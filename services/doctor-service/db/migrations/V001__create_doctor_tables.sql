-- Migration: V001 — Doctor Service
-- Ref: database.md — specialties, doctors, schedules, splits, overbooking config

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS specialties (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed all 41 specialties from claude-plan.md
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

CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile VARCHAR(20) UNIQUE NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    specialty_id INT REFERENCES specialties(id),
    sub_specialty VARCHAR(100),
    is_online_doctor BOOLEAN DEFAULT FALSE,

    -- Revenue splits (sum must = 100)
    consultation_split_doctor DECIMAL(5,2) DEFAULT 50.00,
    consultation_split_clinic DECIMAL(5,2) DEFAULT 50.00,
    operative_split_doctor DECIMAL(5,2) DEFAULT 80.00,
    operative_split_clinic DECIMAL(5,2) DEFAULT 20.00,
    online_split_doctor DECIMAL(5,2) DEFAULT 70.00,
    online_split_clinic DECIMAL(5,2) DEFAULT 30.00,
    CONSTRAINT splits_sum_consultation CHECK (consultation_split_doctor + consultation_split_clinic = 100),
    CONSTRAINT splits_sum_operative CHECK (operative_split_doctor + operative_split_clinic = 100),
    CONSTRAINT splits_sum_online CHECK (online_split_doctor + online_split_clinic = 100),

    payment_method VARCHAR(50),
    payment_details_encrypted TEXT,
    payment_encryption_key_id VARCHAR(50),

    -- Overbooking config (Module 12)
    allow_overbooking BOOLEAN DEFAULT TRUE,
    overbooking_buffer_percentage DECIMAL(5,2) DEFAULT 10.00
        CHECK (overbooking_buffer_percentage BETWEEN 0 AND 15),

    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    branch_id INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors(specialty_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INT DEFAULT 15,
    is_active BOOLEAN DEFAULT TRUE,
    valid_from DATE NOT NULL,
    valid_until DATE,
    branch_id INT DEFAULT 1,
    CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_schedules_doctor_day
    ON doctor_schedules(doctor_id, day_of_week) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS doctor_schedule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    override_type VARCHAR(20) CHECK (override_type IN ('unavailable','custom_hours','holiday')),
    custom_start_time TIME,
    custom_end_time TIME,
    reason VARCHAR(200),
    notify_patients BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_overrides_doctor_date
    ON doctor_schedule_overrides(doctor_id, override_date);

-- RLS
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctors_branch_isolation ON doctors
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE doctors FORCE ROW LEVEL SECURITY;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER doctors_updated_at
    BEFORE UPDATE ON doctors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
