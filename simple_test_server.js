import express from "express";
import cors from "cors";
import StaffApproval from "./routes/rms/StaffApproval.js";

const app = express();
app.use(cors());
app.use(express.json());

// Mount the StaffApproval routes
app.use("/api/staff-approval", StaffApproval);

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Test server is running', routes_loaded: true });
});

const port = 5002; // Another different port

app.listen(port, () => {
    console.log(`Simple test server listening on port ${port}...`);
    console.log('Testing StaffApproval route mounting...');
});

// Test the route mounting
setTimeout(() => {
    import('node-fetch').then(({ default: fetch }) => {
        fetch(`http://localhost:${port}/api/staff-approval/approve-reject-staff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: 'data' })
        })
        .then(response => {
            console.log(`✅ Route accessible! Status: ${response.status}`);
            return response.text();
        })
        .then(data => {
            console.log('Response:', data);
            process.exit(0);
        })
        .catch(error => {
            console.log('❌ Route error:', error.message);
            process.exit(1);
        });
    });
}, 1000);