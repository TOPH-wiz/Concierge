const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
const authHeader = req.headers.authorization;
const token = authHeader?.startsWith("Bearer ")
? authHeader.slice(7)
: null;

if (!token) {
return res.status(401).json({
error: "Authentication required"
});
}

const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
console.error("JWT_SECRET is missing or too short");
return res.status(503).json({
error: "Authentication is not configured"
});
}

try {
const payload = jwt.verify(token, secret, {
algorithms: ["HS256"],
issuer: "oqata-api",
audience: "oqata-client"
});

if (
  typeof payload.sub !== "string" ||
  !["corporate", "proxy", "admin"].includes(payload.role)
) {
  return res.status(401).json({
    error: "Invalid access token"
  });
}

req.user = {
  id: payload.sub,
  role: payload.role
};

next();

} catch (error) {
return res.status(401).json({
error: "Invalid or expired access token"
});
}
}

function requireRole(...allowedRoles) {
return (req, res, next) => {
if (!req.user) {
return res.status(401).json({
error: "Authentication required"
});
}

if (!allowedRoles.includes(req.user.role)) {
  return res.status(403).json({
    error: "Insufficient permissions"
  });
}

next();

};
}

module.exports = {
authenticateToken,
requireRole
};
