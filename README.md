# Puente

The African leg of the Africa ↔ Bolivia corridor on Pollar: local agents handle
add-money and cash-out for Pollar wallets, with a Stellar escrow holding USDC in between.

This repository holds the backend, a FastAPI service for orders, agent floats, the
Stellar escrow and the public proof page:

- [backend/README.md](backend/README.md): run it, the endpoints, deployment
- [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md): how the code is organized

The frontend is built separately. It uses the API documented at `/docs`.
