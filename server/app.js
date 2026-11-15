const path = require("node:path");
const express = require("express");
const session = require("express-session");
const MySQLStoreFactory = require("express-mysql-session");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const db = require("./db");
const { requireCsrf } = require("./middleware/csrf");
const { errorHandler, notFound } = require("./middleware/error-handler");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const budgetRoutes = require("./routes/budgets");
const categoryRoutes = require("./routes/categories");
const dashboardRoutes = require("./routes/dashboard");
const goalRoutes = require("./routes/goals");
const transactionRoutes = require("./routes/transactions");

const app = express();
const root = path.resolve(__dirname, "..");
const publicDirectory = path.join(root, "public");
const isProduction = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}

const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 24 * 60 * 60 * 1000,
  createDatabaseTable: true,
}, db.pool);
app.locals.sessionStore = sessionStore;

let initialization;
function initialize() {
  if (!initialization) {
    initialization = db.query("SELECT 1")
      .then(() => sessionStore.onReady())
      .catch((error) => {
        initialization = undefined;
        throw error;
      });
  }
  return initialization;
}
app.locals.initialize = initialize;

app.set("trust proxy", isProduction ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  if (req.path.startsWith("/api") && !req.body) req.body = {};
  next();
});
if (!process.env.VERCEL) {
  app.use(express.static(publicDirectory, { dotfiles: "deny" }));
}
app.use(async (req, res, next) => {
  try {
    await initialize();
    return next();
  } catch (error) {
    return next(error);
  }
});
app.use(session({
  name: "pennysaurus.sid",
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please wait before trying again." },
});

app.use("/api", requireCsrf);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", notFound);
app.use(errorHandler);

module.exports = app;
