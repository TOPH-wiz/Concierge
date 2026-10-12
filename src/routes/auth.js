const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { pool } = require("../db");

const router = express.Router();

const registrationSchema = z.object({
email: z.string().email().max(254),
password: z.string().min(12).max(72),
fullName: z.string().trim().min(2).max(120),
role: z.enum(["corporate", "proxy"])
});

const loginSchema = z.object({
email: z.string().email().max(254),
password: z.string().min(1).max(72)
});

function getJwtSecret() {
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
throw new Error("JWT_SECRET must contain at least 32 characters");
}
return secret;
}

function issueToken(user) {
return jwt.sign(
{ role: user.role },
getJwtSecret(),
{
subject: user.id,
expiresIn: "15m",
issuer: "oqata-api",
audience: "oqata-client",
algorithm: "HS256"
}
);
}

router.post("/register", async (req, res) => {
const parsed = registrationSchema.safeParse(req.body);

if (!parsed.success) {
return res.status(400).json({
error: "Invalid registration details",
details: parsed.error.issues.map(issue => ({
field: issue.path.join("."),
message: issue.message
}))
});
}

try {
getJwtSecret();

const email = parsed.data.email.trim().toLowerCase();
const passwordHash = await bcrypt.hash(parsed.data.password, 12);

const result = await pool.query(
  `INSERT INTO app_users (email, password_hash, full_name, role)
   VALUES ($1, $2, $3, $4)
   RETURNING id, email, full_name, role, status`,
  [
    email,
    passwordHash,
    parsed.data.fullName,
    parsed.data.role
  ]
);

const user = result.rows[0];

return res.status(201).json({
  user,
  accessToken: issueToken(user),
  tokenType: "Bearer",
  expiresIn: 900
});

} catch (error) {
if (error.code === "23505") {
return res.status(409).json({
error: "An account with this email already exists"
});
}

console.error("Registration failed:", error.message);

return res.status(500).json({
  error: "Registration failed. Check server configuration."
});

}
});

router.post("/login", async (req, res) => {
const parsed = loginSchema.safeParse(req.body);

if (!parsed.success) {
return res.status(400).json({
error: "Enter a valid email and password"
});
}

try {
getJwtSecret();

const email = parsed.data.email.trim().toLowerCase();

const result = await pool.query(
  `SELECT id, email, full_name, role, status, password_hash
   FROM app_users
   WHERE email = $1
   LIMIT 1`,
  [email]
);

const user = result.rows[0];

if (
  !user ||
  !(await bcrypt.compare(parsed.data.password, user.password_hash))
) {
  return res.status(401).json({
    error: "Invalid email or password"
  });
}

if (user.status !== "active") {
  return res.status(403).json({
    error: "Account is not active. Contact an administrator."
  });
}

return res.json({
  user: {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: user.status
  },
  accessToken: issueToken(user),
  tokenType: "Bearer",
  expiresIn: 900
});

} catch (error) {
console.error("Login failed:", error.message);

return res.status(500).json({
  error: "Login failed. Check server configuration."
});

}
});

module.exports = router;
