import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url + "?ssl=%7B%22rejectUnauthorized%22%3Afalse%7D");
try {
  await conn.execute(
    "ALTER TABLE tourist_deal_wishlists ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMP NULL DEFAULT NULL"
  );
  console.log("Migration done: alerted_at column added to tourist_deal_wishlists");
} catch (e) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("Column already exists, skipping");
  } else {
    console.error("Error:", e.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
