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

const checkManagerHierarchy = async () => {
    try {
        await connectDB();

        console.log('🔍 CHECKING MANAGER HIERARCHY ISSUES');
        console.log('====================================\n');

        // Get all users and analyze manager relationships
        const allUsers = await User.find({}).sort({ department: 1, roles: 1 });

        // Group by department
        const departments = {};
        allUsers.forEach(user => {
            if (!departments[user.department]) {
                departments[user.department] = {
                    directors: [],
                    managers: [],
                    employees: [],
                    candidates: []
                };
            }

            if (user.roles.includes('director')) {
                departments[user.department].directors.push(user);
            } else if (user.roles.includes('manager')) {
                departments[user.department].managers.push(user);
            } else if (user.status === false && user.roles.includes('user')) {
                departments[user.department].candidates.push(user);
            } else if (user.status === true && user.roles.includes('user')) {
                departments[user.department].employees.push(user);
            }
        });

        console.log('📊 CURRENT DEPARTMENT STRUCTURE:');
        console.log('=================================\n');

        Object.keys(departments).forEach(deptName => {
            const dept = departments[deptName];
            console.log(`🏢 ${deptName.toUpperCase()}:`);

            // Show directors
            if (dept.directors.length > 0) {
                console.log(`   🎯 Directors (${dept.directors.length}):`);
                dept.directors.forEach(director => {
                    console.log(`      - ${director.first_name} ${director.last_name} (${director.employee_id})`);
                    console.log(`        Manager ID: ${director.manager_id || 'NULL'}`);
                    console.log(`        Reports To: ${director.reports_to || 'NULL'}`);
                });
            }

            // Show managers and their manager_id conflicts
            if (dept.managers.length > 0) {
                console.log(`   👔 Managers (${dept.managers.length}):`);
                const managerIds = new Set();
                dept.managers.forEach(manager => {
                    console.log(`      - ${manager.first_name} ${manager.last_name} (${manager.employee_id})`);
                    console.log(`        Manager ID: ${manager.manager_id || 'NULL'}`);
                    console.log(`        Reports To: ${manager.reports_to || 'NULL'}`);
                    if (manager.manager_id) {
                        managerIds.add(manager.manager_id);
                    }
                });

                if (managerIds.size > 1) {
                    console.log(`   ⚠️  ISSUE: Multiple manager_ids found: [${Array.from(managerIds).join(', ')}]`);
                } else if (managerIds.size === 1) {
                    console.log(`   ✅ Single manager_id: ${Array.from(managerIds)[0]}`);
                }
            }

            // Show candidates and their manager assignments
            if (dept.candidates.length > 0) {
                console.log(`   🏆 Candidates (${dept.candidates.length}):`);
                const candidateManagerIds = new Set();
                dept.candidates.forEach(candidate => {
                    console.log(`      - ${candidate.first_name} ${candidate.last_name} (${candidate.employee_id})`);
                    console.log(`        Manager ID: ${candidate.manager_id || 'NULL'}`);
                    console.log(`        Reports To: ${candidate.reports_to || 'NULL'}`);
                    console.log(`        Performance: ${candidate.performance_appraisal_score}/100`);
                    if (candidate.manager_id) {
                        candidateManagerIds.add(candidate.manager_id);
                    }
                });

                if (candidateManagerIds.size > 1) {
                    console.log(`   ⚠️  ISSUE: Candidates have different manager_ids: [${Array.from(candidateManagerIds).join(', ')}]`);
                } else if (candidateManagerIds.size === 1) {
                    console.log(`   ✅ Candidates have consistent manager_id: ${Array.from(candidateManagerIds)[0]}`);
                } else {
                    console.log(`   ⚠️  ISSUE: No manager_id assigned to candidates`);
                }
            }

            console.log('');
        });

        console.log('🔧 PROPOSED HIERARCHICAL STRUCTURE FIX:');
        console.log('========================================\n');

        Object.keys(departments).forEach(deptName => {
            const dept = departments[deptName];
            console.log(`🏢 ${deptName.toUpperCase()}:`);

            if (dept.directors.length > 0) {
                const director = dept.directors[0]; // Use first director as primary
                console.log(`   🎯 Primary Director: ${director.first_name} ${director.last_name} (${director.employee_id})`);

                if (dept.managers.length > 0) {
                    const primaryManager = dept.managers[0]; // Use first manager as primary
                    console.log(`   👔 Primary Manager: ${primaryManager.first_name} ${primaryManager.last_name} (${primaryManager.employee_id})`);
                    console.log(`   📋 Suggested Hierarchy:`);
                    console.log(`      - Director reports to: CEO/Chief`);
                    console.log(`      - Primary Manager reports to: Director (${director.employee_id})`);

                    if (dept.managers.length > 1) {
                        console.log(`      - Other Managers report to: Primary Manager (${primaryManager.employee_id})`);
                        dept.managers.slice(1).forEach(manager => {
                            console.log(`        * ${manager.first_name} ${manager.last_name} → ${primaryManager.first_name} ${primaryManager.last_name}`);
                        });
                    }

                    if (dept.candidates.length > 0) {
                        console.log(`      - All Candidates report to: Primary Manager (${primaryManager.employee_id})`);
                        dept.candidates.forEach(candidate => {
                            console.log(`        * ${candidate.first_name} ${candidate.last_name} → ${primaryManager.first_name} ${primaryManager.last_name}`);
                        });
                    }
                }
            }
            console.log('');
        });

        console.log('🛠️  RECOMMENDATIONS:');
        console.log('=====================');
        console.log('1. Each department should have ONE primary manager');
        console.log('2. All candidates in a department should report to the same manager');
        console.log('3. Secondary managers should report to the primary manager');
        console.log('4. Consistent manager_id assignment within departments');
        console.log('5. Clear reporting hierarchy: Chief → Director → Primary Manager → Secondary Managers → Candidates');

        await mongoose.disconnect();
        console.log('\n✅ Manager hierarchy analysis completed!');

    } catch (error) {
        console.error('❌ Error checking hierarchy:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
checkManagerHierarchy();