"""End-to-end test on Stellar testnet against a real API process.

Creates throwaway testnet accounts and a test "USDC" from its own issuer, starts the
API with DEV_AUTH=1 on a fresh `<db>_e2e` database, then drives every flow over HTTP:
add money, cash out with a fee-bumped payment (like Pollar sends), refund,
permission and replay checks, float contention, the proof page, crash recovery of
escrow payouts, and time-based maintenance (expiry and auto-completion).

    python -m scripts.e2e_testnet
"""

import asyncio
import os
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import httpx
from stellar_sdk import Asset, Keypair, Network, Server, TransactionBuilder

from app.config import Settings, settings
from app.deps import close_deps, open_deps
from app.services import maintenance
from scripts.migrate import apply_schema

BACKEND = Path(__file__).resolve().parent.parent
HORIZON = "https://horizon-testnet.stellar.org"
PASSPHRASE = Network.TESTNET_NETWORK_PASSPHRASE
FEE = 10_000

horizon = Server(HORIZON)
step_no = 0


def step(title: str) -> None:
    global step_no
    step_no += 1
    print(f"\n{step_no:>2}. {title}")


def ok(message: str) -> None:
    print(f"    ✓ {message}")


def expect(condition: bool, message: str, context: object = None) -> None:
    if not condition:
        raise AssertionError(f"{message}\n    context: {context!r}")
    ok(message)


# ─── Stellar helpers ────────────────────────────────────────────────────────────


def friendbot(*keypairs: Keypair) -> None:
    for kp in keypairs:
        httpx.get("https://friendbot.stellar.org", params={"addr": kp.public_key}, timeout=60).raise_for_status()


def submit(source: Keypair, build, *, fee_bump: Keypair | None = None) -> tuple[str, str]:
    """Builds, signs and submits. Returns (hash to report, inner hash)."""
    account = horizon.load_account(source.public_key)
    tx = build(TransactionBuilder(account, PASSPHRASE, base_fee=FEE)).set_timeout(120).build()
    tx.sign(source)
    if fee_bump is None:
        horizon.submit_transaction(tx)
        return tx.hash_hex(), tx.hash_hex()
    bump = TransactionBuilder.build_fee_bump_transaction(fee_bump, FEE * 2, tx, PASSPHRASE)
    bump.sign(fee_bump)
    horizon.submit_transaction(bump)
    return bump.hash_hex(), tx.hash_hex()


def usdc_of(address: str, usdc: Asset) -> Decimal:
    for line in horizon.accounts().account_id(address).call()["balances"]:
        if line.get("asset_code") == usdc.code and line.get("asset_issuer") == usdc.issuer:
            return Decimal(line["balance"])
    return Decimal(0)


# ─── API helpers ────────────────────────────────────────────────────────────────


def dev(user_id: str, kp: Keypair) -> dict[str, str]:
    return {"Authorization": f"Dev {user_id} {kp.public_key}"}


def call(client: httpx.Client, method: str, path: str, who: dict[str, str] | None = None, json: object = None) -> httpx.Response:
    return client.request(method, path, headers=who or {}, json=json)


def settle(client: httpx.Client, res: httpx.Response, who: dict[str, str], want: str) -> dict:
    """Follows a 202 (escrow payment still landing) by polling until `want`."""
    body = res.json()
    deadline = time.time() + 90
    while body.get("status") != want and time.time() < deadline:
        time.sleep(4)
        body = call(client, "GET", f"/api/orders/{body['id']}", who).json()
    return body


def with_retry(fn, attempts: int = 6):
    """Horizon's load-balanced nodes can lag a ledger behind; retry TX_NOT_FOUND."""
    for i in range(attempts):
        res = fn()
        if not (res.status_code == 404 and res.json()["error"]["code"] == "TX_NOT_FOUND") or i == attempts - 1:
            return res
        time.sleep(2)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def fresh_database(base_dsn: str) -> str:
    parts = urlsplit(base_dsn)
    name = f"{parts.path.lstrip('/') or 'puente'}_e2e"
    admin = await asyncpg.connect(urlunsplit(parts._replace(path="/postgres")))
    try:
        await admin.execute(f'drop database if exists "{name}" with (force)')
        await admin.execute(f'create database "{name}"')
    finally:
        await admin.close()
    dsn = urlunsplit(parts._replace(path=f"/{name}"))
    await apply_schema(dsn)
    return dsn


async def db_execute(dsn: str, query: str, *args: object) -> None:
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute(query, *args)
    finally:
        await conn.close()


# ─── The run ────────────────────────────────────────────────────────────────────


def main() -> None:
    issuer, escrow, customer, sponsor = (Keypair.random() for _ in range(4))
    agent_wallet, stranger_wallet = Keypair.random(), Keypair.random()
    usdc = Asset("USDC", issuer.public_key)

    step("Testnet accounts and a test USDC")
    friendbot(issuer, escrow, customer, sponsor)
    for holder in (escrow, customer):
        submit(holder, lambda b: b.append_change_trust_op(asset=usdc))
    submit(issuer, lambda b: b.append_payment_op(escrow.public_key, usdc, "100").append_payment_op(customer.public_key, usdc, "50"))
    ok(f"escrow {escrow.public_key} holds 100 USDC · customer holds 50 USDC")

    step("Fresh database and API process")
    dsn = asyncio.run(fresh_database(settings().database_url))
    port = free_port()
    log = tempfile.NamedTemporaryFile(prefix="puente-e2e-api-", suffix=".log", delete=False)
    env = {
        **os.environ,
        "DATABASE_URL": dsn,
        "STELLAR_NETWORK": "testnet",
        "HORIZON_URL": HORIZON,
        "ESCROW_SECRET": escrow.secret,
        "USDC_ISSUER": issuer.public_key,
        "DEV_AUTH": "1",
        "ENVIRONMENT": "test",
        "PAYOUT_WINDOW_MINUTES": "0",
        "POLLAR_SECRET_KEY": "",
        "MAINTENANCE_INTERVAL_SECONDS": "0",  # the test runs maintenance itself, when it wants
    }
    api = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(port)], cwd=BACKEND, env=env, stdout=log, stderr=subprocess.STDOUT
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(60):
            try:
                if httpx.get(f"{base}/health", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.5)
        else:
            raise RuntimeError("API didn't start")
        ok(f"API up at {base} · logs in {log.name}")
        run_flows(httpx.Client(base_url=base, timeout=120), dsn, usdc, escrow, customer, sponsor, agent_wallet, stranger_wallet)
    except BaseException:
        print(f"\n✗ FAILED. API logs: {log.name}")
        raise
    finally:
        api.terminate()
        api.wait(timeout=10)


def run_flows(client, dsn, usdc, escrow, customer, sponsor, agent_wallet, stranger_wallet) -> None:
    ada, tunde, stranger = dev("ada", customer), dev("tunde", agent_wallet), dev("stranger", stranger_wallet)

    step("Register an agent desk with the CLI")
    expect(call(client, "GET", "/api/me", tunde).status_code == 200, "agent signs in once")
    subprocess.run(
        [sys.executable, "-m", "scripts.agent_upsert", "--user-id", "tunde", "--name", "Tunde · Yaba", "--bank", "GTBank",
         "--account-number", "0123456789", "--account-name", "Tunde Bello", "--rate-buy", "1580", "--rate-sell", "1620", "--float", "60"],
        cwd=BACKEND, env={**os.environ, "DATABASE_URL": dsn}, check=True, capture_output=True,
    )
    agents = call(client, "GET", "/api/agents?country=NG").json()
    expect(len(agents) == 1 and agents[0]["availableUsdc"] == "60.0000000", "agent listed with 60 USDC available", agents)
    agent_id = agents[0]["id"]

    step("Add money: ₦8,100 at 1,620 → 5 USDC")
    res = call(client, "POST", "/api/orders", ada, {"type": "cash_in", "agentId": agent_id, "fiatAmount": "8100"})
    order = res.json()
    expect(res.status_code == 201 and order["status"] == "awaiting_fiat" and order["usdcAmount"] == "5.0000000", "order created", order)
    expect(order["pay"]["accountNumber"] == "0123456789" and order["pay"]["reference"] == order["ref"], "customer sees where to pay and the reference")
    expect(order["actions"] == ["fiat-sent"], "customer's only action is fiat-sent", order["actions"])
    oid = order["id"]
    expect(call(client, "GET", f"/api/orders/{oid}", stranger).status_code == 404, "a stranger gets 404")
    expect(call(client, "POST", f"/api/orders/{oid}/confirm", ada).json()["error"]["code"] == "WRONG_PARTY", "customer can't release their own USDC")
    expect(call(client, "POST", f"/api/orders/{oid}/confirm", tunde).json()["error"]["code"] == "INVALID_STATE", "agent can't confirm before payment is marked")
    expect(call(client, "GET", "/api/me", tunde).json()["agent"]["reservedUsdc"] == "5.0000000", "5 USDC of the float is reserved")

    order = call(client, "POST", f"/api/orders/{oid}/fiat-sent", ada).json()
    expect(order["status"] == "fiat_sent", "customer marks the ₦ transfer as sent")
    before = usdc_of(customer.public_key, usdc)
    order = settle(client, call(client, "POST", f"/api/orders/{oid}/confirm", tunde), tunde, "completed")
    expect(order["status"] == "completed" and order["hashes"]["release"], "agent confirms → escrow releases USDC", order)
    ok(f"release tx {order['hashes']['release']['url']}")
    expect(usdc_of(customer.public_key, usdc) - before == Decimal("5"), "customer's wallet received exactly 5 USDC")
    again = call(client, "POST", f"/api/orders/{oid}/confirm", tunde)
    expect(again.status_code == 200 and usdc_of(customer.public_key, usdc) - before == Decimal("5"), "confirming again pays nothing twice")
    me = call(client, "GET", "/api/me", tunde).json()["agent"]
    expect(me["floatUsdc"] == "55.0000000" and me["reservedUsdc"] == "0.0000000", "agent float 60 → 55, nothing reserved", me)
    expect([e["to"] for e in order["events"]][-1] == "completed", "timeline ends in completed")

    step("Cash out 10 USDC at 1,580 → ₦15,800, paid with a fee-bumped transaction")
    payout = {"bank": "Access Bank", "accountNumber": "0987654321", "accountName": "Ada Obi"}
    res = call(client, "POST", "/api/orders", ada, {"type": "cash_out", "agentId": agent_id, "usdcAmount": "10", "payout": payout})
    out = res.json()
    expect(res.status_code == 201 and out["status"] == "awaiting_usdc" and out["fiatAmount"] == "15800.00", "cash-out order created", out)
    expect(out["escrow"]["address"] == escrow.public_key and out["escrow"]["memo"] == out["ref"], "customer sees escrow address and memo")
    bad = call(client, "POST", f"/api/orders/{out['id']}/usdc-sent", ada, {"txHash": "ab" * 32})
    expect(bad.status_code == 404 and bad.json()["error"]["code"] == "TX_NOT_FOUND", "an unknown hash is rejected")

    res = call(client, "POST", "/api/orders", ada, {"type": "cash_out", "agentId": agent_id, "usdcAmount": "3", "payout": payout})
    other = res.json()
    outer, inner = submit(customer, lambda b: b.append_payment_op(escrow.public_key, usdc, "10").add_text_memo(out["ref"]), fee_bump=sponsor)
    wrong = with_retry(lambda: call(client, "POST", f"/api/orders/{other['id']}/usdc-sent", ada, {"txHash": outer}))
    expect(wrong.status_code == 422 and wrong.json()["error"]["code"] == "TX_MEMO_MISMATCH", "a payment can't fund a different order", wrong.json())
    out = with_retry(lambda: call(client, "POST", f"/api/orders/{out['id']}/usdc-sent", ada, {"txHash": outer})).json()
    expect(out["status"] == "usdc_locked" and out["hashes"]["funding"]["hash"] == outer, "fee-bumped payment verified → USDC locked", out)
    same = call(client, "POST", f"/api/orders/{out['id']}/usdc-sent", ada, {"txHash": inner})
    expect(same.status_code == 200, "the inner hash of the same payment is accepted idempotently", same.json())
    missing_ref = call(client, "POST", f"/api/orders/{out['id']}/fiat-sent", tunde, {})
    expect(missing_ref.json()["error"]["code"] == "REFERENCE_REQUIRED", "agent must give a payout reference")
    out = call(client, "POST", f"/api/orders/{out['id']}/fiat-sent", tunde, {"reference": "NIP-000123"}).json()
    expect(out["status"] == "fiat_sent" and out["agentReference"] == "NIP-000123", "agent marks the ₦ payout as sent")
    out = call(client, "POST", f"/api/orders/{out['id']}/confirm", ada).json()
    expect(out["status"] == "completed", "customer confirms the ₦ arrived")
    expect(call(client, "GET", "/api/me", tunde).json()["agent"]["floatUsdc"] == "65.0000000", "agent float 55 → 65")

    step("Refund: the agent never pays out (payout window is 0 in this test)")
    plain, _ = submit(customer, lambda b: b.append_payment_op(escrow.public_key, usdc, "3").add_text_memo(other["ref"]))
    other = with_retry(lambda: call(client, "POST", f"/api/orders/{other['id']}/usdc-sent", ada, {"txHash": plain})).json()
    expect(other["status"] == "usdc_locked" and other["actions"] == ["refund"], "USDC locked and refund offered", other)
    before = usdc_of(customer.public_key, usdc)
    other = settle(client, call(client, "POST", f"/api/orders/{other['id']}/refund", ada), ada, "refunded")
    expect(other["status"] == "refunded" and other["hashes"]["refund"], "refund paid from escrow", other)
    expect(usdc_of(customer.public_key, usdc) - before == Decimal("3"), "customer got exactly 3 USDC back")

    step("Two customers race for the same float")
    bola = dev("bola", Keypair.random())
    body = {"type": "cash_out", "agentId": agent_id, "usdcAmount": "1", "payout": payout}
    expect(call(client, "POST", "/api/orders", bola, body).status_code == 201, "cash-outs don't touch the float")

    async def race() -> list[int]:
        async with httpx.AsyncClient(base_url=str(client.base_url), timeout=60) as ac:
            request = {"type": "cash_in", "agentId": agent_id, "usdcAmount": "40"}
            results = await asyncio.gather(*(ac.post("/api/orders", headers=ada, json=request) for _ in range(2)))
            return sorted(r.status_code for r in results)

    codes = asyncio.run(race())
    expect(codes == [201, 409], "two 40 USDC orders against 65 available: one wins, one gets INSUFFICIENT_FLOAT", codes)

    step("Proof page")
    proof = call(client, "GET", "/api/proof").json()
    t = proof["totals"]
    expect(
        (t["completedCashIn"], t["completedCashOut"], t["refunded"], t["volumeUsdc"]) == (1, 1, 1, "15.0000000"),
        "totals: 1 add-money, 1 cash-out, 1 refund, 15 USDC volume",
        t,
    )
    expect(proof["escrow"]["usdcBalance"] == "105.0000000" and proof["escrow"]["solvent"] is True, "escrow 105 USDC covers 65 owed", proof["escrow"])

    step("Crash recovery: payment saved but never submitted")
    crash = recovery_order(client, ada, tunde, agent_id)
    envelope = sign_release(escrow, customer, usdc, crash)
    asyncio.run(save_envelope(dsn, crash["id"], envelope))
    before = usdc_of(customer.public_key, usdc)
    crash = settle(client, call(client, "POST", f"/api/orders/{crash['id']}/confirm", tunde), tunde, "completed")
    expect(crash["hashes"]["release"]["hash"] == envelope[0], "the saved envelope is resubmitted, not re-signed", crash["hashes"])
    expect(usdc_of(customer.public_key, usdc) - before == Decimal("1"), "customer paid exactly once")

    step("Crash recovery: saved payment can never land (sequence used by another transaction)")
    dead = recovery_order(client, ada, tunde, agent_id)
    envelope = sign_release(escrow, customer, usdc, dead)
    asyncio.run(save_envelope(dsn, dead["id"], envelope))
    submit(escrow, lambda b: b.append_payment_op(usdc.issuer, usdc, "0.0000001"))  # consumes the saved envelope's sequence
    before = usdc_of(customer.public_key, usdc)
    dead = settle(client, call(client, "POST", f"/api/orders/{dead['id']}/confirm", tunde), tunde, "completed")
    expect(dead["hashes"]["release"]["hash"] != envelope[0], "the dead envelope is discarded and a fresh one signed", dead["hashes"])
    expect(usdc_of(customer.public_key, usdc) - before == Decimal("1"), "customer paid exactly once")

    step("Maintenance: an unpaid add-money order expires and frees the float")
    stale = next(o for o in call(client, "GET", "/api/orders?as=user&scope=open", ada).json() if o["type"] == "cash_in" and o["usdcAmount"] == "40.0000000")
    asyncio.run(db_execute(dsn, "update orders set expires_at = now() - interval '1 minute' where id = $1", uuid.UUID(stale["id"])))
    late = call(client, "POST", f"/api/orders/{stale['id']}/fiat-sent", ada)
    expect(late.status_code == 409 and late.json()["error"]["code"] == "ORDER_EXPIRED", "paying after the window is refused", late.json())
    expect(call(client, "GET", f"/api/orders/{stale['id']}", ada).json()["actions"] == [], "and no action is offered")
    asyncio.run(run_maintenance(dsn, escrow, usdc))
    expect(call(client, "GET", f"/api/orders/{stale['id']}", ada).json()["status"] == "expired", "maintenance expires the order")
    expect(call(client, "GET", "/api/me", tunde).json()["agent"]["reservedUsdc"] == "0.0000000", "the 40 USDC reservation is released")

    step("Maintenance: a paid-out cash-out the customer never confirms completes on its own")
    quiet = call(client, "POST", "/api/orders", ada, {"type": "cash_out", "agentId": agent_id, "usdcAmount": "2", "payout": payout}).json()
    paid, _ = submit(customer, lambda b: b.append_payment_op(escrow.public_key, usdc, "2").add_text_memo(quiet["ref"]))
    with_retry(lambda: call(client, "POST", f"/api/orders/{quiet['id']}/usdc-sent", ada, {"txHash": paid}))
    call(client, "POST", f"/api/orders/{quiet['id']}/fiat-sent", tunde, {"reference": "NIP-000456"})
    float_before = Decimal(call(client, "GET", "/api/me", tunde).json()["agent"]["floatUsdc"])
    asyncio.run(db_execute(dsn, "update orders set fiat_sent_at = now() - interval '25 hours' where id = $1", uuid.UUID(quiet["id"])))
    asyncio.run(run_maintenance(dsn, escrow, usdc))
    quiet = call(client, "GET", f"/api/orders/{quiet['id']}", ada).json()
    expect(quiet["status"] == "completed" and quiet["events"][-1]["actor"] == "system", "maintenance completes it", quiet["events"][-1])
    expect(Decimal(call(client, "GET", "/api/me", tunde).json()["agent"]["floatUsdc"]) - float_before == Decimal("2"), "agent float credited 2 USDC")

    print("\nAll end-to-end checks passed.")


async def run_maintenance(dsn: str, escrow: Keypair, usdc: Asset) -> None:
    """One maintenance pass, wired exactly as the API wires it."""
    cfg = Settings(
        database_url=dsn,
        stellar_network="testnet",
        horizon_url=HORIZON,
        escrow_secret=escrow.secret,
        usdc_issuer=usdc.issuer,
        payout_window_minutes=0,
        maintenance_interval_seconds=0,
    )
    deps = await open_deps(cfg)
    try:
        await maintenance.run_once(deps)
    finally:
        await close_deps(deps)


def recovery_order(client, ada, tunde, agent_id) -> dict:
    order = call(client, "POST", "/api/orders", ada, {"type": "cash_in", "agentId": agent_id, "usdcAmount": "1"}).json()
    return call(client, "POST", f"/api/orders/{order['id']}/fiat-sent", ada).json()


def sign_release(escrow: Keypair, customer: Keypair, usdc: Asset, order: dict) -> tuple[str, str, datetime]:
    account = horizon.load_account(escrow.public_key)
    tx = (
        TransactionBuilder(account, PASSPHRASE, base_fee=FEE)
        .append_payment_op(customer.public_key, usdc, order["usdcAmount"])
        .add_text_memo(order["ref"])
        .set_timeout(120)
        .build()
    )
    tx.sign(escrow)
    max_time = datetime.fromtimestamp(tx.transaction.preconditions.time_bounds.max_time, tz=UTC)
    return tx.hash_hex(), tx.to_xdr(), max_time


async def save_envelope(dsn: str, order_id: str, envelope: tuple[str, str, datetime]) -> None:
    """Simulates a crash between saving the signed payment and submitting it."""
    await db_execute(
        dsn,
        "update orders set status = 'releasing', release_tx = $2, release_xdr = $3, release_max_time = $4 where id = $1",
        uuid.UUID(order_id),
        *envelope,
    )


if __name__ == "__main__":
    main()
