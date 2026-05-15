Implement a 3-replica read database architecture for the Fadl Clinic 
Management System with automatic load balancing across replicas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARCHITECTURE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1 Primary (WRITE)  →  replicates to  →  3 Read Replicas
                                          ├── Replica 1
                                          ├── Replica 2
                                          └── Replica 3

- ALL write operations (INSERT, UPDATE, DELETE) → Primary only
- ALL read operations (SELECT) → round-robin across Replica 1, 2, 3
- If a replica is down → skip it and use the next available one
- If ALL replicas are down → fall back to Primary for reads

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — DATABASE CONFIGURATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Add to .env:

  # Primary
  DB_PRIMARY_HOST=
  DB_PRIMARY_PORT=5432
  DB_PRIMARY_USER=
  DB_PRIMARY_PASS=
  DB_PRIMARY_NAME=fadl_clinic

  # Replica 1
  DB_REPLICA1_HOST=
  DB_REPLICA1_PORT=5432
  DB_REPLICA1_USER=
  DB_REPLICA1_PASS=
  DB_REPLICA1_NAME=fadl_clinic

  # Replica 2
  DB_REPLICA2_HOST=
  DB_REPLICA2_PORT=5432
  DB_REPLICA2_USER=
  DB_REPLICA2_PASS=
  DB_REPLICA2_NAME=fadl_clinic

  # Replica 3
  DB_REPLICA3_HOST=
  DB_REPLICA3_PORT=5432
  DB_REPLICA3_USER=
  DB_REPLICA3_PASS=
  DB_REPLICA3_NAME=fadl_clinic

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — DATABASE MANAGER CLASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create /src/db/DatabaseManager.ts (or .js):

  class DatabaseManager {
    - primaryPool:   connection to Primary
    - replicaPools:  array of 3 replica connections
    - currentIndex:  round-robin counter (starts at 0)
    - healthStatus:  { replica1: bool, replica2: bool, replica3: bool }

    Methods:
    
    getWriteConnection()
      → always returns primaryPool
      → used for INSERT, UPDATE, DELETE, transactions

    getReadConnection()
      → round-robin: pick next healthy replica
      → increment currentIndex % 3
      → if selected replica is unhealthy, try next
      → if all 3 replicas unhealthy, fall back to primaryPool
      → log which replica handled the request

    healthCheck()
      → ping each replica every 30 seconds
      → mark replica as unhealthy if ping fails or timeout > 2s
      → mark replica as healthy again once ping recovers
      → log all status changes

    getStatus()
      → returns JSON with health of all 4 connections
      → used by monitoring endpoint
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — QUERY ROUTING MIDDLEWARE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create /src/db/queryRouter.ts:

  function routeQuery(sql, params):
    - Parse the SQL string — check first keyword
    - If starts with SELECT → use getReadConnection()
    - If starts with INSERT, UPDATE, DELETE, 
      BEGIN, COMMIT, ROLLBACK → use getWriteConnection()
    - Execute query on chosen connection
    - On replica error: retry once on next replica,
      then fall back to primary
    - Log: timestamp, query type, which node used, 
      duration in ms

  Replace all direct db.query() calls in the codebase
  with routeQuery() so routing is automatic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — TRANSACTION SAFETY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - ALL queries inside a transaction block must use 
    the Primary connection exclusively
  - BEGIN → binds that session to Primary
  - All subsequent queries in same session → Primary
  - COMMIT / ROLLBACK → Primary
  - Never split a transaction across primary + replica

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — HEALTH MONITORING ENDPOINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Add GET /api/system/db-status

  Returns:
  {
    "primary":   { "host": "...", "status": "healthy", "latency_ms": 4 },
    "replica_1": { "host": "...", "status": "healthy", "latency_ms": 6 },
    "replica_2": { "host": "...", "status": "degraded","latency_ms": 312 },
    "replica_3": { "host": "...", "status": "healthy", "latency_ms": 5 },
    "active_replica_index": 2,
    "reads_served": { "replica_1": 142, "replica_2": 98, "replica_3": 137 },
    "fallbacks_to_primary": 3
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — REPLICATION LAG GUARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  For critical reads immediately after a write 
  (e.g. read-your-own-writes):

  - Accept optional flag: routeQuery(sql, params, 
    { forcePrimary: true })
  - Use this flag in these cases:
    · Immediately after creating an appointment
    · Immediately after saving settlement changes
    · Any operation where stale replica data would 
      cause a visible bug
  - All other reads use replicas normally

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7 — LOGGING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Log every query with:
  [DB] 2026-05-10 09:14:22 | READ  | replica_2 | 8ms  | GET /api/settlements
  [DB] 2026-05-10 09:14:23 | WRITE | primary   | 12ms | POST /api/appointments
  [DB] 2026-05-10 09:14:25 | READ  | replica_3 | 6ms  | GET /api/patients
  [DB] 2026-05-10 09:14:26 | READ  | replica_1 | 7ms  | GET /api/doctors
  [DB] 2026-05-10 09:14:27 | FALLBACK→PRIMARY  | replica_2 down

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - Do NOT change any existing API logic or business rules
  - Only the database connection layer changes
  - All existing db.query() calls → replaced with routeQuery()
  - Existing behavior stays identical, only the node 
    serving the query changes
  - Add unit tests for: round-robin logic, failover 
    when replica is down, transaction pinning to primary
