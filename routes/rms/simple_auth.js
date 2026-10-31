import { Router } from "express";
import User from "../../models/rms/user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = Router();

// Simple login for testing hierarchical voting
router.post("/simple-login", async (req, res) => {
    try {
        const { user, password } = req.body;
        console.log('Simple login attempt for:', user);

        // Find user by username (user field in our model)
        const foundUser = await User.findOne({ user: user });
        if (!foundUser) {
            console.log('User not found:', user);
            return res.status(401).json({
                error: true,
                message: "Invalid username"
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, foundUser.password);
        if (!validPassword) {
            console.log('Invalid password for user:', user);
            return res.status(401).json({
                error: true,
                message: "Invalid password"
            });
        }

        // Generate access token
        const accessToken = jwt.sign(
            {
                _id: foundUser._id,
                employee_id: foundUser.employee_id,
                level: foundUser.level,
                department: foundUser.department
            },
            process.env.ACCESS_TOKEN_PRIVATE_KEY || "test-secret",
            { expiresIn: "1h" }
        );

        console.log('Login successful for:', user);

        res.status(200).json({
            error: false,
            message: "Logged in Successfully",
            accessToken: accessToken,
            data: {
                employee_id: foundUser.employee_id,
                user: foundUser.user,
                first_name: foundUser.first_name,
                last_name: foundUser.last_name,
                level: foundUser.level,
                department: foundUser.department,
                position: foundUser.position,
                roles: foundUser.roles,
                is_managerial: foundUser.is_managerial,
                performance_appraisal_score: foundUser.performance_appraisal_score
            }
        });

    } catch (error) {
        console.error("Simple login error:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error",
            details: error.message
        });
    }
});

// Test endpoint to check if server is running
router.get("/test", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Backend server is running",
        timestamp: new Date().toISOString()
    });
});

export default router;