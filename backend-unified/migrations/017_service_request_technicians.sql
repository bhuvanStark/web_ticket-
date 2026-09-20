-- Additive: allows more than one technician on a service ticket.
-- service_requests.assigned_technician_id remains the single PRIMARY owner
-- (unchanged behavior, unchanged column). Rows here are ADDITIONAL
-- technicians with a restricted, read-mostly view on the technician side.
CREATE TABLE IF NOT EXISTS service_request_technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  -- Mirrors service_requests.service_type's vocabulary ('onsite_service' |
  -- 'remote_support') for this additional technician's own mode.
  service_mode text NOT NULL DEFAULT 'onsite_service',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_request_id, technician_id)
);

CREATE INDEX IF NOT EXISTS service_request_technicians_request_idx
  ON service_request_technicians (service_request_id);
