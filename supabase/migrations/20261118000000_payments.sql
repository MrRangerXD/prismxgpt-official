create type payment_asset as enum ('upi','ltc','sol','trx','usdt_trc20','usdt_spl');
create type payment_status as enum ('pending','seen','confirming','paid','expired','failed','review');

create table payment_orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan_id         text not null,
  asset           payment_asset not null,
  expected_atomic text not null,
  address         text,
  utr             text,
  tx_hash         text,
  confirmations   int not null default 0,
  status          payment_status not null default 'pending',
  credited_at     timestamptz,
  expires_at      timestamptz not null default now() + interval '30 minutes',
  created_at      timestamptz not null default now()
);

create unique index payment_orders_tx  on payment_orders (tx_hash) where tx_hash is not null;
create unique index payment_orders_utr on payment_orders (utr)     where utr     is not null;
create index payment_orders_open on payment_orders (asset, status)
  where status in ('pending','seen','confirming');

alter table payment_orders enable row level security;
create policy "own orders" on payment_orders for select using (auth.uid() = user_id);
