"""Creates or checks the escrow account: funds it on testnet and adds the USDC trustline.

    python -m scripts.escrow_setup              # uses ESCROW_SECRET, or generates one and prints it
    python -m scripts.escrow_setup --write-env  # also appends a newly generated secret to backend/.env
"""

import argparse
import sys
from pathlib import Path

import httpx
from stellar_sdk import Asset, Keypair, Network, Server, TransactionBuilder
from stellar_sdk.exceptions import NotFoundError

from app.config import settings

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write-env", action="store_true", help="append a newly generated ESCROW_SECRET to backend/.env")
    args = parser.parse_args()
    cfg = settings()

    if cfg.escrow_secret:
        keypair = Keypair.from_secret(cfg.escrow_secret)
    else:
        keypair = Keypair.random()
        print(f"Generated a new escrow account: {keypair.public_key}")
        if args.write_env:
            with ENV_FILE.open("a") as env:
                env.write(f"\nESCROW_SECRET={keypair.secret}\n")
            print(f"Saved ESCROW_SECRET to {ENV_FILE}")
        else:
            print(f"Add this line to backend/.env and keep it secret:\nESCROW_SECRET={keypair.secret}\n")

    server = Server(cfg.horizon)
    passphrase = Network.PUBLIC_NETWORK_PASSPHRASE if cfg.stellar_network == "mainnet" else Network.TESTNET_NETWORK_PASSPHRASE
    usdc = Asset("USDC", cfg.usdc_issuer_address)

    try:
        account = server.load_account(keypair.public_key)
    except NotFoundError:
        if cfg.stellar_network != "testnet":
            sys.exit(f"The escrow account doesn't exist on mainnet yet. Send {keypair.public_key} at least 2 XLM, then run this again.")
        print("Funding the escrow with testnet XLM (friendbot)…")
        httpx.get("https://friendbot.stellar.org", params={"addr": keypair.public_key}, timeout=60).raise_for_status()
        account = server.load_account(keypair.public_key)

    balances = (account.raw_data or {}).get("balances", [])
    if not any(b.get("asset_code") == "USDC" and b.get("asset_issuer") == usdc.issuer for b in balances):
        print("Adding the USDC trustline…")
        tx = TransactionBuilder(account, passphrase, base_fee=10_000).append_change_trust_op(asset=usdc).set_timeout(60).build()
        tx.sign(keypair)
        server.submit_transaction(tx)

    record = server.accounts().account_id(keypair.public_key).call()
    print(f"\nEscrow {keypair.public_key} on {cfg.stellar_network}")
    for line in record["balances"]:
        code = "XLM" if line["asset_type"] == "native" else line["asset_code"]
        print(f"  {code:>5}  {line['balance']}")
    if cfg.stellar_network == "testnet":
        print(f"\nNext: get testnet USDC at https://faucet.circle.com (network: Stellar Testnet) for {keypair.public_key}")


if __name__ == "__main__":
    main()
