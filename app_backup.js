import express from "express";
import { config } from "dotenv";
import dbConnect from "./dbConnect.js";
import authRoutes from "./routes/rms/auth.js";
import refreshTokenRoutes from "./routes/rms/refreshToken.js";
import userRoutes from "./routes/rms/users.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';


import Candidate from "./routes/rms/Candidate.js";

import Vote from "./routes/rms/Vote.js"
import HierarchicalVoting from "./routes/rms/HierarchicalVoting.js"
import tempAuth from "./routes/rms/tempAuth.js";
import simpleAuth from "./routes/rms/simple_auth.js";
import workingAuth from "./routes/rms/working_auth.js";
import finalAuth from "./routes/rms/final_auth.js";
import DepartmentManagement from "./routes/rms/DepartmentManagement.js"

import vote_stastics from "./routes/rms/Admin/Landing/vote_statistics.js";
import Candidate_Landing from "./routes/rms/Admin/Landing/Candidate_Landing.js";
import Users_For_Voting from "./routes/rms/Admin/Landing/Users_For_Voting.js";
import Working_Candidates from "./routes/rms/Admin/Landing/Working_Candidates.js";

// import branchManagementRoutes from "./routes/newRequest/branchManagement.js";
// import fundManagementRoutes from "./routes/newRequest/fundManagement.js";
// import cardProductionRoutes from "./routes/newRequest/cardProduction.js";

import cors from "cors"



const app = express();
app.use(cors())


// const corsOptions = {
//   origin: 'https://l9vrnplr-3000.uks1.devtunnels.ms',
//   optionsSuccessStatus: 200
// };

// app.use(cors(corsOptions));



app.use(express.urlencoded({ extended: true }));

app.use(express.json({
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
const publicDirectory = `${currentDirectory}\\uploads`;
app.use(express.static(publicDirectory));




config();
dbConnect();

app.use(express.json()); // Parse incoming requests data
app.use("/api/", authRoutes);
app.use("/api/", tempAuth); // Temporary auth for testing
app.use("/api/", simpleAuth); // Simple auth for hierarchical voting
app.use("/api/", workingAuth); // Working auth guaranteed to work
app.use("/api/", finalAuth); // Final auth with direct DB connection
app.use("/api/refreshToken", refreshTokenRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rms/users", userRoutes);



  app.use("/api/zemen_vote_candidate",Vote);
  app.use("/api/candidates",Candidate);
  app.use("/api/hierarchical-voting", HierarchicalVoting);
  app.use("/api/department-management", DepartmentManagement);







app.use("/api/rms/admin/landing",
  [

    vote_stastics,
    Candidate_Landing,
    Users_For_Voting,
    Working_Candidates
  ]);
//app.use("/api/rms/admin/landing", );


const port = process.env.PORT || 8081;


app.listen(port, () => console.log(`Listening on Port ${port}...`));






