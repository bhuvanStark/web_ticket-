CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text NOT NULL,
  email text NOT NULL,
  password_hash text,
  phone text,
  address text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_email_ci_unique UNIQUE (email)
);
CREATE UNIQUE INDEX customers_email_lower_unique ON customers (lower(email));

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admins_email_lower_unique ON admins (lower(email));

CREATE TABLE technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  full_name text NOT NULL,
  phone text,
  specialization text,
  role_title text,
  status text NOT NULL DEFAULT 'available',
  is_active boolean NOT NULL DEFAULT true,
  rating numeric(3,2),
  avatar_url text,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technicians_rating_check CHECK (rating IS NULL OR rating BETWEEN 0 AND 5)
);
CREATE UNIQUE INDEX technicians_email_lower_unique ON technicians (lower(email));

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  postal_code text,
  country text DEFAULT 'India',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  legacy_code text,
  name text NOT NULL,
  room_type text,
  capacity integer,
  qr_code text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_capacity_check CHECK (capacity IS NULL OR capacity >= 0),
  UNIQUE (location_id, name),
  UNIQUE (qr_code)
);

CREATE TABLE equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  category text,
  type text,
  name text NOT NULL,
  model text,
  status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  assigned_technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL,
  issue_category text NOT NULL,
  issue_title text NOT NULL,
  issue_description text,
  service_type text,
  preferred_date date,
  preferred_time text,
  status text NOT NULL DEFAULT 'request_received',
  priority text NOT NULL DEFAULT 'high',
  resolution_notes text,
  customer_signature text,
  rating integer,
  feedback_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_requests_rating_check CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);

CREATE TABLE service_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  author_name text,
  notes text NOT NULL,
  work_done text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_request_id uuid REFERENCES service_requests(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  notifications_enabled boolean NOT NULL DEFAULT true,
  email_notifications boolean NOT NULL DEFAULT true,
  sms_notifications boolean NOT NULL DEFAULT false,
  preferred_contact_method text NOT NULL DEFAULT 'email',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  job_role text,
  access_level text NOT NULL DEFAULT 'authorized_user',
  status text NOT NULL DEFAULT 'invited',
  invite_token text UNIQUE,
  invite_token_expires_at timestamptz,
  password_hash text,
  invited_by uuid REFERENCES customers(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, email)
);

CREATE TABLE password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES admins(id) ON DELETE CASCADE,
  email text NOT NULL,
  approval_token text UNIQUE,
  approval_expires_at timestamptz,
  approved_at timestamptz,
  reset_token text UNIQUE,
  reset_expires_at timestamptz,
  consumed_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  requested_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT password_resets_owner_check CHECK (
    (customer_id IS NOT NULL AND admin_id IS NULL) OR
    (customer_id IS NULL AND admin_id IS NOT NULL)
  )
);

CREATE INDEX service_requests_customer_created_idx ON service_requests (customer_id, created_at DESC);
CREATE INDEX service_requests_technician_status_idx ON service_requests (assigned_technician_id, status);
CREATE INDEX service_requests_status_priority_idx ON service_requests (status, priority);
CREATE INDEX rooms_location_idx ON rooms (location_id);
CREATE INDEX equipment_room_idx ON equipment (room_id);
CREATE INDEX service_updates_request_created_idx ON service_updates (service_request_id, created_at DESC);
CREATE INDEX notifications_customer_created_idx ON notifications (customer_id, created_at DESC);
CREATE INDEX password_resets_status_idx ON password_resets (status, created_at DESC);
CREATE INDEX team_members_customer_idx ON team_members (customer_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['customers','admins','technicians','locations','rooms','equipment','customer_preferences','team_members','password_resets']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
  END LOOP;
END $$;
