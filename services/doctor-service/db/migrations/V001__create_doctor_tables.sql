-- Migration: V001 — Doctor Service
-- Creates: specialties, doctors (JSONB revenue_splits), doctor_schedules, doctor_schedule_overrides
-- Ref: database.md Enhancements #3 (extensions), #5 (RLS), #6 (partitioning)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── SPECIALTIES ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS specialties (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(50)  UNIQUE NOT NULL,
    name_en    VARCHAR(100) NOT NULL,
    name_ar    VARCHAR(100) NOT NULL,
    category   VARCHAR(50),
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed all 41 specialties
INSERT INTO specialties (code, name_en, name_ar, category) VALUES
    ('GYN',  'Gynecology & Infertility',          'النساء والعقم',                  'obstetrics'),
    ('PED',  'Pediatrics & Newborn',              'الأطفال والمواليد',              'pediatrics'),
    ('PSUR', 'Pediatrics Surgery',                'جراحة الأطفال',                 'surgery'),
    ('DENT', 'Dentistry',                         'الأسنان',                        'dental'),
    ('PSY',  'Psychiatry',                        'الطب النفسي',                    'mental'),
    ('PHYS', 'Physiotherapy',                     'العلاج الطبيعي',                 'rehab'),
    ('DERM', 'Dermatology',                       'الجلدية',                        'dermatology'),
    ('ALLG', 'Allergy & Immunology',              'الحساسية والمناعة',              'immunology'),
    ('PAIN', 'Pain Management',                   'التحكم في الألم',                'anesthesia'),
    ('PHON', 'Phoniatrics',                       'التخاطب',                        'ent'),
    ('DIET', 'Dietitian & Nutrition',             'التغذية والرجيم',                'nutrition'),
    ('OBS',  'Obesity & Laparoscopic Surgery',    'السمنة وجراحاتها',               'surgery'),
    ('OPTH', 'Ophthalmology',                     'العيون',                         'ophthalmology'),
    ('HEP',  'Hepatology',                        'الكبد',                          'gastro'),
    ('AUD',  'Audiology',                         'السمع',                          'ent'),
    ('PLAS', 'Plastic Surgery',                   'الجراحات التجميلية',             'surgery'),
    ('DIAB', 'Diabetes & Endocrinology',          'السكر والغدد الصماء',            'endocrine'),
    ('GAST', 'Gastroenterology & Endoscopy',      'الجهاز الهضمي والمناظير',       'gastro'),
    ('IVF',  'IVF & Infertility',                 'التلقيح الصناعي والعقم',        'obstetrics'),
    ('NEPH', 'Nephrology',                        'الكلى',                          'nephrology'),
    ('SPIN', 'Spinal Surgery',                    'جراحة العمود الفقري',           'surgery'),
    ('ELD',  'Elders Care',                       'كبار السن',                     'general'),
    ('BEAU', 'Beauty',                            'التجميل',                        'dermatology'),
    ('INT',  'Internal Medicine',                 'الباطنة',                        'general'),
    ('NEUR', 'Neurology',                         'المخ والأعصاب',                 'neurology'),
    ('NSUR', 'Neurosurgery',                      'جراحة المخ والأعصاب',           'surgery'),
    ('GSUR', 'General Surgery',                   'الجراحة العامة',                 'surgery'),
    ('URO',  'Urology',                           'المسالك البولية',               'urology'),
    ('VASC', 'Vascular Surgery',                  'جراحة الأوعية الدموية',         'surgery'),
    ('CARD', 'Cardiology',                        'القلب',                          'cardiology'),
    ('CHEST','Chest & Respiratory',               'أمراض الصدر والجهاز التنفسي',  'respiratory'),
    ('ONC',  'Oncology',                          'الأورام',                        'oncology'),
    ('OSUR', 'Oncology Surgery',                  'جراحة الأورام',                 'surgery'),
    ('ANDR', 'Andrology & Male Infertility',      'الذكورة والعقم',                'urology'),
    ('RHEU', 'Rheumatology',                      'الروماتيزم',                     'rheumatology'),
    ('ENT',  'ENT',                               'الأنف والأذن والحنجرة',         'ent'),
    ('HEMA', 'Hematology',                        'أمراض الدم',                    'hematology'),
    ('ORTH', 'Orthopedics',                       'جراحة العظام',                  'surgery'),
    ('ANES', 'Anesthesiology',                    'التخدير',                        'anesthesia'),
    ('RADL', 'Radiology',                         'الأشعة',                         'radiology'),
    ('EMRG', 'Emergency Medicine',                'الطوارئ',                        'emergency')
ON CONFLICT (code) DO NOTHING;

-- ─── DOCTORS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctors (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile       VARCHAR(20) UNIQUE NOT NULL,
    name_en      VARCHAR(200) NOT NULL,
    name_ar      VARCHAR(200),
    specialty_id INT         REFERENCES specialties(id),
    sub_specialty VARCHAR(100),
    is_online_doctor BOOLEAN NOT NULL DEFAULT FALSE,

    -- Revenue splits stored as JSONB: { consultation, operative, online }
    -- Each split: { doctorPercentage: number, clinicPercentage: number }
    revenue_splits JSONB NOT NULL DEFAULT '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',

    payment_method            VARCHAR(50),
    payment_details_encrypted TEXT,
    payment_encryption_key_id VARCHAR(50),

    allow_overbooking             BOOLEAN      NOT NULL DEFAULT TRUE,
    overbooking_buffer_percentage DECIMAL(5,2) NOT NULL DEFAULT 10.00
        CHECK (overbooking_buffer_percentage BETWEEN 0 AND 15),

    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    version    INT         NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    branch_id  INT         NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_doctors_specialty
    ON doctors (specialty_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_active
    ON doctors (is_active, branch_id) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_branch
    ON doctors (branch_id, deleted_at);

-- ─── DOCTOR SCHEDULES ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctor_schedules (
    id                    UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id             UUID     NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week           SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time            TIME     NOT NULL,
    end_time              TIME     NOT NULL,
    slot_duration_minutes INT      NOT NULL DEFAULT 15,
    is_active             BOOLEAN  NOT NULL DEFAULT TRUE,
    valid_from            DATE     NOT NULL,
    valid_until           DATE,
    branch_id             INT      NOT NULL DEFAULT 1,

    CONSTRAINT valid_schedule_time CHECK (start_time < end_time),
    -- Unique per doctor per day — enables ON CONFLICT (doctor_id, day_of_week) DO UPDATE
    CONSTRAINT uq_doctor_day UNIQUE (doctor_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_schedules_doctor_day
    ON doctor_schedules (doctor_id, day_of_week) WHERE is_active = TRUE;

-- ─── DOCTOR SCHEDULE OVERRIDES ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctor_schedule_overrides (
    id               UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id        UUID     NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    override_date    DATE     NOT NULL,
    override_type    VARCHAR(20) NOT NULL
        CHECK (override_type IN ('unavailable', 'custom_hours', 'holiday')),
    custom_start_time TIME,
    custom_end_time   TIME,
    reason            VARCHAR(500),
    notify_patients   BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        UUID,
    branch_id         INT      NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_overrides_doctor_date
    ON doctor_schedule_overrides (doctor_id, override_date);

CREATE INDEX IF NOT EXISTS idx_overrides_branch_date
    ON doctor_schedule_overrides (branch_id, override_date);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctors_branch_isolation ON doctors
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE doctors FORCE ROW LEVEL SECURITY;

-- Schedules inherit RLS via doctor_id join; add direct policy for direct queries
ALTER TABLE doctor_schedule_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY overrides_branch_isolation ON doctor_schedule_overrides
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE doctor_schedule_overrides FORCE ROW LEVEL SECURITY;

-- ─── AUTO-UPDATE updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER doctors_updated_at
    BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
