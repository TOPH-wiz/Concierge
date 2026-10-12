const express = require("express");
const { z } = require("zod");
const { pool } = require("../db");
const {
authenticateToken,
requireRole
} = require("../auth");

const router = express.Router();

const createTaskSchema = z.object({
title: z.string().trim().min(3).max(160),
description: z.string().trim().min(10).max(5000),
countryCode: z.string().regex(/^[A-Z]{2}$/),
city: z.string().trim().min(2).max(100),
currency: z.string().regex(/^[A-Z]{3}$/),
budgetAmount: z.number().positive().max(100000000)
});

router.use(authenticateToken);

router.post(
"/",
requireRole("corporate"),
async (req, res) => {
const parsed = createTaskSchema.safeParse(req.body);

if (!parsed.success) {
  return res.status(400).json({
    error: "Invalid task details",
    details: parsed.error.issues.map(issue => ({
      field: issue.path.join("."),
      message: issue.message
    }))
  });
}

const client = await pool.connect();

try {
  await client.query("BEGIN");

  const companyResult = await client.query(
    `SELECT id
     FROM corporate_profiles
     WHERE user_id = $1`,
    [req.user.id]
  );

  if (companyResult.rowCount === 0) {
    await client.query("ROLLBACK");
    return res.status(403).json({
      error: "Corporate profile required"
    });
  }

  const companyId = companyResult.rows[0].id;
  const data = parsed.data;

  const result = await client.query(
    `INSERT INTO tasks_core
      (corporate_id, title, description, country_code,
       city, currency, budget_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, description, country_code, city,
               currency, budget_amount, status, created_at`,
    [
      companyId,
      data.title,
      data.description,
      data.countryCode,
      data.city,
      data.currency,
      data.budgetAmount
    ]
  );

  await client.query(
    `INSERT INTO audit_events
      (actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      req.user.id,
      "task.created",
      "task",
      result.rows[0].id,
      JSON.stringify({ status: "requested" })
    ]
  );

  await client.query("COMMIT");

  return res.status(201).json({
    task: result.rows[0]
  });
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Task creation failed:", error.message);

  return res.status(500).json({
    error: "Could not create task"
  });
} finally {
  client.release();
}

}
);

router.get("/", async (req, res) => {
try {
let result;

if (req.user.role === "corporate") {
  result = await pool.query(
    `SELECT t.*
     FROM tasks_core t
     JOIN corporate_profiles c ON c.id = t.corporate_id
     WHERE c.user_id = $1
     ORDER BY t.created_at DESC
     LIMIT 100`,
    [req.user.id]
  );
} else if (req.user.role === "proxy") {
  result = await pool.query(
    `SELECT t.*
     FROM tasks_core t
     JOIN proxy_profiles p ON p.id = t.assigned_proxy_id
     WHERE p.user_id = $1
     ORDER BY t.created_at DESC
     LIMIT 100`,
    [req.user.id]
  );
} else {
  result = await pool.query(
    `SELECT *
     FROM tasks_core
     ORDER BY created_at DESC
     LIMIT 100`
  );
}

return res.json({ tasks: result.rows });

} catch (error) {
console.error("Task listing failed:", error.message);
return res.status(500).json({
error: "Could not retrieve tasks"
});
}
});

module.exports = router;
