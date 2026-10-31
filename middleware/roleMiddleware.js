import jwt from "jsonwebtoken";

// Middleware to verify JWT token and extract user info
export const verifyToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'] || req.headers['x-access-token'];

        if (!authHeader) {
            return res.status(401).json({
                error: true,
                message: "Access token is required"
            });
        }

        let token;
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7); // Remove "Bearer " prefix
        } else {
            token = authHeader;
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_PRIVATE_KEY || "voting-secret-key");

        // Attach user info to request object
        req.user = {
            _id: decoded._id,
            employee_id: decoded.employee_id,
            email: decoded.email,
            role: decoded.role,
            roles: decoded.roles || [decoded.role],
            level: decoded.level,
            department: decoded.department,
            model: decoded.model
        };

        next();
    } catch (error) {
        console.error("Token verification error:", error);
        return res.status(401).json({
            error: true,
            message: "Invalid or expired token"
        });
    }
};

// Middleware to check if user has required role
export const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: true,
                message: "Authentication required"
            });
        }

        // Convert single role to array
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

        // Check if user has any of the allowed roles
        const hasRole = roles.some(role =>
            req.user.roles.includes(role) || req.user.role === role
        );

        if (!hasRole) {
            return res.status(403).json({
                error: true,
                message: `Access denied. Required roles: ${roles.join(', ')}`
            });
        }

        next();
    };
};

// Specific role middlewares
export const requireAdmin = requireRole(['admin', 'chief']);
export const requireChief = requireRole('chief');
export const requireDirector = requireRole(['chief', 'director']);
export const requireManager = requireRole(['chief', 'director', 'manager']);
export const requireUser = requireRole(['chief', 'director', 'manager', 'user']);

// Middleware for managerial level access
export const requireManagerial = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            error: true,
            message: "Authentication required"
        });
    }

    const managerialRoles = ['chief', 'director', 'manager'];
    const hasManagerialRole = managerialRoles.some(role =>
        req.user.roles.includes(role) || req.user.role === role
    );

    if (!hasManagerialRole) {
        return res.status(403).json({
            error: true,
            message: "Access denied. Managerial level required"
        });
    }

    next();
};

// Middleware to check if user can access specific employee data
export const requireSelfOrSuperior = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            error: true,
            message: "Authentication required"
        });
    }

    const targetEmployeeId = req.params.employee_id || req.body.employee_id;

    // Allow if accessing own data
    if (req.user.employee_id === targetEmployeeId) {
        return next();
    }

    // Allow if user has administrative privileges
    if (req.user.roles.includes('chief') || req.user.roles.includes('admin')) {
        return next();
    }

    // Allow directors and managers based on hierarchy (simplified for now)
    if (req.user.roles.includes('director') || req.user.roles.includes('manager')) {
        return next();
    }

    return res.status(403).json({
        error: true,
        message: "Access denied. You can only access your own data or subordinate data"
    });
};

export default {
    verifyToken,
    requireRole,
    requireAdmin,
    requireChief,
    requireDirector,
    requireManager,
    requireUser,
    requireManagerial,
    requireSelfOrSuperior
};