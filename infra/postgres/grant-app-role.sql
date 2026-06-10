-- Per-database grants for fadl_app (run inside each service database).
-- Tables stay owned by `fadl`; fadl_app gets DML only, so RLS policies apply.
-- CREATE on schema public is granted because appointment/billing services
-- create monthly partitions at runtime (V011 partition automation).

\set ON_ERROR_STOP on

GRANT USAGE, CREATE ON SCHEMA public TO fadl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fadl_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fadl_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO fadl_app;

-- Future objects created by `fadl` (migrations) are automatically granted
ALTER DEFAULT PRIVILEGES FOR ROLE fadl IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fadl_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fadl IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fadl_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fadl IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO fadl_app;
