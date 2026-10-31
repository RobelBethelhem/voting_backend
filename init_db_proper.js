import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// Import the actual models
import User from './models/rms/user.js';
import VotingPeriod from './models/rms/VotingPeriod.js';
// PerformanceAppraisal model removed - using performance_appraisal_score in User model instead
import HierarchicalVoting from './models/rms/HierarchicalVoting.js';

// Database connection
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/voting_system');
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

async function initializeDatabase() {
    try {
        console.log('🧹 Clearing existing data...');

        // Drop indexes that might cause conflicts
        try {
            await User.collection.dropIndexes();
        } catch (e) {
            console.log('No indexes to drop');
        }

        await User.deleteMany({});
        // No longer using separate PerformanceAppraisal model
        await VotingPeriod.deleteMany({});
        await HierarchicalVoting.deleteMany({});

        console.log('👥 Creating sample users...');

        // Hash password for all users (password: "test123")
        const hashedPassword = await bcrypt.hash('test123', 10);

        const users = [
            // Chief
            {
                first_name: 'Chief',
                last_name: 'Executive',
                employee_id: 'CHF001',
                user: 'chief.admin',
                position: 'Chief Executive Officer',
                department: 'Executive',
                email: 'chief@bank.com',
                password: hashedPassword,
                roles: ['chief', 'admin'],
                level: 'chief',
                manager_id: null,
                director_id: null,
                chief_id: null,
                performance_appraisal_score: 95,
                is_managerial: true,
                status: true
            },

            // Directors
            {
                first_name: 'John',
                last_name: 'Smith',
                employee_id: 'DIR001',
                user: 'dir.it',
                position: 'IT Director',
                department: 'IT',
                email: 'director.it@bank.com',
                password: hashedPassword,
                roles: ['director'],
                level: 'director',
                manager_id: null,
                director_id: null,
                chief_id: 'CHF001',
                performance_appraisal_score: 88,
                is_managerial: true,
                status: true
            },
            {
                first_name: 'Sarah',
                last_name: 'Johnson',
                employee_id: 'DIR002',
                user: 'dir.finance',
                position: 'Finance Director',
                department: 'Finance',
                email: 'director.finance@bank.com',
                password: hashedPassword,
                roles: ['director'],
                level: 'director',
                manager_id: null,
                director_id: null,
                chief_id: 'CHF001',
                performance_appraisal_score: 90,
                is_managerial: true,
                status: true
            },
            {
                first_name: 'Michael',
                last_name: 'Brown',
                employee_id: 'DIR003',
                user: 'dir.hr',
                position: 'HR Director',
                department: 'HR',
                email: 'director.hr@bank.com',
                password: hashedPassword,
                roles: ['director'],
                level: 'director',
                manager_id: null,
                director_id: null,
                chief_id: 'CHF001',
                performance_appraisal_score: 85,
                is_managerial: true,
                status: true
            },

            // Managers
            {
                first_name: 'Alice',
                last_name: 'Wilson',
                employee_id: 'MGR001',
                user: 'mgr.it.dev',
                position: 'Development Manager',
                department: 'IT',
                email: 'manager.dev@bank.com',
                password: hashedPassword,
                roles: ['manager'],
                level: 'manager',
                manager_id: null,
                director_id: 'DIR001',
                chief_id: 'CHF001',
                performance_appraisal_score: 85,
                is_managerial: true,
                status: true
            },
            {
                first_name: 'Bob',
                last_name: 'Davis',
                employee_id: 'MGR002',
                user: 'mgr.it.ops',
                position: 'Operations Manager',
                department: 'IT',
                email: 'manager.ops@bank.com',
                password: hashedPassword,
                roles: ['manager'],
                level: 'manager',
                manager_id: null,
                director_id: 'DIR001',
                chief_id: 'CHF001',
                performance_appraisal_score: 78,
                is_managerial: true,
                status: true
            },
            {
                first_name: 'Carol',
                last_name: 'Martinez',
                employee_id: 'MGR003',
                user: 'mgr.finance',
                position: 'Finance Manager',
                department: 'Finance',
                email: 'manager.finance@bank.com',
                password: hashedPassword,
                roles: ['manager'],
                level: 'manager',
                manager_id: null,
                director_id: 'DIR002',
                chief_id: 'CHF001',
                performance_appraisal_score: 92,
                is_managerial: true,
                status: true
            },
            {
                first_name: 'David',
                last_name: 'Lee',
                employee_id: 'MGR004',
                user: 'mgr.hr',
                position: 'HR Manager',
                department: 'HR',
                email: 'manager.hr@bank.com',
                password: hashedPassword,
                roles: ['manager'],
                level: 'manager',
                manager_id: null,
                director_id: 'DIR003',
                chief_id: 'CHF001',
                performance_appraisal_score: 87,
                is_managerial: true,
                status: true
            },

            // Professionals
            {
                first_name: 'Emma',
                last_name: 'Thompson',
                employee_id: 'PRO001',
                user: 'dev.senior',
                position: 'Senior Developer',
                department: 'IT',
                email: 'senior.dev@bank.com',
                password: hashedPassword,
                roles: ['user'],
                level: 'professional',
                manager_id: 'MGR001',
                director_id: 'DIR001',
                chief_id: 'CHF001',
                performance_appraisal_score: 88,
                is_managerial: false,
                status: true
            },
            {
                first_name: 'Frank',
                last_name: 'Garcia',
                employee_id: 'PRO002',
                user: 'dev.junior',
                position: 'Junior Developer',
                department: 'IT',
                email: 'junior.dev@bank.com',
                password: hashedPassword,
                roles: ['user'],
                level: 'professional',
                manager_id: 'MGR001',
                director_id: 'DIR001',
                chief_id: 'CHF001',
                performance_appraisal_score: 75,
                is_managerial: false,
                status: true
            },
            {
                first_name: 'Grace',
                last_name: 'Kim',
                employee_id: 'PRO003',
                user: 'ops.analyst',
                position: 'Operations Analyst',
                department: 'IT',
                email: 'ops.analyst@bank.com',
                password: hashedPassword,
                roles: ['user'],
                level: 'professional',
                manager_id: 'MGR002',
                director_id: 'DIR001',
                chief_id: 'CHF001',
                performance_appraisal_score: 82,
                is_managerial: false,
                status: true
            },
            {
                first_name: 'Henry',
                last_name: 'Rodriguez',
                employee_id: 'PRO004',
                user: 'finance.analyst',
                position: 'Financial Analyst',
                department: 'Finance',
                email: 'finance.analyst@bank.com',
                password: hashedPassword,
                roles: ['user'],
                level: 'professional',
                manager_id: 'MGR003',
                director_id: 'DIR002',
                chief_id: 'CHF001',
                performance_appraisal_score: 91,
                is_managerial: false,
                status: true
            },
            {
                first_name: 'Ivy',
                last_name: 'Chen',
                employee_id: 'PRO005',
                user: 'hr.specialist',
                position: 'HR Specialist',
                department: 'HR',
                email: 'hr.specialist@bank.com',
                password: hashedPassword,
                roles: ['user'],
                level: 'professional',
                manager_id: 'MGR004',
                director_id: 'DIR003',
                chief_id: 'CHF001',
                performance_appraisal_score: 79,
                is_managerial: false,
                status: true
            }
        ];

        await User.insertMany(users);
        console.log(`✅ Created ${users.length} users`);

        console.log('📊 Performance scores are already included in User records (performance_appraisal_score field)');
        console.log('✅ No separate performance records needed - simplified model');

        console.log('🗳️ Creating voting period...');
        const votingPeriod = {
            period_id: 'VP2024Q4',
            period_name: '2024 Q4 Performance Voting',
            description: 'Quarterly performance evaluation voting period for hierarchical system',
            start_date: new Date(),
            end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
            allow_peer_voting: true,
            allow_manager_voting: true,
            allow_director_voting: true,
            require_chief_approval: true,
            target_departments: ['IT', 'Finance', 'HR'],
            quota_per_function: 1,
            status: 'peer_voting',
            created_by: 'CHF001'
        };

        await VotingPeriod.create(votingPeriod);
        console.log('✅ Created voting period: VP2024Q4');

        console.log('\n🎉 Database initialized successfully with proper models!');
        console.log('\n📋 Test Accounts Created:');
        console.log('');
        console.log('👑 Chief:');
        console.log('   Username: chief.admin | Password: test123');
        console.log('');
        console.log('🏢 Directors:');
        console.log('   Username: dir.it | Password: test123 (IT Director)');
        console.log('   Username: dir.finance | Password: test123 (Finance Director)');
        console.log('   Username: dir.hr | Password: test123 (HR Director)');
        console.log('');
        console.log('👔 Managers:');
        console.log('   Username: mgr.it.dev | Password: test123 (Development Manager)');
        console.log('   Username: mgr.it.ops | Password: test123 (Operations Manager)');
        console.log('   Username: mgr.finance | Password: test123 (Finance Manager)');
        console.log('   Username: mgr.hr | Password: test123 (HR Manager)');
        console.log('');
        console.log('👤 Professionals:');
        console.log('   Username: dev.senior | Password: test123 (Senior Developer)');
        console.log('   Username: dev.junior | Password: test123 (Junior Developer)');
        console.log('   Username: ops.analyst | Password: test123 (Operations Analyst)');
        console.log('   Username: finance.analyst | Password: test123 (Financial Analyst)');
        console.log('   Username: hr.specialist | Password: test123 (HR Specialist)');
        console.log('');
        console.log('📊 Performance Scores: Included in user records (75-95 range)');
        console.log('🗳️ Voting Period: VP2024Q4 (Active, Peer Voting Stage)');
        console.log('');
        console.log('✨ Simplified Model Structure:');
        console.log('   - Users: Contains performance_appraisal_score (0-100)');
        console.log('   - Candidates: Qualified users copied with performance scores');
        console.log('   - No separate PerformanceAppraisal model needed');
        console.log('');
        console.log('🧮 Hierarchy Structure:');
        console.log('   Chief → Directors → Managers → Professionals');
        console.log('   Each level can vote on their subordinates');
        console.log('   Performance scores integrated for weight calculations');
        console.log('');
        console.log('🚀 Ready to test the complete hierarchical voting workflow!');

    } catch (error) {
        console.error('❌ Error initializing database:', error);
    } finally {
        await mongoose.disconnect();
        console.log('📝 Database connection closed');
    }
}

// Run initialization
connectDB().then(() => {
    initializeDatabase();
});