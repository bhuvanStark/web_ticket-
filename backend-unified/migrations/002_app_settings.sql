-- Organisation-wide admin dashboard configuration.
--
-- A single row (id = 1) holds the toggles the admin sets on the Settings page:
--   enabled_modules  - which sidebar modules are visible
--   role_permissions - per-role page access map
--
-- The dashboard reads this on load and writes it when "Save Configuration
-- Settings" is clicked, so the toggles survive a page refresh.

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  enabled_modules jsonb NOT NULL DEFAULT '{}'::jsonb,
  role_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

INSERT INTO app_settings (id, enabled_modules, role_permissions)
VALUES (
  1,
  '{
    "requests": true, "customers": true, "rooms": true, "technicians": true,
    "installations": true, "inventory": true, "demos": true, "calendar": true,
    "history": true, "reports": true
  }'::jsonb,
  '{
    "Super Admin": {
      "dashboard": true, "requests": true, "customers": true, "rooms": true,
      "technicians": true, "installations": true, "inventory": true, "demos": true,
      "calendar": true, "history": true, "reports": true, "staff": true, "settings": true
    },
    "Service Manager": {
      "dashboard": true, "requests": true, "customers": true, "rooms": true,
      "technicians": true, "installations": true, "inventory": true, "demos": true,
      "calendar": true, "history": true, "reports": true, "staff": false, "settings": false
    },
    "Dispatcher": {
      "dashboard": true, "requests": true, "customers": true, "rooms": true,
      "technicians": false, "installations": false, "inventory": false, "demos": false,
      "calendar": true, "history": true, "reports": false, "staff": false, "settings": false
    }
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
