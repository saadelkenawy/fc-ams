-- V005: multi-specialty doctors
-- A doctor keeps a primary specialty (doctors.specialty_id — referenced by
-- appointments/billing) and may carry additional specialties. Per-specialty
-- revenue-split overrides live inside the existing revenue_splits JSONB under
-- the optional "bySpecialty" key ({ "<specialtyId>": {consultation, operative,
-- online} }) — no schema change needed for those.

ALTER TABLE doctors
    ADD COLUMN IF NOT EXISTS secondary_specialty_ids INT[] NOT NULL DEFAULT '{}';
