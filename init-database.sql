-- init-database.sql
-- Initialize database with required users and permissions

-- Create the smartops role if it doesn't exist
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'smartops') THEN
      CREATE ROLE smartops LOGIN PASSWORD 'smartops123';
   END IF;
END
$$;

-- Grant necessary permissions
ALTER ROLE smartops CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE smartops_platform TO smartops;

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE smartops_platform OWNER smartops'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smartops_platform');

-- Connect to the new database and set up schema
\c smartops_platform;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO smartops;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO smartops;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO smartops;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO smartops;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO smartops;
