-- Fadl Clinic — PostgreSQL local dev database init
-- Runs once on first `docker compose up` via /docker-entrypoint-initdb.d/

-- Create one database per service (microservice isolation)
CREATE DATABASE fadl_identity;
CREATE DATABASE fadl_patients;
CREATE DATABASE fadl_appointments;
CREATE DATABASE fadl_doctors;
CREATE DATABASE fadl_billing;
CREATE DATABASE fadl_ehr;
CREATE DATABASE fadl_procedures;
CREATE DATABASE fadl_procurement;

-- Grant the fadl user full access to all service databases
GRANT ALL PRIVILEGES ON DATABASE fadl_identity     TO fadl;
GRANT ALL PRIVILEGES ON DATABASE fadl_patients     TO fadl;
GRANT ALL PRIVILEGES ON DATABASE fadl_appointments TO fadl;
GRANT ALL PRIVILEGES ON DATABASE fadl_doctors      TO fadl;
GRANT ALL PRIVILEGES ON DATABASE fadl_billing      TO fadl;
GRANT ALL PRIVILEGES ON DATABASE fadl_ehr          TO fadl;
GRANT ALL PRIVILEGES ON DATABASE fadl_procedures   TO fadl;
GRANT ALL PRIVILEGES ON DATABASE fadl_procurement  TO fadl;

-- Enable required extensions in each database
\c fadl_identity
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c fadl_patients
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c fadl_appointments
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c fadl_doctors
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c fadl_billing
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c fadl_ehr
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c fadl_procedures
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c fadl_procurement
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
