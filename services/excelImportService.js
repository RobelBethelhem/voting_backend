/**
 * Excel Import Service
 * Handles importing employees and candidates from Excel files
 */

import xlsx from 'xlsx';
import bcrypt from 'bcrypt';
import User from '../models/rms/user.js';
import Candidate from '../models/rms/Candidate.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';

/**
 * Parse Excel file and return data as JSON
 */
const parseExcelFile = (filePath, sheetName = null) => {
    try {
        const workbook = xlsx.readFile(filePath);
        const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);
        return data;
    } catch (error) {
        throw new Error(`Error parsing Excel file: ${error.message}`);
    }
};

/**
 * Import employees from Excel file
 * Expected columns:
 * - employee_id, first_name, last_name, email, position, department_name
 * - level (professional/manager/director/chief)
 * - job_grade, function, performance_appraisal_score, is_managerial
 * Note: manager_id, director_id, chief_id are auto-populated based on department mapping
 */
export const importEmployeesFromExcel = async (filePath, importedBy = 'admin') => {
    try {
        const data = parseExcelFile(filePath);

        if (!data || data.length === 0) {
            throw new Error("No data found in Excel file");
        }

        const defaultPassword = await bcrypt.hash("Test@123", 10);
        const results = {
            successful: [],
            failed: [],
            total: data.length
        };

        for (const row of data) {
            try {
                // Validate required fields
                if (!row.employee_id || !row.first_name || !row.last_name || !row.email) {
                    results.failed.push({
                        row,
                        error: "Missing required fields (employee_id, first_name, last_name, email)"
                    });
                    continue;
                }

                // Check if user already exists
                const existingUser = await User.findOne({
                    $or: [
                        { employee_id: row.employee_id },
                        { email: row.email }
                    ]
                });

                if (existingUser) {
                    results.failed.push({
                        employee_id: row.employee_id,
                        error: "User already exists with this employee_id or email"
                    });
                    continue;
                }

                // Determine user roles based on level
                let roles = ["user"];
                if (row.level === "chief") {
                    roles = ["chief", "user"];
                } else if (row.level === "director") {
                    roles = ["director", "user"];
                } else if (row.level === "manager") {
                    roles = ["manager", "user"];
                }

                // Create user object
                const newUser = new User({
                    employee_id: row.employee_id,
                    first_name: row.first_name,
                    last_name: row.last_name,
                    user: row.username || row.employee_id.toLowerCase(),
                    username: row.username || row.employee_id.toLowerCase(),
                    email: row.email,
                    password: row.password ? await bcrypt.hash(row.password, 10) : defaultPassword,
                    position: row.position || "Employee",
                    department: row.department_name || "General",
                    roles: roles,
                    level: row.level || "professional",
                    job_grade: row.job_grade || "",
                    function: row.function || "",
                    manager_id: row.manager_id || "",
                    director_id: row.director_id || "",
                    chief_id: row.chief_id || "",
                    performance_appraisal_score: parseFloat(row.performance_appraisal_score) || 0,
                    is_managerial: row.is_managerial === "true" || row.is_managerial === true || row.level !== "professional",
                    status: true
                });

                await newUser.save();
                results.successful.push({
                    employee_id: row.employee_id,
                    name: `${row.first_name} ${row.last_name}`,
                    email: row.email
                });

            } catch (error) {
                results.failed.push({
                    employee_id: row.employee_id,
                    error: error.message
                });
            }
        }

        return {
            success: true,
            message: `Import completed. ${results.successful.length} successful, ${results.failed.length} failed`,
            results
        };

    } catch (error) {
        throw new Error(`Failed to import employees: ${error.message}`);
    }
};

/**
 * Import candidates from Excel file
 * Expected columns:
 * - employee_id, first_name, last_name, department_name, position
 * - level, performance_appraisal_score
 * - voting_period_id (optional, uses active period if not provided)
 * Note: manager_id, director_id, chief_id are auto-populated based on department mapping
 */
export const importCandidatesFromExcel = async (filePath, importedBy = 'admin', votingPeriodId = null) => {
    try {
        const data = parseExcelFile(filePath);

        if (!data || data.length === 0) {
            throw new Error("No data found in Excel file");
        }

        // Get active voting period if not provided
        if (!votingPeriodId) {
            const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
            if (!activeVotingPeriod) {
                throw new Error("No active voting period found. Please create a voting period first.");
            }
            votingPeriodId = activeVotingPeriod.period_id;
        }

        const results = {
            successful: [],
            failed: [],
            total: data.length
        };

        for (const row of data) {
            try {
                // Validate required fields
                if (!row.employee_id || !row.first_name || !row.last_name || !row.department_name || !row.position) {
                    results.failed.push({
                        row,
                        error: "Missing required fields (employee_id, first_name, last_name, department_name, position)"
                    });
                    continue;
                }

                // Check if employee exists
                const employee = await User.findOne({ employee_id: row.employee_id });
                if (!employee) {
                    results.failed.push({
                        employee_id: row.employee_id,
                        error: "Employee not found in the system"
                    });
                    continue;
                }

                // Check if candidate already exists for this voting period
                const existingCandidate = await Candidate.findOne({
                    employee_id: row.employee_id,
                    voting_period_id: votingPeriodId
                });

                if (existingCandidate) {
                    results.failed.push({
                        employee_id: row.employee_id,
                        error: "Candidate already registered for this voting period"
                    });
                    continue;
                }

                // Use employee data if not provided in Excel
                const performanceScore = parseFloat(row.performance_appraisal_score) || employee.performance_appraisal_score || 0;

                // Create candidate object
                const newCandidate = new Candidate({
                    employee_id: row.employee_id,
                    first_name: row.first_name || employee.first_name,
                    last_name: row.last_name || employee.last_name,
                    department: row.department_name || employee.department,
                    position: row.position || employee.position,
                    level: row.level || employee.level,
                    performance_appraisal_score: performanceScore,
                    performance_weighted: performanceScore * 0.5, // 50% weight
                    manager_id: row.manager_id || employee.manager_id || "",
                    director_id: row.director_id || employee.director_id || "",
                    chief_id: row.chief_id || employee.chief_id || "",
                    voting_period_id: votingPeriodId,
                    is_active: true,
                    registered_By: importedBy,
                    // Remove qualification_criteria - candidates are directly eligible
                });

                await newCandidate.save();
                results.successful.push({
                    employee_id: row.employee_id,
                    name: `${row.first_name} ${row.last_name}`,
                    department: row.department_name
                });

                // Update voting period candidate count
                await VotingPeriod.findOneAndUpdate(
                    { period_id: votingPeriodId },
                    { $inc: { total_candidates: 1 } }
                );

            } catch (error) {
                results.failed.push({
                    employee_id: row.employee_id || "Unknown",
                    error: error.message
                });
            }
        }

        return {
            success: true,
            message: `Import completed. ${results.successful.length} successful, ${results.failed.length} failed`,
            voting_period_id: votingPeriodId,
            results
        };

    } catch (error) {
        throw new Error(`Failed to import candidates: ${error.message}`);
    }
};

/**
 * Generate sample Excel template for employee import
 */
export const generateEmployeeTemplate = () => {
    const template = [
        {
            employee_id: "EMP001",
            first_name: "John",
            last_name: "Doe",
            email: "john.doe@company.com",
            username: "johndoe",
            password: "", // Leave empty for default password
            position: "Senior Developer",
            department_name: "Information Technology",
            level: "professional", // professional/manager/director/chief
            job_grade: "P3",
            function: "Software Development",
            performance_appraisal_score: 85,
            is_managerial: false
        },
        {
            employee_id: "MGR001",
            first_name: "Jane",
            last_name: "Smith",
            email: "jane.smith@company.com",
            username: "janesmith",
            password: "",
            position: "Development Manager",
            department_name: "Information Technology",
            level: "manager",
            job_grade: "M2",
            function: "Software Development",
            performance_appraisal_score: 90,
            is_managerial: true
        }
    ];

    const ws = xlsx.utils.json_to_sheet(template);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Employees");

    return wb;
};

/**
 * Generate sample Excel template for candidate import
 */
export const generateCandidateTemplate = () => {
    const template = [
        {
            employee_id: "EMP001",
            first_name: "John",
            last_name: "Doe",
            department: "Innovation and IT Projects",
            position: "Senior Developer",
            performance_appraisal_score: 85
        },
        {
            employee_id: "EMP002",
            first_name: "Alice",
            last_name: "Johnson",
            department: "Finance Department",
            position: "Financial Analyst",
            performance_appraisal_score: 88
        },
        {
            employee_id: "EMP003",
            first_name: "Bob",
            last_name: "Smith",
            department: "Human Resources",
            position: "HR Specialist",
            performance_appraisal_score: 92
        }
    ];

    const ws = xlsx.utils.json_to_sheet(template);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Candidates");

    return wb;
};

export default {
    importEmployeesFromExcel,
    importCandidatesFromExcel,
    generateEmployeeTemplate,
    generateCandidateTemplate
};