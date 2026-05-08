CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE notification_channel AS ENUM ('sms', 'whatsapp', 'email', 'push');
CREATE TYPE notification_status  AS ENUM ('queued', 'sent', 'delivered', 'failed', 'cancelled');

-- Notification templates
CREATE TABLE IF NOT EXISTS notification_templates (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(100) UNIQUE NOT NULL,   -- e.g. 'APPT_BOOKED', 'APPT_REMINDER'
    channel     notification_channel NOT NULL,
    subject_en  VARCHAR(300),
    subject_ar  VARCHAR(300),
    body_en     TEXT NOT NULL,
    body_ar     TEXT NOT NULL,
    variables   JSONB DEFAULT '[]',              -- list of variable names expected in body
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Outbound notifications
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code   VARCHAR(100),
    channel         notification_channel NOT NULL,
    recipient_id    UUID,                        -- patient_id or doctor_id
    recipient_type  VARCHAR(20) NOT NULL DEFAULT 'patient'
        CHECK (recipient_type IN ('patient', 'doctor', 'admin')),
    recipient_mobile VARCHAR(20),
    recipient_email  VARCHAR(300),
    subject         VARCHAR(300),
    body            TEXT NOT NULL,
    variables_used  JSONB DEFAULT '{}',
    status          notification_status NOT NULL DEFAULT 'queued',
    scheduled_at    TIMESTAMPTZ DEFAULT NOW(),
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    error_message   TEXT,
    retry_count     INT DEFAULT 0,
    max_retries     INT DEFAULT 3,
    idempotency_key VARCHAR(100) UNIQUE,
    appointment_id  UUID,                       -- optional link
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    branch_id       INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient   ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_status      ON notifications(status, scheduled_at) WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_notif_appointment ON notifications(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_branch      ON notifications(branch_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_branch ON notifications FOR ALL
    USING (branch_id = current_setting('app.current_branch_id', TRUE)::INT);
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

-- Seed templates
INSERT INTO notification_templates (code, channel, subject_en, subject_ar, body_en, body_ar, variables) VALUES
  ('APPT_BOOKED', 'sms', NULL, NULL,
   'Dear {{patientName}}, your appointment with {{doctorName}} is confirmed for {{date}} at {{time}}. Ref: {{appointmentId}}',
   'عزيزي {{patientName}}، تم تأكيد موعدك مع {{doctorName}} بتاريخ {{date}} الساعة {{time}}. المرجع: {{appointmentId}}',
   '["patientName","doctorName","date","time","appointmentId"]'),

  ('APPT_REMINDER_2H', 'sms', NULL, NULL,
   'Reminder: You have an appointment with {{doctorName}} today at {{time}}. Please confirm by replying YES or call {{clinicMobile}}.',
   'تذكير: لديك موعد مع {{doctorName}} اليوم الساعة {{time}}. برجاء التأكيد بالرد YES أو الاتصال بـ {{clinicMobile}}.',
   '["doctorName","time","clinicMobile"]'),

  ('APPT_CANCELLED', 'sms', NULL, NULL,
   'Dear {{patientName}}, your appointment with {{doctorName}} on {{date}} has been cancelled. To rebook call {{clinicMobile}}.',
   'عزيزي {{patientName}}، تم إلغاء موعدك مع {{doctorName}} بتاريخ {{date}}. للحجز مجدداً اتصل بـ {{clinicMobile}}.',
   '["patientName","doctorName","date","clinicMobile"]'),

  ('APPT_BOOKED', 'whatsapp', NULL, NULL,
   'Dear {{patientName}}, your appointment with {{doctorName}} is confirmed for {{date}} at {{time}}. Ref: {{appointmentId}}',
   'عزيزي {{patientName}}، تم تأكيد موعدك مع {{doctorName}} بتاريخ {{date}} الساعة {{time}}. المرجع: {{appointmentId}}',
   '["patientName","doctorName","date","time","appointmentId"]')
ON CONFLICT (code) DO NOTHING;
