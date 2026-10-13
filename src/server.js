require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { checkDatabase } = require("./db");
const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(
cors({
origin: process.env.CORS_ORIGIN || "http://localhost:3000"
})
);
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);

app.get("/", (req, res) => {
res.json({
name: "Oqata API",
status: "running",
version: "1.0.0"
});
});

app.get("/health", (req, res) => {
res.status(200).json({
status: "healthy",
service: "oqata-api",
timestamp: new Date().toISOString()
});
});

app.get("/health/ready", async (req, res) => {
try {
const database = await checkDatabase();

res.json({
  status: "ready",
  database: "connected",
  databaseTime: database.server_time
});

} catch (error) {
console.error("Readiness check failed:", error.message);

res.status(503).json({
  status: "not_ready",
  database: "unavailable"
});

}
});

app.use((req, res) => {
res.status(404).json({
error: "Route not found",
path: req.path
});
});

app.listen(PORT, "0.0.0.0", () => {
console.log("Oqata API listening on port ${PORT}");
});
