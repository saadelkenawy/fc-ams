-- Identity Service — Users, Refresh Tokens, Audit Log
-- Fadl Clinic Management System

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enum ─────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'finance', 'doctor', 'receptionist', 'patient');

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT        NOT NULL,
  password_hash    TEXT        NOT NULL,
  name_en          TEXT        NOT NULL,
  name_ar          TEXT,
  role             user_role   NOT NULL DEFAULT 'receptionist',
  branch_id        INT         NOT NULL DEFAULT 1,
  doctor_id        UUID,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  last_login_at    TIMESTAMPTZ,
  failed_logins    INT         NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  version          INT         NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_branch   ON users (branch_id);
CREATE INDEX idx_users_role     ON users (role);

-- ─── Refresh Tokens ───────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_rt_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_rt_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_rt_expires    ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;

-- ─── Audit Log ────────────────────────────────────────────────────────────────

CREATE TABLE auth_audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT        NOT NULL,
  event      TEXT        NOT NULL,  -- 'login_success' | 'login_failed' | 'logout' | 'token_refresh' | 'password_changed'
  ip_address INET,
  user_agent TEXT,
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON auth_audit_log (user_id);
CREATE INDEX idx_audit_event   ON auth_audit_log (event, created_at DESC);

-- ─── Seed: default admin ──────────────────────────────────────────────────────
-- Password: Admin@123 (bcrypt, cost 12)
-- Change immediately in production

INSERT INTO users (email, password_hash, name_en, name_ar, role, branch_id)
VALUES (
  'admin@fadlclinic.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGiQvFrGplHlFp3JnKQvxCKvd5.',
  'Admin User',
  'مدير النظام',
  'admin',
  1
);
