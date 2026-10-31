import express from "express";
import Department from "../../models/rms/Department.js";
import User from "../../models/rms/user.js";
import authMiddleware from "../../middleware/authMiddleware.js";

const router = express.Router();

// Get all departments with their hierarchy
router.get("/departments", authMiddleware, async (req, res) => {
    try {
        const departments = await Department.find({ is_active: true });

        // Populate manager, director, and chief information
        const populatedDepartments = await Promise.all(
            departments.map(async (dept) => {
                const manager = dept.manager_id ? await User.findOne({ employee_id: dept.manager_id }) : null;
                const director = dept.director_id ? await User.findOne({ employee_id: dept.director_id }) : null;
                const chief = dept.chief_id ? await User.findOne({ employee_id: dept.chief_id }) : null;

                return {
                    ...dept.toObject(),
                    manager: manager ? {
                        employee_id: manager.employee_id,
                        name: `${manager.first_name} ${manager.last_name}`,
                        email: manager.email,
                        position: manager.position
                    } : null,
                    director: director ? {
                        employee_id: director.employee_id,
                        name: `${director.first_name} ${director.last_name}`,
                        email: director.email,
                        position: director.position
                    } : null,
                    chief: chief ? {
                        employee_id: chief.employee_id,
                        name: `${chief.first_name} ${chief.last_name}`,
                        email: chief.email,
                        position: chief.position
                    } : null
                };
            })
        );

        res.status(200).json({
            success: true,
            message: "Departments retrieved successfully",
            data: populatedDepartments
        });
    } catch (error) {
        console.error("Error retrieving departments:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve departments",
            error: error.message
        });
    }
});

// Get available users by role for assignment
router.get("/available-users/:role", authMiddleware, async (req, res) => {
    try {
        const { role } = req.params;

        if (!['manager', 'director', 'chief'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role. Must be manager, director, or chief"
            });
        }

        const users = await User.find({
            roles: { $in: [role] },
            status: true
        }).select('employee_id first_name last_name email position department');

        res.status(200).json({
            success: true,
            message: `Available ${role}s retrieved successfully`,
            data: users
        });
    } catch (error) {
        console.error(`Error retrieving ${role}s:`, error);
        res.status(500).json({
            success: false,
            message: `Failed to retrieve ${role}s`,
            error: error.message
        });
    }
});

// Assign manager to department
router.put("/assign-manager", authMiddleware, async (req, res) => {
    try {
        const { department_id, manager_id } = req.body;

        // Verify manager exists and has manager role
        const manager = await User.findOne({
            employee_id: manager_id,
            roles: { $in: ['manager'] }
        });

        if (!manager) {
            return res.status(404).json({
                success: false,
                message: "Manager not found or invalid role"
            });
        }

        // Update department
        const department = await Department.findOneAndUpdate(
            { department_id },
            {
                manager_id,
                updated_at: new Date()
            },
            { new: true }
        );

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found"
            });
        }

        // Update user's department if different
        await User.findOneAndUpdate(
            { employee_id: manager_id },
            { department: department.department_name }
        );

        res.status(200).json({
            success: true,
            message: "Manager assigned successfully",
            data: department
        });
    } catch (error) {
        console.error("Error assigning manager:", error);
        res.status(500).json({
            success: false,
            message: "Failed to assign manager",
            error: error.message
        });
    }
});

// Assign director to department
router.put("/assign-director", authMiddleware, async (req, res) => {
    try {
        const { department_id, director_id } = req.body;

        // Verify director exists and has director role
        const director = await User.findOne({
            employee_id: director_id,
            roles: { $in: ['director'] }
        });

        if (!director) {
            return res.status(404).json({
                success: false,
                message: "Director not found or invalid role"
            });
        }

        // Update department
        const department = await Department.findOneAndUpdate(
            { department_id },
            {
                director_id,
                updated_at: new Date()
            },
            { new: true }
        );

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found"
            });
        }

        // Update all users in this department to have this director
        await User.updateMany(
            { department: department.department_name },
            { director_id }
        );

        res.status(200).json({
            success: true,
            message: "Director assigned successfully",
            data: department
        });
    } catch (error) {
        console.error("Error assigning director:", error);
        res.status(500).json({
            success: false,
            message: "Failed to assign director",
            error: error.message
        });
    }
});

// Assign chief to department
router.put("/assign-chief", authMiddleware, async (req, res) => {
    try {
        const { department_id, chief_id } = req.body;

        // Verify chief exists and has chief role
        const chief = await User.findOne({
            employee_id: chief_id,
            roles: { $in: ['chief'] }
        });

        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief not found or invalid role"
            });
        }

        // Update department
        const department = await Department.findOneAndUpdate(
            { department_id },
            {
                chief_id,
                updated_at: new Date()
            },
            { new: true }
        );

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found"
            });
        }

        // Update all users in this department to have this chief
        await User.updateMany(
            { department: department.department_name },
            { chief_id }
        );

        res.status(200).json({
            success: true,
            message: "Chief assigned successfully",
            data: department
        });
    } catch (error) {
        console.error("Error assigning chief:", error);
        res.status(500).json({
            success: false,
            message: "Failed to assign chief",
            error: error.message
        });
    }
});

// Create new department
router.post("/create-department", authMiddleware, async (req, res) => {
    try {
        const { department_name, description } = req.body;

        // Generate department ID
        const department_id = `DEPT_${Date.now().toString().slice(-6)}`;

        const department = new Department({
            department_id,
            department_name,
            description,
            is_active: true
        });

        await department.save();

        res.status(201).json({
            success: true,
            message: "Department created successfully",
            data: department
        });
    } catch (error) {
        console.error("Error creating department:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create department",
            error: error.message
        });
    }
});

// Get hierarchy visualization
router.get("/hierarchy", authMiddleware, async (req, res) => {
    try {
        // Get all chiefs
        const chiefs = await User.find({ roles: { $in: ['chief'] } })
            .select('employee_id first_name last_name email position');

        const hierarchy = await Promise.all(
            chiefs.map(async (chief) => {
                // Get departments under this chief
                const departments = await Department.find({
                    chief_id: chief.employee_id,
                    is_active: true
                });

                const departmentHierarchy = await Promise.all(
                    departments.map(async (dept) => {
                        // Get director for this department
                        const director = dept.director_id ?
                            await User.findOne({ employee_id: dept.director_id })
                                .select('employee_id first_name last_name email position') : null;

                        // Get manager for this department
                        const manager = dept.manager_id ?
                            await User.findOne({ employee_id: dept.manager_id })
                                .select('employee_id first_name last_name email position') : null;

                        // Get employees in this department
                        const employees = await User.find({
                            department: dept.department_name,
                            roles: { $in: ['user'] }
                        }).select('employee_id first_name last_name email position');

                        return {
                            department: {
                                id: dept.department_id,
                                name: dept.department_name,
                                description: dept.description
                            },
                            director,
                            manager,
                            employees
                        };
                    })
                );

                return {
                    chief: {
                        employee_id: chief.employee_id,
                        name: `${chief.first_name} ${chief.last_name}`,
                        email: chief.email,
                        position: chief.position
                    },
                    departments: departmentHierarchy
                };
            })
        );

        res.status(200).json({
            success: true,
            message: "Hierarchy retrieved successfully",
            data: hierarchy
        });
    } catch (error) {
        console.error("Error retrieving hierarchy:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve hierarchy",
            error: error.message
        });
    }
});

export default router;