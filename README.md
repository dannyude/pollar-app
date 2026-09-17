# Puente

The African leg of the Africa ↔ Bolivia corridor on Pollar: local agents handle
add-money and cash-out for Pollar wallets, with a Stellar escrow holding USDC in between.

| Folder | What |
|---|---|
| `backend/` | FastAPI service: orders, agent floats, the Stellar escrow, the proof page. [README](backend/README.md) · [architecture](backend/ARCHITECTURE.md) |
| `front-end/` | Next.js app: landing page, dashboard, send, orders, agent desk, proof. [README](front-end/README.md) |

The front-end calls the API documented at `/docs`, with its schema at `/openapi.json`.
