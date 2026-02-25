-- Migration 003: Google Calendar — add direct refresh token storage
-- Simpler than Supabase Vault for self-hosted deployments.
-- (In production with Vault enabled, store only the vault_id instead.)
ALTER TABLE practitioner_credentials
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
