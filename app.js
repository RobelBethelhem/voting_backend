import express from "express";
import { config } from "dotenv";
import dbConnect from "./dbConnect.js";
import { syncFiscalYearIndexesOnConnect } from "./utils/fiscalYearIndexes.js";
import authRoutes from "./routes/rms/auth.js";
import refreshTokenRoutes from "./routes/rms/refreshToken.js";
import userRoutes from "./routes/rms/users.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import Candidate from "./routes/rms/Candidate.js";
import Vote from "./routes/rms/Vote.js"
import HierarchicalVoting from "./routes/rms/HierarchicalVoting.js"
import tempAuth, { isDomainLogin } from "./routes/rms/tempAuth.js";
import requireSignIn from "./middleware/requireSignIn.js";
import simpleAuth from "./routes/rms/simple_auth.js";
import workingAuth from "./routes/rms/working_auth.js";
import finalAuth from "./routes/rms/final_auth.js";
import unifiedAuth from "./routes/rms/unified_auth.js";
import authTest from "./routes/rms/auth_test.js";
import DepartmentManagement from "./routes/rms/DepartmentManagement.js"
import ManagerialRating from "./routes/rms/ManagerialRating.js"
import StaffApproval from "./routes/rms/StaffApproval.js"
import ReRating from "./routes/rms/ReRating.js"
import FiscalYearRoutes from "./routes/rms/FiscalYear.js"

import vote_stastics from "./routes/rms/Admin/Landing/vote_statistics.js";
import Candidate_Landing from "./routes/rms/Admin/Landing/Candidate_Landing.js";
import Users_For_Voting from "./routes/rms/Admin/Landing/Users_For_Voting.js";
import Working_Candidates from "./routes/rms/Admin/Landing/Working_Candidates.js";
import Participation_Dashboard from "./routes/rms/Admin/Landing/participation_dashboard.js";

// Import admin routes for employee and candidate management
import adminRoutes from "./routes/adminRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import quotaRoutes from "./routes/quotaRoutes.js";

import cors from "cors"

config();

const app = express();

// CORS_ORIGINS: comma-separated origins allowed to call the API (e.g. https://aps2.zemenbank.com).
// Unset (local development) allows any origin.
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(corsOrigins.length
  ? cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      credentials: true
    })
  : cors());

// Excel imports (e.g. /api/admin/import-employees-json) send every row in one request,
// which is well over the 100kb default
const BODY_LIMIT = '25mb';

app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

app.use(express.json({
  limit: BODY_LIMIT,
  verify: (req, res, buf) => {
    if (buf && buf.length) {
      try {
        JSON.parse(buf);
      } catch (error) {
        res.status(400).json({ message: 'Invalid JSON format' });
      }
    }
  },
}));

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const publicDirectory = `${currentDirectory}/uploads`;
app.use(express.static(publicDirectory));

dbConnect();
syncFiscalYearIndexesOnConnect();

app.use(express.json({ limit: BODY_LIMIT })); // Parse incoming requests data

// Every API route lives under API_PREFIX: /api locally, and the IIS application path on the
// server (e.g. /zbvs/api), because iisnode passes the full request path through to Express.
const API_PREFIX = (process.env.API_PREFIX || "/api").replace(/\/+$/, "");
const domainLogin = isDomainLogin();
const api = express.Router();

// On the server every API call needs a signed-in user (REQUIRE_SIGN_IN=false turns this off)
const signInRequired = (process.env.REQUIRE_SIGN_IN || String(domainLogin)).trim().toLowerCase() !== "false";
if (signInRequired) api.use(requireSignIn);

// Before the /api/ auth routers: routes/rms/auth.js has a catch-all GET /:id
api.use("/fiscal-years", FiscalYearRoutes);
if (domainLogin) {
  // Domain login goes through /temp-login only. The other login routes check passwords
  // against the database (where imported accounts share default passwords) or accept
  // the test passwords, so they stay off on the server.
  api.post("/login", (req, res) =>
    res.status(404).json({ error: true, message: "Sign in with your domain account" }));
}
api.use("/", authRoutes);
api.use("/", tempAuth); // Login: domain account on the server, test passwords locally
if (!domainLogin) {
  api.use("/", simpleAuth); // Simple auth for hierarchical voting
  api.use("/", workingAuth); // Working auth guaranteed to work
  api.use("/", finalAuth); // Final auth with direct DB connection
  api.use("/", unifiedAuth); // Unified auth that checks all user models
  api.use("/", authTest); // Authentication test routes
}
api.use("/refreshToken", refreshTokenRoutes);
api.use("/users", userRoutes);
api.use("/rms/users", userRoutes);

// Admin routes for employee and candidate management
api.use("/admin", adminRoutes);

// Template routes for evaluation criteria and rating matrices
api.use("/admin/template", templateRoutes);

// Quota routes for quota selection and management
api.use("/admin/quota", quotaRoutes);

// Top performers route with quota-based selection
import topPerformersRoute from "./routes/rms/topPerformersRoute.js";
api.use("/admin/top-performers", topPerformersRoute);

api.use("/zemen_vote_candidate",Vote);
api.use("/candidates",Candidate);
api.use("/hierarchical-voting", HierarchicalVoting);
api.use("/department-management", DepartmentManagement);
api.use("/managerial-rating", ManagerialRating);
api.use("/staff-approval", StaffApproval);
api.use("/re-rating", ReRating);

api.use("/rms/admin/landing",
  [
    vote_stastics,
    Candidate_Landing,
    Users_For_Voting,
    Working_Candidates,
    Participation_Dashboard
  ]);

app.use(API_PREFIX, api);

const port = process.env.PORT || 8081;

app.listen(port, () => console.log(`Listening on Port ${port}...`));
