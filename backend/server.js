const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { verifyCsrf } = require("./middleware/csrf");
const audit = require("./middleware/audit");

dotenv.config();

connectDB();

const app = express();

app.set("trust proxy", 1);
app.use(require("compression")());

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = (process.env.CLIENT_URL || "http://localhost:8080")
        .split(",")
        .map((s) => s.trim());
      if (!origin || allowed.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Requested-With",
    ],
  }),
);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  // Session housekeeping (/me, /refresh, /logout) fires on every page load and
  // successful calls aren't brute-force attempts — only failures count.
  skipSuccessfulRequests: true,
  skip: (req) => ["/me", "/refresh", "/logout"].includes(req.path),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts, please try again later.",
  },
});

app.use("/api/", (req, res, next) =>
  req.path.startsWith("/photos/") ? next() : generalLimiter(req, res, next),
);

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

app.use(mongoSanitize({ allowDots: true }));
app.use(hpp());
app.use(verifyCsrf);

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Usage/health metrics + account control for the CRM dashboard.
const tele = require("./utils/telemetry")("NESTCARE_SECRET");
app.use(tele.middleware);
app.use("/api/telemetry", tele.ingest);
app.use("/api/crm/metrics", tele.metrics);
app.use("/api/crm/accounts", require("./utils/crmAccounts")("NESTCARE_SECRET", require("./utils/crmAdapter")));

app.use("/api/auth", authLimiter, require("./routes/authRoutes"));
app.use("/api/legal", require("./routes/legalRoutes"));
app.use("/api/tenants", audit("tenant"), require("./routes/tenantRoutes"));
app.use("/api/billing", require("./routes/billingRoutes"));
app.use("/api/patients", audit("patient"), require("./routes/patientRoutes"));
app.use("/api/doctors", require("./routes/doctorRoutes"));
app.use(
  "/api/appointments",
  audit("appointment"),
  require("./routes/appointmentRoutes"),
);
app.use(
  "/api/consultations",
  audit("consultation"),
  require("./routes/consultationRoutes"),
);
app.use("/api/staff", audit("staff"), require("./routes/staffRoutes"));
app.use("/api/payments", audit("payment"), require("./routes/paymentRoutes"));
app.use("/api/invoices", audit("invoice"), require("./routes/invoiceRoutes"));
app.use("/api/lab-orders", audit("lab_order"), require("./routes/labRoutes"));
app.use(
  "/api/medicines",
  audit("medicine"),
  require("./routes/medicineRoutes"),
);
app.use("/api/vendors", audit("vendor"), require("./routes/vendorRoutes"));
app.use(
  "/api/purchases",
  audit("purchase"),
  require("./routes/purchaseRoutes"),
);
app.use(
  "/api/inventory",
  audit("inventory"),
  require("./routes/inventoryRoutes"),
);
app.use("/api/pharmacy", audit("pharmacy"), require("./routes/pharmacyRoutes"));
app.use(
  "/api/departments",
  audit("department"),
  require("./routes/departmentRoutes"),
);
app.use("/api/lab-tests", audit("lab_test"), require("./routes/labTestRoutes"));
app.use("/api/me", audit("portal"), require("./routes/patientPortalRoutes"));
app.use("/api/whatsapp", audit("whatsapp"), require("./routes/whatsappRoutes"));
app.use(
  "/api/follow-ups",
  audit("follow_up"),
  require("./routes/followUpRoutes"),
);
app.use("/api/photos", require("./routes/photoRoutes"));
app.use("/api/summary", require("./routes/summaryRoutes"));
app.use("/api/reports", audit("report"), require("./routes/reportRoutes"));
app.use("/api", audit("compliance"), require("./routes/complianceRoutes"));

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok" });
});

app.get("/", (req, res) => {
  res.json({ success: true, message: "NestDoc API" });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
  if (process.env.NODE_ENV !== "test") require("./utils/reminders").start();
  if (process.env.NODE_ENV === "development") {
    console.log(`NestDoc API running on port ${PORT}`);
  }
});

module.exports = app;
