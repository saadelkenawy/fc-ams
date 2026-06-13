-- ─────────────────────────────────────────────────────────────────────────────
-- V007 — Per-specialty sub-specialties
--
-- A doctor practices a primary specialty plus optional additional specialties
-- (doctors.specialty_id + doctors.secondary_specialty_ids). Each of those
-- specialties may now carry its own set of sub-specialties, chosen from the
-- specialties catalogue. We store them as a JSONB map keyed by specialty id:
--   { "<specialtyId>": [<subSpecialtyId>, ...], ... }
--
-- The legacy free-text doctors.sub_specialty column is kept for backward
-- compatibility but is no longer written by the add-doctor flow.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS sub_specialty_ids JSONB NOT NULL DEFAULT '{}'::jsonb;
