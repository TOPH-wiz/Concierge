
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { pool } = require("../src/db");

async function main() {
  const migrationPath = path.join(
    __dirname,
    "..",
    "db",
    "migrations",
    "001_initial.sql"
  );

  const sql = fs.readFileSync(migrationPath, "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    console.log("Migration 001 applied successfully.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration runner failed:", error.message);
  process.exitCode = 1;
  pool.end().catch(() => {});
});
