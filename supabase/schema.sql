create extension if not exists "pgcrypto";

create table if not exists exchange_rates (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  code text not null,
  numeric_code text,
  name text,
  nominal integer not null default 1,
  rate numeric(18, 6) not null,
  diff numeric(18, 6),
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (as_of_date, code)
);

create index if not exists exchange_rates_date_idx on exchange_rates (as_of_date desc);
create index if not exists exchange_rates_code_idx on exchange_rates (code);

create table if not exists gold_prices (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  weight_grams integer not null,
  sell_price_uzs bigint,
  buyback_intact_uzs bigint,
  buyback_damaged_uzs bigint,
  source_url text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (as_of_date, weight_grams)
);

create index if not exists gold_prices_date_idx on gold_prices (as_of_date desc);

create table if not exists policy_rates (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null unique,
  value_percent numeric(8, 3) not null,
  source_url text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table if not exists cbu_publications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null unique,
  section text not null,
  published_at timestamptz,
  detected_at timestamptz not null default now()
);

create index if not exists cbu_publications_detected_idx on cbu_publications (detected_at desc);
