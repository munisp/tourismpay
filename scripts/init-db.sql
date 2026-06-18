-- TourismPay: Initialize additional databases required by services.
-- This runs automatically on first container startup via docker-entrypoint-initdb.d.

CREATE DATABASE tourismpay_settlement OWNER tourismpay_user;
CREATE DATABASE keycloak OWNER tourismpay_user;
CREATE DATABASE permify OWNER tourismpay_user;
