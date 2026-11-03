CREATE TABLE shop_products (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_satang INTEGER NOT NULL CHECK(price_satang BETWEEN 100 AND 100000000),
  duration_kind TEXT NOT NULL CHECK(duration_kind IN ('days','months','permanent')),
  duration_amount INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX shop_products_catalog_idx ON shop_products(deleted_at,enabled,sort_order);
CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  client_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES shop_products(id),
  product_name TEXT NOT NULL,
  price_satang INTEGER NOT NULL,
  duration_kind TEXT NOT NULL,
  duration_amount INTEGER NOT NULL,
  payment_config TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verifying','paid')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verify_token TEXT,
  verify_started_at INTEGER,
  verify_attempts INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER,
  last_error TEXT,
  slip_key TEXT,
  slip_sha256 TEXT,
  transaction_id TEXT UNIQUE,
  paid_at INTEGER,
  key_id TEXT NOT NULL UNIQUE
);
CREATE UNIQUE INDEX purchase_orders_retry_idx ON purchase_orders(owner_id,client_id);
CREATE INDEX purchase_orders_owner_idx ON purchase_orders(owner_id,created_at DESC);
CREATE INDEX purchase_orders_created_idx ON purchase_orders(created_at DESC);
CREATE TABLE payment_receipts (
  transaction_id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL UNIQUE REFERENCES purchase_orders(id),
  amount_satang INTEGER NOT NULL,
  transferred_at INTEGER NOT NULL,
  verified_at INTEGER NOT NULL,
  receiving_bank TEXT NOT NULL,
  slip_sha256 TEXT NOT NULL
);
