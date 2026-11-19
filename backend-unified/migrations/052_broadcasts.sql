-- Broadcasts: an admin's announcement popup, shown to the chosen employees
-- (Technician / Sales / Back-Office) when they open the app and again
-- before Check In until they tap "Got it".
--
-- Rules (enforced in services/broadcastService.js):
--   * A broadcast lives 24 hours from sending (expires_at), or until an
--     admin ends it early (ended_at).
--   * One live broadcast per employee: anyone already in a live broadcast
--     cannot be added to another until it ends, or until they are removed
--     from it (their broadcast_recipients row is deleted).
--   * Text cannot be edited after sending.
--
-- broadcast_recipients uses the same one-of-three owner columns as
-- attendance_records. ON DELETE CASCADE everywhere, so deleting an employee
-- row (staff removal "Delete") never trips on a broadcast.
-- Runs inside scripts/migrate.js's transaction.

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tone text NOT NULL CHECK (tone IN ('info', 'nudge', 'kudos', 'important')),
  emoji text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  headline text NOT NULL CHECK (length(btrim(headline)) BETWEEN 1 AND 120),
  highlight text CHECK (highlight IS NULL OR length(btrim(highlight)) BETWEEN 1 AND 60),
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 1 AND 600),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 3),
  audience text NOT NULL CHECK (audience IN ('everyone', 'custom')),
  created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  ended_at timestamptz,
  ended_by_name text,
  CONSTRAINT broadcasts_expires_after_created CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_expires_at ON broadcasts (expires_at);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES technicians(id) ON DELETE CASCADE,
  sales_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  back_office_id uuid REFERENCES back_office(id) ON DELETE CASCADE,
  seen_at timestamptz,
  acknowledged_at timestamptz,
  CONSTRAINT broadcast_recipients_owner_check CHECK (num_nonnulls(technician_id, sales_id, back_office_id) = 1),
  CONSTRAINT broadcast_recipients_ack_after_seen CHECK (acknowledged_at IS NULL OR seen_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients (broadcast_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_unique_technician
  ON broadcast_recipients (broadcast_id, technician_id) WHERE technician_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_unique_sales
  ON broadcast_recipients (broadcast_id, sales_id) WHERE sales_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_unique_back_office
  ON broadcast_recipients (broadcast_id, back_office_id) WHERE back_office_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_technician
  ON broadcast_recipients (technician_id) WHERE technician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_sales
  ON broadcast_recipients (sales_id) WHERE sales_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_back_office
  ON broadcast_recipients (back_office_id) WHERE back_office_id IS NOT NULL;
