/**
 * Complete Database Rebuild Script
 * Drops existing database and rebuilds with fresh demo data
 * Includes hierarchical voting system with Admin functionality
 */

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

// Import all models
import User from "../models/rms/user.js";
import Candidate from "../models/rms/Candidate.js";
import VotingPeriod from "../models/rms/VotingPeriod.js";
import HierarchicalVoting from "../models/rms/HierarchicalVoting.js";
import PerformanceAppraisal from "../models/rms/PerformanceAppraisal.js";
import Department from "../models/rms/Department.js";

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB || "mongodb://127.0.0.1:27017/voting_system");
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};

// Drop the entire database
const dropDatabase = async () => {
    try {
        console.log("\n🗑️  Dropping existing database...");
        await mongoose.connection.db.dropDatabase();
        console.log("✅ Database dropped successfully");
    } catch (error) {
        console.error("❌ Error dropping database:", error);
        throw error;
    }
};

// Create departments
const createDepartments = async () => {
    console.log("\n🏢 Creating departments...");

    const departments = [
        {
            department_id: "DEPT001",
            department_name: "Information Technology",
            department_code: "IT",
            chief_id: "CHIEF001",
            director_ids: ["DIR001", "DIR002"],
            manager_ids: ["MGR001", "MGR002", "MGR003", "MGR004"],
            professional_ids: ["EMP001", "EMP002", "EMP003", "EMP004", "EMP005", "EMP006", "EMP007", "EMP008"],
            created_by: "system",
            status: true
        },
        {
            department_id: "DEPT002",
            department_name: "Human Resources",
            department_code: "HR",
            chief_id: "CHIEF001",
            director_ids: ["DIR003"],
            manager_ids: ["MGR005", "MGR006"],
            professional_ids: ["EMP009", "EMP010", "EMP011", "EMP012"],
            created_by: "system",
            status: true
        },
        {
            department_id: "DEPT003",
            department_name: "Finance",
            department_code: "FIN",
            chief_id: "CHIEF001",
            director_ids: ["DIR004"],
            manager_ids: ["MGR007", "MGR008"],
            professional_ids: ["EMP013", "EMP014", "EMP015", "EMP016", "EMP017", "EMP018"],
            created_by: "system",
            status: true
        },
        {
            department_id: "DEPT004",
            department_name: "Operations",
            department_code: "OPS",
            chief_id: "CHIEF001",
            director_ids: ["DIR005"],
            manager_ids: ["MGR009", "MGR010"],
            professional_ids: ["EMP019", "EMP020", "EMP021", "EMP022", "EMP023"],
            created_by: "system",
            status: true
        }
    ];

    await Department.insertMany(departments);
    console.log(`✅ Created ${departments.length} departments`);
};

// Create users with hierarchical structure
const createUsers = async () => {
    console.log("\n👥 Creating users with hierarchical structure...");

    const defaultPassword = await bcrypt.hash("Test@123", 10);

    const users = [
        // System Admin
        {
            employee_id: "ADMIN001",
            first_name: "System",
            last_name: "Administrator",
            user: "admin",
            username: "admin",
            email: "admin@votingsystem.com",
            password: defaultPassword,
            position: "System Administrator",
            department: "IT",
            roles: ["admin"],
            level: "professional",
            is_managerial: false,
            status: true
        },

        // Chief Level (1 Chief overseeing all departments)
        {
            employee_id: "CHIEF001",
            first_name: "John",
            last_name: "Chief",
            user: "chief001",
            username: "chief001",
            email: "chief@company.com",
            password: defaultPassword,
            position: "Chief Executive Officer",
            department: "Executive",
            roles: ["chief", "user"],
            level: "chief",
            job_grade: "C1",
            function: "Executive Management",
            performance_appraisal_score: 95,
            is_managerial: true,
            status: true
        },

        // Director Level - IT Department
        {
            employee_id: "DIR001",
            first_name: "David",
            last_name: "ITDirector",
            user: "dir001",
            username: "dir001",
            email: "it.director1@company.com",
            password: defaultPassword,
            position: "IT Director",
            department: "Information Technology",
            roles: ["director", "user"],
            level: "director",
            job_grade: "D1",
            function: "IT Management",
            chief_id: "CHIEF001",
            performance_appraisal_score: 88,
            is_managerial: true,
            status: true
        },
        {
            employee_id: "DIR002",
            first_name: "Diana",
            last_name: "ITDirector2",
            user: "dir002",
            username: "dir002",
            email: "it.director2@company.com",
            password: defaultPassword,
            position: "IT Infrastructure Director",
            department: "Information Technology",
            roles: ["director", "user"],
            level: "director",
            job_grade: "D1",
            function: "IT Infrastructure",
            chief_id: "CHIEF001",
            performance_appraisal_score: 85,
            is_managerial: true,
            status: true
        },

        // Director Level - HR Department
        {
            employee_id: "DIR003",
            first_name: "Helen",
            last_name: "HRDirector",
            user: "dir003",
            username: "dir003",
            email: "hr.director@company.com",
            password: defaultPassword,
            position: "HR Director",
            department: "Human Resources",
            roles: ["director", "user"],
            level: "director",
            job_grade: "D1",
            function: "HR Management",
            chief_id: "CHIEF001",
            performance_appraisal_score: 90,
            is_managerial: true,
            status: true
        },

        // Director Level - Finance Department
        {
            employee_id: "DIR004",
            first_name: "Frank",
            last_name: "FinanceDirector",
            user: "dir004",
            username: "dir004",
            email: "finance.director@company.com",
            password: defaultPassword,
            position: "Finance Director",
            department: "Finance",
            roles: ["director", "user"],
            level: "director",
            job_grade: "D1",
            function: "Finance Management",
            chief_id: "CHIEF001",
            performance_appraisal_score: 92,
            is_managerial: true,
            status: true
        },

        // Director Level - Operations Department
        {
            employee_id: "DIR005",
            first_name: "Oliver",
            last_name: "OpsDirector",
            user: "dir005",
            username: "dir005",
            email: "ops.director@company.com",
            password: defaultPassword,
            position: "Operations Director",
            department: "Operations",
            roles: ["director", "user"],
            level: "director",
            job_grade: "D1",
            function: "Operations Management",
            chief_id: "CHIEF001",
            performance_appraisal_score: 87,
            is_managerial: true,
            status: true
        },

        // Manager Level - IT Department (4 managers)
        {
            employee_id: "MGR001",
            first_name: "Michael",
            last_name: "DevManager",
            user: "mgr001",
            username: "mgr001",
            email: "dev.manager@company.com",
            password: defaultPassword,
            position: "Development Manager",
            department: "Information Technology",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Software Development",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            performance_appraisal_score: 82,
            is_managerial: true,
            status: true
        },
        {
            employee_id: "MGR002",
            first_name: "Maria",
            last_name: "QAManager",
            user: "mgr002",
            username: "mgr002",
            email: "qa.manager@company.com",
            password: defaultPassword,
            position: "QA Manager",
            department: "Information Technology",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Quality Assurance",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            performance_appraisal_score: 85,
            is_managerial: true,
            status: true
        },
        {
            employee_id: "MGR003",
            first_name: "Mark",
            last_name: "InfraManager",
            user: "mgr003",
            username: "mgr003",
            email: "infra.manager@company.com",
            password: defaultPassword,
            position: "Infrastructure Manager",
            department: "Information Technology",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "IT Infrastructure",
            director_id: "DIR002",
            chief_id: "CHIEF001",
            performance_appraisal_score: 78,
            is_managerial: true,
            status: true
        },
        {
            employee_id: "MGR004",
            first_name: "Monica",
            last_name: "SecurityManager",
            user: "mgr004",
            username: "mgr004",
            email: "security.manager@company.com",
            password: defaultPassword,
            position: "Security Manager",
            department: "Information Technology",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "IT Security",
            director_id: "DIR002",
            chief_id: "CHIEF001",
            performance_appraisal_score: 88,
            is_managerial: true,
            status: true
        },

        // Manager Level - HR Department (2 managers)
        {
            employee_id: "MGR005",
            first_name: "Hannah",
            last_name: "TalentManager",
            user: "mgr005",
            username: "mgr005",
            email: "talent.manager@company.com",
            password: defaultPassword,
            position: "Talent Acquisition Manager",
            department: "Human Resources",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Talent Acquisition",
            director_id: "DIR003",
            chief_id: "CHIEF001",
            performance_appraisal_score: 83,
            is_managerial: true,
            status: true
        },
        {
            employee_id: "MGR006",
            first_name: "Harry",
            last_name: "CompManager",
            user: "mgr006",
            username: "mgr006",
            email: "comp.manager@company.com",
            password: defaultPassword,
            position: "Compensation Manager",
            department: "Human Resources",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Compensation & Benefits",
            director_id: "DIR003",
            chief_id: "CHIEF001",
            performance_appraisal_score: 80,
            is_managerial: true,
            status: true
        },

        // Manager Level - Finance Department (2 managers)
        {
            employee_id: "MGR007",
            first_name: "Frederick",
            last_name: "AccountingManager",
            user: "mgr007",
            username: "mgr007",
            email: "accounting.manager@company.com",
            password: defaultPassword,
            position: "Accounting Manager",
            department: "Finance",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Accounting",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 86,
            is_managerial: true,
            status: true
        },
        {
            employee_id: "MGR008",
            first_name: "Fiona",
            last_name: "TreasuryManager",
            user: "mgr008",
            username: "mgr008",
            email: "treasury.manager@company.com",
            password: defaultPassword,
            position: "Treasury Manager",
            department: "Finance",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Treasury",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 84,
            is_managerial: true,
            status: true
        },

        // Manager Level - Operations Department (2 managers)
        {
            employee_id: "MGR009",
            first_name: "Oscar",
            last_name: "ProcessManager",
            user: "mgr009",
            username: "mgr009",
            email: "process.manager@company.com",
            password: defaultPassword,
            position: "Process Manager",
            department: "Operations",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Process Management",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            performance_appraisal_score: 81,
            is_managerial: true,
            status: true
        },
        {
            employee_id: "MGR010",
            first_name: "Olivia",
            last_name: "QualityManager",
            user: "mgr010",
            username: "mgr010",
            email: "quality.manager@company.com",
            password: defaultPassword,
            position: "Quality Control Manager",
            department: "Operations",
            roles: ["manager", "user"],
            level: "manager",
            job_grade: "M2",
            function: "Quality Control",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            performance_appraisal_score: 87,
            is_managerial: true,
            status: true
        },

        // Professional Level - IT Department (8 professionals)
        {
            employee_id: "EMP001",
            first_name: "Alice",
            last_name: "Developer",
            user: "emp001",
            username: "emp001",
            email: "alice.dev@company.com",
            password: defaultPassword,
            position: "Senior Developer",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Software Development",
            manager_id: "MGR001",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            performance_appraisal_score: 75,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP002",
            first_name: "Bob",
            last_name: "Analyst",
            user: "emp002",
            username: "emp002",
            email: "bob.analyst@company.com",
            password: defaultPassword,
            position: "System Analyst",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Software Development",
            manager_id: "MGR001",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            performance_appraisal_score: 78,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP003",
            first_name: "Charlie",
            last_name: "Tester",
            user: "emp003",
            username: "emp003",
            email: "charlie.test@company.com",
            password: defaultPassword,
            position: "QA Engineer",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "Quality Assurance",
            manager_id: "MGR002",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            performance_appraisal_score: 82,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP004",
            first_name: "Diana",
            last_name: "QALead",
            user: "emp004",
            username: "emp004",
            email: "diana.qa@company.com",
            password: defaultPassword,
            position: "QA Lead",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Quality Assurance",
            manager_id: "MGR002",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            performance_appraisal_score: 85,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP005",
            first_name: "Edward",
            last_name: "SysAdmin",
            user: "emp005",
            username: "emp005",
            email: "edward.admin@company.com",
            password: defaultPassword,
            position: "System Administrator",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "IT Infrastructure",
            manager_id: "MGR003",
            director_id: "DIR002",
            chief_id: "CHIEF001",
            performance_appraisal_score: 79,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP006",
            first_name: "Faye",
            last_name: "Network",
            user: "emp006",
            username: "emp006",
            email: "faye.network@company.com",
            password: defaultPassword,
            position: "Network Engineer",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "IT Infrastructure",
            manager_id: "MGR003",
            director_id: "DIR002",
            chief_id: "CHIEF001",
            performance_appraisal_score: 77,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP007",
            first_name: "George",
            last_name: "Security",
            user: "emp007",
            username: "emp007",
            email: "george.sec@company.com",
            password: defaultPassword,
            position: "Security Analyst",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "IT Security",
            manager_id: "MGR004",
            director_id: "DIR002",
            chief_id: "CHIEF001",
            performance_appraisal_score: 83,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP008",
            first_name: "Grace",
            last_name: "SecOps",
            user: "emp008",
            username: "emp008",
            email: "grace.secops@company.com",
            password: defaultPassword,
            position: "SecOps Engineer",
            department: "Information Technology",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "IT Security",
            manager_id: "MGR004",
            director_id: "DIR002",
            chief_id: "CHIEF001",
            performance_appraisal_score: 80,
            is_managerial: false,
            status: true
        },

        // Professional Level - HR Department (4 professionals)
        {
            employee_id: "EMP009",
            first_name: "Henry",
            last_name: "Recruiter",
            user: "emp009",
            username: "emp009",
            email: "henry.recruit@company.com",
            password: defaultPassword,
            position: "Senior Recruiter",
            department: "Human Resources",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Talent Acquisition",
            manager_id: "MGR005",
            director_id: "DIR003",
            chief_id: "CHIEF001",
            performance_appraisal_score: 76,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP010",
            first_name: "Iris",
            last_name: "HRSpecialist",
            user: "emp010",
            username: "emp010",
            email: "iris.hr@company.com",
            password: defaultPassword,
            position: "HR Specialist",
            department: "Human Resources",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "Talent Acquisition",
            manager_id: "MGR005",
            director_id: "DIR003",
            chief_id: "CHIEF001",
            performance_appraisal_score: 74,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP011",
            first_name: "Jack",
            last_name: "CompAnalyst",
            user: "emp011",
            username: "emp011",
            email: "jack.comp@company.com",
            password: defaultPassword,
            position: "Compensation Analyst",
            department: "Human Resources",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Compensation & Benefits",
            manager_id: "MGR006",
            director_id: "DIR003",
            chief_id: "CHIEF001",
            performance_appraisal_score: 81,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP012",
            first_name: "Julia",
            last_name: "Benefits",
            user: "emp012",
            username: "emp012",
            email: "julia.benefits@company.com",
            password: defaultPassword,
            position: "Benefits Specialist",
            department: "Human Resources",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "Compensation & Benefits",
            manager_id: "MGR006",
            director_id: "DIR003",
            chief_id: "CHIEF001",
            performance_appraisal_score: 77,
            is_managerial: false,
            status: true
        },

        // Professional Level - Finance Department (6 professionals)
        {
            employee_id: "EMP013",
            first_name: "Kevin",
            last_name: "Accountant",
            user: "emp013",
            username: "emp013",
            email: "kevin.account@company.com",
            password: defaultPassword,
            position: "Senior Accountant",
            department: "Finance",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Accounting",
            manager_id: "MGR007",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 84,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP014",
            first_name: "Laura",
            last_name: "FinAnalyst",
            user: "emp014",
            username: "emp014",
            email: "laura.finance@company.com",
            password: defaultPassword,
            position: "Financial Analyst",
            department: "Finance",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Accounting",
            manager_id: "MGR007",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 86,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP015",
            first_name: "Mike",
            last_name: "Auditor",
            user: "emp015",
            username: "emp015",
            email: "mike.audit@company.com",
            password: defaultPassword,
            position: "Internal Auditor",
            department: "Finance",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Accounting",
            manager_id: "MGR007",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 79,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP016",
            first_name: "Nancy",
            last_name: "Treasury",
            user: "emp016",
            username: "emp016",
            email: "nancy.treasury@company.com",
            password: defaultPassword,
            position: "Treasury Analyst",
            department: "Finance",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "Treasury",
            manager_id: "MGR008",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 75,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP017",
            first_name: "Oliver",
            last_name: "CashMgmt",
            user: "emp017",
            username: "emp017",
            email: "oliver.cash@company.com",
            password: defaultPassword,
            position: "Cash Management Specialist",
            department: "Finance",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "Treasury",
            manager_id: "MGR008",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 73,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP018",
            first_name: "Patricia",
            last_name: "Risk",
            user: "emp018",
            username: "emp018",
            email: "patricia.risk@company.com",
            password: defaultPassword,
            position: "Risk Analyst",
            department: "Finance",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Treasury",
            manager_id: "MGR008",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            performance_appraisal_score: 88,
            is_managerial: false,
            status: true
        },

        // Professional Level - Operations Department (5 professionals)
        {
            employee_id: "EMP019",
            first_name: "Quinn",
            last_name: "ProcessAnalyst",
            user: "emp019",
            username: "emp019",
            email: "quinn.process@company.com",
            password: defaultPassword,
            position: "Process Analyst",
            department: "Operations",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "Process Management",
            manager_id: "MGR009",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            performance_appraisal_score: 76,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP020",
            first_name: "Rachel",
            last_name: "Improvement",
            user: "emp020",
            username: "emp020",
            email: "rachel.improve@company.com",
            password: defaultPassword,
            position: "Process Improvement Specialist",
            department: "Operations",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Process Management",
            manager_id: "MGR009",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            performance_appraisal_score: 82,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP021",
            first_name: "Sam",
            last_name: "QualityControl",
            user: "emp021",
            username: "emp021",
            email: "sam.quality@company.com",
            password: defaultPassword,
            position: "Quality Control Specialist",
            department: "Operations",
            roles: ["user"],
            level: "professional",
            job_grade: "P2",
            function: "Quality Control",
            manager_id: "MGR010",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            performance_appraisal_score: 78,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP022",
            first_name: "Tina",
            last_name: "QAOps",
            user: "emp022",
            username: "emp022",
            email: "tina.qaops@company.com",
            password: defaultPassword,
            position: "QA Operations Specialist",
            department: "Operations",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Quality Control",
            manager_id: "MGR010",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            performance_appraisal_score: 85,
            is_managerial: false,
            status: true
        },
        {
            employee_id: "EMP023",
            first_name: "Uma",
            last_name: "Compliance",
            user: "emp023",
            username: "emp023",
            email: "uma.compliance@company.com",
            password: defaultPassword,
            position: "Compliance Officer",
            department: "Operations",
            roles: ["user"],
            level: "professional",
            job_grade: "P3",
            function: "Quality Control",
            manager_id: "MGR010",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            performance_appraisal_score: 80,
            is_managerial: false,
            status: true
        }
    ];

    await User.insertMany(users);
    console.log(`✅ Created ${users.length} users`);

    // Display hierarchy summary
    console.log("\n📊 User Hierarchy Summary:");
    console.log("  • 1 System Admin");
    console.log("  • 1 Chief Executive");
    console.log("  • 5 Directors");
    console.log("  • 10 Managers");
    console.log("  • 23 Professionals");
};

// Create active voting period
const createVotingPeriod = async () => {
    console.log("\n📅 Creating voting period...");

    const votingPeriod = {
        period_id: "VP2024Q4",
        period_name: "Q4 2024 Performance Excellence Awards",
        description: "Annual Q4 performance excellence recognition for outstanding employees",
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        allow_peer_voting: true,
        allow_manager_voting: true,
        allow_director_voting: true,
        require_chief_approval: true,
        target_departments: ["Information Technology", "Human Resources", "Finance", "Operations"],
        target_functions: [
            "Software Development", "Quality Assurance", "IT Infrastructure", "IT Security",
            "Talent Acquisition", "Compensation & Benefits",
            "Accounting", "Treasury",
            "Process Management", "Quality Control"
        ],
        quota_per_function: 1,
        status: "active",
        total_candidates: 0,
        created_by: "ADMIN001"
    };

    const created = await VotingPeriod.create(votingPeriod);
    console.log(`✅ Created voting period: ${created.period_name}`);
    return created;
};

// Create candidates (eligible employees for voting)
const createCandidates = async (votingPeriodId) => {
    console.log("\n🎯 Creating candidates...");

    // Select high-performing professionals and managers as candidates
    const candidates = [
        // IT Department Candidates
        {
            employee_id: "EMP001",
            first_name: "Alice",
            last_name: "Developer",
            department: "Information Technology",
            position: "Senior Developer",
            level: "professional",
            performance_appraisal_score: 75,
            performance_weighted: 37.5, // 75 * 0.5
            manager_id: "MGR001",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "EMP003",
            first_name: "Charlie",
            last_name: "Tester",
            department: "Information Technology",
            position: "QA Engineer",
            level: "professional",
            performance_appraisal_score: 82,
            performance_weighted: 41, // 82 * 0.5
            manager_id: "MGR002",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "EMP004",
            first_name: "Diana",
            last_name: "QALead",
            department: "Information Technology",
            position: "QA Lead",
            level: "professional",
            performance_appraisal_score: 85,
            performance_weighted: 42.5, // 85 * 0.5
            manager_id: "MGR002",
            director_id: "DIR001",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "EMP007",
            first_name: "George",
            last_name: "Security",
            department: "Information Technology",
            position: "Security Analyst",
            level: "professional",
            performance_appraisal_score: 83,
            performance_weighted: 41.5, // 83 * 0.5
            manager_id: "MGR004",
            director_id: "DIR002",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },

        // HR Department Candidates
        {
            employee_id: "EMP011",
            first_name: "Jack",
            last_name: "CompAnalyst",
            department: "Human Resources",
            position: "Compensation Analyst",
            level: "professional",
            performance_appraisal_score: 81,
            performance_weighted: 40.5, // 81 * 0.5
            manager_id: "MGR006",
            director_id: "DIR003",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },

        // Finance Department Candidates
        {
            employee_id: "EMP013",
            first_name: "Kevin",
            last_name: "Accountant",
            department: "Finance",
            position: "Senior Accountant",
            level: "professional",
            performance_appraisal_score: 84,
            performance_weighted: 42, // 84 * 0.5
            manager_id: "MGR007",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "EMP014",
            first_name: "Laura",
            last_name: "FinAnalyst",
            department: "Finance",
            position: "Financial Analyst",
            level: "professional",
            performance_appraisal_score: 86,
            performance_weighted: 43, // 86 * 0.5
            manager_id: "MGR007",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "EMP018",
            first_name: "Patricia",
            last_name: "Risk",
            department: "Finance",
            position: "Risk Analyst",
            level: "professional",
            performance_appraisal_score: 88,
            performance_weighted: 44, // 88 * 0.5
            manager_id: "MGR008",
            director_id: "DIR004",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },

        // Operations Department Candidates
        {
            employee_id: "EMP020",
            first_name: "Rachel",
            last_name: "Improvement",
            department: "Operations",
            position: "Process Improvement Specialist",
            level: "professional",
            performance_appraisal_score: 82,
            performance_weighted: 41, // 82 * 0.5
            manager_id: "MGR009",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "EMP022",
            first_name: "Tina",
            last_name: "QAOps",
            department: "Operations",
            position: "QA Operations Specialist",
            level: "professional",
            performance_appraisal_score: 85,
            performance_weighted: 42.5, // 85 * 0.5
            manager_id: "MGR010",
            director_id: "DIR005",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },

        // Managerial Candidates (for director voting)
        {
            employee_id: "MGR002",
            first_name: "Maria",
            last_name: "QAManager",
            department: "Information Technology",
            position: "QA Manager",
            level: "manager",
            performance_appraisal_score: 85,
            performance_weighted: 42.5, // 85 * 0.5
            manager_id: null,
            director_id: "DIR001",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "MGR004",
            first_name: "Monica",
            last_name: "SecurityManager",
            department: "Information Technology",
            position: "Security Manager",
            level: "manager",
            performance_appraisal_score: 88,
            performance_weighted: 44, // 88 * 0.5
            manager_id: null,
            director_id: "DIR002",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "MGR007",
            first_name: "Frederick",
            last_name: "AccountingManager",
            department: "Finance",
            position: "Accounting Manager",
            level: "manager",
            performance_appraisal_score: 86,
            performance_weighted: 43, // 86 * 0.5
            manager_id: null,
            director_id: "DIR004",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        },
        {
            employee_id: "MGR010",
            first_name: "Olivia",
            last_name: "QualityManager",
            department: "Operations",
            position: "Quality Control Manager",
            level: "manager",
            performance_appraisal_score: 87,
            performance_weighted: 43.5, // 87 * 0.5
            manager_id: null,
            director_id: "DIR005",
            chief_id: "CHIEF001",
            voting_period_id: votingPeriodId,
            is_active: true,
            registered_By: "ADMIN001"
        }
    ];

    await Candidate.insertMany(candidates);
    console.log(`✅ Created ${candidates.length} candidates`);

    // Update voting period with candidate count
    await VotingPeriod.findOneAndUpdate(
        { period_id: votingPeriodId },
        { total_candidates: candidates.length }
    );
};

// Create sample votes for demonstration
const createSampleVotes = async (votingPeriodId) => {
    console.log("\n🗳️ Creating sample votes...");

    const votes = [
        // Peer votes for IT professionals
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP001",
            voter_id: "EMP002",
            vote_type: "peer_rating",
            score: 40,
            comments: "Excellent teamwork and code quality"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP001",
            voter_id: "EMP003",
            vote_type: "peer_rating",
            score: 38,
            comments: "Great problem-solving skills"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP003",
            voter_id: "EMP001",
            vote_type: "peer_rating",
            score: 42,
            comments: "Thorough testing approach"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP003",
            voter_id: "EMP004",
            vote_type: "peer_rating",
            score: 44,
            comments: "Excellent attention to detail"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP004",
            voter_id: "EMP003",
            vote_type: "peer_rating",
            score: 45,
            comments: "Outstanding QA leadership"
        },

        // Manager votes for their professionals
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP001",
            voter_id: "MGR001",
            vote_type: "manager_rating",
            score: 40,
            comments: "Consistently delivers high-quality code"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP003",
            voter_id: "MGR002",
            vote_type: "manager_rating",
            score: 43,
            comments: "Excellent testing coverage and bug detection"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP004",
            voter_id: "MGR002",
            vote_type: "manager_rating",
            score: 45,
            comments: "Shows leadership potential in QA team"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP007",
            voter_id: "MGR004",
            vote_type: "manager_rating",
            score: 42,
            comments: "Proactive in identifying security vulnerabilities"
        },

        // Finance department votes
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP013",
            voter_id: "EMP014",
            vote_type: "peer_rating",
            score: 41,
            comments: "Reliable and accurate in financial reporting"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP014",
            voter_id: "EMP013",
            vote_type: "peer_rating",
            score: 43,
            comments: "Excellent analytical skills"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP013",
            voter_id: "MGR007",
            vote_type: "manager_rating",
            score: 42,
            comments: "Strong accounting expertise"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP014",
            voter_id: "MGR007",
            vote_type: "manager_rating",
            score: 44,
            comments: "Outstanding financial analysis and reporting"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "EMP018",
            voter_id: "MGR008",
            vote_type: "manager_rating",
            score: 46,
            comments: "Exceptional risk management capabilities"
        },

        // Director votes for managers
        {
            voting_period_id: votingPeriodId,
            candidate_id: "MGR002",
            voter_id: "DIR001",
            vote_type: "director_rating",
            score: 44,
            comments: "Excellent team leadership and quality focus"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "MGR004",
            voter_id: "DIR002",
            vote_type: "director_rating",
            score: 45,
            comments: "Strong security governance and risk management"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "MGR007",
            voter_id: "DIR004",
            vote_type: "director_rating",
            score: 43,
            comments: "Reliable financial management and reporting"
        },
        {
            voting_period_id: votingPeriodId,
            candidate_id: "MGR010",
            voter_id: "DIR005",
            vote_type: "director_rating",
            score: 44,
            comments: "Consistent quality improvements across operations"
        }
    ];

    // Calculate weighted scores
    for (const vote of votes) {
        let weight = 0;
        switch (vote.vote_type) {
            case "peer_rating":
                weight = 0.2; // 20% weight
                break;
            case "manager_rating":
                weight = 0.3; // 30% weight for non-managers, 50% for managers
                break;
            case "director_rating":
                weight = 0.5; // 50% weight for manager evaluation
                break;
        }
        vote.weighted_score = vote.score * weight;
    }

    await HierarchicalVoting.insertMany(votes);
    console.log(`✅ Created ${votes.length} sample votes`);
};

// Create performance appraisals
const createPerformanceAppraisals = async () => {
    console.log("\n📊 Creating performance appraisals...");

    const users = await User.find({ level: { $ne: "chief" } });
    const appraisals = users.map(user => ({
        employee_id: user.employee_id,
        appraisal_period: "Q4-2024",
        performance_score: user.performance_appraisal_score,
        manager_rating: user.level === "professional" ? Math.floor(Math.random() * 10) + 35 : Math.floor(Math.random() * 10) + 40,
        peer_rating: user.level === "professional" ? Math.floor(Math.random() * 10) + 30 : null,
        weighted_total: user.performance_appraisal_score,
        status: "completed",
        created_by: user.manager_id || user.director_id || "CHIEF001",
        created_at: new Date()
    }));

    await PerformanceAppraisal.insertMany(appraisals);
    console.log(`✅ Created ${appraisals.length} performance appraisals`);
};

// Main execution function
const rebuildDatabase = async () => {
    try {
        console.log("🚀 Starting complete database rebuild...\n");
        console.log("═".repeat(50));

        // Connect to database
        await connectDB();

        // Drop existing database
        await dropDatabase();

        // Create fresh data
        await createDepartments();
        await createUsers();
        const votingPeriod = await createVotingPeriod();
        await createCandidates(votingPeriod.period_id);
        await createSampleVotes(votingPeriod.period_id);
        await createPerformanceAppraisals();

        console.log("\n═".repeat(50));
        console.log("✅ DATABASE REBUILD COMPLETED SUCCESSFULLY!");
        console.log("═".repeat(50));

        console.log("\n📋 Summary:");
        console.log("  • Database: voting_system");
        console.log("  • Admin Login: admin / Test@123");
        console.log("  • Chief Login: chief001 / Test@123");
        console.log("  • Director Login: dir001 / Test@123");
        console.log("  • Manager Login: mgr001 / Test@123");
        console.log("  • Employee Login: emp001 / Test@123");
        console.log("\n  • Active Voting Period: Q4 2024 Performance Excellence Awards");
        console.log("  • Total Candidates: 14 (10 professionals, 4 managers)");
        console.log("  • Sample Votes Created: Yes");

        console.log("\n🔑 Key Features:");
        console.log("  • Hierarchical voting system (Chief -> Director -> Manager -> Professional)");
        console.log("  • Admin can register employees and candidates");
        console.log("  • Excel import functionality ready for both employees and candidates");
        console.log("  • No qualification criteria - candidates are directly eligible");
        console.log("  • Weighted scoring system implemented");
        console.log("  • Chief approval workflow in place");

        console.log("\n═".repeat(50));

    } catch (error) {
        console.error("\n❌ DATABASE REBUILD FAILED:", error);
        console.error(error.stack);
    } finally {
        await mongoose.connection.close();
        console.log("\n🔌 Database connection closed");
        process.exit(0);
    }
};

// Execute the rebuild
rebuildDatabase();