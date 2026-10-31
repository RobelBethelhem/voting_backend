import express from "express";
import cors from "cors";
import dbConnect from "./dbConnect.js";
import StaffApproval from "./routes/rms/StaffApproval.js";

const app = express();
app.use(cors());
app.use(express.json());

// Connect to database
dbConnect();

// Mount the StaffApproval routes
app.use("/api/staff-approval", StaffApproval);

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Test server is running', routes_loaded: true });
});

const port = 5001; // Different port to avoid conflict

app.listen(port, () => {
    console.log(`Test server listening on port ${port}...`);
    console.log('StaffApproval routes should be available at:');
    console.log(`  POST http://localhost:${port}/api/staff-approval/approve-reject-staff`);
    console.log(`  GET  http://localhost:${port}/api/staff-approval/my-staff-approvals`);
});