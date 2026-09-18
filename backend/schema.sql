-- Puente schema. Idempotent: safe to run on every deploy (`pnpm db:migrate`).
-- Money columns are numeric, never float: USDC has 7 decimals on Stellar,
-- fiat is stored to the minor unit (2 decimals), rates to 6 decimals.

create table if not exists users (
  id          text primary key,                 -- Pollar userId
  wallet      text not null,                    -- Stellar G-address from the Pollar session
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists agents (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null unique references users(id),
  display_name    text not null,
  country         text not null,                -- ISO 3166-1 alpha-2, e.g. NG
  currency        text not null,                -- ISO 4217, e.g. NGN
  rail            text not null default 'bank_transfer'
                  check (rail in ('bank_transfer', 'mobile_money', 'cash')),
  pay_details     jsonb not null,               -- where users send fiat: { bank, accountNumber, accountName }
  rate_buy        numeric(20,6) not null,       -- fiat the agent pays per USDC (cash-out)
  rate_sell       numeric(20,6) not null,       -- fiat the user pays per USDC (add money)
  min_fiat        numeric(20,2) not null default 0,
  max_fiat        numeric(20,2) not null default 1000000,
  float_usdc      numeric(20,7) not null default 0,  -- agent-owned USDC held in escrow
  reserved_usdc   numeric(20,7) not null default 0,  -- part of the float promised to open add-money orders
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint agents_rates_positive check (rate_buy > 0 and rate_sell > 0),
  constraint agents_reserved_within_float check (reserved_usdc >= 0 and reserved_usdc <= float_usdc)
);

create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  ref               text not null unique,       -- PU-XXXXXX; also the memo on every Stellar payment
  type              text not null check (type in ('cash_in', 'cash_out')),
  status            text not null,
  user_id           text not null references users(id),
  agent_id          uuid not null references agents(id),
  user_wallet       text not null,              -- cash_in: payout destination · cash_out: expected payer
  currency          text not null,
  fiat_amount       numeric(20,2) not null check (fiat_amount > 0),
  usdc_amount       numeric(20,7) not null check (usdc_amount > 0),
  rate              numeric(20,6) not null,
  pay_details       jsonb,                      -- cash_in: agent account the user pays (snapshot)
  payout_details    jsonb,                      -- cash_out: user account the agent pays
  agent_reference   text,                       -- cash_out: bank reference of the agent's payout
  funding_tx        text unique,                -- cash_out: user → escrow
  release_tx        text unique,                -- cash_in: escrow → user
  release_xdr       text,
  release_max_time  timestamptz,
  refund_tx         text unique,                -- cash_out refund: escrow → user
  refund_xdr        text,
  refund_max_time   timestamptz,
  dispute_reason    text,
  expires_at        timestamptz,
  locked_at         timestamptz,
  fiat_sent_at      timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint orders_status_valid check (
    (type = 'cash_in'  and status in ('awaiting_fiat', 'fiat_sent', 'releasing', 'completed', 'expired', 'disputed')) or
    (type = 'cash_out' and status in ('awaiting_usdc', 'usdc_locked', 'fiat_sent', 'completed', 'expired', 'refunding', 'refunded', 'disputed'))
  )
);

-- A payout reference is evidence of one bank transfer, so it can't be the
-- evidence for two orders. Scoped per agent: two desks may see the same
-- provider sequence, one desk reusing a reference is reusing a receipt.
do $$
begin
  create unique index if not exists orders_agent_reference_uq
    on orders (agent_id, agent_reference) where agent_reference is not null;
exception when unique_violation then
  raise notice 'orders_agent_reference_uq not created: orders already share a payout reference. Settle them (scripts.order_resolve) and re-run.';
end $$;

-- A client can send Idempotency-Key when opening an order, so a double-tap
-- returns the first order instead of opening a second one that reserves float.
alter table orders add column if not exists idempotency_key text;
create unique index if not exists orders_idempotency_uq
  on orders (user_id, idempotency_key) where idempotency_key is not null;

create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_agent_idx on orders (agent_id, created_at desc);
create index if not exists orders_status_idx on orders (status, type);

create table if not exists order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references orders(id),
  from_status  text,
  to_status    text not null,
  actor        text not null check (actor in ('user', 'agent', 'system')),
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists order_events_order_idx on order_events (order_id, id);
