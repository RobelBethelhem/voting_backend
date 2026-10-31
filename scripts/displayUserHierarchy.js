import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';

config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

const displayUserHierarchy = async () => {
    try {
        await connectDB();

        console.log('🏛️ ZEMEN BANK HIERARCHICAL VOTING SYSTEM - USER STRUCTURE');
        console.log('================================================================\n');

        // Get all users and organize by role
        const allUsers = await User.find({}).sort({ roles: 1, department: 1, first_name: 1 });

        // Organize users by hierarchy levels
        const hierarchy = {
            admin: [],
            chief: [],
            director: [],
            manager: [],
            user: []
        };

        // Categorize users by primary role
        allUsers.forEach(user => {
            const primaryRole = user.roles[0]; // First role is primary
            if (hierarchy[primaryRole]) {
                hierarchy[primaryRole].push(user);
            }
        });

        // Display hierarchy levels
        console.log('📊 ORGANIZATIONAL HIERARCHY:');
        console.log('============================\n');

        // Level 1: System Administration
        console.log('🔧 LEVEL 1: SYSTEM ADMINISTRATION');
        console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ Role: ADMIN                                                                                 │');
        console.log('│ Permissions: Full system access, user management, voting configuration                     │');
        console.log('│ Voting Rights: View all results, manage candidates, system oversight                       │');
        console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');

        if (hierarchy.admin.length > 0) {
            hierarchy.admin.forEach((user, index) => {
                console.log(`   ${index + 1}. ${user.first_name} ${user.last_name}`);
                console.log(`      📋 Employee ID: ${user.employee_id}`);
                console.log(`      📧 Email: ${user.email || user.user}`);
                console.log(`      🏢 Department: ${user.department}`);
                console.log(`      💼 Position: ${user.position}`);
                console.log(`      📊 Status: ${user.status ? 'Active Voter' : 'Candidate'}`);
                console.log('');
            });
        }

        // Level 2: Executive Leadership
        console.log('👑 LEVEL 2: EXECUTIVE LEADERSHIP (CHIEF)');
        console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ Role: CHIEF                                                                                 │');
        console.log('│ Permissions: Final approval authority, strategic oversight                                  │');
        console.log('│ Voting Rights: Review and approve all ratings, final decision authority                    │');
        console.log('│ Hierarchy: Can review Director, Manager, and Employee performance                          │');
        console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');

        if (hierarchy.chief.length > 0) {
            hierarchy.chief.forEach((user, index) => {
                console.log(`   ${index + 1}. ${user.first_name} ${user.last_name}`);
                console.log(`      📋 Employee ID: ${user.employee_id}`);
                console.log(`      📧 Email: ${user.email || user.user}`);
                console.log(`      🏢 Department: ${user.department}`);
                console.log(`      💼 Position: ${user.position}`);
                console.log(`      📊 Status: ${user.status ? 'Active Voter' : 'Candidate'}`);
                console.log('');
            });
        }

        // Level 3: Department Directors
        console.log('🎯 LEVEL 3: DEPARTMENT DIRECTORS');
        console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ Role: DIRECTOR                                                                              │');
        console.log('│ Permissions: Department-level authority, manager oversight                                  │');
        console.log('│ Voting Rights: Rate candidates in their department (0-50 points)                          │');
        console.log('│ Hierarchy: Supervise Managers, oversee department voting process                           │');
        console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');

        const deptDirectors = {};
        if (hierarchy.director.length > 0) {
            hierarchy.director.forEach(user => {
                if (!deptDirectors[user.department]) {
                    deptDirectors[user.department] = [];
                }
                deptDirectors[user.department].push(user);
            });

            Object.keys(deptDirectors).forEach(dept => {
                console.log(`   📂 ${dept.toUpperCase()} DEPARTMENT:`);
                deptDirectors[dept].forEach((user, index) => {
                    console.log(`      ${index + 1}. ${user.first_name} ${user.last_name}`);
                    console.log(`         📋 Employee ID: ${user.employee_id}`);
                    console.log(`         📧 Email: ${user.email || user.user}`);
                    console.log(`         💼 Position: ${user.position}`);
                    console.log(`         📊 Status: ${user.status ? 'Active Voter' : 'Candidate'}`);
                    console.log('');
                });
            });
        }

        // Level 4: Department Managers
        console.log('👔 LEVEL 4: DEPARTMENT MANAGERS');
        console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ Role: MANAGER                                                                               │');
        console.log('│ Permissions: Team management, direct employee oversight                                     │');
        console.log('│ Voting Rights: Rate candidates in their department (0-50 points)                          │');
        console.log('│ Hierarchy: Direct supervisors of candidates, peer reviewers                                │');
        console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');

        const deptManagers = {};
        if (hierarchy.manager.length > 0) {
            hierarchy.manager.forEach(user => {
                if (!deptManagers[user.department]) {
                    deptManagers[user.department] = [];
                }
                deptManagers[user.department].push(user);
            });

            Object.keys(deptManagers).forEach(dept => {
                console.log(`   📂 ${dept.toUpperCase()} DEPARTMENT:`);
                deptManagers[dept].forEach((user, index) => {
                    console.log(`      ${index + 1}. ${user.first_name} ${user.last_name}`);
                    console.log(`         📋 Employee ID: ${user.employee_id}`);
                    console.log(`         📧 Email: ${user.email || user.user}`);
                    console.log(`         💼 Position: ${user.position}`);
                    console.log(`         📊 Status: ${user.status ? 'Active Voter' : 'Candidate'}`);
                    console.log('');
                });
            });
        }

        // Level 5: Candidates (Users being evaluated)
        console.log('🏆 LEVEL 5: CANDIDATES (EMPLOYEES BEING EVALUATED)');
        console.log('┌─────────────────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ Role: USER (Candidate Status)                                                              │');
        console.log('│ Permissions: Limited system access during evaluation period                                │');
        console.log('│ Voting Rights: Cannot vote (being evaluated)                                               │');
        console.log('│ Hierarchy: Bottom level - subject to performance evaluation                                │');
        console.log('└─────────────────────────────────────────────────────────────────────────────────────────┘');

        // Get candidates (status: false)
        const candidates = await User.find({ status: false, roles: { $in: ['user'] } }).sort({ department: 1, first_name: 1 });

        const deptCandidates = {};
        candidates.forEach(user => {
            if (!deptCandidates[user.department]) {
                deptCandidates[user.department] = [];
            }
            deptCandidates[user.department].push(user);
        });

        Object.keys(deptCandidates).forEach(dept => {
            console.log(`   📂 ${dept.toUpperCase()} DEPARTMENT:`);
            deptCandidates[dept].forEach((user, index) => {
                console.log(`      ${index + 1}. ${user.first_name} ${user.last_name}`);
                console.log(`         📋 Employee ID: ${user.employee_id}`);
                console.log(`         📧 Email: ${user.email || user.user}`);
                console.log(`         💼 Position: ${user.position}`);
                console.log(`         📊 Performance Score: ${user.performance_appraisal_score}/100`);
                console.log(`         📊 Status: CANDIDATE (being evaluated)`);
                console.log('');
            });
        });

        // Voting Authority Matrix
        console.log('⚖️ VOTING AUTHORITY MATRIX:');
        console.log('===========================\n');

        console.log('┌──────────────┬─────────────────────────────────────────────────────────────────┐');
        console.log('│ ROLE         │ VOTING AUTHORITY & RESPONSIBILITIES                             │');
        console.log('├──────────────┼─────────────────────────────────────────────────────────────────┤');
        console.log('│ ADMIN        │ • Full system oversight                                        │');
        console.log('│              │ • View all voting results                                      │');
        console.log('│              │ • Manage candidates and users                                  │');
        console.log('│              │ • Configure voting parameters                                  │');
        console.log('├──────────────┼─────────────────────────────────────────────────────────────────┤');
        console.log('│ CHIEF        │ • Final approval authority                                     │');
        console.log('│              │ • Review all department results                                │');
        console.log('│              │ • Override director decisions if needed                        │');
        console.log('│              │ • Strategic performance oversight                              │');
        console.log('├──────────────┼─────────────────────────────────────────────────────────────────┤');
        console.log('│ DIRECTOR     │ • Rate candidates in their department (0-50 points)           │');
        console.log('│              │ • Weight: 30% of total score                                   │');
        console.log('│              │ • Supervise manager ratings                                    │');
        console.log('│              │ • Department-level decision authority                           │');
        console.log('├──────────────┼─────────────────────────────────────────────────────────────────┤');
        console.log('│ MANAGER      │ • Rate candidates in their department (0-50 points)           │');
        console.log('│              │ • Weight: 30% of total score                                   │');
        console.log('│              │ • Conduct peer evaluations                                     │');
        console.log('│              │ • Direct employee oversight                                    │');
        console.log('├──────────────┼─────────────────────────────────────────────────────────────────┤');
        console.log('│ USER (Voter) │ • Peer voting on 8 criteria (1-5 scale each)                 │');
        console.log('│              │ • Weight: 20% of total score                                   │');
        console.log('│              │ • Can vote for candidates in same/related departments          │');
        console.log('│              │ • Collaborative evaluation process                             │');
        console.log('├──────────────┼─────────────────────────────────────────────────────────────────┤');
        console.log('│ CANDIDATE    │ • Subject to evaluation (cannot vote)                         │');
        console.log('│              │ • Performance Score: 50% of total (from appraisal)            │');
        console.log('│              │ • Receives ratings from all hierarchy levels                   │');
        console.log('│              │ • Final score calculation: Performance(50%) + Manager(30%) + Peer(20%) │');
        console.log('└──────────────┴─────────────────────────────────────────────────────────────────┘\n');

        // Department Summary
        console.log('🏢 DEPARTMENT STRUCTURE SUMMARY:');
        console.log('=================================\n');

        const deptSummary = {};
        allUsers.forEach(user => {
            if (!deptSummary[user.department]) {
                deptSummary[user.department] = {
                    chiefs: 0,
                    directors: 0,
                    managers: 0,
                    voters: 0,
                    candidates: 0,
                    total: 0
                };
            }

            deptSummary[user.department].total++;

            if (user.roles.includes('chief')) deptSummary[user.department].chiefs++;
            else if (user.roles.includes('director')) deptSummary[user.department].directors++;
            else if (user.roles.includes('manager')) deptSummary[user.department].managers++;
            else if (user.status === true) deptSummary[user.department].voters++;
            else if (user.status === false) deptSummary[user.department].candidates++;
        });

        Object.keys(deptSummary).forEach(dept => {
            const stats = deptSummary[dept];
            console.log(`📂 ${dept.toUpperCase()}:`);
            console.log(`   👑 Chiefs: ${stats.chiefs}`);
            console.log(`   🎯 Directors: ${stats.directors}`);
            console.log(`   👔 Managers: ${stats.managers}`);
            console.log(`   🗳️ Voters: ${stats.voters}`);
            console.log(`   🏆 Candidates: ${stats.candidates}`);
            console.log(`   📊 Total: ${stats.total}`);
            console.log('');
        });

        // Voting Flow
        console.log('🔄 HIERARCHICAL VOTING FLOW:');
        console.log('=============================\n');

        console.log('1. 📊 PERFORMANCE APPRAISAL (50% Weight)');
        console.log('   └── Pre-loaded performance scores (75.72 - 84.27/100)');
        console.log('   └── Automatically converted to /50 scale for calculations');
        console.log('');

        console.log('2. 👔 MANAGER/DIRECTOR RATING (30% Weight)');
        console.log('   └── Managers rate candidates in their department (0-50 points)');
        console.log('   └── Directors can override or supplement manager ratings');
        console.log('   └── Hierarchical approval process');
        console.log('');

        console.log('3. 🤝 PEER EVALUATION (20% Weight)');
        console.log('   └── Colleagues rate on 8 criteria (1-5 scale each):');
        console.log('       • Dedication');
        console.log('       • Quality of Work');
        console.log('       • Collaboration & Teamwork');
        console.log('       • Independence');
        console.log('       • Customer Service');
        console.log('       • Time Management');
        console.log('       • Office Attire & Dress Code');
        console.log('       • Flexibility');
        console.log('');

        console.log('4. 👑 CHIEF APPROVAL');
        console.log('   └── Final review and approval of all ratings');
        console.log('   └── Strategic oversight and decision authority');
        console.log('   └── Can adjust final scores if needed');
        console.log('');

        console.log('5. 🔢 FINAL CALCULATION');
        console.log('   └── Total Score = Performance(50%) + Manager(30%) + Peer(20%)');
        console.log('   └── Results displayed with full breakdown');
        console.log('   └── Ranking and analytics generated');

        await mongoose.disconnect();
        console.log('\n✅ User hierarchy analysis completed!');

    } catch (error) {
        console.error('❌ Error displaying hierarchy:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
displayUserHierarchy();