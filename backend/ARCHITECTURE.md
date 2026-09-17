# Puente backend architecture

Functional core, imperative shell. Business rules are pure functions over
immutable records, and they live in `domain/`. Everything that touches the
outside world sits at the edges and is passed in explicitly:
- the database (`repositories/`)
- Stellar and Pollar (`gateways/`)
- HTTP (`web/`)

The same idea runs throughout: find a responsibility, give it to one function or
module, and keep its inputs visible in its signature.

## How a request flows

```
HTTP request
   │
   ▼
Router        web/routes/     parse, authenticate, call ONE service function, present, status code
   │ schemas  web/schemas.py  the shape of data crossing the boundary
   ▼
Service       services/       async functions: service(deps, user, …) — orchestrate one behavior
   │ rules    domain/         pure functions: may this happen? what does it cost? what happened?
   ├──────►  Repository  repositories/  persistence functions: repo_fn(conn, …) — SQL only
   └──────►  Gateway     gateways/      network functions: gateway_fn(client, …) — Stellar, Pollar
```

Dependencies are passed, never reached for:
- **Services** receive `deps` (`deps.py`), a frozen record holding the pool, the clients, the policy, the caches and the clock.
- **Repositories** receive the `conn` of the transaction they run in.
- **Gateways** receive their `client`.
- **Domain functions** receive only plain values: an order, an agent, `now`, the policy.

Imports point one way: `web → services → domain`, and `services →
repositories / gateways → domain`. The domain imports nothing else from `app/`.

## Who owns what

| Responsibility | Where | Functions |
|---|---|---|
| Who may do what to an order, and when | `domain/lifecycle.py` | `check`, `allowed_actions`, `role_of`, `is_due_to_expire`, `is_due_to_auto_complete` |
| What an order costs | `domain/pricing.py` | `quote` |
| What an agent's float allows | `domain/floats.py` | `available_usdc`, `ensure_can_reserve`, `max_cash_in_fiat` |
| Whether a Stellar payment funds a cash-out | `domain/funding.py` | `verify_cash_out_funding`, `attach_decision`, `ensure_can_hold_usdc`, `ensure_escrow_covers` |
| What became of a signed payout, and what's next | `domain/payouts.py` | `judge_envelope`, `next_payout_step`, `classify_submit_failure`, `should_record_settled` |
| Account details per rail | `domain/rails.py` | `validate_details`, `institution` |
| Reading credentials and Pollar's answer | `domain/auth.py` | `parse_authorization`, `identity_from_pollar`, `cache_until` |
| What the escrow owes | `domain/proof.py` | `escrow_obligations`, `is_solvent` |
| The order lifecycles | `services/orders.py` | `open_cash_in`, `mark_cash_in_paid`, `confirm_cash_in`, `open_cash_out`, `attach_cash_out_payment`, `mark_cash_out_paid`, `confirm_cash_out`, `refund_cash_out`, `dispute`, `expire`, `auto_complete`, `settle_payout` |
| Paying USDC out of escrow exactly once | `services/payouts.py` | `pay_out` |
| Letting time pass | `services/maintenance.py` | `run_once`, `run_forever` |
| Who is calling | `services/auth.py` | `authenticate` |
| Agent desks, proof page | `services/agents.py`, `services/proof.py` | `list_available`, `profile`, `register`, `snapshot` |
| Transactions | `repositories/db.py` | `async with transaction(pool) as conn` |
| Orders and their timeline | `repositories/orders.py` | `get`, `insert`, `record_transition`, `save_envelope`, … |
| Float movements | `repositories/agents.py` | `reserve`, `release_reservation`, `consume_reservation`, `credit` |
| Talking to Stellar | `gateways/stellar.py` | `fetch_account`, `fetch_transaction`, `fetch_source_history`, `sign_escrow_payment`, `submit` |
| Talking to Pollar | `gateways/pollar.py` | `verify_token` |
| Service results → JSON | `web/presenters.py` | `present_order`, `present_agent`, `present_me`, `present_proof` |
| Business failure → HTTP status | `web/errors.py` | `HTTP_STATUS[ErrorKind]` |
| Opening and closing dependencies | `deps.py` | `open_deps`, `close_deps` |

The only class that holds mutable state is `TtlCache` in `cache.py`, because
caching is its whole job. Everything else is a frozen record, a schema, an enum,
an exception or a resource handle created in `open_deps`.

## One request end to end: an agent confirms an add-money order

```
POST /api/orders/{id}/confirm
│
├─ routes/orders.confirm                 HTTP only
│    └─ orders.confirm(deps, user, id)   it's a cash_in order → confirm_cash_in
│
├─ orders.confirm_cash_in
│    ├─ transaction(pool): lock the order
│    ├─ lifecycle.check(order, CONFIRM, "agent", now, policy)   pure: PROCEED / raise
│    ├─ order_repo.record_transition(conn, order, "releasing")  status + event together
│    └─ settle_payout(deps, id, RELEASE)
│         ├─ payouts.pay_out
│         │    ├─ stellar.fetch_source_history → judge_envelope    facts in, pure verdict out
│         │    ├─ next_payout_step(order, kind, state)             pure: resubmit / sign_new / settled
│         │    └─ stellar.sign_escrow_payment → save → stellar.submit
│         ├─ should_record_settled(order, kind, hash)              pure
│         ├─ order_repo.record_transition(conn, order, "completed")
│         └─ agent_repo.consume_reservation(conn, agent_id, usdc)
│
└─ present_order(snapshot, deps.stellar) → JSON (202 if the payment is still landing)
```

## Rules that keep it this way

1. **Rules take values and return values.** No `await`, no I/O and no clock inside `domain/`; `now` is passed in.
2. **SQL only in `repositories/`. HTTP only in `web/`. The Stellar SDK only in `gateways/stellar.py`.**
3. **Services own transaction boundaries.** Repositories run on the connection they're handed and never commit on their own.
4. **A status change and its event are one call** (`record_transition`).
5. **One source of truth for the state machine.** Enforcement (`check`) and the UI's `actions` list (`allowed_actions`) read the same table.
6. **Gateways report facts; the domain judges them.**
7. **Business errors carry an `ErrorKind`, not an HTTP status.** Only `web/errors.py` maps kinds to codes.
8. **Reads don't write.** Time-based changes run in `services/maintenance.py`, which decides what's due and calls the same `services/orders.py` functions a request would.

## Testing

- **Unit tests** (`tests/`, ~0.5 s) cover every pure rule in `domain/`, including the double-payment decisions in `domain/payouts.py`. They need no database or network: `.venv/bin/pytest`.
- **The end-to-end suite** (`scripts/e2e_testnet.py`, ~2–3 min) runs the real API against Postgres and Stellar testnet: `.venv/bin/python -m scripts.e2e_testnet`.

## Adding a feature: where does it go?

- **A new rule about who may do what:** a row in `lifecycle.RULES`, plus a unit test.
- **A new decision:** a pure function in `domain/`, plus a unit test.
- **A new thing an order can do:** a function in `services/orders.py`, plus a route that calls it.
- **A new query or column:** a repository function.
- **An automated rail (Paystack, M-Pesa):** a gateway module for the provider. Its webhook route calls an existing service function such as `confirm_cash_in`.
