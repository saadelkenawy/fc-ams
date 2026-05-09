-- Procurement Service Schema
-- Egyptian Drug Authority classification: Class I (low), Class II (medium), Class III (high)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Item catalog ─────────────────────────────────────────────────────────────
CREATE TABLE procurement_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name           VARCHAR(200) NOT NULL,
  item_name_ar        VARCHAR(200),
  category            TEXT        NOT NULL
                        CHECK (category IN (
                          'PPE',
                          'Injection & Phlebotomy',
                          'Sterilization & Hygiene',
                          'Diagnostic Devices',
                          'Specialty Instruments'
                        )),
  clinical_use        TEXT,
  clinic_types        TEXT[]      NOT NULL DEFAULT '{}',
  budget_tier         TEXT        NOT NULL
                        CHECK (budget_tier IN ('Economy', 'Mid-range', 'Premium')),
  eda_status          TEXT        NOT NULL
                        CHECK (eda_status IN ('Registered', 'Permit required', 'Controlled', 'Not regulated')),
  eda_class           TEXT        CHECK (eda_class IN ('I', 'II', 'III')),
  local_first         BOOLEAN     NOT NULL DEFAULT false,
  qty_unit            TEXT,
  qty_per_month       INTEGER,
  reorder_threshold   INTEGER     NOT NULL DEFAULT 0,
  current_stock       INTEGER     NOT NULL DEFAULT 0,
  unit_cost_egp       DECIMAL(10,2),
  preferred_vendor_id UUID,   -- populated after vendors are inserted
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Vendor directory ──────────────────────────────────────────────────────────
CREATE TABLE procurement_vendors (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name       VARCHAR(200) NOT NULL,
  vendor_name_ar    VARCHAR(200),
  vendor_type       TEXT        NOT NULL
                      CHECK (vendor_type IN (
                        'Local Egyptian manufacturer',
                        'Authorized international distributor',
                        'Major medical importer / supply chain'
                      )),
  brands_covered    TEXT,
  categories_served TEXT[]      NOT NULL DEFAULT '{}',
  contact_name      VARCHAR(200),
  contact_phone     VARCHAR(50),
  contact_email     VARCHAR(200),
  notes             TEXT,
  is_approved       BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK from items → vendors (added after both tables exist)
ALTER TABLE procurement_items
  ADD CONSTRAINT fk_items_preferred_vendor
  FOREIGN KEY (preferred_vendor_id) REFERENCES procurement_vendors(id)
  ON DELETE SET NULL;

-- ─── Receipt headers ───────────────────────────────────────────────────────────
CREATE SEQUENCE receipt_number_seq START 1000;

CREATE TABLE procurement_receipts (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number       VARCHAR(100) NOT NULL UNIQUE
                         DEFAULT ('REC-' || nextval('receipt_number_seq')),
  vendor_id            UUID         NOT NULL REFERENCES procurement_vendors(id),
  invoice_number       VARCHAR(100),
  invoice_date         DATE,
  invoice_total_egp    DECIMAL(12,2),
  invoice_file_uri     TEXT,
  ocr_confidence       DECIMAL(4,2),
  ocr_overridden       BOOLEAN      NOT NULL DEFAULT false,
  currency_source      TEXT         NOT NULL DEFAULT 'EGP'
                         CHECK (currency_source IN ('EGP', 'converted')),
  cbe_rate             DECIMAL(10,4),
  currency_audit_log   JSONB,
  date_received        DATE         NOT NULL DEFAULT CURRENT_DATE,
  received_by_staff_id UUID         NOT NULL,
  status               TEXT         NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'discrepancy', 'cancelled')),
  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── Receipt line items ────────────────────────────────────────────────────────
CREATE TABLE procurement_receipt_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id           UUID        NOT NULL REFERENCES procurement_receipts(id) ON DELETE CASCADE,
  item_id              UUID        NOT NULL REFERENCES procurement_items(id),
  batch_lot_number     VARCHAR(100),
  expiry_date          DATE,
  quantity_received    INTEGER     NOT NULL CHECK (quantity_received > 0),
  quantity_ordered     INTEGER,
  unit_price_egp       DECIMAL(10,2) NOT NULL CHECK (unit_price_egp > 0),
  discrepancy_flagged  BOOLEAN     NOT NULL DEFAULT false,
  discrepancy_pct      DECIMAL(5,2),
  discrepancy_notes    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Alerts ───────────────────────────────────────────────────────────────────
CREATE TABLE procurement_alerts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type       TEXT        NOT NULL
                     CHECK (alert_type IN ('EXPIRY_ALERT', 'REORDER_ALERT', 'DISCREPANCY_ALERT')),
  item_id          UUID        REFERENCES procurement_items(id),
  receipt_id       UUID        REFERENCES procurement_receipts(id),
  receipt_item_id  UUID        REFERENCES procurement_receipt_items(id),
  message          TEXT        NOT NULL,
  severity         TEXT        NOT NULL DEFAULT 'warning'
                     CHECK (severity IN ('info', 'warning', 'critical')),
  is_read          BOOLEAN     NOT NULL DEFAULT false,
  triggered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_proc_items_category    ON procurement_items(category);
CREATE INDEX idx_proc_items_active      ON procurement_items(is_active);
CREATE INDEX idx_proc_items_clinic      ON procurement_items USING gin(clinic_types);
CREATE INDEX idx_proc_items_name_trgm   ON procurement_items USING gin(item_name gin_trgm_ops);

CREATE INDEX idx_proc_receipts_vendor   ON procurement_receipts(vendor_id);
CREATE INDEX idx_proc_receipts_status   ON procurement_receipts(status);
CREATE INDEX idx_proc_receipts_date     ON procurement_receipts(date_received DESC);

CREATE INDEX idx_proc_ri_receipt        ON procurement_receipt_items(receipt_id);
CREATE INDEX idx_proc_ri_item           ON procurement_receipt_items(item_id);
CREATE INDEX idx_proc_ri_expiry         ON procurement_receipt_items(expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE INDEX idx_proc_alerts_type       ON procurement_alerts(alert_type);
CREATE INDEX idx_proc_alerts_unread     ON procurement_alerts(is_read) WHERE is_read = false;
CREATE INDEX idx_proc_alerts_item       ON procurement_alerts(item_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_procurement_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_items_ts    BEFORE UPDATE ON procurement_items    FOR EACH ROW EXECUTE FUNCTION update_procurement_updated_at();
CREATE TRIGGER trg_vendors_ts  BEFORE UPDATE ON procurement_vendors   FOR EACH ROW EXECUTE FUNCTION update_procurement_updated_at();
CREATE TRIGGER trg_receipts_ts BEFORE UPDATE ON procurement_receipts  FOR EACH ROW EXECUTE FUNCTION update_procurement_updated_at();

-- ─── Seed data — vendors ──────────────────────────────────────────────────────
INSERT INTO procurement_vendors (vendor_name, vendor_type, brands_covered, categories_served, notes) VALUES
  ('B. Braun Egypt S.A.E.',              'Authorized international distributor',  'B. Braun IV cannulas, infusion sets, syringes, safety needles', ARRAY['Injection & Phlebotomy', 'Sterilization & Hygiene'], 'MOH-approved; requires account registration'),
  ('Becton Dickinson Egypt',             'Authorized international distributor',  'BD Vacutainer, BD syringes, PrecisionGlide needles',           ARRAY['Injection & Phlebotomy'],                            'Direct subsidiary; EDA-registered portfolio'),
  ('3M Egypt S.A.E.',                    'Authorized international distributor',  '3M surgical masks, respirators, Comply sterilization pouches, Attest indicators', ARRAY['PPE', 'Sterilization & Hygiene'], 'Tender registration required for MOH contracts'),
  ('EIPICO',                             'Local Egyptian manufacturer',           'Pharmaceutical-grade ethanol and isopropyl alcohol solutions', ARRAY['Sterilization & Hygiene'],                            'Largest listed Egyptian drug manufacturer'),
  ('Johnson & Johnson Egypt S.A.E.',     'Authorized international distributor',  'Savlon antiseptic, Betadine (povidone-iodine)',                ARRAY['Sterilization & Hygiene'],                            'MOH-listed; available through pharmacy channels'),
  ('Siemens Healthineers Egypt',         'Authorized international distributor',  'Diagnostic imaging, in-vitro diagnostics, patient monitoring', ARRAY['Diagnostic Devices'],                                'Direct tender participation for MOH'),
  ('Roche Egypt S.A.E.',                 'Authorized international distributor',  'Roche point-of-care diagnostics, coagulation analysers',       ARRAY['Diagnostic Devices'],                                'Active service network in Egypt'),
  ('Abbott Laboratories Egypt',          'Authorized international distributor',  'Abbott point-of-care diagnostics, glucose monitoring',         ARRAY['Diagnostic Devices'],                                'Direct subsidiary; EDA-registered'),
  ('Philips Healthcare Egypt',           'Authorized international distributor',  'Philips patient monitors, ultrasound systems',                  ARRAY['Diagnostic Devices'],                                'Local office; service contracts available'),
  ('Global Medical Group Egypt',         'Major medical importer / supply chain', 'Multi-brand surgical instruments, dermatology sets',            ARRAY['Specialty Instruments', 'Diagnostic Devices'],       NULL),
  ('Nipro Medical Egypt',                'Authorized international distributor',  'Nipro syringes, IV cannulas, blood collection tubes',           ARRAY['Injection & Phlebotomy'],                            'Via authorized Egyptian agents'),
  ('Medico International Medical',       'Major medical importer / supply chain', 'Multi-brand disposable gowns, masks, sterile gloves',           ARRAY['PPE', 'Sterilization & Hygiene'],                    NULL),
  ('Amoun Pharmaceutical Co.',           'Local Egyptian manufacturer',           'Antiseptic solutions, alcohol-based products',                  ARRAY['Sterilization & Hygiene'],                           'Confirm medical-grade availability before ordering');

-- ─── Seed data — items (core universal and clinic-specific) ───────────────────
INSERT INTO procurement_items (item_name, category, clinical_use, clinic_types, budget_tier, eda_status, eda_class, local_first, qty_unit, qty_per_month, reorder_threshold, unit_cost_egp) VALUES
  -- Universal items
  ('Nitrile examination gloves (S/M/L)',      'PPE',                      'Barrier protection during patient contact and procedures.',              ARRAY['Internal Medicine','Pediatrics','General Surgery','Dermatology'], 'Economy',   'Registered',     'I',   true,  'box (100)',   5,   10, 185.00),
  ('Disposable three-ply surgical mask',      'PPE',                      'Respiratory droplet protection for clinician and patient.',              ARRAY['Internal Medicine','Pediatrics','General Surgery','Dermatology'], 'Economy',   'Registered',     'I',   true,  'box (50)',     6,   10,  65.00),
  ('Isopropyl alcohol 70% antiseptic swabs',  'Sterilization & Hygiene',  'Pre-injection skin antisepsis and venipuncture site preparation.',       ARRAY['Internal Medicine','Pediatrics','General Surgery','Dermatology'], 'Economy',   'Registered',     'I',   true,  'box (100)',    6,   10,  45.00),
  ('Alcohol-based hand sanitizer gel',        'Sterilization & Hygiene',  'Hand hygiene before and after every patient contact.',                   ARRAY['Internal Medicine','Pediatrics','General Surgery','Dermatology'], 'Economy',   'Not regulated',  NULL,  true,  'litre',        6,   10,  55.00),
  ('Disposable syringe with needle (assorted)','Injection & Phlebotomy',  'Single-use injection of medication and vaccine delivery.',               ARRAY['Internal Medicine','Pediatrics','General Surgery','Dermatology'], 'Economy',   'Registered',     'II',  true,  'box (100)',    4,   10,  90.00),
  -- Internal Medicine
  ('Peripheral IV cannula (18G/20G/22G)',     'Injection & Phlebotomy',   'Venous access for IV fluids and medication administration.',             ARRAY['Internal Medicine'],                                              'Economy',   'Registered',     'II',  false, 'unit',        100,  30,   8.50),
  ('Venous blood collection tube (EDTA/SST)', 'Injection & Phlebotomy',   'Evacuated tube for blood specimen collection and analysis.',             ARRAY['Internal Medicine'],                                              'Economy',   'Registered',     'II',  false, 'unit',        200,  50,   4.20),
  ('Safety blood lancet (28G)',               'Injection & Phlebotomy',   'Single-use capillary puncture for blood glucose sampling.',              ARRAY['Internal Medicine'],                                              'Economy',   'Registered',     'I',   true,  'unit',        100,  30,   1.80),
  ('Quaternary ammonium surface disinfectant','Sterilization & Hygiene',  'Decontamination of examination surfaces between patients.',              ARRAY['Internal Medicine','General Surgery'],                             'Economy',   'Permit required', NULL, false, 'litre',        4,    5, 120.00),
  ('Self-sealing sterilization pouches',      'Sterilization & Hygiene',  'Steam sterilization packaging for reusable small instruments.',          ARRAY['Internal Medicine','General Surgery'],                             'Economy',   'Not regulated',  NULL,  false, 'pack (200)',   1,    2,  85.00),
  ('Acoustic stethoscope (dual-head)',        'Diagnostic Devices',       'Auscultation of cardiac, pulmonary, and bowel sounds.',                  ARRAY['Internal Medicine'],                                              'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0, 750.00),
  ('Aneroid sphygmomanometer with adult cuff','Diagnostic Devices',       'Non-invasive blood pressure measurement.',                               ARRAY['Internal Medicine'],                                              'Mid-range', 'Registered',     'II',  false, 'unit',         0,    0, 650.00),
  ('Portable glucometer (point-of-care)',     'Diagnostic Devices',       'Capillary blood glucose measurement at point of care.',                  ARRAY['Internal Medicine'],                                              'Economy',   'Registered',     'II',  false, 'unit',         0,    0, 450.00),
  ('Fingertip pulse oximeter',                'Diagnostic Devices',       'Non-invasive arterial oxygen saturation and pulse rate monitoring.',     ARRAY['Internal Medicine'],                                              'Economy',   'Registered',     'II',  false, 'unit',         0,    0, 350.00),
  ('Digital clinical thermometer',            'Diagnostic Devices',       'Core body temperature measurement via axillary or oral route.',          ARRAY['Internal Medicine','Pediatrics'],                                  'Economy',   'Registered',     'I',   true,  'unit',         0,    0,  95.00),
  ('Reflex/percussion hammer (Taylor)',       'Specialty Instruments',    'Elicitation of deep tendon reflexes in neurological examination.',       ARRAY['Internal Medicine'],                                              'Economy',   'Not regulated',  NULL,  false, 'unit',         0,    0, 180.00),
  ('Diagnostic ophthalmoscope (direct)',      'Specialty Instruments',    'Direct fundoscopy and anterior segment examination.',                    ARRAY['Internal Medicine'],                                              'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0,1400.00),
  -- Pediatrics
  ('Disposable examination gown/apron',       'PPE',                      'Full-body protection during examination and procedures.',                 ARRAY['Pediatrics','Internal Medicine'],                                  'Economy',   'Registered',     'I',   true,  'unit',        200,  50,  12.00),
  ('Pediatric butterfly needle (21G–23G)',    'Injection & Phlebotomy',   'Short-bevel winged needle for pediatric peripheral venipuncture.',       ARRAY['Pediatrics'],                                                     'Economy',   'Registered',     'II',  false, 'unit',        100,  30,   5.50),
  ('Pediatric blood collection tubes (2–4 mL)','Injection & Phlebotomy', 'Small-volume evacuated tubes suited to pediatric blood volumes.',        ARRAY['Pediatrics'],                                                     'Economy',   'Registered',     'II',  false, 'unit',        150,  40,   3.80),
  ('Disposable otoscope ear speculum',        'Sterilization & Hygiene',  'Single-use speculum preventing cross-infection during otoscopy.',        ARRAY['Pediatrics'],                                                     'Economy',   'Not regulated',  NULL,  false, 'pack (100)',   2,    3,  55.00),
  ('Pediatric stethoscope (28 mm diaphragm)', 'Diagnostic Devices',       'Auscultation calibrated to pediatric chest wall dimensions.',            ARRAY['Pediatrics'],                                                     'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0, 850.00),
  ('Otoscope with illumination',              'Diagnostic Devices',       'Examination of the external auditory canal and tympanic membrane.',      ARRAY['Pediatrics'],                                                     'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0, 950.00),
  ('Pediatric aneroid sphygmomanometer',      'Diagnostic Devices',       'Age-appropriate blood pressure measurement in children.',                ARRAY['Pediatrics'],                                                     'Economy',   'Registered',     'II',  false, 'unit',         0,    0, 480.00),
  ('Infant/toddler platform scale (0–15 kg)', 'Diagnostic Devices',       'Accurate weight for medication dosing and growth monitoring.',           ARRAY['Pediatrics'],                                                     'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0,1200.00),
  ('Infrared tympanic thermometer',           'Diagnostic Devices',       'Rapid non-contact temperature measurement via ear canal.',               ARRAY['Pediatrics'],                                                     'Economy',   'Registered',     'I',   false, 'unit',         0,    0, 350.00),
  ('Wooden tongue depressor (disposable)',    'Specialty Instruments',    'Oropharyngeal visualization and gag reflex assessment.',                 ARRAY['Pediatrics'],                                                     'Economy',   'Not regulated',  NULL,  true,  'box (100)',    5,   10,  25.00),
  ('Pediatric peak flow meter',               'Specialty Instruments',    'Expiratory flow rate measurement for asthma severity monitoring.',       ARRAY['Pediatrics'],                                                     'Economy',   'Registered',     'I',   false, 'unit',         0,    0, 280.00),
  ('Infant height measuring board (stadiometer)','Specialty Instruments', 'Supine length measurement for infants under 24 months.',                 ARRAY['Pediatrics'],                                                     'Economy',   'Not regulated',  NULL,  false, 'unit',         0,    0, 450.00),
  -- General Surgery
  ('Sterile surgical gloves (powder-free)',   'PPE',                      'Sterile hand barrier for all invasive surgical procedures.',             ARRAY['General Surgery'],                                                 'Economy',   'Registered',     'I',   true,  'pair',        200,  50,  22.00),
  ('Sterile surgical gown (reinforced)',      'PPE',                      'Full-body sterile barrier garment maintaining aseptic field.',           ARRAY['General Surgery'],                                                 'Economy',   'Registered',     'I',   false, 'unit',        100,  25,  85.00),
  ('Fenestrated surgical drape',             'PPE',                      'Sterile drape isolating the operative field at the aperture.',           ARRAY['General Surgery'],                                                 'Economy',   'Registered',     'I',   false, 'unit',        100,  25,  65.00),
  ('Absorbable suture, polyglactin 910',      'Injection & Phlebotomy',   'Internal tissue and fascial closure with controlled absorption.',        ARRAY['General Surgery'],                                                 'Mid-range', 'Registered',     'III', false, 'unit',         50,  15, 420.00),
  ('Non-absorbable suture, polyamide',        'Injection & Phlebotomy',   'Skin and external wound closure requiring manual removal.',              ARRAY['General Surgery'],                                                 'Economy',   'Registered',     'II',  false, 'unit',         50,  15, 210.00),
  ('Luer-lock syringe for local anesthetic',  'Injection & Phlebotomy',   'Precise intradermal or subcutaneous anesthetic injection.',              ARRAY['General Surgery'],                                                 'Economy',   'Registered',     'I',   false, 'unit',        100,  25,   6.50),
  ('Tabletop autoclave steam sterilizer',     'Sterilization & Hygiene',  'Steam sterilization of reusable surgical instruments at 134°C.',         ARRAY['General Surgery'],                                                 'Premium',   'Registered',     'II',  false, 'unit',         0,    0,18000.00),
  ('Enzymatic instrument cleaner concentrate','Sterilization & Hygiene',  'Pre-sterilization enzymatic breakdown of protein debris.',               ARRAY['General Surgery'],                                                 'Economy',   'Not regulated',  NULL,  false, 'litre',        5,    5, 220.00),
  ('Mobile surgical examination lamp (LED)', 'Diagnostic Devices',       'High-intensity focused illumination of the operative field.',            ARRAY['General Surgery'],                                                 'Premium',   'Registered',     'I',   false, 'unit',         0,    0, 8500.00),
  ('Portable suction apparatus (1–2 L jar)',  'Diagnostic Devices',       'Evacuation of blood and fluid from the surgical field.',                 ARRAY['General Surgery'],                                                 'Premium',   'Registered',     'II',  false, 'unit',         0,    0, 5200.00),
  ('Electrosurgical unit (monopolar/bipolar)','Diagnostic Devices',       'High-frequency electrical cutting and tissue coagulation.',              ARRAY['General Surgery'],                                                 'Premium',   'Registered',     'II',  false, 'unit',         0,    0,22000.00),
  ('Scalpel handle with disposable blades',   'Specialty Instruments',    'Surgical incision and precise tissue dissection.',                       ARRAY['General Surgery'],                                                 'Economy',   'Registered',     'I',   false, 'unit',        100,  30,  18.00),
  ('Hemostatic artery forceps (Kelly/Halsted)','Specialty Instruments',   'Clamping of blood vessels to achieve intraoperative hemostasis.',        ARRAY['General Surgery'],                                                 'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0, 850.00),
  ('Operating scissors (Mayo/Metzenbaum)',    'Specialty Instruments',    'Blunt tissue dissection and suture material cutting.',                   ARRAY['General Surgery'],                                                 'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0, 950.00),
  ('Needle holder (Mayo-Hegar)',              'Specialty Instruments',    'Driving of curved suture needles through tissue layers.',                ARRAY['General Surgery'],                                                 'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0, 780.00),
  ('Self-retaining wound retractor (Weitlaner)','Specialty Instruments',  'Mechanical tissue retraction for sustained operative field exposure.',   ARRAY['General Surgery'],                                                 'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0,1100.00),
  -- Dermatology
  ('Laser/UV protective eyewear (OD 5+)',     'PPE',                      'Eye protection from laser radiation and Wood''s lamp UV exposure.',       ARRAY['Dermatology'],                                                     'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0, 850.00),
  ('Intradermal/subcutaneous needle (27G–30G)','Injection & Phlebotomy',  'Fine-gauge delivery of intradermal medications and botulinum toxin.',    ARRAY['Dermatology'],                                                     'Economy',   'Registered',     'I',   false, 'unit',        200,  50,   1.20),
  ('Mesotherapy micro-needle (32G × 4 mm)',   'Injection & Phlebotomy',   'Controlled intradermal micro-injection of active agents.',               ARRAY['Dermatology'],                                                     'Economy',   'Registered',     'I',   false, 'unit',        100,  25,   2.50),
  ('Biopsy specimen container with formalin', 'Sterilization & Hygiene',  'Fixed-tissue preservation for dermatopathological analysis.',            ARRAY['Dermatology'],                                                     'Economy',   'Permit required', NULL, false, 'unit',         30,  10,  28.00),
  ('Dermatoscope, polarized-light',           'Diagnostic Devices',       'Non-invasive dermoscopic examination of pigmented skin lesions.',        ARRAY['Dermatology'],                                                     'Premium',   'Registered',     'I',   false, 'unit',         0,    0, 7200.00),
  ('Wood''s lamp (365 nm UV)',                'Diagnostic Devices',       'UV fluorescence examination for fungal infections and pigmentation.',    ARRAY['Dermatology'],                                                     'Mid-range', 'Registered',     'I',   false, 'unit',         0,    0,1500.00),
  ('Cryotherapy unit (liquid nitrogen)',      'Diagnostic Devices',       'Cryodestruction of benign epidermal lesions and viral warts.',           ARRAY['Dermatology'],                                                     'Premium',   'Permit required', 'II', false, 'unit',         0,    0, 9500.00),
  ('Skin punch biopsy set (2/4/6 mm)',        'Diagnostic Devices',       'Circular cutting instrument for full-thickness skin biopsy.',            ARRAY['Dermatology'],                                                     'Economy',   'Registered',     'I',   false, 'pack (5)',    20,    5,  95.00),
  ('Comedone extractor (double-ended)',       'Specialty Instruments',    'Manual extraction of comedones and milia from sebaceous follicles.',     ARRAY['Dermatology'],                                                     'Economy',   'Not regulated',  NULL,  false, 'unit',         0,    0,  85.00),
  ('Skin curette (Volkmann double-ended)',    'Specialty Instruments',    'Superficial scraping of keratoses and cyst evacuation.',                 ARRAY['Dermatology'],                                                     'Economy',   'Registered',     'I',   false, 'unit',         0,    0, 250.00),
  ('Battery-operated electrocautery pen',     'Specialty Instruments',    'Superficial coagulation of skin tags and telangiectasias.',              ARRAY['Dermatology'],                                                     'Mid-range', 'Registered',     'II',  false, 'unit',         0,    0, 950.00),
  ('Disposable skin stapler (35 staples)',    'Specialty Instruments',    'Rapid skin edge approximation in dermatological surgery.',               ARRAY['Dermatology','General Surgery'],                                   'Economy',   'Registered',     'I',   false, 'unit',        10,    3, 185.00);
