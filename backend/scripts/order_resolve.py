"""Settles an order whose fiat leg is in question, after a human reads the evidence.

A dispute freezes an order deliberately — neither side can act and no timer moves
it — because deciding whether naira actually arrived is not something the system
can know. This is the operator's side of that, deliberately a script and not an
endpoint, like registering an agent.

    # the fiat did arrive: finish the order as it would have finished
    python -m scripts.order_resolve --ref PU-FUP34S --uphold --note "Opay receipt 2609... matches the payout."

    # it never arrived: the customer's USDC goes back, or the agent's float is freed
    python -m scripts.order_resolve --ref PU-FUP34S --reject --note "No transfer found for this reference."

    # the payout didn't happen — reversed, or recorded against the wrong order
    python -m scripts.order_resolve --ref PU-FUP34S --bounced --note "Opay reversed 2609... on 18 Sep."

`--bounced` is the only one that lets a second payout happen, and only an operator
can say it — otherwise "it failed, let me send again" would be a claim either side
could make, and the money could go out twice.
"""

import argparse
import asyncio
import sys
from uuid import UUID

from app.config import settings
from app.deps import close_deps, open_deps
from app.domain.errors import AppError
from app.repositories import orders as order_repo
from app.repositories.db import transaction
from app.services import orders


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    which = p.add_mutually_exclusive_group(required=True)
    which.add_argument("--ref", help="the order reference, e.g. PU-FUP34S")
    which.add_argument("--order-id", help="the order's UUID")
    outcome = p.add_mutually_exclusive_group(required=True)
    outcome.add_argument("--uphold", action="store_true", help="the fiat arrived: complete the order")
    outcome.add_argument("--reject", action="store_true", help="it never arrived: return the money")
    outcome.add_argument("--bounced", action="store_true", help="the payout didn't happen (reversed, or recorded in error): let the agent pay again")
    p.add_argument("--note", required=True, help="what the evidence showed; both sides see this")
    return p.parse_args()


async def main() -> None:
    args = parse_args()
    if len(args.note.strip()) < 10:
        sys.exit("--note should say what the evidence showed.")

    deps = await open_deps(settings())
    try:
        async with transaction(deps.pool) as conn:
            order = await (order_repo.by_ref(conn, args.ref.strip().upper()) if args.ref else order_repo.get(conn, UUID(args.order_id)))
        if order is None:
            sys.exit("No such order.")

        print(f"{order.ref}  {order.type}  {order.status}  {order.usdc_amount} USDC")
        if order.dispute_reason:
            print(f"  disputed: {order.dispute_reason}")

        outcome = "uphold" if args.uphold else "bounced" if args.bounced else "reject"
        status = await orders.resolve_payout(deps, order.id, outcome=outcome, note=args.note.strip())
        print(f"  → {status}")
        if status == "pending":
            print("  The escrow payment is still landing; maintenance will finish it.")
        elif args.bounced:
            print("  The agent can pay again and record the new reference on this order.")
    except AppError as exc:
        sys.exit(f"{exc.code}: {exc}")
    finally:
        await close_deps(deps)


if __name__ == "__main__":
    asyncio.run(main())
