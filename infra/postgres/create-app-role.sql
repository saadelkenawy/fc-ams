-- Fadl Clinic — application database role (non-superuser, RLS enforced)
--
-- Services previously connected as the cluster superuser `fadl`, which has
-- BYPASSRLS — making every row-level-security policy inert. This script
-- creates `fadl_app`: a plain login role that owns nothing, so RLS policies
-- on tables owned by `fadl` apply to it unconditionally.
--
-- `fadl` remains the migrations/admin role (scripts/migrate.sh).
--
-- Apply: bash infra/postgres/apply-app-role.sh   (idempotent)
-- The password below is the LOCAL DEV password; production must override it
-- via the APP_DB_PASSWORD env var consumed by apply-app-role.sh.

\set ON_ERROR_STOP on

SELECT 'CREATE ROLE fadl_app LOGIN PASSWORD ' || quote_literal(:'app_password') ||
       ' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fadl_app')
\gexec

-- Keep the password in sync on re-runs
ALTER ROLE fadl_app WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOBYPASSRLS;
