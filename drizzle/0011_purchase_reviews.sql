CREATE UNIQUE INDEX payment_receipts_slip_idx ON payment_receipts(slip_sha256);
CREATE TABLE purchase_reviews (
  order_id TEXT PRIMARY KEY NOT NULL REFERENCES purchase_orders(id),
  admin_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  slip_sha256 TEXT NOT NULL,
  note TEXT NOT NULL,
  approved_at INTEGER NOT NULL
);
