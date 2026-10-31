/**
 * Admin Routes
 * Handles employee and candidate registration including Excel import
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import xlsx from 'xlsx';
import {
    importEmployeesFromExcel,
    importCandidatesFromExcel,
    generateEmployeeTemplate,
    generateCandidateTemplate
} from '../services/excelImportService.js';
import User from '../models/rms/user.js';
import Candidate from '../models/rms/Candidate.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';
import Department from '../models/rms/Department.js';
import Manager from '../models/rms/Manager.js';
import Director from '../models/rms/Director.js';
import Chief from '../models/rms/Chief.js';
import { fiscalYearFilter, getCurrentFiscalYear, withFiscalYear } from '../utils/fiscalYear.js';
import { relinkQuotaChiefs } from '../services/fiscalYearOrgService.js';
import bcrypt from 'bcrypt';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        if (ext !== '.xlsx' && ext !== '.xls') {
            return cb(new Error('Only Excel files are allowed'));
        }
        cb(null, true);
    }
});

// Middleware to check admin role
const isAdmin = (req, res, next) => {
    // For now, allow all requests to proceed
    // In production, this should check JWT token and user role
    req.user = req.user || { employee_id: 'ADMIN001', roles: ['admin'] };
    next();
};

// Register single employee
router.post('/register-employee', isAdmin, async (req, res) => {
    try {
        const {
            employee_id, first_name, last_name, email, username,
            position, department_name, level, job_grade, function: empFunction,
            performance_appraisal_score, is_managerial, password
        } = req.body;

        // Get department and its hierarchy
        const department = await Department.findOne({ department_name });
        if (!department) {
            return res.status(400).json({
                success: false,
                message: 'Department not found. Please register the department first.'
            });
        }

        // Get hierarchy details directly from department
        let manager_id = department.manager_id || '';
        let director_id = department.director_id || '';
        let chief_id = department.chief_id || '';

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { employee_id },
                { email },
                { user: username }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this employee_id, email, or username'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password || "Test@123", 10);

        // Determine roles based on level
        let roles = ["user"];
        if (level === "chief") roles = ["chief", "user"];
        else if (level === "director") roles = ["director", "user"];
        else if (level === "manager") roles = ["manager", "user"];

        // Create new user with proper username handling
        const newUser = new User({
            employee_id,
            first_name,
            last_name,
            user: username || employee_id.toLowerCase(), // Use provided username or fallback to employee_id
            username: username || employee_id.toLowerCase(), // Use provided username or fallback to employee_id
            email,
            password: hashedPassword,
            position: position || "Employee",
            department: department.department_name,
            roles,
            level: level || "professional",
            job_grade: job_grade || "",
            function: empFunction || "",
            manager_id,
            director_id,
            chief_id,
            performance_appraisal_score: performance_appraisal_score || 0,
            is_managerial: is_managerial || (level !== "professional"),
            status: true
        });

        await newUser.save();

        res.status(201).json({
            success: true,
            message: 'Employee registered successfully',
            employee: {
                employee_id: newUser.employee_id,
                name: `${newUser.first_name} ${newUser.last_name}`,
                email: newUser.email,
                department: newUser.department,
                level: newUser.level
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to register employee',
            error: error.message
        });
    }
});

// Populate candidates based on qualification criteria
router.post('/populate-candidates', isAdmin, async (req, res) => {
    try {
        const { min_performance_score = 0 } = req.body;

        console.log(`🎯 Populating candidates with minimum performance score: ${min_performance_score}`);

        // Clear existing candidates
        await Candidate.deleteMany({});
        console.log('🗑️ Cleared existing candidates');

        // Find employees who meet the qualification criteria
        const qualifiedEmployees = await User.find({
            performance_appraisal_score: { $gte: min_performance_score },
            status: true // Only active employees
        }).sort({ performance_appraisal_score: -1 });

        console.log(`👥 Found ${qualifiedEmployees.length} qualified employees`);

        let populatedCount = 0;
        let errors = [];

        for (let i = 0; i < qualifiedEmployees.length; i++) {
            try {
                const employee = qualifiedEmployees[i];

                // Create candidate with all employee data
                const candidateData = {
                    first_name: employee.first_name,
                    last_name: employee.last_name,
                    employee_id: employee.employee_id,
                    user: employee.user,
                    username: employee.username,
                    position: employee.position,
                    department: employee.department,
                    email: employee.email,
                    password: employee.password,
                    roles: employee.roles,
                    job_grade: employee.job_grade,
                    function: employee.function,
                    manager_id: employee.manager_id,
                    director_id: employee.director_id,
                    chief_id: employee.chief_id,
                    performance_appraisal_score: employee.performance_appraisal_score,
                    is_managerial: employee.is_managerial,
                    status: true,
                    qualified_at: new Date(),
                    qualification_criteria: {
                        min_performance_score: min_performance_score
                    }
                };

                const newCandidate = new Candidate(candidateData);
                await newCandidate.save();
                populatedCount++;

                console.log(`✅ Added candidate: ${employee.first_name} ${employee.last_name} (${employee.employee_id}) - Score: ${employee.performance_appraisal_score}`);

            } catch (error) {
                console.error(`❌ Error creating candidate for employee ${qualifiedEmployees[i].employee_id}:`, error.message);
                errors.push(`Employee ${qualifiedEmployees[i].employee_id}: ${error.message}`);
            }
        }

        console.log(`🎉 Successfully populated ${populatedCount} candidates`);

        res.json({
            success: true,
            message: `Successfully populated ${populatedCount} candidates based on qualification criteria`,
            populated: populatedCount,
            total_qualified: qualifiedEmployees.length,
            qualification_criteria: {
                min_performance_score: min_performance_score
            },
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('❌ Error populating candidates:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to populate candidates',
            error: error.message
        });
    }
});

// Get qualification settings
router.get('/qualification-settings', isAdmin, async (req, res) => {
    try {
        // Get current qualification criteria from any existing candidate
        const sampleCandidate = await Candidate.findOne().select('qualification_criteria');

        const currentCriteria = sampleCandidate?.qualification_criteria || {
            min_performance_score: 0
        };

        // Get statistics about potential candidates
        const totalEmployees = await User.countDocuments({ status: true });
        const qualifiedCounts = await User.aggregate([
            { $match: { status: true } },
            {
                $group: {
                    _id: null,
                    count_score_60: { $sum: { $cond: [{ $gte: ['$performance_appraisal_score', 60] }, 1, 0] } },
                    count_score_70: { $sum: { $cond: [{ $gte: ['$performance_appraisal_score', 70] }, 1, 0] } },
                    count_score_80: { $sum: { $cond: [{ $gte: ['$performance_appraisal_score', 80] }, 1, 0] } },
                    count_score_90: { $sum: { $cond: [{ $gte: ['$performance_appraisal_score', 90] }, 1, 0] } },
                    avg_score: { $avg: '$performance_appraisal_score' },
                    max_score: { $max: '$performance_appraisal_score' },
                    min_score: { $min: '$performance_appraisal_score' }
                }
            }
        ]);

        const currentCandidates = await Candidate.countDocuments();

        res.json({
            success: true,
            current_criteria: currentCriteria,
            statistics: {
                total_employees: totalEmployees,
                current_candidates: currentCandidates,
                potential_candidates: qualifiedCounts[0] || {
                    count_score_60: 0,
                    count_score_70: 0,
                    count_score_80: 0,
                    count_score_90: 0,
                    avg_score: 0,
                    max_score: 0,
                    min_score: 0
                }
            }
        });

    } catch (error) {
        console.error('Error getting qualification settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get qualification settings',
            error: error.message
        });
    }
});

// Register single candidate (supports both employee lookup and direct candidate registration)
router.post('/register-candidate', isAdmin, async (req, res) => {
    try {
        console.log("Received candidate registration request:", req.body);

        const {
            employee_id,
            first_name,
            last_name,
            department,
            position,
            performance_appraisal_score,
            voting_period_id
        } = req.body;

        let candidateData;

        // Check if this is a direct candidate registration (has all required fields) or employee lookup
        if (first_name && last_name && department && position) {
            // Direct candidate registration - similar to professional employee registration
            console.log("Direct candidate registration mode");

            // Validate required fields
            if (!employee_id || !first_name || !last_name || !department || !position) {
                return res.status(400).json({
                    success: false,
                    message: "All fields are required: employee_id, first_name, last_name, department, position"
                });
            }

            // Validate performance score
            let score = 0;
            if (performance_appraisal_score !== undefined) {
                score = parseFloat(performance_appraisal_score);
                if (isNaN(score) || score < 0 || score > 100) {
                    return res.status(400).json({
                        success: false,
                        message: "Performance appraisal score must be between 0 and 100"
                    });
                }
            }

            // Check if candidate already exists
            const existingCandidate = await Candidate.findOne({ employee_id });
            if (existingCandidate) {
                return res.status(400).json({
                    success: false,
                    message: 'Candidate with this employee_id already exists'
                });
            }

            // Get department hierarchy (import the hierarchy helper from auth.js)
            let manager_id = '';
            let director_id = '';
            let chief_id = '';

            if (department) {
                console.log('Getting hierarchy for candidate department:', department);
                try {
                    // Import all models for hierarchy lookup
                    const [Department, Manager, Director, Chief] = await Promise.all([
                        import('../models/rms/Department.js').then(m => m.default),
                        import('../models/rms/Manager.js').then(m => m.default),
                        import('../models/rms/Director.js').then(m => m.default),
                        import('../models/rms/Chief.js').then(m => m.default)
                    ]);

                    const dept = await Department.findOne({ department_name: department });
                    if (dept) {
                        manager_id = dept.manager_id || '';

                        if (manager_id) {
                            const manager = await Manager.findOne({ employee_id: manager_id });
                            if (manager && manager.director_id) {
                                director_id = manager.director_id;

                                const director = await Director.findOne({ employee_id: director_id });
                                if (director && director.chief_id) {
                                    chief_id = director.chief_id;
                                }
                            }
                        }
                    }
                    console.log('Assigned candidate hierarchy:', { manager_id, director_id, chief_id });
                } catch (error) {
                    console.warn('Could not fetch hierarchy:', error);
                }
            }

            candidateData = {
                employee_id,
                first_name,
                last_name,
                department,
                position,
                performance_appraisal_score: score,
                manager_id,
                director_id,
                chief_id,
                registered_By: req.user?.employee_id || 'ADMIN001',
                Created_At: new Date()
            };

        } else {
            // Employee lookup mode (original behavior)
            console.log("Employee lookup mode");

            if (!employee_id) {
                return res.status(400).json({
                    success: false,
                    message: 'employee_id is required'
                });
            }

            // Get employee details
            const employee = await User.findOne({ employee_id });
            if (!employee) {
                return res.status(404).json({
                    success: false,
                    message: 'Employee not found'
                });
            }

            // Get voting period (use provided or get active)
            let votingPeriod;
            if (voting_period_id) {
                votingPeriod = await VotingPeriod.findOne({ period_id: voting_period_id });
            } else {
                votingPeriod = await VotingPeriod.findOne({ status: "active" });
            }

            if (!votingPeriod) {
                return res.status(404).json({
                    success: false,
                    message: 'No active voting period found'
                });
            }

            // Check if candidate already exists
            const existingCandidate = await Candidate.findOne({
                employee_id,
                voting_period_id: votingPeriod.period_id
            });

            if (existingCandidate) {
                return res.status(400).json({
                    success: false,
                    message: 'Candidate already registered for this voting period'
                });
            }

            candidateData = {
                employee_id: employee.employee_id,
                first_name: employee.first_name,
                last_name: employee.last_name,
                department: employee.department,
                position: employee.position,
                performance_appraisal_score: employee.performance_appraisal_score || 0,
                manager_id: employee.manager_id,
                director_id: employee.director_id,
                chief_id: employee.chief_id,
                registered_By: req.user?.employee_id || 'ADMIN001'
            };
        }

        // Create new candidate
        const newCandidate = new Candidate(candidateData);
        await newCandidate.save();

        console.log('✅ Created candidate with hierarchy:', {
            employee_id: candidateData.employee_id,
            department: candidateData.department,
            manager_id: candidateData.manager_id,
            director_id: candidateData.director_id,
            chief_id: candidateData.chief_id
        });

        // Update voting period candidate count if voting period exists
        if (candidateData.voting_period_id) {
            await VotingPeriod.findOneAndUpdate(
                { period_id: candidateData.voting_period_id },
                { $inc: { total_candidates: 1 } }
            );
        }

        res.status(201).json({
            success: true,
            message: 'Candidate registered successfully',
            candidate: {
                id: newCandidate._id,
                employee_id: candidateData.employee_id,
                name: `${candidateData.first_name} ${candidateData.last_name}`,
                department: candidateData.department,
                position: candidateData.position,
                performance_appraisal_score: candidateData.performance_appraisal_score,
                manager_id: candidateData.manager_id,
                director_id: candidateData.director_id,
                chief_id: candidateData.chief_id
            }
        });

    } catch (error) {
        console.error("Error registering candidate:", error);
        res.status(500).json({
            success: false,
            message: 'Failed to register candidate',
            error: error.message
        });
    }
});

// Import employees from Excel (file upload)
router.post('/import-employees', isAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const result = await importEmployeesFromExcel(
            req.file.path,
            req.user?.employee_id || 'ADMIN001'
        );

        res.json(result);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to import employees',
            error: error.message
        });
    }
});

// Import employees from JSON data (for professional registration)
// Fields a yearly re-import refreshes on people who are already registered (only those
// present in the file). Logins, passwords and roles are left alone.
const YEARLY_EMPLOYEE_FIELDS = ['first_name', 'last_name', 'position', 'department', 'job_grade', 'function', 'performance_appraisal_score'];
const YEARLY_MANAGER_FIELDS = ['first_name', 'last_name', 'position', 'department', 'job_grade', 'function', 'performance_appraisal_score'];

const copyPresentFields = (target, source, fields) => {
    for (const field of fields) {
        if (source[field] !== undefined && source[field] !== null && source[field] !== '') {
            target[field] = source[field];
        }
    }
};

router.post('/import-employees-json', isAdmin, async (req, res) => {
    try {
        // update_existing: refresh employees already registered (e.g. a new fiscal year's
        // appraisal scores) instead of reporting them as duplicates
        const { employees, update_existing = false } = req.body;

        if (!employees || !Array.isArray(employees)) {
            return res.status(400).json({
                success: false,
                message: 'No employees data provided'
            });
        }

        console.log(`Processing ${employees.length} employees...`);

        let imported = 0;
        let updated = 0;
        let errors = [];

        for (let i = 0; i < employees.length; i++) {
            try {
                const employeeData = employees[i];

                // Get department and its hierarchy
                const department = await Department.findOne({ department_name: employeeData.department });
                if (!department) {
                    errors.push(`Row ${i + 1}: Department '${employeeData.department}' not found`);
                    continue;
                }

                // Get hierarchy details directly from department
                let manager_id = department.manager_id || '';
                let director_id = department.director_id || '';
                let chief_id = department.chief_id || '';

                // Check if user already exists
                const existingUser = await User.findOne({
                    $or: [
                        { employee_id: employeeData.employee_id },
                        { email: employeeData.email },
                        { user: employeeData.user }
                    ]
                });

                if (existingUser) {
                    if (update_existing && existingUser.employee_id === employeeData.employee_id) {
                        copyPresentFields(existingUser, employeeData, YEARLY_EMPLOYEE_FIELDS);
                        existingUser.department_name = employeeData.department;
                        existingUser.manager_id = manager_id;
                        existingUser.director_id = director_id;
                        existingUser.chief_id = chief_id;
                        await existingUser.save();
                        updated++;
                        continue;
                    }
                    errors.push(`Row ${i + 1}: User with employee_id '${employeeData.employee_id}' or email '${employeeData.email}' already exists`);
                    continue;
                }

                // Create new user with hierarchy info
                const newUser = new User({
                    first_name: employeeData.first_name,
                    last_name: employeeData.last_name,
                    employee_id: employeeData.employee_id,
                    user: employeeData.user,
                    email: employeeData.email,
                    password: "$2b$10$FPGWuVHDUTNQ7gyiDa5mzubgI4CFvrud0P7pA1ku2lGh9Br3MXYQa", // Default password
                    position: employeeData.position,
                    department: employeeData.department,
                    department_name: employeeData.department,
                    level: employeeData.level || 'professional',
                    job_grade: employeeData.job_grade,
                    function: employeeData.function || '',
                    performance_appraisal_score: employeeData.performance_appraisal_score || 0,
                    is_managerial: employeeData.is_managerial || false,
                    roles: employeeData.roles || ['user'],
                    manager_id,
                    director_id,
                    chief_id,
                    status: true
                });

                await newUser.save();
                imported++;

                console.log(`✅ Created user: ${employeeData.first_name} ${employeeData.last_name} (${employeeData.employee_id})`);

            } catch (error) {
                console.error(`❌ Error creating user at row ${i + 1}:`, error.message);
                errors.push(`Row ${i + 1}: ${error.message}`);
            }
        }

        res.json({
            success: true,
            message: `Import completed. ${imported} employees imported${update_existing ? `, ${updated} updated` : ''}.`,
            imported,
            updated,
            total: employees.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to import employees',
            error: error.message
        });
    }
});

// Import candidates from Excel
router.post('/import-candidates', isAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const votingPeriodId = req.body.voting_period_id || null;

        const result = await importCandidatesFromExcel(
            req.file.path,
            req.user?.employee_id || 'ADMIN001',
            votingPeriodId
        );

        res.json(result);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to import candidates',
            error: error.message
        });
    }
});

// Import candidates from JSON data
router.post('/import-candidates-json', isAdmin, async (req, res) => {
    try {
        const { candidates } = req.body;

        if (!candidates || !Array.isArray(candidates)) {
            return res.status(400).json({
                success: false,
                message: 'No candidates data provided'
            });
        }

        console.log(`Processing ${candidates.length} candidates...`);

        let imported = 0;
        let errors = [];

        for (let i = 0; i < candidates.length; i++) {
            try {
                const candidateData = candidates[i];

                // Get department hierarchy using full hierarchical lookup
                let manager_id = '';
                let director_id = '';
                let chief_id = '';

                if (candidateData.department) {
                    console.log(`Getting hierarchy for candidate ${candidateData.employee_id} department:`, candidateData.department);
                    try {
                        // Import all models for hierarchy lookup
                        const [DepartmentModel, Manager, Director, Chief] = await Promise.all([
                            import('../models/rms/Department.js').then(m => m.default),
                            import('../models/rms/Manager.js').then(m => m.default),
                            import('../models/rms/Director.js').then(m => m.default),
                            import('../models/rms/Chief.js').then(m => m.default)
                        ]);

                        const dept = await DepartmentModel.findOne({ department_name: candidateData.department });
                        if (!dept) {
                            errors.push(`Row ${i + 1}: Department '${candidateData.department}' not found`);
                            continue;
                        }

                        manager_id = dept.manager_id || '';

                        if (manager_id) {
                            const manager = await Manager.findOne({ employee_id: manager_id });
                            if (manager && manager.director_id) {
                                director_id = manager.director_id;

                                const director = await Director.findOne({ employee_id: director_id });
                                if (director && director.chief_id) {
                                    chief_id = director.chief_id;
                                }
                            }
                        }
                        console.log(`Assigned hierarchy for ${candidateData.employee_id}:`, { manager_id, director_id, chief_id });
                    } catch (error) {
                        console.warn(`Could not fetch hierarchy for ${candidateData.employee_id}:`, error);
                    }
                }

                // Check if candidate already exists
                const existingCandidate = await Candidate.findOne({ employee_id: candidateData.employee_id });

                if (existingCandidate) {
                    errors.push(`Row ${i + 1}: Candidate with employee_id '${candidateData.employee_id}' already exists`);
                    continue;
                }

                // Validate performance score
                let score = 0;
                if (candidateData.performance_appraisal_score !== undefined) {
                    score = parseFloat(candidateData.performance_appraisal_score);
                    if (isNaN(score) || score < 0 || score > 100) {
                        errors.push(`Row ${i + 1}: Invalid performance score`);
                        continue;
                    }
                }

                // Create new candidate with hierarchy info
                const newCandidate = new Candidate({
                    employee_id: candidateData.employee_id,
                    first_name: candidateData.first_name,
                    last_name: candidateData.last_name,
                    department: candidateData.department,
                    position: candidateData.position,
                    performance_appraisal_score: score,
                    manager_id,
                    director_id,
                    chief_id,
                    registered_By: 'ADMIN001'
                });

                await newCandidate.save();
                imported++;

                console.log(`✅ Created candidate: ${candidateData.first_name} ${candidateData.last_name} (${candidateData.employee_id})`);

            } catch (error) {
                console.error(`❌ Error creating candidate at row ${i + 1}:`, error.message);
                errors.push(`Row ${i + 1}: ${error.message}`);
            }
        }

        res.json({
            success: true,
            message: `Import completed. ${imported} candidates imported successfully.`,
            imported,
            total: candidates.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to import candidates',
            error: error.message
        });
    }
});

// Download employee template
router.get('/template-employees', isAdmin, (req, res) => {
    try {
        const wb = generateEmployeeTemplate();
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="employee_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate template',
            error: error.message
        });
    }
});

// Download candidate template
router.get('/template-candidates', isAdmin, (req, res) => {
    try {
        const wb = generateCandidateTemplate();
        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="candidate_template.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate template',
            error: error.message
        });
    }
});

// Get all employees
router.get('/employees', isAdmin, withFiscalYear, async (req, res) => {
    try {
        const employees = await User.find({ ...fiscalYearFilter(req.fiscalYear) })
            .select('-password')
            .sort({ department: 1, level: -1, employee_id: 1 });

        res.json({
            success: true,
            count: employees.length,
            employees
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employees',
            error: error.message
        });
    }
});

// Update/Edit employee
router.patch('/employees/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            first_name, last_name, employee_id, email, username,
            position, department, level, job_grade, function: empFunction,
            performance_appraisal_score, is_managerial, password, ...otherFields
        } = req.body;

        console.log('Updating employee:', id, 'with data:', req.body);

        // Find the employee
        const employee = await User.findById(id);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        // Initialize hierarchy fields
        let manager_id = '';
        let director_id = '';
        let chief_id = '';

        // If department is being updated, recalculate hierarchy
        if (department && department !== employee.department) {
            const Department = (await import('../models/rms/Department.js')).default;
            const dept = await Department.findOne({ department_name: department });

            if (!dept) {
                return res.status(400).json({
                    success: false,
                    message: 'Department not found. Please register the department first.'
                });
            }

            // Get hierarchy directly from department model
            manager_id = dept.manager_id || '';
            director_id = dept.director_id || '';
            chief_id = dept.chief_id || '';
        } else {
            // Keep existing hierarchy if department hasn't changed
            manager_id = employee.manager_id;
            director_id = employee.director_id;
            chief_id = employee.chief_id;
        }

        // Build update data
        const updateData = {
            ...otherFields,
            ...(first_name && { first_name }),
            ...(last_name && { last_name }),
            ...(employee_id && { employee_id }),
            ...(email && { email }),
            ...(username && { user: username, username }),
            ...(position && { position }),
            ...(department && { department }),
            ...(level && { level }),
            ...(job_grade !== undefined && { job_grade }),
            ...(empFunction !== undefined && { function: empFunction }),
            ...(performance_appraisal_score !== undefined && { performance_appraisal_score }),
            ...(is_managerial !== undefined && { is_managerial }),
            manager_id,
            director_id,
            chief_id
        };

        // Hash password if provided
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        // Update roles based on level if level is being changed
        if (level) {
            let roles = ["user"];
            if (level === "chief") roles = ["chief", "user"];
            else if (level === "director") roles = ["director", "user"];
            else if (level === "manager") roles = ["manager", "user"];
            updateData.roles = roles;
        }

        // Remove undefined fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key] === undefined) {
                delete updateData[key];
            }
        });

        console.log('Final update data:', updateData);

        const updatedEmployee = await User.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true
        }).select('-password');

        res.json({
            success: true,
            message: 'Employee updated successfully',
            employee: updatedEmployee
        });

    } catch (error) {
        console.error('Error updating employee:', error);

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                success: false,
                message: `Employee with this ${duplicateField} already exists`
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update employee',
                error: error.message
            });
        }
    }
});

// Delete employee
router.delete('/employees/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const deletedEmployee = await User.findByIdAndDelete(id);

        if (!deletedEmployee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }

        res.json({
            success: true,
            message: 'Employee deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete employee',
            error: error.message
        });
    }
});

// Get all candidates for a voting period
router.get('/candidates/:voting_period_id?', isAdmin, async (req, res) => {
    try {
        const query = {};

        if (req.params.voting_period_id) {
            query.voting_period_id = req.params.voting_period_id;
        } else {
            // Get active voting period
            const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
            if (activeVotingPeriod) {
                query.voting_period_id = activeVotingPeriod.period_id;
            }
        }

        const candidates = await Candidate.find(query)
            .sort({ department: 1, performance_weighted: -1 });

        res.json({
            success: true,
            count: candidates.length,
            voting_period_id: query.voting_period_id,
            candidates
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch candidates',
            error: error.message
        });
    }
});

// Create voting period
router.post('/voting-period', isAdmin, async (req, res) => {
    try {
        const {
            period_id, period_name, description,
            start_date, end_date,
            target_departments, target_functions,
            quota_per_function
        } = req.body;

        // Check if period_id already exists
        const existing = await VotingPeriod.findOne({ period_id });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Voting period with this ID already exists'
            });
        }

        const newVotingPeriod = new VotingPeriod({
            period_id,
            period_name,
            description,
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            allow_peer_voting: true,
            allow_manager_voting: true,
            allow_director_voting: true,
            require_chief_approval: true,
            target_departments: target_departments || [],
            target_functions: target_functions || [],
            quota_per_function: quota_per_function || 1,
            status: "active",
            created_by: req.user?.employee_id || 'ADMIN001'
        });

        await newVotingPeriod.save();

        res.status(201).json({
            success: true,
            message: 'Voting period created successfully',
            voting_period: newVotingPeriod
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create voting period',
            error: error.message
        });
    }
});

// Get all voting periods
router.get('/voting-periods', isAdmin, async (req, res) => {
    try {
        const votingPeriods = await VotingPeriod.find({})
            .sort({ created_at: -1 });

        res.json({
            success: true,
            count: votingPeriods.length,
            voting_periods: votingPeriods
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch voting periods',
            error: error.message
        });
    }
});

// Department Management Routes

// Get all departments
router.get('/departments', isAdmin, withFiscalYear, async (req, res) => {
    try {
        const departments = await Department.find({ is_active: true, ...fiscalYearFilter(req.fiscalYear) })
            .sort({ department_code: 1 });

        res.json({
            success: true,
            count: departments.length,
            data: departments
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch departments',
            error: error.message
        });
    }
});

// Create department
router.post('/departments', isAdmin, async (req, res) => {
    try {
        const { department_code, department_name, description } = req.body;

        // Check if department already exists
        const existingDepartment = await Department.findOne({
            department_code: department_code.toUpperCase()
        });

        if (existingDepartment) {
            return res.status(400).json({
                success: false,
                message: 'Department with this code already exists'
            });
        }

        const newDepartment = new Department({
            department_code: department_code.toUpperCase(),
            department_name,
            description: description || '',
        });

        await newDepartment.save();

        res.status(201).json({
            success: true,
            message: 'Department created successfully',
            department: newDepartment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create department',
            error: error.message
        });
    }
});

// Update department
router.patch('/departments/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { department_code, department_name, description, manager_id } = req.body;
        console.log('PATCH department request:', { id, department_code, department_name, description, manager_id });

        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        // Check if department_code is already taken by another department
        if (department_code && department_code.toUpperCase() !== department.department_code) {
            const existingDepartment = await Department.findOne({
                department_code: department_code.toUpperCase(),
                _id: { $ne: id },
                fiscal_year: department.fiscal_year ?? null
            });

            if (existingDepartment) {
                return res.status(400).json({
                    success: false,
                    message: 'Department code already exists'
                });
            }
        }

        const previousName = department.department_name;
        const previousManagerId = department.manager_id || '';

        if (department_code) department.department_code = department_code.toUpperCase();
        if (department_name) department.department_name = department_name;
        if (description !== undefined) department.description = description;
        if (manager_id !== undefined) department.manager_id = manager_id;

        console.log('Before save - department fields:', {
            department_code: department.department_code,
            department_name: department.department_name,
            description: department.description,
            manager_id: department.manager_id
        });

        await department.save();

        // Employees and candidates follow their department's manager. When the manager is set,
        // changed or removed, move the ones still on the previous manager (or with none);
        // anyone given a different manager individually keeps theirs.
        const newManagerId = department.manager_id || '';
        let employeesUpdated = 0;
        let candidatesUpdated = 0;
        if (manager_id !== undefined && newManagerId !== previousManagerId) {
            const followers = {
                department: previousName,
                manager_id: { $in: [previousManagerId, '', null] },
                employee_id: { $ne: newManagerId },
                fiscal_year: department.fiscal_year ?? null
            };
            const update = { $set: { manager_id: newManagerId } };
            employeesUpdated = (await User.updateMany(followers, update)).modifiedCount;
            candidatesUpdated = (await Candidate.updateMany(followers, update)).modifiedCount;
            console.log(`Department ${previousName} manager ${previousManagerId || '(none)'} -> ${newManagerId || '(none)'}: moved ${employeesUpdated} employees, ${candidatesUpdated} candidates`);
        }

        console.log('After save - department fields:', {
            department_code: department.department_code,
            department_name: department.department_name,
            description: department.description,
            manager_id: department.manager_id
        });

        res.json({
            success: true,
            message: 'Department updated successfully',
            department,
            employees_updated: employeesUpdated,
            candidates_updated: candidatesUpdated
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update department',
            error: error.message
        });
    }
});

// Delete department
router.delete('/departments/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        // Soft delete
        department.is_active = false;
        await department.save();

        res.json({
            success: true,
            message: 'Department deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete department',
            error: error.message
        });
    }
});

// Import departments from Excel or JSON
router.post('/import-departments', isAdmin, (req, res) => {
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    console.log('Has departments:', !!req.body.departments);

    // Check if it's JSON data first
    if (req.body && req.body.departments && Array.isArray(req.body.departments)) {
        console.log('Processing JSON data with', req.body.departments.length, 'departments');
        // Handle JSON data from frontend
        return processImportedDepartments(req.body.departments, res);
    } else {
        console.log('Attempting file upload processing');
        // Handle file upload (for backward compatibility)
        const fileUpload = upload.single('file');

        return fileUpload(req, res, async (err) => {
            try {
                if (err || !req.file) {
                    return res.status(400).json({
                        success: false,
                        message: err?.message || 'No file uploaded'
                    });
                }

                const workbook = xlsx.readFile(req.file.path);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(worksheet);

                return processImportedDepartments(data, res);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to import departments',
                    error: error.message
                });
            }
        });
    }
});

// Helper function to process imported departments
async function processImportedDepartments(data, res) {
    try {
        console.log('=== PROCESSING DEPARTMENTS ===');
        console.log('Total departments to process:', data.length);
        console.log('Departments data:', JSON.stringify(data, null, 2));

        const results = {
            successful: [],
            failed: [],
            total: data.length
        };

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            console.log(`\n--- Processing department ${i + 1}/${data.length} ---`);
            console.log('Row data:', JSON.stringify(row, null, 2));

            try {
                if (!row.department_code || !row.department_name) {
                    console.log('❌ Missing required fields');
                    results.failed.push({
                        row,
                        error: "Missing required fields (department_code, department_name)"
                    });
                    continue;
                }

                console.log('✅ Required fields present');

                // Check if department already exists
                const existingDepartment = await Department.findOne({
                    department_code: row.department_code.toString().toUpperCase()
                });

                if (existingDepartment) {
                    console.log('❌ Department already exists:', row.department_code);
                    results.failed.push({
                        department_code: row.department_code,
                        error: "Department already exists with this code"
                    });
                    continue;
                }

                console.log('✅ Department is new, creating...');
                const newDepartment = new Department({
                    department_code: row.department_code.toString().toUpperCase(),
                    department_name: row.department_name,
                    description: row.description || '',
                });

                console.log('🔄 Attempting to save department to database...');
                const savedDepartment = await newDepartment.save();
                console.log('✅ Successfully saved department:', savedDepartment._id);

                results.successful.push({
                    department_code: row.department_code,
                    department_name: row.department_name
                });
                console.log('📊 Current results:', results.successful.length, 'successful,', results.failed.length, 'failed');

            } catch (error) {
                console.log('❌ Error processing department:', error.message);
                console.log('Error details:', error);
                results.failed.push({
                    department_code: row.department_code || "Unknown",
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Import completed. ${results.successful.length} successful, ${results.failed.length} failed`,
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to import departments',
            error: error.message
        });
    }
}

// ===== MANAGER ROUTES =====

// GET all managers
router.get('/managers', withFiscalYear, async (req, res) => {
    try {
        const { filters, globalFilter, sorting } = req.query;
        const parsedFilters = filters ? JSON.parse(filters) : [];
        const parsedSorting = sorting ? JSON.parse(sorting) : [];

        let query = { ...fiscalYearFilter(req.fiscalYear) };

        // Apply filters
        parsedFilters.forEach(filter => {
            if (filter.value) {
                query[filter.id] = new RegExp(filter.value, 'i');
            }
        });

        // Apply global filter
        if (globalFilter) {
            query.$or = [
                { first_name: new RegExp(globalFilter, 'i') },
                { last_name: new RegExp(globalFilter, 'i') },
                { employee_id: new RegExp(globalFilter, 'i') },
                { email: new RegExp(globalFilter, 'i') },
                { position: new RegExp(globalFilter, 'i') }
            ];
        }

        let queryBuilder = Manager.find(query);

        // Apply sorting
        if (parsedSorting.length > 0) {
            const sortObj = {};
            parsedSorting.forEach(sort => {
                sortObj[sort.id] = sort.desc ? -1 : 1;
            });
            queryBuilder = queryBuilder.sort(sortObj);
        }

        const data = await queryBuilder;

        res.json({
            data,
            meta: {
                totalRowCount: data.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch managers',
            error: error.message
        });
    }
});

// POST create new manager
router.post('/managers', async (req, res) => {
    try {
        const managerData = req.body;

        // Hash password if provided, otherwise use default
        if (managerData.password) {
            managerData.password = await bcrypt.hash(managerData.password, 10);
        }

        const newManager = new Manager(managerData);
        const savedManager = await newManager.save();

        res.status(201).json({
            success: true,
            message: 'Manager created successfully',
            data: savedManager
        });
    } catch (error) {
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                success: false,
                message: `Manager with this ${duplicateField} already exists`
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to create manager',
                error: error.message
            });
        }
    }
});

// PATCH update manager
router.patch('/managers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Hash password if being updated
        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        updateData.updated_at = new Date();

        const updatedManager = await Manager.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedManager) {
            return res.status(404).json({
                success: false,
                message: 'Manager not found'
            });
        }

        res.json({
            success: true,
            message: 'Manager updated successfully',
            data: updatedManager
        });
    } catch (error) {
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                success: false,
                message: `Manager with this ${duplicateField} already exists`
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to update manager',
                error: error.message
            });
        }
    }
});

// DELETE manager
router.delete('/managers/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedManager = await Manager.findByIdAndDelete(id);

        if (!deletedManager) {
            return res.status(404).json({
                success: false,
                message: 'Manager not found'
            });
        }

        res.json({
            success: true,
            message: 'Manager deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete manager',
            error: error.message
        });
    }
});

// POST import managers from Excel
router.post('/import-managers', async (req, res) => {
    try {
        // update_existing: refresh managers already registered (e.g. a new fiscal year's
        // appraisal scores) instead of reporting them as duplicates
        const { managers, update_existing = false } = req.body;

        if (!managers || !Array.isArray(managers)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid managers data provided'
            });
        }

        const results = {
            successful: [],
            updated: [],
            failed: [],
            total: managers.length
        };

        for (let i = 0; i < managers.length; i++) {
            const managerData = managers[i];

            try {
                // Validate required fields
                const requiredFields = ['first_name', 'last_name', 'employee_id', 'user', 'email', 'position'];
                const missingFields = requiredFields.filter(field => !managerData[field]);

                if (missingFields.length > 0) {
                    results.failed.push({
                        row: i + 1,
                        data: managerData,
                        error: `Missing required fields: ${missingFields.join(', ')}`
                    });
                    continue;
                }

                // Check for duplicates
                const existingManager = await Manager.findOne({
                    $or: [
                        { employee_id: managerData.employee_id },
                        { user: managerData.user },
                        { email: managerData.email }
                    ]
                });

                if (existingManager) {
                    if (update_existing && existingManager.employee_id === managerData.employee_id) {
                        copyPresentFields(existingManager, managerData, YEARLY_MANAGER_FIELDS);
                        await existingManager.save();
                        results.updated.push({
                            row: i + 1,
                            employee_id: managerData.employee_id,
                            name: `${existingManager.first_name} ${existingManager.last_name}`
                        });
                        continue;
                    }
                    results.failed.push({
                        row: i + 1,
                        data: managerData,
                        error: 'Manager already exists with this employee_id, username, or email'
                    });
                    continue;
                }

                // Hash password
                managerData.password = await bcrypt.hash('default123', 10);
                managerData.level = 'manager';

                const newManager = new Manager(managerData);
                const savedManager = await newManager.save();

                results.successful.push({
                    row: i + 1,
                    employee_id: managerData.employee_id,
                    name: `${managerData.first_name} ${managerData.last_name}`
                });

            } catch (error) {
                results.failed.push({
                    row: i + 1,
                    data: managerData,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Import completed. ${results.successful.length} successful, ${update_existing ? `${results.updated.length} updated, ` : ''}${results.failed.length} failed`,
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to import managers',
            error: error.message
        });
    }
});

// ===== DIRECTOR ROUTES =====

// GET all directors
router.get('/directors', withFiscalYear, async (req, res) => {
    try {
        const { filters, globalFilter, sorting } = req.query;
        const parsedFilters = filters ? JSON.parse(filters) : [];
        const parsedSorting = sorting ? JSON.parse(sorting) : [];

        let query = { ...fiscalYearFilter(req.fiscalYear) };

        // Apply filters
        parsedFilters.forEach(filter => {
            if (filter.value) {
                query[filter.id] = new RegExp(filter.value, 'i');
            }
        });

        // Apply global filter
        if (globalFilter) {
            query.$or = [
                { first_name: new RegExp(globalFilter, 'i') },
                { last_name: new RegExp(globalFilter, 'i') },
                { employee_id: new RegExp(globalFilter, 'i') },
                { email: new RegExp(globalFilter, 'i') },
                { position: new RegExp(globalFilter, 'i') }
            ];
        }

        let queryBuilder = Director.find(query);

        // Apply sorting
        if (parsedSorting.length > 0) {
            const sortObj = {};
            parsedSorting.forEach(sort => {
                sortObj[sort.id] = sort.desc ? -1 : 1;
            });
            queryBuilder = queryBuilder.sort(sortObj);
        }

        const data = await queryBuilder;

        res.json({
            data,
            meta: {
                totalRowCount: data.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch directors',
            error: error.message
        });
    }
});

// POST create new director
router.post('/directors', async (req, res) => {
    try {
        const directorData = req.body;

        // Hash password if provided, otherwise use default
        if (directorData.password) {
            directorData.password = await bcrypt.hash(directorData.password, 10);
        }

        const newDirector = new Director(directorData);
        const savedDirector = await newDirector.save();

        res.status(201).json({
            success: true,
            message: 'Director created successfully',
            data: savedDirector
        });
    } catch (error) {
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                success: false,
                message: `Director with this ${duplicateField} already exists`
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to create director',
                error: error.message
            });
        }
    }
});

// PATCH update director
router.patch('/directors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Hash password if being updated
        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        updateData.updated_at = new Date();

        const updatedDirector = await Director.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedDirector) {
            return res.status(404).json({
                success: false,
                message: 'Director not found'
            });
        }

        res.json({
            success: true,
            message: 'Director updated successfully',
            data: updatedDirector
        });
    } catch (error) {
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                success: false,
                message: `Director with this ${duplicateField} already exists`
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to update director',
                error: error.message
            });
        }
    }
});

// DELETE director
router.delete('/directors/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedDirector = await Director.findByIdAndDelete(id);

        if (!deletedDirector) {
            return res.status(404).json({
                success: false,
                message: 'Director not found'
            });
        }

        res.json({
            success: true,
            message: 'Director deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete director',
            error: error.message
        });
    }
});

// POST import directors from Excel
router.post('/import-directors', async (req, res) => {
    try {
        const { directors } = req.body;

        if (!directors || !Array.isArray(directors)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid directors data provided'
            });
        }

        const results = {
            successful: [],
            failed: [],
            total: directors.length
        };

        for (let i = 0; i < directors.length; i++) {
            const directorData = directors[i];

            try {
                // Validate required fields
                const requiredFields = ['first_name', 'last_name', 'employee_id', 'user', 'email', 'position'];
                const missingFields = requiredFields.filter(field => !directorData[field]);

                if (missingFields.length > 0) {
                    results.failed.push({
                        row: i + 1,
                        data: directorData,
                        error: `Missing required fields: ${missingFields.join(', ')}`
                    });
                    continue;
                }

                // Check for duplicates
                const existingDirector = await Director.findOne({
                    $or: [
                        { employee_id: directorData.employee_id },
                        { user: directorData.user },
                        { email: directorData.email }
                    ]
                });

                if (existingDirector) {
                    results.failed.push({
                        row: i + 1,
                        data: directorData,
                        error: 'Director already exists with this employee_id, username, or email'
                    });
                    continue;
                }

                // Hash password
                directorData.password = await bcrypt.hash('default123', 10);
                directorData.level = 'director';

                const newDirector = new Director(directorData);
                const savedDirector = await newDirector.save();

                results.successful.push({
                    row: i + 1,
                    employee_id: directorData.employee_id,
                    name: `${directorData.first_name} ${directorData.last_name}`
                });

            } catch (error) {
                results.failed.push({
                    row: i + 1,
                    data: directorData,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Import completed. ${results.successful.length} successful, ${results.failed.length} failed`,
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to import directors',
            error: error.message
        });
    }
});

// ===== CHIEF ROUTES =====

// GET all chiefs
router.get('/chiefs', withFiscalYear, async (req, res) => {
    try {
        const { filters, globalFilter, sorting } = req.query;
        const parsedFilters = filters ? JSON.parse(filters) : [];
        const parsedSorting = sorting ? JSON.parse(sorting) : [];

        let query = { ...fiscalYearFilter(req.fiscalYear) };

        // Apply filters
        parsedFilters.forEach(filter => {
            if (filter.value) {
                query[filter.id] = new RegExp(filter.value, 'i');
            }
        });

        // Apply global filter
        if (globalFilter) {
            query.$or = [
                { first_name: new RegExp(globalFilter, 'i') },
                { last_name: new RegExp(globalFilter, 'i') },
                { employee_id: new RegExp(globalFilter, 'i') },
                { email: new RegExp(globalFilter, 'i') },
                { position: new RegExp(globalFilter, 'i') }
            ];
        }

        let queryBuilder = Chief.find(query);

        // Apply sorting
        if (parsedSorting.length > 0) {
            const sortObj = {};
            parsedSorting.forEach(sort => {
                sortObj[sort.id] = sort.desc ? -1 : 1;
            });
            queryBuilder = queryBuilder.sort(sortObj);
        }

        const data = await queryBuilder;

        res.json({
            data,
            meta: {
                totalRowCount: data.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chiefs',
            error: error.message
        });
    }
});

// POST create new chief
router.post('/chiefs', async (req, res) => {
    try {
        const chiefData = req.body;

        // Hash password if provided, otherwise use default
        if (chiefData.password) {
            chiefData.password = await bcrypt.hash(chiefData.password, 10);
        }

        const newChief = new Chief(chiefData);
        const savedChief = await newChief.save();
        await relinkQuotaChiefs(await getCurrentFiscalYear());

        res.status(201).json({
            success: true,
            message: 'Chief created successfully',
            data: savedChief
        });
    } catch (error) {
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                success: false,
                message: `Chief with this ${duplicateField} already exists`
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to create chief',
                error: error.message
            });
        }
    }
});

// PATCH update chief
router.patch('/chiefs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Hash password if being updated
        if (updateData.password) {
            updateData.password = await bcrypt.hash(updateData.password, 10);
        }

        updateData.updated_at = new Date();

        const updatedChief = await Chief.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedChief) {
            return res.status(404).json({
                success: false,
                message: 'Chief not found'
            });
        }

        res.json({
            success: true,
            message: 'Chief updated successfully',
            data: updatedChief
        });
    } catch (error) {
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                success: false,
                message: `Chief with this ${duplicateField} already exists`
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Failed to update chief',
                error: error.message
            });
        }
    }
});

// DELETE chief
router.delete('/chiefs/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deletedChief = await Chief.findByIdAndDelete(id);

        if (!deletedChief) {
            return res.status(404).json({
                success: false,
                message: 'Chief not found'
            });
        }

        res.json({
            success: true,
            message: 'Chief deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete chief',
            error: error.message
        });
    }
});

// POST import chiefs from Excel
router.post('/import-chiefs', async (req, res) => {
    try {
        const { chiefs } = req.body;

        if (!chiefs || !Array.isArray(chiefs)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid chiefs data provided'
            });
        }

        const results = {
            successful: [],
            failed: [],
            total: chiefs.length
        };

        for (let i = 0; i < chiefs.length; i++) {
            const chiefData = chiefs[i];

            try {
                // Validate required fields
                const requiredFields = ['first_name', 'last_name', 'employee_id', 'user', 'email', 'position'];
                const missingFields = requiredFields.filter(field => !chiefData[field]);

                if (missingFields.length > 0) {
                    results.failed.push({
                        row: i + 1,
                        data: chiefData,
                        error: `Missing required fields: ${missingFields.join(', ')}`
                    });
                    continue;
                }

                // Check for duplicates
                const existingChief = await Chief.findOne({
                    $or: [
                        { employee_id: chiefData.employee_id },
                        { user: chiefData.user },
                        { email: chiefData.email }
                    ]
                });

                if (existingChief) {
                    results.failed.push({
                        row: i + 1,
                        data: chiefData,
                        error: 'Chief already exists with this employee_id, username, or email'
                    });
                    continue;
                }

                // Hash password
                chiefData.password = await bcrypt.hash('default123', 10);
                chiefData.level = 'chief';

                const newChief = new Chief(chiefData);
                const savedChief = await newChief.save();

                results.successful.push({
                    row: i + 1,
                    employee_id: chiefData.employee_id,
                    name: `${chiefData.first_name} ${chiefData.last_name}`
                });

            } catch (error) {
                results.failed.push({
                    row: i + 1,
                    data: chiefData,
                    error: error.message
                });
            }
        }

        await relinkQuotaChiefs(await getCurrentFiscalYear());

        res.json({
            success: true,
            message: `Import completed. ${results.successful.length} successful, ${results.failed.length} failed`,
            results
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to import chiefs',
            error: error.message
        });
    }
});

export default router;