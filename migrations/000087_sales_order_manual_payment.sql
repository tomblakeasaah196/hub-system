-- ============================================================
-- MIGRATION 000087 — Manual "Mark as Paid" audit on sales orders
--
-- Context: the Optimus Pay provider has stopped delivering their
-- Transaction Notification webhook, so a bank-transfer web order
-- that was in fact paid will sit at `payment_pending` forever.
-- Staff need to confirm payment manually from the admin orders view
-- (looking at the actual bank statement / Optimus dashboard) and
-- flip the order to paid.
--
-- To keep an audit trail of who did the manual flip, and against
-- which external reference (bank txn id, Optimus ref, etc.), we
-- add three nullable columns to <biz>.sales_orders. They stay NULL
-- for every normally-settled order (webhook, Paystack, POS) and
-- are only populated when a human clicked "Mark as Paid" from the
-- Sales admin UI.
--
-- Additive and safe — no new constraints, no backfill.
-- ============================================================

ALTER TABLE jewelry.sales_orders
  ADD COLUMN IF NOT EXISTS manual_payment_ref       TEXT,
  ADD COLUMN IF NOT EXISTS manually_marked_paid_by  UUID REFERENCES shared.users (user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manually_marked_paid_at  TIMESTAMPTZ;

ALTER TABLE diffusers.sales_orders
  ADD COLUMN IF NOT EXISTS manual_payment_ref       TEXT,
  ADD COLUMN IF NOT EXISTS manually_marked_paid_by  UUID REFERENCES shared.users (user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manually_marked_paid_at  TIMESTAMPTZ;
