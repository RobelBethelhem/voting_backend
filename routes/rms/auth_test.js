import { Router } from "express";
import { verifyToken, requireAdmin, requireChief, requireDirector, requireManager, requireUser } from "../../middleware/roleMiddleware.js";

const router = Router();

// Test routes to verify role-based access
router.get("/test/public", (req, res) => {
    res.json({
        message: "This is a public endpoint - no authentication required",
        timestamp: new Date().toISOString()
    });
});

router.get("/test/user", verifyToken, requireUser, (req, res) => {
    res.json({
        message: "Access granted - User level and above",
        user: {
            employee_id: req.user.employee_id,
            role: req.user.role,
            roles: req.user.roles
        },
        timestamp: new Date().toISOString()
    });
});

router.get("/test/manager", verifyToken, requireManager, (req, res) => {
    res.json({
        message: "Access granted - Manager level and above",
        user: {
            employee_id: req.user.employee_id,
            role: req.user.role,
            roles: req.user.roles
        },
        timestamp: new Date().toISOString()
    });
});

router.get("/test/director", verifyToken, requireDirector, (req, res) => {
    res.json({
        message: "Access granted - Director level and above",
        user: {
            employee_id: req.user.employee_id,
            role: req.user.role,
            roles: req.user.roles
        },
        timestamp: new Date().toISOString()
    });
});

router.get("/test/chief", verifyToken, requireChief, (req, res) => {
    res.json({
        message: "Access granted - Chief level only",
        user: {
            employee_id: req.user.employee_id,
            role: req.user.role,
            roles: req.user.roles
        },
        timestamp: new Date().toISOString()
    });
});

router.get("/test/admin", verifyToken, requireAdmin, (req, res) => {
    res.json({
        message: "Access granted - Admin level (Chief)",
        user: {
            employee_id: req.user.employee_id,
            role: req.user.role,
            roles: req.user.roles
        },
        timestamp: new Date().toISOString()
    });
});

// Test route to show user's current permissions
router.get("/test/whoami", verifyToken, (req, res) => {
    res.json({
        message: "Current user information",
        user: req.user,
        permissions: {
            canAccessUser: req.user.roles.includes('user'),
            canAccessManager: req.user.roles.includes('manager'),
            canAccessDirector: req.user.roles.includes('director'),
            canAccessChief: req.user.roles.includes('chief'),
            canAccessAdmin: req.user.roles.includes('chief') || req.user.roles.includes('admin')
        },
        timestamp: new Date().toISOString()
    });
});

export default router;