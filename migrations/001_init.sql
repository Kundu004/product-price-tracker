-- Run this once in the Supabase SQL Editor.

create extension if not exists "pgcrypto"; -- needed for gen_random_uuid()

create table tracked_products (
  id                uuid primary key default gen_random_uuid(),
  store_product_id  text not null,          -- numeric id from the item URL, e.g. "2947"
  product_name      text not null,          -- snapshot at tracking time
  selected_option   text not null,          -- store's option code, e.g. "o1"
  option_label      text,                   -- human-readable, e.g. "Solo" — for UI/CSV
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (store_product_id, selected_option)
);

create table scrape_attempts (
  id                  uuid primary key default gen_random_uuid(),
  tracked_product_id  uuid not null references tracked_products(id) on delete cascade,
  attempted_at        timestamptz not null default now(),
  outcome             text not null check (outcome in ('success', 'retried', 'failed')),
  retry_count         int not null default 0,
  price               numeric,             -- NULL when outcome = 'failed'
  stock               text,                -- text: store shows things like "Last few: 71", not just a number
  error_reason        text,                -- e.g. "challenge_failed", "timeout" — null on success
  created_at          timestamptz not null default now()
);

create index idx_scrape_attempts_product_time
  on scrape_attempts (tracked_product_id, attempted_at desc);
