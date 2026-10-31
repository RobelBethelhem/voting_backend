import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
import Department from '../models/rms/Department.js';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';

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

const fixHierarchicalStructure = async () => {
    try {
        await connectDB();

        console.log('🔧 Fixing Hierarchical Structure...\n');

        // **STEP 1: Fix Directors reporting to correct Chiefs**
        console.log('👑 Step 1: Updating Directors to report to correct Chiefs...');

        // Credit & Portfolio Management Directors → CHIEF002 (Chief Credit Officer)
        await User.updateMany(
            { employee_id: { $in: ['DIR001', 'DIR002'] } },
            { chief_id: 'CHIEF002' }
        );
        console.log('   ✅ DIR001 (Credit Appraisal) → CHIEF002 (Chief Credit Officer)');
        console.log('   ✅ DIR002 (Portfolio Management) → CHIEF002 (Chief Credit Officer)');

        // Risk & Operations Directors → CHIEF001 (Chief Risk Officer)
        await User.updateMany(
            { employee_id: { $in: ['DIR003', 'DIR004'] } },
            { chief_id: 'CHIEF001' }
        );
        console.log('   ✅ DIR003 (Risk Management) → CHIEF001 (Chief Risk Officer)');
        console.log('   ✅ DIR004 (Operations) → CHIEF001 (Chief Risk Officer)');

        // **STEP 2: Fix Managers reporting to correct Directors**
        console.log('\n🎯 Step 2: Updating Managers to report to correct Directors...');

        // Credit Appraisal Managers → DIR001
        await User.updateMany(
            { employee_id: { $in: ['MGR001', 'MGR002'] } },
            {
                director_id: 'DIR001',
                chief_id: 'CHIEF002'
            }
        );
        console.log('   ✅ MGR001, MGR002 (Credit Appraisal) → DIR001 → CHIEF002');

        // Portfolio Management Managers → DIR002
        await User.updateMany(
            { employee_id: { $in: ['MGR003', 'MGR004'] } },
            {
                director_id: 'DIR002',
                chief_id: 'CHIEF002'
            }
        );
        console.log('   ✅ MGR003, MGR004 (Portfolio Management) → DIR002 → CHIEF002');

        // Risk Management Managers → DIR003
        await User.updateMany(
            { employee_id: { $in: ['MGR005', 'MGR006'] } },
            {
                director_id: 'DIR003',
                chief_id: 'CHIEF001'
            }
        );
        console.log('   ✅ MGR005, MGR006 (Risk Management) → DIR003 → CHIEF001');

        // Operations Managers → DIR004
        await User.updateMany(
            { employee_id: { $in: ['MGR007', 'MGR008'] } },
            {
                director_id: 'DIR004',
                chief_id: 'CHIEF001'
            }
        );
        console.log('   ✅ MGR007, MGR008 (Operations) → DIR004 → CHIEF001');

        // **STEP 3: Fix Employees reporting to correct Managers within same department**
        console.log('\n👥 Step 3: Updating Employees to report to correct Managers...');

        // Credit Appraisal Employees
        await User.updateOne(
            { employee_id: 'EMP001' },
            {
                manager_id: 'MGR001',
                director_id: 'DIR001',
                chief_id: 'CHIEF002'
            }
        );
        await User.updateOne(
            { employee_id: 'EMP002' },
            {
                manager_id: 'MGR001',
                director_id: 'DIR001',
                chief_id: 'CHIEF002'
            }
        );
        await User.updateOne(
            { employee_id: 'EMP003' },
            {
                manager_id: 'MGR002',
                director_id: 'DIR001',
                chief_id: 'CHIEF002'
            }
        );
        console.log('   ✅ EMP001, EMP002 → MGR001; EMP003 → MGR002 (Credit Appraisal)');

        // Portfolio Management Employees
        await User.updateOne(
            { employee_id: 'EMP004' },
            {
                manager_id: 'MGR003',
                director_id: 'DIR002',
                chief_id: 'CHIEF002'
            }
        );
        await User.updateOne(
            { employee_id: 'EMP005' },
            {
                manager_id: 'MGR004',
                director_id: 'DIR002',
                chief_id: 'CHIEF002'
            }
        );
        console.log('   ✅ EMP004 → MGR003; EMP005 → MGR004 (Portfolio Management)');

        // Risk Management Employees
        await User.updateOne(
            { employee_id: 'EMP006' },
            {
                manager_id: 'MGR005',
                director_id: 'DIR003',
                chief_id: 'CHIEF001'
            }
        );
        await User.updateOne(
            { employee_id: 'EMP007' },
            {
                manager_id: 'MGR006',
                director_id: 'DIR003',
                chief_id: 'CHIEF001'
            }
        );
        console.log('   ✅ EMP006 → MGR005; EMP007 → MGR006 (Risk Management)');

        // Operations Employees
        await User.updateOne(
            { employee_id: 'EMP008' },
            {
                manager_id: 'MGR007',
                director_id: 'DIR004',
                chief_id: 'CHIEF001'
            }
        );
        await User.updateOne(
            { employee_id: 'EMP009' },
            {
                manager_id: 'MGR008',
                director_id: 'DIR004',
                chief_id: 'CHIEF001'
            }
        );
        await User.updateOne(
            { employee_id: 'EMP010' },
            {
                manager_id: 'MGR007',
                director_id: 'DIR004',
                chief_id: 'CHIEF001'
            }
        );
        console.log('   ✅ EMP008, EMP010 → MGR007; EMP009 → MGR008 (Operations)');

        // **STEP 4: Update Department Structure**
        console.log('\n🏢 Step 4: Updating Department Structure...');

        await Department.updateMany({}, { $unset: { manager_id: 1, director_id: 1, chief_id: 1 } });

        const departmentUpdates = [
            {
                filter: { department_name: 'Credit Appraisal' },
                update: {
                    manager_ids: ['MGR001', 'MGR002'],
                    director_id: 'DIR001',
                    chief_id: 'CHIEF002'
                }
            },
            {
                filter: { department_name: 'Credit Portfolio Management' },
                update: {
                    manager_ids: ['MGR003', 'MGR004'],
                    director_id: 'DIR002',
                    chief_id: 'CHIEF002'
                }
            },
            {
                filter: { department_name: 'Risk Management' },
                update: {
                    manager_ids: ['MGR005', 'MGR006'],
                    director_id: 'DIR003',
                    chief_id: 'CHIEF001'
                }
            },
            {
                filter: { department_name: 'Operations' },
                update: {
                    manager_ids: ['MGR007', 'MGR008'],
                    director_id: 'DIR004',
                    chief_id: 'CHIEF001'
                }
            }
        ];

        for (const dept of departmentUpdates) {
            await Department.updateOne(dept.filter, dept.update);
            console.log(`   ✅ ${dept.filter.department_name} Department updated`);
        }

        // **STEP 5: Update HierarchicalVote records**
        console.log('\n🗳️ Step 5: Updating Hierarchical Vote records...');

        const employees = await User.find({ roles: { $in: ['user'] } });

        for (const employee of employees) {
            const manager = employee.manager_id ?
                await User.findOne({ employee_id: employee.manager_id }) : null;
            const director = employee.director_id ?
                await User.findOne({ employee_id: employee.director_id }) : null;
            const chief = employee.chief_id ?
                await User.findOne({ employee_id: employee.chief_id }) : null;

            await HierarchicalVote.updateOne(
                { candidate_employee_id: employee.employee_id },
                {
                    $set: {
                        manager_id: employee.manager_id,
                        manager_name: manager ? `${manager.first_name} ${manager.last_name}` : "",
                        director_id: employee.director_id,
                        director_name: director ? `${director.first_name} ${director.last_name}` : "",
                        chief_id: employee.chief_id,
                        chief_name: chief ? `${chief.first_name} ${chief.last_name}` : "",
                        last_updated_by: 'HIERARCHY_FIX'
                    }
                }
            );

            console.log(`   ✅ Updated voting record for ${employee.first_name} ${employee.last_name}`);
        }

        console.log('\n📋 Final Hierarchical Structure:');
        console.log('=====================================');

        console.log('\n👑 CHIEF001 (Abraham Tekle - Chief Risk Officer)');
        console.log('   ├── 🎯 DIR003 (Tadesse Wolde - Risk Management)');
        console.log('   │   ├── 👨‍💼 MGR005 (Alemtsehay Teshome)');
        console.log('   │   │   └── 👥 EMP006 (Kidist Hailu)');
        console.log('   │   └── 👨‍💼 MGR006 (Solomon Mulugeta)');
        console.log('   │       └── 👥 EMP007 (Girma Woldemichael)');
        console.log('   └── 🎯 DIR004 (Hanan Ahmed - Operations)');
        console.log('       ├── 👨‍💼 MGR007 (Tigist Kebede)');
        console.log('       │   ├── 👥 EMP008 (Selamawit Desta)');
        console.log('       │   └── 👥 EMP010 (Hiwot Mengistu)');
        console.log('       └── 👨‍💼 MGR008 (Berhanu Sisay)');
        console.log('           └── 👥 EMP009 (Ephrem Kassaye)');

        console.log('\n👑 CHIEF002 (Meron Haile - Chief Credit Officer)');
        console.log('   ├── 🎯 DIR001 (Dawit Alemayehu - Credit Appraisal)');
        console.log('   │   ├── 👨‍💼 MGR001 (Metasebia Tadesse)');
        console.log('   │   │   ├── 👥 EMP001 (Mesay Nigussie)');
        console.log('   │   │   └── 👥 EMP002 (Nebiyat Aliyu)');
        console.log('   │   └── 👨‍💼 MGR002 (Yohannes Gebru)');
        console.log('   │       └── 👥 EMP003 (Daniel Tekeste)');
        console.log('   └── 🎯 DIR002 (Sara Bekele - Portfolio Management)');
        console.log('       ├── 👨‍💼 MGR003 (Belaynesh Mekonnen)');
        console.log('       │   └── 👥 EMP004 (Adugnaw Adamu)');
        console.log('       └── 👨‍💼 MGR004 (Getnet Assefa)');
        console.log('           └── 👥 EMP005 (Rahel Beyene)');

        await mongoose.disconnect();
        console.log('\n✅ Hierarchical structure fixed successfully!');

    } catch (error) {
        console.error('❌ Error fixing hierarchical structure:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
fixHierarchicalStructure();