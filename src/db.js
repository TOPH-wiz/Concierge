const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
console.warn(
"DATABASE_URL is not set. Database operations will be unavailable."
);
}

const pool = new Pool({
connectionString,
max: 10,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 5000,
ssl:
process.env.NODE_ENV === "production"
? { rejectUnauthorized: true }
: false
});

pool.on("error", (error) => {
console.error("Unexpected PostgreSQL pool error:", error.message);
});

async function query(text, params = []) {
return pool.query(text, params);
}

async function checkDatabase() {
const result = await query("SELECT NOW() AS server_time");
return result.rows[0];
}

async function closeDatabase() {
await pool.end();
}

module.exports = {
pool,
query,
checkDatabase,
closeDatabase
};
