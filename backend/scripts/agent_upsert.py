"""Registers or updates an agent desk. The person must have signed in to the app once.

    python -m scripts.agent_upsert --email tunde@example.com --name "Tunde · Yaba" \\
        --bank GTBank --account-number 0123456789 --account-name "Tunde Bello" \\
        --rate-buy 1580 --rate-sell 1620 --float 50

Mobile money: --rail mobile_money --provider "MTN MoMo" --phone "+233 24 000 0000" --account-name ...
Cash:         --rail cash --location "Yaba market, stall 12" --phone ... --account-name ...

The float is agent-owned USDC that must already sit in the escrow account.
"""

import argparse
import asyncio
import sys
from decimal import Decimal

import asyncpg

from app.config import settings
from app.deps import close_deps, open_deps
from app.domain.errors import AppError
from app.domain.models import AgentRegistration, User
from app.domain.rails import RAILS
from app.repositories import users as user_repo
from app.repositories.db import transaction
from app.services import agents


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    who = p.add_mutually_exclusive_group(required=True)
    who.add_argument("--user-id")
    who.add_argument("--email")
    who.add_argument("--wallet")
    p.add_argument("--create-user-wallet", help="dev only: create the user with this G-address if missing (needs --user-id)")
    p.add_argument("--name", required=True, help="desk name customers see")
    p.add_argument("--country", default="NG")
    p.add_argument("--currency", default="NGN")
    p.add_argument("--rail", choices=sorted(RAILS), default="bank_transfer")
    p.add_argument("--bank")
    p.add_argument("--account-number")
    p.add_argument("--provider")
    p.add_argument("--phone")
    p.add_argument("--location")
    p.add_argument("--account-name", required=True)
    p.add_argument("--rate-buy", type=Decimal, required=True, help="fiat per USDC the agent pays on cash-out")
    p.add_argument("--rate-sell", type=Decimal, required=True, help="fiat per USDC customers pay to add money")
    p.add_argument("--min-fiat", type=Decimal, default=Decimal("0"))
    p.add_argument("--max-fiat", type=Decimal, default=Decimal("1000000"))
    floats = p.add_mutually_exclusive_group()
    floats.add_argument("--float", dest="set_float", type=Decimal, help="set the agent's USDC float")
    floats.add_argument("--add-float", type=Decimal, help="add to the agent's USDC float")
    p.add_argument("--inactive", action="store_true", help="hide the desk from customers")
    return p.parse_args()


def pay_details(args: argparse.Namespace) -> dict:
    return {
        "bank_transfer": {"bank": args.bank, "accountNumber": args.account_number, "accountName": args.account_name},
        "mobile_money": {"provider": args.provider, "phoneNumber": args.phone, "accountName": args.account_name},
        "cash": {"location": args.location, "contactPhone": args.phone, "accountName": args.account_name},
    }[args.rail]


async def main() -> None:
    args = parse_args()
    deps = await open_deps(settings())
    try:
        async with transaction(deps.pool) as conn:
            if args.create_user_wallet:
                if not args.user_id:
                    sys.exit("--create-user-wallet needs --user-id")
                if await user_repo.find(conn, user_id=args.user_id) is None:
                    await user_repo.upsert(conn, User(id=args.user_id, wallet=args.create_user_wallet, email=None))
            user = await user_repo.find(conn, user_id=args.user_id, email=args.email, wallet=args.wallet)
        if user is None:
            sys.exit("No such user. Ask them to sign in to the app once, then run this again.")

        agent = await agents.register(
            deps,
            AgentRegistration(
                user_id=user.id,
                display_name=args.name,
                country=args.country,
                currency=args.currency,
                rail=args.rail,
                pay_details=pay_details(args),
                rate_buy=args.rate_buy,
                rate_sell=args.rate_sell,
                min_fiat=args.min_fiat,
                max_fiat=args.max_fiat,
                active=not args.inactive,
            ),
            float_usdc=args.set_float,
            add_float_usdc=args.add_float,
        )
    except AppError as exc:
        sys.exit(f"{exc.message} {exc.details or ''}")
    except asyncpg.CheckViolationError as exc:
        sys.exit(f"Rejected by the database: {exc.constraint_name} (a float can't drop below the USDC reserved for open orders)")
    finally:
        await close_deps(deps)

    print(f"Agent {agent.display_name} ({agent.id})")
    print(f"  user      {user.id}  {user.email or ''}")
    print(f"  rail      {agent.rail}  {agent.pay_details}")
    print(f"  rates     buy {agent.rate_buy}  sell {agent.rate_sell} {agent.currency}/USDC")
    print(f"  float     {agent.float_usdc} USDC ({agent.reserved_usdc} reserved)")
    print("Check GET /api/proof: the escrow's USDC balance must cover every agent's float.")


if __name__ == "__main__":
    asyncio.run(main())
