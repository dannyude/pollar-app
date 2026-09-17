# Puente - Frontend

Puente is a hackathon project demonstrating cross-border payments between Africa (NGN) and Latin America (BOB) settled instantly via **Stellar Escrow** and powered by the **Pollar SDK**.

This repository contains the Next.js frontend application.

## 🚀 Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: `react-icons` (Feather Icons `Fi` & Simple Icons `Si`)
- **Typography**: Plus Jakarta Sans
- **State Management**: React Context (`AuthContext`)

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy the `.env.example` file to create your local environment configuration:
```bash
cp .env.example .env.local
```

You will need the following variables:
- `NEXT_PUBLIC_API_URL`: The URL of the Puente FastAPI backend (e.g., `http://localhost:8000/api`).
- `NEXT_PUBLIC_POLLAR_APP_ID`: Your App ID from the [Pollar Dashboard](https://dashboard.pollar.xyz).
- `NEXT_PUBLIC_POLLAR_ENV`: The Pollar environment (`testnet` or `mainnet`).
- `NEXT_PUBLIC_STELLAR_NETWORK`: The Stellar network (`testnet` or `mainnet`).

*Note: You **do not** need to write or deploy any custom Rust/Soroban smart contracts for this project. The Pollar SDK and backend handle all Stellar native escrow logic (multisig, trustlines, timebounds) under the hood.*

### 3. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the app.

---

## 🏗️ Project Structure

```text
src/
├── api/
│   └── client.ts          # Axios client + mock API layer for Pollar logic
├── app/
│   ├── (marketing)/       # Public pages (Landing Page, How it works)
│   ├── (app)/             # Protected pages (Dashboard, Agent Desk, Send Flow)
│   ├── login/             # Authentication page
│   ├── globals.css        # Tailwind v4 theme variables (HSL)
│   └── layout.tsx         # Root layout with font configuration
├── components/
│   ├── layout/            # Sidebar, Navbars
│   └── ui/                # Reusable UI components (Modals, Toasts)
├── context/
│   └── AuthContext.tsx    # Auth state, local storage persistence, cookie management
├── hooks/                 # Custom React hooks (useToast, useOrderTracking)
└── middleware.ts          # Next.js Edge Middleware for route protection
```

---

## 🔐 Architecture Notes

### Authentication & Route Protection
Authentication is handled via the `AuthContext` which saves a user object in `localStorage` and drops a `puente_session` cookie.

The Next.js `middleware.ts` runs on the edge and checks for the presence of the `puente_session` cookie. If an unauthenticated user tries to hit a protected route (like `/dashboard`), they are server-side redirected to `/login?redirect=/dashboard`.

If a user's `localStorage` is wiped but their cookie remains, the `AuthContext` safely clears the cookie to prevent infinite redirect loops.

### Mock API & Client
Currently, parts of the Pollar SDK interaction are stubbed out with `setTimeout` mocks in `src/api/client.ts` to allow for UI/UX development without relying on a live backend.

---

## 🚧 Next Steps for Developers

The UI/UX is fully complete, linted, and production-ready. 
The immediate next step is to **finalize the Pollar SDK Integration**:

1. **Auth Context**: In `src/context/AuthContext.tsx`, remove the `MOCK_USER` logic inside the `login` function. Replace it with the actual `pollarClient.login("google")` call.
2. **Send Flow**: In `src/app/(app)/send/page.tsx`, find the `// ⚠️ MOCK: Replace with Pollar SDK` comments. Swap the mock timeouts with actual calls to the backend `POST /api/orders` endpoint.
3. **API Client**: In `src/api/client.ts`, hook up the `Axios` interceptor to attach the real Pollar session token (`Authorization: Bearer <token>`) instead of the `Dev` header.
