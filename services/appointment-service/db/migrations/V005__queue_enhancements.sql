-- Migration: V005 — Queue enhancements
-- Adds: original_position, cancel/rejoin tracking columns, event enum value 'joined'

-- Add missing columns to patient_queue
ALTER TABLE patient_queue
    ADD COLUMN IF NOT EXISTS original_position INT,
    ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_reason      TEXT,
    ADD COLUMN IF NOT EXISTS rejoined_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejoin_position    INT;

-- Backfill original_position for any existing rows
UPDATE patient_queue SET original_position = position WHERE original_position IS NULL;

-- Add 'joined' as alias event type (existing 'checked_in' kept for compat)
DO $$ BEGIN
    ALTER TYPE queue_event_type ADD VALUE IF NOT EXISTS 'joined';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
