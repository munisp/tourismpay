-- TourismPay: Initialize additional databases required by Go and Python services.
-- This runs automatically on first container startup via docker-entrypoint-initdb.d.

CREATE DATABASE tourismpay_settlement OWNER tourismpay_user;
