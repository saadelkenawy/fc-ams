# 🗄️ Fadl Clinic — Production Database Architecture

> **Document Version:** 1.1 (Enhanced)  
> **Last Updated:** 2026-05-02  
> **Original Plan:** v1.0 — Reviewed and Enhanced by Claude  
> **System:** Fadl Clinic Management System (فضل كلينك)  
> **Platform:** Red Hat OpenShift Container Platform (OCP)

---

## 📋 Review Summary

The submitted database architecture is **strong and production-grade**. The 4-tier stack (PostgreSQL + MongoDB + Redis + Object Storage), monthly partitioning, immutable financial ledger, and Crunchy/Percona operators are all the right choices for a healthcare system at this scale.

That said, there are **20 production-grade enhancements** I'm recommending. They fall into 4 categories:

1. **Critical correctness** — issues that will cause real bugs in production (e.g., mobile-as-PK, missing exclusion constraints)
2. **Scale & performance** — patterns that will hurt at higher load (e.g., unbounded MongoDB arrays, missing CDC)
3. **Compliance & security** — gaps for healthcare-grade compliance (e.g., RLS, idempotency, audit detail)
4. **Operational maturity** — missing pieces for clean Day-2 operations (e.g., schema migrations, partition automation)

All enhancements are folded into the sections below, marked with **⭐ ENHANCEMENT** for clarity.

---

## Table of Contents

1. [High-Level Data Platform Layout](#1-high-level-data-platform-layout)
2. [PostgreSQL — Transactional Core](#2-postgresql--transactional-core)
3. [MongoDB — EHR & Document Store](#3-mongodb--ehr--document-store)
4. [Redis — Caching, Sessions & Real-Time](#4-redis--caching-sessions--real-time)
5. [Object Storage — Files, Images & Cold Data](#5-object-storage--files-images--cold-data)
6. [Data Flow Architecture](#6-data-flow-architecture)
7. [Backup & Disaster Recovery](#7-backup--disaster-recovery)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Security Configuration](#9-security-configuration)
10. [Schema Migrations & Day-2 Operations ⭐ NEW](#10-schema-migrations--day-2-operations)
11. [Scaling Roadmap](#11-scaling-roadmap)
12. [Implementation Checklist](#12-implementation-checklist)

---

## 1. High-Level Data Platform Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPENSHIFT CONTAINER PLATFORM                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │   PostgreSQL    │  │    MongoDB      │  │        Redis Cluster        │ │
│  │   HA Cluster    │  │  Replica Set    │  │   (Cluster Mode)            │ │
│  │   (Crunchy)     │  │   (Percona)     │  │                             │ │
│  │                 │  │                 │  │  • Sessions                 │ │
│  │  • Transactions │  │  • EHR Docs     │  │  • Caching                  │ │
│  │  • Billing      │  │  • DICOM Meta   │  │  • Rate Limiting            │ │
│  │  • Scheduling   │  │  • Chat Logs    │  │  • Real-time Queues         │ │
│  │  • Doctors      │  │  • Audit Trails │  │  • Streams (notifications)  │ │
│  │  • Patients     │  │                 │  │  • Pub/Sub                  │ │
│  └────────┬────────┘  └────────┬────────┘  └─────────────┬───────────────┘ │
│           │                    │                         │                 │
│           └────────────────────┴─────────────────────────┘                 │
│                              │                                              │
│  ┌──────────────────┐   ┌────┴───────────┐   ┌────────────────────────┐  │
│  │  Debezium CDC    │◄──┤  Object Storage │◄──┤  Analytics Warehouse  │  │
│  │  (PG → Kafka)    │   │  (ODF/Ceph/S3) │   │  (read replica)        │  │
│  │  ⭐ ENHANCEMENT  │   │                 │   │  ⭐ ENHANCEMENT        │  │
│  └──────────────────┘   │  • DICOM Images │   └────────────────────────┘  │
│                         │  • PDF Reports  │                                │
│                         │  • Backups (WAL)│                                │
│                         │  • Cold Records │                                │
│                         └─────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### ⭐ ENHANCEMENT 1 — Add Debezium CDC

**What:** Deploy Debezium connector to stream PostgreSQL changes (via logical replication) into Kafka topics.

**Why:** The current architecture has analytics-service reading from PostgreSQL directly. At scale this competes with transactional load. CDC into Kafka enables:
- Async fan-out to analytics-service, notification-service, integration-service
- Audit trail rebuilding from event streams
- Future warehouse / data lake integration without app changes
- Decoupling: services subscribe to events instead of polling

**How:** Deploy Strimzi Kafka Operator on OpenShift; deploy Debezium PostgreSQL connector with `wal_level=logical`.

---

## 2. PostgreSQL — Transactional Core

**Role:** All structured transactional data, financial records, scheduling, and relational entities.

**OpenShift Deployment:** Crunchy Data PostgreSQL Operator.

### 2.1 Cluster Topology

```
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL HA Cluster (Crunchy)                │
│                                                             │
│   ┌─────────────┐      ┌─────────────┐      ┌──────────┐  │
│   │   Primary   │◄────►│  Replica 1  │◄────►│ Replica 2│  │
│   │  (R/W)      │      │ (Hot Stby)  │      │(Hot Stby)│  │
│   └──────┬──────┘      └──────┬──────┘      └─────┬────┘  │
│          │                    │                    │        │
│          ▼                    ▼                    ▼        │
│   ┌─────────────┐      ┌─────────────┐      ┌──────────┐  │
│   │  PgBouncer  │      │  pgBackRest │      │  Vault   │  │
│   │ (Conn Pool) │      │  (Backups)  │      │(Secrets) │  │
│   │  3 replicas │      └─────────────┘      └──────────┘  │
│   │  ⭐ ENHANCED│                                           │
│   └─────────────┘                                           │
│                                                             │
│   Storage: ODF Block (RWO) — SSD tier                      │
│   Backup: S3-compatible object storage (WAL archiving)     │
└─────────────────────────────────────────────────────────────┘
```

### ⭐ ENHANCEMENT 2 — PgBouncer Sizing & Read/Write Split

**Original:** 2 PgBouncer replicas with default config.  
**Enhanced:**
- **Write pool** → Primary only (transaction pooling mode, `pool_size=25` per pod)
- **Read pool** → Replicas (transaction pooling mode, `pool_size=50` per pod)
- **Analytics pool** → Replica 2 dedicated (session pooling, `pool_size=10`)
- **3 replicas minimum** for PgBouncer itself with anti-affinity rules

**Why:** Healthcare OLTP needs predictable connection behavior. Mixing analytics queries with transactional writes on the same pool causes head-of-line blocking. Separate pools isolate slow queries.

### ⭐ ENHANCEMENT 3 — Required PostgreSQL Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- Field-level encryption
CREATE EXTENSION IF NOT EXISTS pg_trgm;           -- Fuzzy name search (used in patient indexes)
CREATE EXTENSION IF NOT EXISTS pg_partman;        -- Automated partition management
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;-- Query performance tracking
CREATE EXTENSION IF NOT EXISTS pgaudit;           -- Compliance-grade audit logging
CREATE EXTENSION IF NOT EXISTS btree_gist;        -- Required for exclusion constraints (Enhancement 8)
CREATE EXTENSION IF NOT EXISTS uuid-ossp;         -- UUID generation
CREATE EXTENSION IF NOT EXISTS unaccent;          -- Arabic/diacritic-insensitive search
```

---

### 2.2 Database Schema Design

**Database:** `fadl_clinic_production`

#### A. PATIENTS

### ⭐ ENHANCEMENT 4 — Use Surrogate Patient ID, NOT Mobile as PK

**Critical issue with original plan:** Using `mobile` as primary key is a real production landmine. Mobile numbers change (provider switches, new SIM, country move). When that happens with mobile-as-PK, you cascade-update foreign keys across `appointments`, `financial_transactions`, etc. — that's an outage.

**Enhanced schema:**

```sql
CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile VARCHAR(20) UNIQUE NOT NULL,              -- Unique, indexed, NOT primary key
    mobile_history JSONB DEFAULT '[]',                -- Track historical mobile numbers
    national_id VARCHAR(20) UNIQUE,
    name_en VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    name_search tsvector GENERATED ALWAYS AS (       -- ⭐ Full-text search column
        to_tsvector('arabic', coalesce(name_ar, '')) ||
        to_tsvector('english', coalesce(name_en, ''))
    ) STORED,
    date_of_birth DATE,
    gender CHAR(1) CHECK (gender IN ('M','F')),
    blood_type VARCHAR(5),
    address TEXT,
    email VARCHAR(200),
    emergency_contact_mobile VARCHAR(20),
    emergency_contact_name VARCHAR(200),
    preferred_language VARCHAR(10) DEFAULT 'ar',
    source_first_visit VARCHAR(50),
    
    -- ⭐ ENHANCEMENT: Soft delete + optimistic concurrency
    deleted_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    
    -- ⭐ ENHANCEMENT: Field-level encryption metadata
    pii_encryption_key_id VARCHAR(50),               -- Vault key reference for rotation
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,                                 -- ⭐ Reference users.id
    updated_by UUID,
    branch_id INT NOT NULL DEFAULT 1
);

-- Indexes
CREATE UNIQUE INDEX idx_patients_mobile_active ON patients(mobile) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_national_id ON patients(national_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_name_search ON patients USING gin(name_search);
CREATE INDEX idx_patients_created_at ON patients(created_at DESC);
CREATE INDEX idx_patients_branch ON patients(branch_id, deleted_at);

-- ⭐ ENHANCEMENT: Row Level Security for multi-branch isolation
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY patients_branch_isolation ON patients
    FOR ALL
    USING (branch_id = current_setting('app.current_branch_id')::INT);
```

### ⭐ ENHANCEMENT 5 — Row Level Security (RLS) Across All Tenant Tables

PostgreSQL RLS adds defense-in-depth. Even if app code has a bug, the database refuses to leak data across branches. Apply the same pattern to `doctors`, `appointments`, `financial_transactions`, `procedure_catalogue`.

---

#### B. DOCTORS & SPECIALTIES

```sql
CREATE TABLE specialties (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,                -- ⭐ Stable code (e.g., "GYN", "DENT") for integrations
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile VARCHAR(20) UNIQUE NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200),
    specialty_id INT REFERENCES specialties(id),
    sub_specialty VARCHAR(100),
    is_online_doctor BOOLEAN DEFAULT FALSE,
    
    consultation_split_doctor DECIMAL(5,2) DEFAULT 50.00,
    consultation_split_clinic DECIMAL(5,2) DEFAULT 50.00,
    operative_split_doctor DECIMAL(5,2) DEFAULT 80.00,
    operative_split_clinic DECIMAL(5,2) DEFAULT 20.00,
    online_split_doctor DECIMAL(5,2) DEFAULT 70.00,
    online_split_clinic DECIMAL(5,2) DEFAULT 30.00,
    
    -- ⭐ ENHANCEMENT: Validation that splits sum to 100
    CONSTRAINT splits_sum_consultation CHECK (consultation_split_doctor + consultation_split_clinic = 100),
    CONSTRAINT splits_sum_operative CHECK (operative_split_doctor + operative_split_clinic = 100),
    CONSTRAINT splits_sum_online CHECK (online_split_doctor + online_split_clinic = 100),
    
    payment_method VARCHAR(50),
    payment_details_encrypted TEXT,                  -- Vault-encrypted
    payment_encryption_key_id VARCHAR(50),           -- ⭐ For key rotation
    
    -- ⭐ ENHANCEMENT: Overbooking config (Module 12 from claude-plan.md)
    allow_overbooking BOOLEAN DEFAULT TRUE,
    overbooking_buffer_percentage DECIMAL(5,2) DEFAULT 10.00 CHECK (overbooking_buffer_percentage BETWEEN 0 AND 15),
    
    is_active BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    version INT NOT NULL DEFAULT 1,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    branch_id INT NOT NULL DEFAULT 1
);

-- ⭐ ENHANCEMENT: Doctor schedule overrides (vacations, conferences, sick days)
CREATE TABLE doctor_schedule_overrides (
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

CREATE TABLE doctor_schedules (
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

CREATE INDEX idx_doctors_specialty ON doctors(specialty_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_doctors_active ON doctors(is_active) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_schedules_doctor_day ON doctor_schedules(doctor_id, day_of_week) WHERE is_active = TRUE;
CREATE INDEX idx_overrides_doctor_date ON doctor_schedule_overrides(doctor_id, override_date);
```

---

#### C. APPOINTMENTS (High-Velocity Table)

### ⭐ ENHANCEMENT 6 — Composite Partitioning (Branch + Date)

**Original:** Partitioned by date only. **Enhanced:** Partitioned by `branch_id` (LIST) then by date (RANGE) — sub-partitioning. This means a branch's data lives in its own physical partitions; analytics or compliance queries scoped to a branch don't touch other branches' data.

### ⭐ ENHANCEMENT 7 — Reference patient_id (UUID), Not Mobile

### ⭐ ENHANCEMENT 8 — Exclusion Constraint to Prevent Double-Booking

```sql
CREATE TABLE appointments (
    id UUID DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(patient_id),  -- ⭐ FK on UUID, not mobile
    doctor_id UUID REFERENCES doctors(id),
    specialty_id INT REFERENCES specialties(id),
    
    -- Scheduling
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    appointment_range tsrange GENERATED ALWAYS AS (   -- ⭐ Used by exclusion constraint
        tsrange(
            (appointment_date + start_time)::timestamp,
            (appointment_date + end_time)::timestamp,
            '[)'
        )
    ) STORED,
    time_zone VARCHAR(50) DEFAULT 'Africa/Cairo',
    
    -- Status workflow
    status VARCHAR(20) NOT NULL DEFAULT 'TBC' 
        CHECK (status IN ('TBC','Ok!','Conf.','Comp.','Canc.','Resch.','Inf.')),
    
    appointment_type VARCHAR(50) DEFAULT 'in_person',
    is_online BOOLEAN DEFAULT FALSE,
    is_overbooked BOOLEAN DEFAULT FALSE,             -- ⭐ Module 12 marker
    
    patient_source VARCHAR(50) NOT NULL DEFAULT 'Cl.s',
    procedure_id UUID,
    
    -- Financial snapshot (denormalized)
    approved_charge DECIMAL(12,2),
    procedure_cost DECIMAL(12,2),
    
    -- Queue management
    queue_number INT,
    checked_in_at TIMESTAMPTZ,
    checked_out_at TIMESTAMPTZ,
    waiting_time_minutes INT,
    
    -- Reschedule chain
    original_appointment_id UUID,
    reschedule_count INT DEFAULT 0,
    
    -- ⭐ ENHANCEMENT: Idempotency for retry safety
    idempotency_key VARCHAR(100) UNIQUE,
    
    -- ⭐ ENHANCEMENT: Optimistic concurrency
    version INT NOT NULL DEFAULT 1,
    
    -- ⭐ ENHANCEMENT: Soft delete
    deleted_at TIMESTAMPTZ,
    
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    branch_id INT NOT NULL DEFAULT 1,
    
    PRIMARY KEY (branch_id, appointment_date, id),    -- ⭐ Composite for partitioning
    
    -- ⭐ CRITICAL: Prevent double-booking the same doctor at the same time
    -- Allows overbooked appointments only when explicitly flagged
    EXCLUDE USING gist (
        doctor_id WITH =,
        appointment_range WITH &&
    ) WHERE (status NOT IN ('Canc.', 'Resch.') 
             AND is_overbooked = FALSE 
             AND deleted_at IS NULL)
) PARTITION BY LIST (branch_id);

-- Sub-partition each branch by month
CREATE TABLE appointments_branch_1 PARTITION OF appointments 
    FOR VALUES IN (1) PARTITION BY RANGE (appointment_date);

CREATE TABLE appointments_branch_1_y2026m05 PARTITION OF appointments_branch_1
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- ⭐ ENHANCEMENT: Automated partition management via pg_partman
SELECT partman.create_parent(
    p_parent_table => 'public.appointments_branch_1',
    p_control => 'appointment_date',
    p_type => 'range',
    p_interval => 'monthly',
    p_premake => 6                                    -- Pre-create 6 months ahead
);

-- Indexes
CREATE INDEX idx_appointments_patient ON appointments(patient_id, appointment_date DESC);
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, appointment_date, status);
CREATE INDEX idx_appointments_status ON appointments(status, appointment_date) 
    WHERE status IN ('TBC','Ok!','Conf.');
CREATE INDEX idx_appointments_source ON appointments(patient_source, appointment_date);
CREATE INDEX idx_appointments_idempotency ON appointments(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

---

#### D. PROCEDURE CATALOGUE

```sql
CREATE TABLE procedure_categories (
    id SERIAL PRIMARY KEY,
    specialty_id INT REFERENCES specialties(id),
    name_en VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200) NOT NULL,
    category_type VARCHAR(50) CHECK (category_type IN ('consultation','follow_up','operative','settling','lab','imaging'))
);

CREATE TABLE procedure_catalogue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id INT REFERENCES procedure_categories(id),
    code VARCHAR(50) UNIQUE,
    fhir_code VARCHAR(50),                            -- ⭐ ENHANCEMENT: FHIR/SNOMED CT code
    snomed_ct_code VARCHAR(50),                       -- ⭐ For interoperability
    icd10_code VARCHAR(20),                           -- ⭐ For diagnosis linkage
    name_en VARCHAR(200) NOT NULL,
    name_ar VARCHAR(200) NOT NULL,
    base_cost DECIMAL(12,2),
    base_approved_charge DECIMAL(12,2),
    is_active BOOLEAN DEFAULT TRUE,
    requires_pre_auth BOOLEAN DEFAULT FALSE,
    typical_duration_minutes INT,                     -- ⭐ For slot calculation
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE doctor_procedure_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
    procedure_id UUID REFERENCES procedure_catalogue(id) ON DELETE CASCADE,
    custom_cost DECIMAL(12,2),
    custom_approved_charge DECIMAL(12,2),
    effective_from DATE NOT NULL,
    effective_until DATE,
    UNIQUE(doctor_id, procedure_id, effective_from),
    CONSTRAINT valid_date_range CHECK (effective_until IS NULL OR effective_until > effective_from)
);
```

---

#### E. BILLING & FINANCIAL LEDGER (Immutable)

### ⭐ ENHANCEMENT 9 — Idempotency Keys + Stricter Immutability

```sql
CREATE TABLE financial_transactions (
    id UUID DEFAULT gen_random_uuid(),
    
    -- ⭐ ENHANCEMENT: Idempotency to prevent duplicate inserts on retry
    idempotency_key VARCHAR(100) NOT NULL,
    
    appointment_id UUID,
    patient_id UUID NOT NULL REFERENCES patients(patient_id),
    doctor_id UUID REFERENCES doctors(id),
    procedure_id UUID REFERENCES procedure_catalogue(id),
    
    patient_source VARCHAR(50) NOT NULL,
    source_fee_percentage DECIMAL(5,2) DEFAULT 0.00,
    source_fee_amount DECIMAL(12,2) DEFAULT 0.00,
    
    approved_charge DECIMAL(12,2) NOT NULL CHECK (approved_charge >= 0),
    procedure_cost DECIMAL(12,2),
    gross_revenue DECIMAL(12,2) NOT NULL,
    
    split_doctor_percentage DECIMAL(5,2) NOT NULL,
    split_clinic_percentage DECIMAL(5,2) NOT NULL,
    doctor_share DECIMAL(12,2) NOT NULL CHECK (doctor_share >= 0),
    clinic_share DECIMAL(12,2) NOT NULL CHECK (clinic_share >= 0),
    
    -- ⭐ ENHANCEMENT: Mathematical integrity check
    CONSTRAINT splits_sum_to_gross CHECK (
        ABS((doctor_share + clinic_share) - gross_revenue) < 0.01
    ),
    CONSTRAINT splits_percentages CHECK (
        split_doctor_percentage + split_clinic_percentage = 100
    ),
    
    payment_method VARCHAR(50),
    payment_status VARCHAR(20) DEFAULT 'pending' 
        CHECK (payment_status IN ('pending','verified','approved','paid','reconciled','refunded')),
    
    check_in_amount DECIMAL(12,2),
    check_out_amount DECIMAL(12,2),
    
    is_refund BOOLEAN DEFAULT FALSE,
    original_transaction_id UUID,
    refund_reason TEXT,
    
    settled_at TIMESTAMPTZ,
    settled_by UUID,
    settlement_reference VARCHAR(100),
    
    -- ⭐ ENHANCEMENT: Multi-currency readiness
    currency_code CHAR(3) NOT NULL DEFAULT 'EGP',
    exchange_rate DECIMAL(12,6) DEFAULT 1.0,
    
    -- ⭐ ENHANCEMENT: VAT for Egyptian compliance
    vat_rate DECIMAL(5,2) DEFAULT 14.00,
    vat_amount DECIMAL(12,2) GENERATED ALWAYS AS (approved_charge * vat_rate / 100) STORED,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    branch_id INT NOT NULL DEFAULT 1,
    
    transaction_date DATE NOT NULL,
    
    PRIMARY KEY (branch_id, transaction_date, id),
    UNIQUE (idempotency_key)                           -- ⭐ Prevent retry duplicates
) PARTITION BY LIST (branch_id);

-- Sub-partitions per branch by month (same pattern as appointments)
CREATE TABLE financial_transactions_branch_1 PARTITION OF financial_transactions
    FOR VALUES IN (1) PARTITION BY RANGE (transaction_date);

CREATE TABLE ft_branch_1_y2026m05 PARTITION OF financial_transactions_branch_1
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- ⭐ ENHANCEMENT: Strict immutability via trigger
CREATE OR REPLACE FUNCTION prevent_financial_modification() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Financial transactions are immutable. Use compensating refund transactions.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_financial_transactions
    BEFORE UPDATE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_modification();

CREATE TRIGGER no_delete_financial_transactions
    BEFORE DELETE ON financial_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_financial_modification();

-- Indexes
CREATE INDEX idx_ft_patient ON financial_transactions(patient_id, transaction_date DESC);
CREATE INDEX idx_ft_doctor ON financial_transactions(doctor_id, payment_status, transaction_date);
CREATE INDEX idx_ft_appointment ON financial_transactions(appointment_id);
CREATE INDEX idx_ft_settlement ON financial_transactions(payment_status, settled_at) 
    WHERE payment_status = 'paid';

-- Event sourcing (also immutable)
CREATE TABLE financial_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    event_version INT NOT NULL DEFAULT 1,             -- ⭐ Schema versioning
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    
    INDEX (transaction_id, created_at)
);
```

---

#### F. SOURCE FEE CONFIGURATION

```sql
CREATE TABLE source_fee_rules (
    id SERIAL PRIMARY KEY,
    source_code VARCHAR(50) UNIQUE NOT NULL,
    source_name_en VARCHAR(100),
    source_name_ar VARCHAR(100),
    fee_type VARCHAR(20) CHECK (fee_type IN ('percentage','fixed')),
    fee_value DECIMAL(12,2) NOT NULL CHECK (fee_value >= 0),
    deduct_from VARCHAR(20) DEFAULT 'clinic' CHECK (deduct_from IN ('clinic','doctor','both')),
    is_active BOOLEAN DEFAULT TRUE,
    valid_from DATE NOT NULL,
    valid_until DATE,
    
    -- ⭐ ENHANCEMENT: Per-specialty override
    specialty_id INT REFERENCES specialties(id),
    
    -- ⭐ ENHANCEMENT: Audit who changed this and when
    last_modified_by UUID,
    last_modified_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

#### G. USERS & RBAC

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(200) UNIQUE,
    mobile VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    
    -- ⭐ ENHANCEMENT: Password policy enforcement metadata
    password_changed_at TIMESTAMPTZ DEFAULT NOW(),
    password_must_change BOOLEAN DEFAULT FALSE,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin','finance','doctor','receptionist','patient')),
    is_active BOOLEAN DEFAULT TRUE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret_encrypted VARCHAR(255),
    mfa_backup_codes_encrypted TEXT,                  -- ⭐ Recovery codes
    
    last_login TIMESTAMPTZ,
    last_login_ip INET,
    
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_branches (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    branch_id INT NOT NULL,
    role_at_branch VARCHAR(50),
    PRIMARY KEY (user_id, branch_id)
);

-- ⭐ ENHANCEMENT: Detailed audit logs with partitioning
CREATE TABLE audit_logs (
    id UUID DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','SELECT','LOGIN','LOGOUT','EXPORT')),
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],                            -- ⭐ Just the fields that changed
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(200),
    request_id VARCHAR(100),                          -- ⭐ Correlation across services
    branch_id INT NOT NULL DEFAULT 1,
    
    PRIMARY KEY (changed_at, id)
) PARTITION BY RANGE (changed_at);

-- Pre-create 12 months
CREATE TABLE audit_logs_y2026m05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

### ⭐ ENHANCEMENT 10 — pgaudit Extension for Compliance Logging

```sql
-- Capture every SELECT/INSERT/UPDATE/DELETE on sensitive tables
ALTER SYSTEM SET pgaudit.log = 'write, ddl';
ALTER SYSTEM SET pgaudit.log_relation = on;
ALTER TABLE patients SET (pgaudit.log = 'all');
ALTER TABLE financial_transactions SET (pgaudit.log = 'all');
ALTER TABLE doctors SET (pgaudit.log = 'write');
```

---

### 2.3 PostgreSQL Configuration for Production

```yaml
# Crunchy PostgreSQL Cluster spec (OpenShift)
spec:
  postgresVersion: 16
  instances: 3                                       # ⭐ 3-node HA
  
  patroni:                                            # ⭐ Patroni tuning
    dynamicConfiguration:
      postgresql:
        parameters:
          max_connections: 500
          shared_buffers: 4GB
          effective_cache_size: 12GB
          maintenance_work_mem: 1GB
          wal_level: logical                          # ⭐ Required for Debezium CDC
          max_wal_senders: 10
          max_replication_slots: 10
          random_page_cost: 1.1                       # SSD
          effective_io_concurrency: 200               # SSD
          work_mem: 16MB
          
  dataVolumeClaimSpec:
    storageClassName: odf-lvm-vg1
    accessModes: ["ReadWriteOnce"]
    resources:
      requests:
        storage: 500Gi
        
  proxy:
    pgBouncer:
      replicas: 3                                     # ⭐ Was 2, raised to 3
      config:
        global:
          pool_mode: transaction
          max_client_conn: 1000
          default_pool_size: 25
          
  backups:
    pgbackrest:
      configuration:
        - secret:
            name: s3-creds
      global:
        repo1-retention-full: "30"
        repo1-retention-archive: "30"
      repos:
        - name: repo1
          s3:
            bucket: fadl-clinic-postgres-backups
            endpoint: s3.openshift-storage.svc.cluster.local
            region: us-east-1
      schedule:
        full: "0 2 * * 0"
        incremental: "0 2 * * 1-6"
        
  monitoring:
    pgmonitor:
      enabled: true
```

---

## 3. MongoDB — EHR & Document Store

### ⭐ ENHANCEMENT 11 — Split Encounters into Separate Collection

**Critical issue:** The original design embeds all encounters in a single `medical_records` document. MongoDB has a hard 16MB document size limit. A chronic patient with 10 years of visits, voice notes, and lab results will hit this limit.

**Enhanced design:** `medical_records` holds patient-level metadata only. Encounters live in their own collection with patient reference.

```javascript
// Collection: medical_records (one per patient — small, fast)
{
  _id: ObjectId("..."),
  patient_id: "uuid-from-postgres",                  // ⭐ FK to patients.patient_id (UUID)
  patient_mobile: "+201012345678",                   // Denormalized for query speed
  national_id: "12345678901234",
  
  demographics: {
    name_en: "Ahmed Hassan",
    name_ar: "أحمد حسن",
    date_of_birth: ISODate("1985-03-15"),
    gender: "M",
    blood_type: "O+",
    allergies: ["Penicillin", "Latex"]
  },
  
  // Summary (computed/cached, NOT the encounters themselves)
  summary: {
    total_visits: 15,
    last_visit_date: ISODate("2026-05-02T10:00:00Z"),
    chronic_conditions: ["Hypertension"],
    active_medications: ["Amlodipine 5mg"],
    last_encounter_id: ObjectId("...")
  },
  
  schema_version: 1,                                  // ⭐ For migrations
  created_at: ISODate("..."),
  updated_at: ISODate("..."),
  branch_id: 1
}

// Collection: encounters (one document per encounter)
{
  _id: ObjectId("..."),
  patient_id: "uuid-from-postgres",                  // ⭐ FK to patients
  appointment_id: "pg-uuid-001",                      // FK to PostgreSQL appointments
  doctor_id: "doc-uuid-001",
  specialty_id: 1,
  encounter_date: ISODate("2026-05-02T10:00:00Z"),
  encounter_type: "consultation",
  
  chief_complaint: { en: "...", ar: "..." },
  history_of_present_illness: "...",
  
  vitals: {
    blood_pressure: "120/80",
    heart_rate: 72,
    temperature: 37.1,
    weight_kg: 78,
    height_cm: 175
  },
  
  physical_examination: { en: "...", ar: "..." },
  
  diagnosis: {
    primary: { 
      icd10: "N30.0",                                 // ⭐ Standardized coding
      snomed_ct: "385093006",
      name_en: "Cystitis", 
      name_ar: "التهاب المثانة" 
    },
    secondary: []
  },
  
  procedures: [...],
  prescriptions: [...],
  lab_orders: [...],
  attachments: [...],
  voice_notes: [...],
  
  // ⭐ ENHANCEMENT: FHIR R4 export ready
  fhir_resource_type: "Encounter",
  fhir_export_status: "synced",                       // synced | pending | error
  
  schema_version: 1,
  created_by: "dr.ahmed@fadl-clinic.com",
  created_at: ISODate("..."),
  updated_at: ISODate("..."),
  branch_id: 1
}

// Indexes
db.encounters.createIndex({ "patient_id": 1, "encounter_date": -1 })
db.encounters.createIndex({ "appointment_id": 1 }, { unique: true })
db.encounters.createIndex({ "doctor_id": 1, "encounter_date": -1 })
db.encounters.createIndex({ "diagnosis.primary.icd10": 1 })
db.encounters.createIndex({ "branch_id": 1, "encounter_date": -1 })
```

### ⭐ ENHANCEMENT 12 — DICOM via DICOMweb, Not Raw S3 Paths

The original design stores raw S3 paths to DICOM files. Modern healthcare imaging uses **DICOMweb** (WADO-RS, QIDO-RS, STOW-RS). Recommend deploying **Orthanc** or **dcm4chee** as a DICOM server on OpenShift, with images backed by ODF object storage. MongoDB stores DICOM study metadata + the WADO-RS retrieval URL.

```javascript
// Collection: dicom_studies
{
  _id: ObjectId("..."),
  study_instance_uid: "1.2.840.113619.2.55.3.604688.4...",  // DICOM standard UID
  patient_id: "uuid-from-postgres",
  encounter_id: ObjectId("..."),
  modality: "CT",                                     // CT, MRI, US, XR, etc.
  body_part: "ABDOMEN",
  study_date: ISODate("..."),
  
  // DICOMweb retrieval (not raw S3 path)
  wado_rs_url: "https://dicom.fadl-clinic.com/studies/{study_uid}",
  qido_rs_url: "https://dicom.fadl-clinic.com/studies?StudyInstanceUID={uid}",
  
  series_count: 3,
  images_count: 320,
  total_size_mb: 245,
  
  // Backup location (still S3 for archival)
  archive_s3_path: "s3://fadl-clinic-files/dicom/{patient_hash}/{study_uid}/",
  
  branch_id: 1,
  created_at: ISODate("...")
}
```

### ⭐ ENHANCEMENT 13 — MongoDB Sharding Plan (Year 2 Trigger)

The original Year 2 plan mentions sharding by `branch_id`. Add explicit shard key strategy now:

- **Shard key:** `{ branch_id: 1, patient_id: "hashed" }`
- **Chunk size:** 64MB default
- **Zone sharding:** Branch-1 zone = NodePool A, Branch-2 zone = NodePool B
- **Pre-split** chunks before going live to avoid jumbo chunks

---

## 4. Redis — Caching, Sessions & Real-Time

### ⭐ ENHANCEMENT 14 — Redis Streams for Notification Queue

**Original:** `LPUSH queue:notifications:sms` + `BRPOP` from workers.  
**Problem:** No consumer groups, no replay, no acknowledgment, no exactly-once delivery semantics. If a notification worker crashes mid-processing, the message is lost.

**Enhanced:** Use Redis Streams with consumer groups.

```bash
# Producer (any service)
XADD notifications * 
  channel "whatsapp"
  to "+201012345678"
  template "appointment_confirmed_ar"
  vars '{"date":"2026-05-02","time":"10:00"}'

# Consumer group setup (once)
XGROUP CREATE notifications notification_workers $ MKSTREAM

# Worker reads
XREADGROUP GROUP notification_workers worker-1 COUNT 10 BLOCK 5000 STREAMS notifications >

# After processing
XACK notifications notification_workers <message_id>

# Replay un-acked messages from crashed worker
XAUTOCLAIM notifications notification_workers worker-2 60000 0
```

### ⭐ ENHANCEMENT 15 — Pessimistic Slot Locking

**Problem:** Two patients booking the same slot simultaneously can both succeed if you only check Redis cache (race condition between read and write).

**Solution:** Use Redis distributed locks (`SET NX EX`) before confirming the appointment in PostgreSQL.

```bash
# Acquire lock (atomic check-and-set)
SET lock:slot:{doctor_id}:{date}:{time} {request_id} NX EX 30

# If acquired → write to PostgreSQL with appointment_range exclusion constraint
# If failed → return "slot taken" to user

# Release after PostgreSQL commit
DEL lock:slot:{doctor_id}:{date}:{time}
```

### Updated Topology

```
┌─────────────────────────────────────────────────────────────┐
│              Redis Cluster (6 nodes + Sentinel)             │
│                                                             │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐                    │
│   │ Master 1│  │ Master 2│  │ Master 3│   (Hash slots)     │
│   │ 0-5460  │  │5461-10922│ │10923-16383│                  │
│   └───┬─────┘  └────┬────┘  └────┬────┘                    │
│       │             │            │                          │
│   ┌───┴─────┐  ┌────┴────┐  ┌────┴────┐                    │
│   │Replica 1│  │Replica 2│  │Replica 3│                    │
│   └─────────┘  └─────────┘  └─────────┘                    │
│                                                             │
│   ⭐ Persistence: AOF everysec + RDB every 15 min           │
│   ⭐ Memory: 4GB/node, allkeys-lru eviction                 │
│   ⭐ Streams: notifications, slot_events, audit_events      │
│   ⭐ Network: TLS in-cluster (Istio mTLS)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Object Storage — Files, Images & Cold Data

### ⭐ ENHANCEMENT 16 — Bucket Versioning + Object Lock for WORM Compliance

For Egyptian healthcare records (25-year retention), enable **S3 Object Lock** in compliance mode on backup and medical record buckets. Even an admin cannot delete locked objects — protects against ransomware and insider threats.

```yaml
apiVersion: objectbucket.io/v1alpha1
kind: ObjectBucketClaim
metadata:
  name: fadl-clinic-medical-records
spec:
  generateBucketName: fadl-medical
  storageClassName: ocs-storagecluster-ceph-rgw
  additionalConfig:
    bucketLifecycle: |
      <LifecycleConfiguration>
        <Rule>
          <ID>tier-to-cold-after-2-years</ID>
          <Status>Enabled</Status>
          <Transition>
            <Days>730</Days>
            <StorageClass>GLACIER</StorageClass>
          </Transition>
        </Rule>
      </LifecycleConfiguration>
    objectLock: enabled
    objectLockMode: COMPLIANCE
    objectLockRetentionDays: 9125    # 25 years
```

---

## 6. Data Flow Architecture

(Same as original — already strong)

---

## 7. Backup & Disaster Recovery

### ⭐ ENHANCEMENT 17 — Automated PITR Validation

**Problem:** Original plan does monthly PITR test. That's good but manual, easy to forget.

**Enhanced:** Tekton Pipeline runs nightly:
1. Pick a random transaction from last 24h
2. Restore PostgreSQL backup to throwaway namespace
3. Verify the transaction exists at expected timestamp
4. Tear down namespace
5. Alert if validation fails

This catches backup corruption within 24 hours instead of 30 days.

### Backup Matrix (Updated)

| Data Store | Method | Frequency | Retention | Validation |
|------------|--------|-----------|-----------|------------|
| PostgreSQL | pgBackRest (full) | Weekly | 30 days | Nightly PITR auto-test ⭐ |
| PostgreSQL | pgBackRest (incr) | Daily | 30 days | Nightly PITR auto-test ⭐ |
| PostgreSQL | WAL Archiving | Continuous | 30 days | Continuous ingestion check |
| MongoDB | Percona Backup | Daily | 30 days | Weekly restore test ⭐ |
| MongoDB | Oplog backup | Continuous | 7 days | Continuous lag monitoring |
| Redis | RDB + AOF | Every 15 min | 7 days | Weekly load test ⭐ |
| Object Storage | Ceph replication | Real-time | Cross-zone | Monthly checksum ⭐ |
| Cross-Region DR | Async replication | Continuous | 90 days | Quarterly full DR drill ⭐ |

---

## 8. Monitoring & Alerting

### ⭐ ENHANCEMENT 18 — Healthcare-Specific Alerts

| Metric | Tool | Alert Threshold | Why |
|--------|------|-----------------|-----|
| PostgreSQL replication lag | Prometheus | > 30s warn, > 60s page | Standard |
| PostgreSQL connection saturation | Prometheus | > 80% | Standard |
| Failed appointment bookings rate | App metric | > 5/min ⭐ | Indicates user-facing outage |
| Financial transaction integrity check failure | App metric | Any ⭐ | doctor_share + clinic_share ≠ gross_revenue |
| MFA failure rate spike | Audit log → Prometheus | > 10/min ⭐ | Possible brute force |
| Patient record access by single user | pgaudit ⭐ | > 100/hour | Possible data exfiltration |
| MongoDB oplog window | Percona | < 24 hours | Standard |
| Redis cache hit ratio | Prometheus | < 90% | Standard |
| Backup failure | Alertmanager | Any | Standard |
| Encryption key rotation overdue | Vault metric ⭐ | > 90 days | Compliance |

---

## 9. Security Configuration

### ⭐ ENHANCEMENT 19 — Vault Dynamic Database Credentials

Instead of static DB passwords, use Vault's database secrets engine to issue short-lived (1 hour) credentials per service per pod. If a pod is compromised, credentials self-expire.

```hcl
# Vault config
path "database/creds/fadl-app-readwrite" {
  capabilities = ["read"]
}

# Application requests creds at startup
vault read database/creds/fadl-app-readwrite
# Response: username=v-app-x7d9f3, password=A1b2C3..., lease=3600s
```

### Encryption Layers (Updated)

| Layer | Method | Key Management | Rotation |
|-------|--------|---------------|----------|
| Data at rest (PVC) | LUKS via ODF | OpenShift-managed | Annual |
| Data at rest (DB) | PostgreSQL TDE | Vault | Quarterly ⭐ |
| Field-level (PII) | pgcrypto AES-256 | Vault transit engine | Per-record key versioning ⭐ |
| Data in transit | TLS 1.3 + mTLS | Service Mesh | Auto-rotated by Istio |
| Backups | AES-256-GCM | Vault transit engine | Quarterly ⭐ |
| App-DB credentials | Dynamic | Vault DB engine | Hourly ⭐ |

### Access Control (Updated with Immutability)

```sql
-- Read/Write role (no UPDATE/DELETE on financial tables)
CREATE ROLE fadl_app_readwrite;
GRANT SELECT, INSERT ON financial_transactions TO fadl_app_readwrite;
GRANT SELECT, INSERT, UPDATE ON appointments TO fadl_app_readwrite;
GRANT SELECT, INSERT, UPDATE ON patients TO fadl_app_readwrite;

-- Read-only for analytics
CREATE ROLE fadl_app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fadl_app_readonly;

-- Migration role (only during Phase Zero, then DROPPED)
CREATE ROLE fadl_migration;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fadl_migration;
-- After migration: DROP ROLE fadl_migration;

-- Per-branch RLS context
CREATE ROLE fadl_branch_1_role;
ALTER ROLE fadl_branch_1_role SET app.current_branch_id = '1';
```

---

## 10. Schema Migrations & Day-2 Operations ⭐ NEW

### ⭐ ENHANCEMENT 20 — Schema Migration Tooling

**Problem:** Original plan has no schema evolution strategy. In production, schemas change weekly. Without tooling, you'll have drift between dev/staging/prod.

**Solution:** Adopt **Flyway** (recommended for PostgreSQL) or **Liquibase**. Migrations live in the `service/<service-name>` Git branch. Tekton runs them automatically before app deployment.

```
service/billing-service/
├── src/
│   └── main/
│       └── resources/
│           └── db/migration/
│               ├── V001__initial_schema.sql
│               ├── V002__add_idempotency_key.sql
│               ├── V003__add_vat_columns.sql
│               └── V004__add_currency_code.sql
└── flyway.conf
```

### MongoDB Schema Versioning

MongoDB has no schema, but documents must evolve safely. Add `schema_version` field to every collection. Migration jobs upgrade documents lazily on read or in batches via background workers.

### Partition Maintenance Automation

```sql
-- pg_partman background worker creates next month's partitions automatically
-- Configure as cron via OpenShift CronJob
SELECT partman.run_maintenance(p_analyze => true);
```

### Vacuum and Analyze Tuning

```yaml
# Aggressive autovacuum on high-velocity tables
ALTER TABLE appointments SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE financial_transactions SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
```

---

## 11. Scaling Roadmap

| Phase | Scale | Database Action |
|-------|-------|-----------------|
| **Current** | 1 branch, 30 doctors, 500 patients/day | Single cluster, monthly partitions |
| **Year 1** | 3 branches, 100 doctors, 2000 patients/day | Read replicas per branch; sharded Redis; CDC to analytics warehouse ⭐ |
| **Year 2** | 10 branches, 500 doctors, 10000 patients/day | PostgreSQL logical replication to regional clusters; MongoDB sharding by `branch_id` |
| **Year 5** | National chain | CockroachDB or YugabyteDB evaluation; MongoDB Atlas Global Clusters |

---

## 12. Implementation Checklist

### Foundation
- [ ] Deploy Crunchy PostgreSQL Operator with 3-instance HA
- [ ] Deploy Percona MongoDB Operator with 3-node replica set + arbiter
- [ ] Deploy Redis Cluster (6 nodes) with persistence + Streams enabled ⭐
- [ ] Configure ODF ObjectBucketClaims with Object Lock + versioning ⭐
- [ ] Integrate HashiCorp Vault dynamic database credentials ⭐
- [ ] Install required PostgreSQL extensions (pgcrypto, pg_trgm, pg_partman, pgaudit, btree_gist) ⭐

### Schema
- [ ] Use UUID `patient_id` as PK; mobile as unique constraint only ⭐
- [ ] Apply composite partitioning (branch_id LIST → date RANGE) ⭐
- [ ] Add exclusion constraint to prevent doctor double-booking ⭐
- [ ] Add idempotency keys on appointments + financial_transactions ⭐
- [ ] Add optimistic concurrency `version` column on mutable tables ⭐
- [ ] Add soft delete `deleted_at` columns ⭐
- [ ] Enable Row Level Security on tenant tables ⭐
- [ ] Install Flyway/Liquibase per service ⭐

### MongoDB
- [ ] Split medical_records into encounters collection ⭐
- [ ] Deploy Orthanc/dcm4chee for DICOMweb ⭐
- [ ] Add `schema_version` field to all collections ⭐
- [ ] Plan shard key for Year 2 (`{branch_id: 1, patient_id: "hashed"}`) ⭐

### Operations
- [ ] Deploy Debezium CDC for PostgreSQL → Kafka ⭐
- [ ] Configure pg_partman for automated partition management ⭐
- [ ] Configure aggressive autovacuum on high-velocity tables ⭐
- [ ] Enable pgaudit on patients + financial_transactions ⭐
- [ ] Enable PgBouncer with separate write/read/analytics pools ⭐
- [ ] Configure Redis Streams for notification fan-out ⭐
- [ ] Configure Redis distributed locks for slot booking ⭐

### Backup & DR
- [ ] Enable pgBackRest + Percona Backup with S3 targets
- [ ] Build Tekton Pipeline for nightly PITR auto-validation ⭐
- [ ] Build Tekton Pipeline for weekly MongoDB restore test ⭐
- [ ] Configure quarterly cross-database DR drill ⭐

### Pre-Production Validation
- [ ] Run Phase Zero data migration with < 0.01% variance
- [ ] Execute failover test: kill primary, verify automatic promotion
- [ ] Execute PITR test: restore to specific timestamp, verify data
- [ ] Load test: simulate 10,000 concurrent appointment bookings
- [ ] Security scan: verify field-level encryption for mobile/national_id
- [ ] Penetration test: third-party assessment

---

## 📊 Summary of 20 Enhancements

| # | Enhancement | Category |
|---|---|---|
| 1 | Debezium CDC for PostgreSQL → Kafka | Scale & Performance |
| 2 | PgBouncer with separate write/read/analytics pools | Scale & Performance |
| 3 | Required PostgreSQL extensions explicitly listed | Operational Maturity |
| 4 | Use UUID patient_id as PK, not mobile | Critical Correctness |
| 5 | Row Level Security on tenant tables | Compliance & Security |
| 6 | Composite partitioning (branch + date) | Scale & Performance |
| 7 | Reference patient_id (UUID), not mobile in FKs | Critical Correctness |
| 8 | Exclusion constraint to prevent double-booking | Critical Correctness |
| 9 | Idempotency keys + stricter immutability triggers | Critical Correctness |
| 10 | pgaudit extension for compliance logging | Compliance & Security |
| 11 | Split encounters into separate MongoDB collection | Critical Correctness |
| 12 | DICOM via DICOMweb (Orthanc/dcm4chee) | Compliance & Security |
| 13 | MongoDB sharding plan with explicit shard key | Scale & Performance |
| 14 | Redis Streams for notifications (consumer groups) | Critical Correctness |
| 15 | Redis distributed locks for slot booking | Critical Correctness |
| 16 | S3 Object Lock for WORM compliance (25-year) | Compliance & Security |
| 17 | Automated nightly PITR validation | Operational Maturity |
| 18 | Healthcare-specific alerts (PII access, financial integrity) | Compliance & Security |
| 19 | Vault dynamic database credentials | Compliance & Security |
| 20 | Flyway/Liquibase schema migrations + autovacuum tuning | Operational Maturity |

---

## 📅 Change Log

| Date | Version | Change | By |
|---|---|---|---|
| 2026-05-02 | 1.0 | Original database architecture submitted | Saad |
| 2026-05-02 | 1.1 | **Reviewed and enhanced by Claude** — 20 production-grade enhancements added across schema correctness, scale, compliance, and Day-2 operations | Saad + Claude |

---

> **Security is a default posture, not an afterthought. Plan for scaling across multiple clinic branches. Ensure comprehensive API documentation and clean scalable architecture aligned with Red Hat OpenShift enterprise best practices.**