-- Web Push for technicians: one row per browser/device a technician has
-- enabled ticket-assignment notifications on. Purely additive — no existing
-- table is altered. Rows are removed when the technician turns
-- notifications off / logs out, or automatically when the push service
-- reports the subscription as expired (404/410).

BEGIN;

CREATE TABLE technician_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE: a subscription is meaningless once its technician is gone.
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_technician_push_subscriptions_tech ON technician_push_subscriptions(technician_id);

CREATE TRIGGER technician_push_subscriptions_set_updated_at
  BEFORE UPDATE ON technician_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
