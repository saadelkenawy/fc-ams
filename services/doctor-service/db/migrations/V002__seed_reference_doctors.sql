-- Migration: V002 — Doctor Service
-- Adds payment_channel column to doctors and seeds 20 reference doctors
-- matching the Fadl Clinic Excel Dr_Data sheet structure (data.md §3.2).
--
-- Revenue splits are stored in the JSONB revenue_splits column per V001 schema:
--   {"consultation":{"doctorPercentage":N,"clinicPercentage":N},
--    "operative":{"doctorPercentage":N,"clinicPercentage":N},
--    "online":{"doctorPercentage":N,"clinicPercentage":N}}
--
-- Op_<name> and Onl_<name> prefix rows from Dr_Data are collapsed into a
-- single doctor record with all three split modes populated (§5.1 algorithm).

-- ─── ADD payment_channel COLUMN ───────────────────────────────────────────────

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(50);

-- ─── SEED 20 REFERENCE DOCTORS ────────────────────────────────────────────────

WITH spec AS (
    SELECT code, id FROM specialties
)
INSERT INTO doctors (
    mobile,
    name_en,
    name_ar,
    specialty_id,
    revenue_splits,
    payment_method,
    payment_channel,
    is_online_doctor,
    branch_id
)
SELECT
    mobile,
    name_en,
    name_ar,
    (SELECT id FROM spec WHERE code = specialty_code),
    revenue_splits::jsonb,
    payment_method,
    payment_channel,
    is_online_doctor,
    1
FROM (VALUES
    -- 1. د. هدى مدكور — GYN — 50/50 consultation, 80/20 operative, 70/30 online
    ('+201001000001', 'Dr. Huda Madkour',      'د. هدى مدكور',
     'GYN',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', FALSE),

    -- 2. د. سارة أبو النصر — GYN — 50/50 consultation, 70/30 online, is_online=true
    ('+201001000002', 'Dr. Sara Abu Al-Nasr',  'د. سارة أبو النصر',
     'GYN',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', TRUE),

    -- 3. د. أحمد حسن — CARD — 70/30 consultation, 80/20 operative
    ('+201001000003', 'Dr. Ahmed Hassan',       'د. أحمد حسن',
     'CARD',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'cash', NULL, FALSE),

    -- 4. د. محمود علي — ORTH — 70/30 consultation, 80/20 operative
    ('+201001000004', 'Dr. Mahmoud Ali',        'د. محمود علي',
     'ORTH',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'mobile_wallet', 'Vodafone Cash', FALSE),

    -- 5. د. نهى سالم — DENT — 50/50 consultation, 80/20 operative
    ('+201001000005', 'Dr. Noha Salem',         'د. نهى سالم',
     'DENT',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', FALSE),

    -- 6. د. عمرو يوسف — PSY — 70/30 consultation, 70/30 online
    ('+201001000006', 'Dr. Amr Youssef',        'د. عمرو يوسف',
     'PSY',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'cash', NULL, FALSE),

    -- 7. د. رانيا خليل — PED — 50/50 consultation
    ('+201001000007', 'Dr. Rania Khalil',       'د. رانيا خليل',
     'PED',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'mobile_wallet', 'Etisalat Cash', FALSE),

    -- 8. د. طارق فاروق — DERM — 70/30 consultation
    ('+201001000008', 'Dr. Tarek Farouq',       'د. طارق فاروق',
     'DERM',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', FALSE),

    -- 9. د. منى عبد الله — INT — 50/50 consultation
    ('+201001000009', 'Dr. Mona Abdallah',      'د. منى عبد الله',
     'INT',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'cash', NULL, FALSE),

    -- 10. د. كريم إبراهيم — NEUR — 70/30 consultation
    ('+201001000010', 'Dr. Karim Ibrahim',      'د. كريم إبراهيم',
     'NEUR',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'mobile_wallet', 'Vodafone Cash', FALSE),

    -- 11. د. ياسمين رشاد — DIAB — 50/50 consultation, 70/30 online, is_online=true
    ('+201001000011', 'Dr. Yasmin Rashad',      'د. ياسمين رشاد',
     'DIAB',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', TRUE),

    -- 12. د. حسام عيسى — GAST — 70/30 consultation, 80/20 operative
    ('+201001000012', 'Dr. Hossam Issa',        'د. حسام عيسى',
     'GAST',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'cash', NULL, FALSE),

    -- 13. د. دينا وهبة — IVF — 50/50 consultation, 80/20 operative
    ('+201001000013', 'Dr. Dina Wahba',         'د. دينا وهبة',
     'IVF',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', FALSE),

    -- 14. د. أشرف نجيب — URO — 70/30 consultation, 80/20 operative
    ('+201001000014', 'Dr. Ashraf Nagib',       'د. أشرف نجيب',
     'URO',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'mobile_wallet', 'Vodafone Cash', FALSE),

    -- 15. د. إيمان صادق — OPTH — 50/50 consultation
    ('+201001000015', 'Dr. Iman Sadek',         'د. إيمان صادق',
     'OPTH',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'cash', NULL, FALSE),

    -- 16. د. علاء شاكر — ANES — 37.5/62.5 consultation (mirrors Excel 0.375/0.625 split)
    ('+201001000016', 'Dr. Alaa Shaker',        'د. علاء شاكر',
     'ANES',
     '{"consultation":{"doctorPercentage":37.5,"clinicPercentage":62.5},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', FALSE),

    -- 17. د. ريم حمدي — RHEU — 50/50 consultation
    ('+201001000017', 'Dr. Reem Hamdi',         'د. ريم حمدي',
     'RHEU',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'mobile_wallet', 'Etisalat Cash', FALSE),

    -- 18. د. باسم زكي — GSUR — 80/20 consultation, 80/20 operative
    ('+201001000018', 'Dr. Bassem Zaki',        'د. باسم زكي',
     'GSUR',
     '{"consultation":{"doctorPercentage":80,"clinicPercentage":20},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'cash', NULL, FALSE),

    -- 19. د. نادية حسين — ONC — 70/30 consultation
    ('+201001000019', 'Dr. Nadia Hussein',      'د. نادية حسين',
     'ONC',
     '{"consultation":{"doctorPercentage":70,"clinicPercentage":30},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'instapay', 'InstaPay', FALSE),

    -- 20. د. وليد منصور — ENT — 50/50 consultation
    ('+201001000020', 'Dr. Walid Mansour',      'د. وليد منصور',
     'ENT',
     '{"consultation":{"doctorPercentage":50,"clinicPercentage":50},"operative":{"doctorPercentage":80,"clinicPercentage":20},"online":{"doctorPercentage":70,"clinicPercentage":30}}',
     'mobile_wallet', 'Vodafone Cash', FALSE)

) AS v(mobile, name_en, name_ar, specialty_code, revenue_splits, payment_method, payment_channel, is_online_doctor)
ON CONFLICT (mobile) DO NOTHING;
