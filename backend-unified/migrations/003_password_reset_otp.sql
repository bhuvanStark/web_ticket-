-- Customer password reset by emailed OTP (no admin approval).
--
-- The customer requests a reset, receives a 4-digit code by email, enters it
-- in the app, and then sets a new password. These columns hold the code.

ALTER TABLE password_resets
  ADD COLUMN IF NOT EXISTS otp_hash text,
  ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS otp_attempts integer NOT NULL DEFAULT 0;
