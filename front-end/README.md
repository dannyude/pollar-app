# Puente — frontend

Puente moves money between Nigeria and Latin America: a customer buys or sells USDC
with a local agent, and a Stellar escrow holds the USDC until both sides are done.
Sign-in and wallets come from the **Pollar SDK**; every order is settled by the
[Puente API](../backend).

Next.js 16 (App Router) · Tailwind v4 · `@pollar/react` · axios.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the blanks
npm run dev
```

The backend must be running too — see [`../backend/README.md`](../backend/README.md).
`NEXT_PUBLIC_API_URL` has to end in `/api`.

### Allow your domain in the Pollar dashboard

A publishable key only works from origins you have registered. In
dashboard.pollar.xyz → **Build → Domains**, add every origin that will load the app:

```text
http://localhost:3000      # local development
https://your-app.vercel.app
```

Without it the SDK logs `GET /applications/config 403 ORIGIN_NOT_ALLOWED` and nobody
can sign in.

## The two sign-in modes

`src/context/AuthContext.tsx` picks one at build time:

| Mode | When | What happens |
| --- | --- | --- |
| `pollar` | `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` is set | Pollar's modal signs the user in, and the API is called with `Authorization: Bearer <session token>` |
| `dev` | `NEXT_PUBLIC_DEV_WALLET` is set | One click signs you in as `NEXT_PUBLIC_DEV_USER` with `Authorization: Dev <user> <wallet>`; needs `DEV_AUTH=1` on the backend |
| `unconfigured` | neither | The app renders but nobody can sign in |

Dev mode is for exercising the order flows locally without a Pollar account. It also
shows a "paste the transaction hash" box on cash-out orders, because signing a
payment needs a real Pollar wallet.

## How an order moves

Both flows are driven by `order.actions`, which the API computes — the UI never
decides for itself what is allowed next.

**Adding money (cash-in).** Dashboard → pick an agent → amount in naira. The order
page shows the agent's bank details and the reference to quote. You mark the transfer
sent, the agent confirms the naira arrived, and the escrow releases USDC to your
Pollar wallet.

**Cashing out.** Dashboard → *Cash out* → amount and the account the agent should pay.
You send the USDC to the escrow address with the order's memo (`SendUsdcButton` signs
it with Pollar), the agent pays the fiat and records their reference, and you confirm
it landed — which credits the agent's float.

`/proof` reads `GET /api/proof`: the escrow's real USDC balance against everything it
owes, plus the settled transactions with links to Stellar.

## Structure

```text
src/
├── api/client.ts          # the API contract: types, helpers, and the auth header
├── lib/pollar.tsx         # one PollarClient, mounted browser-side only
├── context/AuthContext.tsx# sign-in, profile, the puente_session cookie
├── app/(marketing)/       # landing page
├── app/(app)/             # dashboard, orders, order detail, agent desk, proof, send
├── components/            # layout, ui, orders/SendUsdcButton
├── hooks/                 # useToast, useOrderTracking (polls while an order is live)
└── middleware.ts          # keeps signed-out visitors on /login
```

## Deploying

Vercel: set `NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY` and `NEXT_PUBLIC_API_URL` as
environment variables, add the deployed origin to Pollar's Domains list, and add the
same origin to `CORS_ORIGINS` on the backend.
