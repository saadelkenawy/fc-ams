-- Run once against the PostgreSQL cluster as a superuser:
--   psql -h localhost -p 5432 -U postgres -v sonar_password="changeme_sonar" -f infra/sonarqube/create-db.sql
--
-- The :sonar_password variable is supplied on the command line to avoid
-- embedding credentials in source control.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sonar') THEN
    EXECUTE format('CREATE USER sonar WITH PASSWORD %L', :'sonar_password');
  END IF;
END
$$;

CREATE DATABASE fadl_sonar
  OWNER sonar
  ENCODING 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE   = 'en_US.UTF-8'
  TEMPLATE template0;

GRANT ALL PRIVILEGES ON DATABASE fadl_sonar TO sonar;

-- SonarQube bootstraps its own schema on first startup.
-- No Flyway migrations needed for this database.
