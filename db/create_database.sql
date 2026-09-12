-- Run once as PostgreSQL administrator (postgres), connected to database postgres.
-- Set a personal password in place of CHANGE_ME before executing.
CREATE ROLE asset_user LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE asset_manager OWNER asset_user ENCODING 'UTF8';
-- Reconnect to asset_manager AS asset_user before schema.sql and seed.sql.
