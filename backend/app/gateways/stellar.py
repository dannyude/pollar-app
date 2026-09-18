"""Everything Puente asks of the Stellar network. Network I/O only: these functions
fetch facts, sign and submit, and leave every judgment to `domain.funding` and
`domain.payouts`."""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Literal

import httpx

from stellar_sdk import Asset as StellarAsset
from stellar_sdk import Keypair, Network, ServerAsync, StrKey, TransactionBuilder
from stellar_sdk.client.aiohttp_client import AiohttpClient
from stellar_sdk.exceptions import BadRequestError, BaseHorizonError, BaseRequestError, NotFoundError

from ..domain.errors import AppError, ErrorKind, stellar_unavailable
from ..domain.funding import AccountFacts, Asset, PaymentFacts, TransactionFacts
from ..domain.models import EscrowEnvelope
from ..domain.money import fmt_usdc
from ..domain.payouts import SourceTx, SubmitOutcome, classify_submit_failure

log = logging.getLogger("puente.stellar")

FRIENDBOT_URL = "https://friendbot.stellar.org"
PAYMENT_TIMEOUT_S = 120  # escrow payments are valid this long after signing
MAX_FEE = 10_000  # fee bid per operation in stroops; the network charges the going rate


@dataclass(frozen=True)
class StellarClient:
    server: ServerAsync
    network: Literal["testnet", "mainnet"]
    passphrase: str
    usdc: Asset
    escrow_secret: str | None


def open_client(*, horizon_url: str, network: Literal["testnet", "mainnet"], usdc_issuer: str, escrow_secret: str | None) -> StellarClient:
    return StellarClient(
        server=ServerAsync(horizon_url, client=AiohttpClient(request_timeout=15, post_timeout=35)),
        network=network,
        passphrase=Network.PUBLIC_NETWORK_PASSPHRASE if network == "mainnet" else Network.TESTNET_NETWORK_PASSPHRASE,
        usdc=Asset("USDC", usdc_issuer),
        escrow_secret=escrow_secret,
    )


async def close_client(client: StellarClient) -> None:
    await client.server.close()


# ─── Identity and links ─────────────────────────────────────────────────────────


def escrow_keypair(client: StellarClient) -> Keypair:
    if not client.escrow_secret or not StrKey.is_valid_ed25519_secret_seed(client.escrow_secret):
        raise AppError(ErrorKind.MISCONFIGURED, "ESCROW_NOT_CONFIGURED", "ESCROW_SECRET is not a valid Stellar secret key.")
    return Keypair.from_secret(client.escrow_secret)


def escrow_address(client: StellarClient) -> str:
    return escrow_keypair(client).public_key


def tx_url(client: StellarClient, tx_hash: str) -> str:
    return f"https://stellar.expert/explorer/{_explorer_network(client)}/tx/{tx_hash}"


def account_url(client: StellarClient, address: str) -> str:
    return f"https://stellar.expert/explorer/{_explorer_network(client)}/account/{address}"


def envelope_origin(client: StellarClient, envelope: EscrowEnvelope) -> tuple[str, int]:
    """The account that signed a saved payment, and the sequence number it used."""
    tx = TransactionBuilder.from_xdr(envelope.xdr, client.passphrase).transaction
    return tx.source.account_id, tx.sequence


# ─── Facts ──────────────────────────────────────────────────────────────────────


async def fetch_account(client: StellarClient, address: str) -> AccountFacts | None:
    try:
        record = await client.server.accounts().account_id(address).call()
    except NotFoundError:
        return None
    except (BaseHorizonError, BaseRequestError) as exc:
        raise _unavailable(exc) from exc
    return AccountFacts(address=address, usdc_balance=_usdc_balance(client, record))


async def fund_testnet_account(client: StellarClient, address: str) -> None:
    """Asks friendbot to create and fund an account. Testnet only — there is no
    equivalent on mainnet, where Pollar (or the user) funds the wallet."""
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            res = await http.get(FRIENDBOT_URL, params={"addr": address})
    except httpx.HTTPError as exc:
        raise stellar_unavailable() from exc
    # Friendbot answers 400 when the account already exists, which is not a failure.
    if res.status_code >= 400 and "exists" not in res.text.lower():
        log.warning("friendbot refused %s: %s %s", address, res.status_code, res.text[:200])
        raise AppError(
            ErrorKind.UPSTREAM,
            "WALLET_FUNDING_FAILED",
            "Stellar's testnet faucet wouldn't fund this wallet. Try again in a moment.",
        )


async def fetch_transaction(client: StellarClient, tx_hash: str) -> TransactionFacts | None:
    tx_hash = tx_hash.strip().lower()
    try:
        record = await client.server.transactions().transaction(tx_hash).call()
        ops = await client.server.operations().for_transaction(tx_hash).limit(200).call()
    except NotFoundError:
        return None
    except (BaseHorizonError, BaseRequestError) as exc:
        raise _unavailable(exc) from exc

    return TransactionFacts(
        # Horizon echoes whichever hash it was looked up by; a fee-bumped transaction
        # is always identified by its outer hash, so one payment has one identity.
        hash=(record.get("fee_bump_transaction") or {}).get("hash") or record["hash"],
        successful=bool(record.get("successful")),
        memo_type=record.get("memo_type"),
        memo=record.get("memo"),
        ledger=int(record["ledger"]),
        payments=[
            PaymentFacts(
                source=op["from"],
                destination=op["to"],
                asset=None if op.get("asset_type") == "native" else Asset(op["asset_code"], op["asset_issuer"]),
                amount=Decimal(op["amount"]),
            )
            for op in ops["_embedded"]["records"]
            if op.get("type") == "payment"
        ],
    )


async def fetch_source_history(client: StellarClient, source: str, down_to_sequence: int, *, max_pages: int = 5) -> list[SourceTx]:
    """Transactions `source` itself sent, newest first, until one with a sequence
    number at or below `down_to_sequence` is included."""
    history: list[SourceTx] = []
    cursor: str | None = None
    try:
        for _ in range(max_pages):
            builder = client.server.transactions().for_account(source).order(desc=True).limit(100).include_failed(True)
            records = (await (builder.cursor(cursor) if cursor else builder).call())["_embedded"]["records"]
            if not records:
                break
            for record in records:
                if record["source_account"] != source:
                    continue  # incoming payments are listed for the account too
                history.append(SourceTx(int(record["source_account_sequence"]), record["hash"], bool(record["successful"]), int(record["ledger"])))
            if history and history[-1].sequence <= down_to_sequence:
                break
            cursor = records[-1]["paging_token"]
    except NotFoundError:
        return history
    except (BaseHorizonError, BaseRequestError) as exc:
        raise _unavailable(exc) from exc
    return history


# ─── Escrow payments ────────────────────────────────────────────────────────────


async def sign_escrow_payment(client: StellarClient, *, destination: str, amount: Decimal, memo: str) -> EscrowEnvelope:
    """Builds and signs, but doesn't submit, a USDC payment from the escrow."""
    keypair = escrow_keypair(client)
    try:
        escrow = await client.server.load_account(keypair.public_key)
    except NotFoundError as exc:
        raise AppError(ErrorKind.MISCONFIGURED, "ESCROW_ACCOUNT_MISSING", "The escrow account doesn't exist on Stellar. Run scripts/escrow_setup.py.") from exc
    except (BaseHorizonError, BaseRequestError) as exc:
        raise _unavailable(exc) from exc

    envelope = (
        TransactionBuilder(source_account=escrow, network_passphrase=client.passphrase, base_fee=MAX_FEE)
        .append_payment_op(destination=destination, asset=StellarAsset(client.usdc.code, client.usdc.issuer), amount=fmt_usdc(amount))
        .add_text_memo(memo)
        .set_timeout(PAYMENT_TIMEOUT_S)
        .build()
    )
    envelope.sign(keypair)
    bounds = envelope.transaction.preconditions.time_bounds if envelope.transaction.preconditions else None
    if bounds is None:
        raise AppError(ErrorKind.MISCONFIGURED, "ESCROW_PAYMENT_UNBOUNDED", "Escrow payments must carry a time bound.")
    return EscrowEnvelope(hash=envelope.hash_hex(), xdr=envelope.to_xdr(), max_time=datetime.fromtimestamp(bounds.max_time, tz=UTC))


async def submit(client: StellarClient, envelope: EscrowEnvelope) -> SubmitOutcome:
    """Submits a signed envelope. Submitting the same envelope again never pays twice."""
    try:
        res = await client.server.submit_transaction(envelope.xdr, skip_memo_required_check=True)
    except BadRequestError as exc:
        outcome = classify_submit_failure(exc.status, exc.extras)
    except (BaseHorizonError, BaseRequestError, asyncio.TimeoutError) as exc:
        outcome = classify_submit_failure(getattr(exc, "status", None), None)
    else:
        return SubmitOutcome("confirmed", ledger=int(res["ledger"])) if res.get("successful") else SubmitOutcome("rejected")
    if outcome.kind == "unknown":
        log.warning("submit outcome unknown for %s", envelope.hash)
    return outcome


# ─── Helpers ────────────────────────────────────────────────────────────────────


def _usdc_balance(client: StellarClient, account: dict[str, Any]) -> Decimal | None:
    for line in account.get("balances", []):
        if line.get("asset_code") == client.usdc.code and line.get("asset_issuer") == client.usdc.issuer:
            return Decimal(line["balance"])
    return None


def _explorer_network(client: StellarClient) -> str:
    return "public" if client.network == "mainnet" else "testnet"


def _unavailable(exc: Exception) -> AppError:
    log.warning("horizon error: %r", exc)
    return stellar_unavailable()
