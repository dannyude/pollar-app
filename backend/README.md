# Puente API

FastAPI service for Puente: local agents handle add-money and cash-out for Pollar
wallets, and a Stellar escrow holds USDC between legs. Interactive docs run at
`/docs` once the server is up. For how the code is organized, and which component
owns which behavior, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env                              # then fill in DATABASE_URL and POLLAR_SECRET_KEY
.venv/bin/python -m scripts.migrate               # create tables (safe to re-run)
.venv/bin/python -m scripts.escrow_setup --write-env   # testnet escrow: XLM + USDC trustline
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Fund the escrow with testnet USDC at [faucet.circle.com](https://faucet.circle.com)
(network: Stellar Testnet). Then register an agent. The person signs in to the
app once first, so their user row exists:

```bash
.venv/bin/python -m scripts.agent_upsert --email tunde@example.com --name "Tunde · Yaba" \
  --bank GTBank --account-number 0123456789 --account-name "Tunde Bello" \
  --rate-buy 1580 --rate-sell 1620 --float 50
```

An agent's float must already be sitting in the escrow. `GET /api/proof` shows
whether the escrow balance covers every float.

## Disputes

Either side can dispute an order whose fiat leg is claimed but unconfirmed. That
freezes it on purpose: no action is offered to either party and no timer moves
it, because whether naira actually arrived is not something the system can know.
An operator settles it after looking at the evidence:

```bash
# the fiat did arrive — finish the order as it would have finished
.venv/bin/python -m scripts.order_resolve --ref PU-FUP34S --uphold \
  --note "Opay receipt 2609... matches the ₦15,800 payout."

# it didn't — the money goes back where it came from
.venv/bin/python -m scripts.order_resolve --ref PU-FUP34S --reject \
  --note "No transfer found for this reference."
```

A payout reference is evidence of one bank transfer, so it belongs to one order:
reusing one on a second order is refused with `REFERENCE_ALREADY_USED`, the way a
Stellar payment can only fund one cash-out.

A third case is not a dispute at all: the payout didn't happen — the bank
reversed it, or it was recorded against the wrong order — so nobody is owed
anything yet and it should simply be done again.

```bash
.venv/bin/python -m scripts.order_resolve --ref PU-FUP34S --bounced \
  --note "Opay reversed 2609... the same evening."
```

That returns the order to where it was before the payout — `usdc_locked` for a
cash-out, `awaiting_fiat` with a fresh window for an add-money order — keeping
the failed reference in the timeline, and the agent pays again on the same order.

`--bounced` is the only path to a second payout, and only an operator can take
it. Neither party can reach it by claiming a transfer failed, because every extra
fiat payment is real money leaving someone's account. A bounce doesn't restart
the cash-out clocks either: the customer's refund window still runs from when
their USDC was locked, so a failed payout can't be used to hold their money
longer.

Upholding a cash-out credits the agent's float; rejecting one returns the
customer's USDC from escrow. For an add-money order, upholding releases the USDC
and rejecting frees the agent's reserved float. Both sides see the note in the
order's timeline. There is deliberately no HTTP route for any of this.

## Auth

The app sends the Pollar session token on every call:

```ts
const { session } = getClient().getAuthState();   // when step === "authenticated"
fetch(`${API}/api/me`, { headers: { Authorization: `Bearer ${session.token.accessToken}` } });
```

The API checks it with Pollar's `POST /v1/tokens/verify` using `POLLAR_SECRET_KEY`,
then uses the returned user ID and Stellar wallet. For local testing without
Pollar, set `DEV_AUTH=1` and send `Authorization: Dev <userId> <G-address>`.
This is ignored when `ENVIRONMENT=production`.

## Endpoints

| Method | Path | Who | What it does |
|---|---|---|---|
| GET | `/api/agents?country=NG` | anyone | Agents, rates, available USDC |
| GET | `/api/me` | signed in | The user, plus their agent desk if they run one |
| POST | `/api/orders` | customer | `{type, agentId, fiatAmount \| usdcAmount, payout?}` → 201 |
| GET | `/api/orders?as=user\|agent&scope=open` | signed in | My orders, or my agent queue |
| GET | `/api/orders/{id}` | either side | Order and timeline. Poll every ~4 s while open |
| POST | `/api/orders/{id}/fiat-sent` | cash_in: customer · cash_out: agent `{reference}` | Fiat was sent |
| POST | `/api/orders/{id}/usdc-sent` | cash_out: customer `{txHash}` | Attach the `runTx` hash; verified on Stellar |
| POST | `/api/orders/{id}/confirm` | cash_in: agent · cash_out: customer | Fiat arrived. For cash_in this releases USDC |
| POST | `/api/orders/{id}/refund` | cash_out: customer | After the payout window, USDC goes back |
| POST | `/api/orders/{id}/dispute` | either side `{reason}` | Flag fiat that didn't arrive |
| GET | `/api/proof` | anyone | Totals, escrow solvency, recent settled orders with hashes |

Every order carries `actions`, the endpoints the current viewer may call right
now, so the UI never duplicates state logic. `confirm` and `refund` return
**202** with `pending: true` while the Stellar payment is still landing; keep
polling the order. Errors always look like `{ "error": { "code", "message", "details" } }`.

Request and response shapes come from `app/web/schemas.py`. FastAPI publishes
them at `/docs` and `/openapi.json`, which a frontend can use to generate its types.

### Cash-out payment from the app

```ts
const { escrow, usdcAmount } = order;
const result = await runTx(
  "payment",
  { destination: escrow.address, amount: usdcAmount, asset: { type: "credit_alphanum4", code: "USDC", issuer: escrow.asset.issuer } },
  { memo: { type: "text", value: escrow.memo } },
);
if (result.status === "success") await post(`/api/orders/${order.id}/usdc-sent`, { txHash: result.hash });
```

The memo and the exact amount are required: that's how the API ties the payment to the order.

## Order states

```
cash_in   awaiting_fiat → fiat_sent → releasing → completed      (expired, disputed)
cash_out  awaiting_usdc → usdc_locked → fiat_sent → completed    (expired, refunding → refunded, disputed)
```

- An agent's float and an order's status change in one transaction with the agent
  row locked. Two customers can't claim the same USDC, and the database rejects
  a reservation above the float.
- Only the agent's confirmation releases escrow USDC. "I've paid" never does.
- Escrow payouts are saved (hash + signed envelope) before they're submitted.
  A retry resubmits the same envelope. A new one is signed only after the old
  one is proven unable to land, so an order is never paid twice.
- Time-based transitions (expiry, auto-complete, retrying payouts that are still
  settling) run in a maintenance loop inside the API process, every
  `MAINTENANCE_INTERVAL_SECONDS` (default 15). GET requests never write.

## Test

Unit tests cover the pure business rules and run in about half a second, with no
database or network:

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
```

The end-to-end suite runs the real API against Postgres and Stellar testnet:

```bash
.venv/bin/python -m scripts.e2e_testnet
```

It creates throwaway testnet accounts and its own test USDC, starts the API on a
fresh `<db>_e2e` database, and runs every flow over HTTP:
- add money
- a fee-bumped cash-out, the way Pollar sends payments
- refund
- permission and replay checks
- a race for the same float
- the proof page
- both crash-recovery paths for escrow payouts
- maintenance: expiry and auto-completion

It takes 2–3 minutes.

## Deploy

Any host that runs a long-lived Python process works (Render, Railway, Fly).
Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set:
- the variables from `.env.example`, with `ENVIRONMENT=production` and `DEV_AUTH` unset
- `CORS_ORIGINS` to the frontend's URL

With Supabase, use the transaction pooler connection string.
