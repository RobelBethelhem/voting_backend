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

const fixManagerHierarchy = async () => {
    try {
        await connectDB();

        console.log('🔧 FIXING MANAGER HIERARCHY');
        console.log('===========================\n');

        // Define proper hierarchical structure
        const hierarchyConfig = {
            'Credit Appraisal': {
                director: 'DIR001',        // Dawit Alemayehu
                primaryManager: 'MGR001',  // Metasebia Tadesse (Senior Credit Manager)
                secondaryManager: 'MGR002' // Yohannes Gebru (Credit Analysis Manager)
            },
            'Credit Portfolio Management': {
                director: 'DIR002',        // Sara Bekele
                primaryManager: 'MGR003',  // Belaynesh Mekonnen (Portfolio Risk Manager)
                secondaryManager: 'MGR004' // Getnet Assefa (Collection Manager)
            },
            'Risk Management': {
                director: 'DIR003',        // Tadesse Wolde
                primaryManager: 'MGR005',  // Alemtsehay Teshome (Market Risk Manager)
                secondaryManager: 'MGR006' // Solomon Mulugeta (Operational Risk Manager)
            },
            'Operations': {
                director: 'DIR004',        // Hanan Ahmed
                primaryManager: 'MGR007',  // Tigist Kebede (Operations Manager)
                secondaryManager: 'MGR008' // Berhanu Sisay (Process Manager)
            }
        };

        console.log('📋 IMPLEMENTING PROPER HIERARCHY:');
        console.log('=================================\n');

        for (const [deptName, config] of Object.entries(hierarchyConfig)) {
            console.log(`🏢 ${deptName.toUpperCase()}:`);

            // 1. Set Director hierarchy
            const director = await User.findOne({ employee_id: config.director });
            if (director) {
                await User.updateOne(
                    { employee_id: config.director },
                    {
                        manager_id: 'CHIEF001', // Reports to Chief
                        reports_to: 'CHIEF001'
                    }
                );
                console.log(`   🎯 Director ${director.first_name} ${director.last_name} → Reports to CHIEF`);
            }

            // 2. Set Primary Manager hierarchy
            const primaryManager = await User.findOne({ employee_id: config.primaryManager });
            if (primaryManager) {
                await User.updateOne(
                    { employee_id: config.primaryManager },
                    {
                        manager_id: config.director,
                        reports_to: config.director
                    }
                );
                console.log(`   👔 Primary Manager ${primaryManager.first_name} ${primaryManager.last_name} → Reports to Director`);
            }

            // 3. Set Secondary Manager hierarchy
            const secondaryManager = await User.findOne({ employee_id: config.secondaryManager });
            if (secondaryManager) {
                await User.updateOne(
                    { employee_id: config.secondaryManager },
                    {
                        manager_id: config.primaryManager,
                        reports_to: config.primaryManager
                    }
                );
                console.log(`   👔 Secondary Manager ${secondaryManager.first_name} ${secondaryManager.last_name} → Reports to Primary Manager`);
            }

            // 4. Set ALL CANDIDATES to report to PRIMARY MANAGER
            const candidates = await User.find({
                department: deptName,
                status: false,
                roles: { $in: ['user'] }
            });

            console.log(`   🏆 Assigning all ${candidates.length} candidates to Primary Manager:`);
            for (const candidate of candidates) {
                await User.updateOne(
                    { employee_id: candidate.employee_id },
                    {
                        manager_id: config.primaryManager,
                        reports_to: config.primaryManager
                    }
                );
                console.log(`      - ${candidate.first_name} ${candidate.last_name} (${candidate.employee_id}) → ${config.primaryManager}`);
            }

            console.log('');
        }

        // 5. Fix Executive and IT hierarchy
        console.log('🏛️ EXECUTIVE & IT HIERARCHY:');
        console.log('=============================');

        // Chiefs report to themselves or CEO (top level)
        await User.updateMany(
            { roles: { $in: ['chief'] } },
            {
                manager_id: null,
                reports_to: null
            }
        );
        console.log('   👑 Chiefs set as top-level (no manager)');

        // Admin reports to Chief
        await User.updateOne(
            { employee_id: 'ADMIN001' },
            {
                manager_id: 'CHIEF001',
                reports_to: 'CHIEF001'
            }
        );
        console.log('   🔧 Admin reports to Chief Risk Officer');

        console.log('\n🔍 VERIFICATION - UPDATED HIERARCHY:');
        console.log('====================================\n');

        // Verify the fixed hierarchy
        for (const [deptName, config] of Object.entries(hierarchyConfig)) {
            console.log(`🏢 ${deptName.toUpperCase()}:`);

            const deptUsers = await User.find({ department: deptName }).sort({ roles: 1 });

            deptUsers.forEach(user => {
                const roleDisplay = user.roles.includes('director') ? '🎯 Director' :
                                   user.roles.includes('manager') ? '👔 Manager' :
                                   user.status === false ? '🏆 Candidate' : '👤 Employee';

                console.log(`   ${roleDisplay}: ${user.first_name} ${user.last_name} (${user.employee_id})`);
                console.log(`      Manager ID: ${user.manager_id || 'NULL'}`);
                console.log(`      Reports To: ${user.reports_to || 'NULL'}`);
                if (user.status === false) {
                    console.log(`      Performance: ${user.performance_appraisal_score}/100`);
                }
                console.log('');
            });
        }

        // Display final hierarchy chart
        console.log('📊 FINAL ORGANIZATIONAL CHART:');
        console.log('===============================\n');

        console.log('👑 CHIEF LEVEL');
        console.log('├── Abraham Tekle (CHIEF001) - Chief Risk Officer');
        console.log('├── Meron Haile (CHIEF002) - Chief Credit Officer');
        console.log('│');
        console.log('🎯 DIRECTOR LEVEL');
        for (const [deptName, config] of Object.entries(hierarchyConfig)) {
            const director = await User.findOne({ employee_id: config.director });
            console.log(`├── ${director.first_name} ${director.last_name} (${config.director}) - ${deptName}`);

            const primaryManager = await User.findOne({ employee_id: config.primaryManager });
            const secondaryManager = await User.findOne({ employee_id: config.secondaryManager });
            console.log(`│   ├── ${primaryManager.first_name} ${primaryManager.last_name} (${config.primaryManager}) - Primary Manager`);
            console.log(`│   │   ├── ${secondaryManager.first_name} ${secondaryManager.last_name} (${config.secondaryManager}) - Secondary Manager`);

            const candidates = await User.find({
                department: deptName,
                status: false,
                roles: { $in: ['user'] }
            });
            candidates.forEach(candidate => {
                console.log(`│   │   ├── ${candidate.first_name} ${candidate.last_name} (${candidate.employee_id}) - Candidate`);
            });
            console.log('│');
        }

        console.log('\n✅ HIERARCHY BENEFITS:');
        console.log('======================');
        console.log('✅ Each department has ONE primary manager for all candidates');
        console.log('✅ Clear reporting structure: Chief → Director → Primary Manager → Candidates');
        console.log('✅ Secondary managers report to primary managers');
        console.log('✅ Consistent manager_id assignment within departments');
        console.log('✅ Proper hierarchical voting authority');

        await mongoose.disconnect();
        console.log('\n🎉 Manager hierarchy fixed successfully!');

    } catch (error) {
        console.error('❌ Error fixing hierarchy:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
fixManagerHierarchy();