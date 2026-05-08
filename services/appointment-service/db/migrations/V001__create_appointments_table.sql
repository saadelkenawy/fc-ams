-- Migration: V001 — Create appointments tables
-- Ref: database.md Enhancement #6 (composite partitioning), #7 (UUID FK), #8 (exclusion constraint)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- Required for EXCLUDE USING gist on non-geometric types

-- ─── SPECIALTIES ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS specialties (
    id        SERIAL PRIMARY KEY,
    code      VARCHAR(50) UNIQUE NOT NULL,   -- Stable code e.g. "GYN", "DENT" for integrations
    name_en   VARCHAR(100) NOT NULL,
    name_ar   VARCHAR(100) NOT NULL,
    category  VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DOCTORS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctors (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile     VARCHAR(20) UNIQUE NOT NULL,
    name_en    VARCHAR(200) NOT NULL,
    name_ar    VARCHAR(200),
    specialty_id INT REFERENCES specialties(id),
    sub_specialty VARCHAR(100),
    is_online_doctor BOOLEAN DEFAULT FALSE,

    -- Revenue-split percentages
    consultation_split_doctor DECIMAL(5,2) DEFAULT 50.00,
    consultation_split_clinic DECIMAL(5,2) DEFAULT 50.00,
    operative_split_doctor    DECIMAL(5,2) DEFAULT 80.00,
    operative_split_clinic    DECIMAL(5,2) DEFAULT 20.00,
    online_split_doctor       DECIMAL(5,2) DEFAULT 70.00,
    online_split_clinic       DECIMAL(5,2) DEFAULT 30.00,

    CONSTRAINT splits_sum_consultation CHECK (consultation_split_doctor + consultation_split_clinic = 100),
    CONSTRAINT splits_sum_operative    CHECK (operative_split_doctor    + operative_split_clinic    = 100),
    CONSTRAINT splits_sum_online       CHECK (online_split_doctor       + online_split_clinic       = 100),

    payment_method             VARCHAR(50),
    payment_details_encrypted  TEXT,
    payment_encryption_key_id  VARCHAR(50),

    allow_overbooking                BOOLEAN DEFAULT TRUE,
    overbooking_buffer_percentage    DECIMAL(5,2) DEFAULT 10.00
        CHECK (overbooking_buffer_percentage BETWEEN 0 AND 15),

    is_active  BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    version    INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    branch_id  INT NOT NULL DEFAULT 1
);

-- ─── DOCTOR SCHEDULES ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctor_schedules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id    UUID REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week  SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    slot_duration_minutes INT DEFAULT 15,
    is_active    BOOLEAN DEFAULT TRUE,
    valid_from   DATE NOT NULL,
    valid_until  DATE,
    branch_id    INT DEFAULT 1,

    CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- ─── DOCTOR SCHEDULE OVERRIDES ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctor_schedule_overrides (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id     UUID REFERENCES doctors(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    override_type VARCHAR(20) CHECK (override_type IN ('unavailable', 'custom_hours', 'holiday')),
    custom_start_time TIME,
    custom_end_time   TIME,
    reason         VARCHAR(200),
    notify_patients BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    created_by     UUID
);

-- ─── APPOINTMENTS ─────────────────────────────────────────────────────────────
-- ⭐ Enhancement #6: Partitioned by LIST(branch_id) → sub-partitioned by RANGE(appointment_date)
-- ⭐ Enhancement #7: FK on patient UUID, not mobile
-- ⭐ Enhancement #8: Exclusion constraint prevents double-booking

CREATE TABLE IF NOT EXISTS appointments (
    id          UUID DEFAULT gen_random_uuid(),
    patient_id  UUID NOT NULL,   -- FK enforced at app layer; cross-service reference to patients
    doctor_id   UUID REFERENCES doctors(id),
    specialty_id INT REFERENCES specialties(id),

    -- Scheduling
    appointment_date DATE NOT NULL,
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    appointment_range tsrange GENERATED ALWAYS AS (
        tsrange(
            (appointment_date + start_time)::timestamp,
            (appointment_date + end_time)::timestamp,
            '[)'
        )
    ) STORED,
    time_zone VARCHAR(50) DEFAULT 'Africa/Cairo',

    -- Status workflow
    status VARCHAR(20) NOT NULL DEFAULT 'TBC'
        CHECK (status IN ('TBC', 'Ok!', 'Conf.', 'Comp.', 'Canc.', 'Resch.', 'Inf.')),

    appointment_type VARCHAR(50) DEFAULT 'in_person',
    is_online        BOOLEAN DEFAULT FALSE,
    is_overbooked    BOOLEAN DEFAULT FALSE,

    patient_source   VARCHAR(50) NOT NULL DEFAULT 'Cl.s',
    procedure_id     UUID,

    -- Financial snapshot (denormalised for read performance)
    approved_charge  DECIMAL(12,2),
    procedure_cost   DECIMAL(12,2),

    -- Queue management
    queue_number         INT,
    checked_in_at        TIMESTAMPTZ,
    checked_out_at       TIMESTAMPTZ,
    waiting_time_minutes INT,

    -- Reschedule chain
    original_appointment_id UUID,
    reschedule_count        INT DEFAULT 0,

    -- Idempotency for retry safety (uniqueness enforced via index on leaf partitions)
    idempotency_key VARCHAR(100),

    -- Optimistic concurrency
    version     INT NOT NULL DEFAULT 1,

    -- Soft delete
    deleted_at  TIMESTAMPTZ,

    notes       TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    branch_id   INT NOT NULL DEFAULT 1,

    -- ⭐ Composite PK required for list+range partitioning
    PRIMARY KEY (branch_id, appointment_date, id)

) PARTITION BY LIST (branch_id);

-- ─── PARTITIONS ───────────────────────────────────────────────────────────────

-- Branch 1 — parent partition (sub-partitioned by date)
CREATE TABLE appointments_branch_1
    PARTITION OF appointments
    FOR VALUES IN (1)
    PARTITION BY RANGE (appointment_date);

-- Branch 1 — initial monthly sub-partition for May 2026
CREATE TABLE appointments_branch_1_y2026m05
    PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- ⭐ Exclusion constraint on leaf partition: prevents double-booking the same doctor
--    at overlapping times. Unsupported on partitioned parents — must live on leaf tables.
ALTER TABLE appointments_branch_1_y2026m05
    ADD CONSTRAINT appt_no_double_book_b1_2026m05
    EXCLUDE USING gist (
        doctor_id         WITH =,
        appointment_range WITH &&
    ) WHERE (
        status NOT IN ('Canc.', 'Resch.')
        AND is_overbooked = FALSE
        AND deleted_at IS NULL
    );

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_appointments_patient
    ON appointments (patient_id, appointment_date DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date
    ON appointments (doctor_id, appointment_date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_status
    ON appointments (status, appointment_date)
    WHERE status IN ('TBC', 'Ok!', 'Conf.');

CREATE INDEX IF NOT EXISTS idx_appointments_source
    ON appointments (patient_source, appointment_date);

-- Idempotency uniqueness enforced per-partition (partitioned tables can't have global UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_idempotency_b1_2026m05
    ON appointments_branch_1_y2026m05 (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_branch
    ON appointments (branch_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_doctors_specialty
    ON doctors (specialty_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_active
    ON doctors (is_active)
    WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_doctor_day
    ON doctor_schedules (doctor_id, day_of_week)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_overrides_doctor_date
    ON doctor_schedule_overrides (doctor_id, override_date);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_branch_isolation ON appointments
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);

ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY doctors_branch_isolation ON doctors
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);

ALTER TABLE doctors FORCE ROW LEVEL SECURITY;

-- ─── AUTO-UPDATE updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER doctors_updated_at
    BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
