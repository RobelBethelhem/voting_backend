import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// Database connection
const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/voting_system', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

// User Schema
const UserSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    full_name: { type: String, required: true },
    department: { type: String, required: true },
    position: { type: String, required: true },
    level: { type: String, enum: ['chief', 'director', 'manager', 'professional'], required: true },
    manager_id: { type: String },
    director_id: { type: String },
    chief_id: { type: String },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now }
});

// Performance Appraisal Schema
const PerformanceSchema = new mongoose.Schema({
    employee_id: { type: String, required: true },
    appraisal_period: { type: String, required: true },
    performance_score: { type: Number, required: true, min: 0, max: 100 },
    goals_achieved: { type: Number, default: 0 },
    competency_score: { type: Number, default: 0 },
    overall_rating: { type: String, enum: ['Excellent', 'Good', 'Satisfactory', 'Needs Improvement'] },
    created_at: { type: Date, default: Date.now }
});

// Voting Period Schema
const VotingPeriodSchema = new mongoose.Schema({
    period_id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    current_stage: { type: String, enum: ['peer_voting', 'manager_rating', 'director_rating', 'chief_approval', 'completed'], default: 'peer_voting' },
    is_active: { type: Boolean, default: true },
    created_by: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
});

// Vote Schema
const VoteSchema = new mongoose.Schema({
    voting_period_id: { type: String, required: true },
    candidate_id: { type: String, required: true },
    voter_id: { type: String, required: true },
    vote_type: { type: String, enum: ['peer_rating', 'manager_rating', 'director_rating'], required: true },
    score: { type: Number, required: true, min: 0, max: 50 },
    comments: { type: String },
    created_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Performance = mongoose.model('Performance', PerformanceSchema);
const VotingPeriod = mongoose.model('VotingPeriod', VotingPeriodSchema);
const Vote = mongoose.model('Vote', VoteSchema);

// Initialize sample data
async function initializeDatabase() {
    try {
        console.log('🧹 Clearing existing data...');
        await User.deleteMany({});
        await Performance.deleteMany({});
        await VotingPeriod.deleteMany({});
        await Vote.deleteMany({});

        console.log('👥 Creating sample users...');

        // Hash password for all users (password: "test123")
        const hashedPassword = await bcrypt.hash('test123', 10);

        const users = [
            // Chief
            {
                employee_id: 'CHF001',
                username: 'chief.admin',
                password: hashedPassword,
                email: 'chief@bank.com',
                full_name: 'Chief Executive Officer',
                department: 'Executive',
                position: 'Chief Executive Officer',
                level: 'chief',
                manager_id: null,
                director_id: null,
                chief_id: null
            },

            // Directors
            {
                employee_id: 'DIR001',
                username: 'dir.it',
                password: hashedPassword,
                email: 'director.it@bank.com',
                full_name: 'John Smith',
                department: 'IT',
                position: 'IT Director',
                level: 'director',
                manager_id: null,
                director_id: null,
                chief_id: 'CHF001'
            },
            {
                employee_id: 'DIR002',
                username: 'dir.finance',
                password: hashedPassword,
                email: 'director.finance@bank.com',
                full_name: 'Sarah Johnson',
                department: 'Finance',
                position: 'Finance Director',
                level: 'director',
                manager_id: null,
                director_id: null,
                chief_id: 'CHF001'
            },
            {
                employee_id: 'DIR003',
                username: 'dir.hr',
                password: hashedPassword,
                email: 'director.hr@bank.com',
                full_name: 'Michael Brown',
                department: 'HR',
                position: 'HR Director',
                level: 'director',
                manager_id: null,
                director_id: null,
                chief_id: 'CHF001'
            },

            // Managers
            {
                employee_id: 'MGR001',
                username: 'mgr.it.dev',
                password: hashedPassword,
                email: 'manager.dev@bank.com',
                full_name: 'Alice Wilson',
                department: 'IT',
                position: 'Development Manager',
                level: 'manager',
                manager_id: null,
                director_id: 'DIR001',
                chief_id: 'CHF001'
            },
            {
                employee_id: 'MGR002',
                username: 'mgr.it.ops',
                password: hashedPassword,
                email: 'manager.ops@bank.com',
                full_name: 'Bob Davis',
                department: 'IT',
                position: 'Operations Manager',
                level: 'manager',
                manager_id: null,
                director_id: 'DIR001',
                chief_id: 'CHF001'
            },
            {
                employee_id: 'MGR003',
                username: 'mgr.finance',
                password: hashedPassword,
                email: 'manager.finance@bank.com',
                full_name: 'Carol Martinez',
                department: 'Finance',
                position: 'Finance Manager',
                level: 'manager',
                manager_id: null,
                director_id: 'DIR002',
                chief_id: 'CHF001'
            },
            {
                employee_id: 'MGR004',
                username: 'mgr.hr',
                password: hashedPassword,
                email: 'manager.hr@bank.com',
                full_name: 'David Lee',
                department: 'HR',
                position: 'HR Manager',
                level: 'manager',
                manager_id: null,
                director_id: 'DIR003',
                chief_id: 'CHF001'
            },

            // Professionals
            {
                employee_id: 'PRO001',
                username: 'dev.senior',
                password: hashedPassword,
                email: 'senior.dev@bank.com',
                full_name: 'Emma Thompson',
                department: 'IT',
                position: 'Senior Developer',
                level: 'professional',
                manager_id: 'MGR001',
                director_id: 'DIR001',
                chief_id: 'CHF001'
            },
            {
                employee_id: 'PRO002',
                username: 'dev.junior',
                password: hashedPassword,
                email: 'junior.dev@bank.com',
                full_name: 'Frank Garcia',
                department: 'IT',
                position: 'Junior Developer',
                level: 'professional',
                manager_id: 'MGR001',
                director_id: 'DIR001',
                chief_id: 'CHF001'
            },
            {
                employee_id: 'PRO003',
                username: 'ops.analyst',
                password: hashedPassword,
                email: 'ops.analyst@bank.com',
                full_name: 'Grace Kim',
                department: 'IT',
                position: 'Operations Analyst',
                level: 'professional',
                manager_id: 'MGR002',
                director_id: 'DIR001',
                chief_id: 'CHF001'
            },
            {
                employee_id: 'PRO004',
                username: 'finance.analyst',
                password: hashedPassword,
                email: 'finance.analyst@bank.com',
                full_name: 'Henry Rodriguez',
                department: 'Finance',
                position: 'Financial Analyst',
                level: 'professional',
                manager_id: 'MGR003',
                director_id: 'DIR002',
                chief_id: 'CHF001'
            },
            {
                employee_id: 'PRO005',
                username: 'hr.specialist',
                password: hashedPassword,
                email: 'hr.specialist@bank.com',
                full_name: 'Ivy Chen',
                department: 'HR',
                position: 'HR Specialist',
                level: 'professional',
                manager_id: 'MGR004',
                director_id: 'DIR003',
                chief_id: 'CHF001'
            }
        ];

        await User.insertMany(users);
        console.log(`✅ Created ${users.length} users`);

        console.log('📊 Creating performance appraisal scores...');
        const currentPeriod = '2024-Q4';
        const performances = [
            // Performance scores for professionals
            { employee_id: 'PRO001', appraisal_period: currentPeriod, performance_score: 88, goals_achieved: 85, competency_score: 90, overall_rating: 'Excellent' },
            { employee_id: 'PRO002', appraisal_period: currentPeriod, performance_score: 75, goals_achieved: 70, competency_score: 80, overall_rating: 'Good' },
            { employee_id: 'PRO003', appraisal_period: currentPeriod, performance_score: 82, goals_achieved: 80, competency_score: 85, overall_rating: 'Good' },
            { employee_id: 'PRO004', appraisal_period: currentPeriod, performance_score: 91, goals_achieved: 90, competency_score: 92, overall_rating: 'Excellent' },
            { employee_id: 'PRO005', appraisal_period: currentPeriod, performance_score: 79, goals_achieved: 75, competency_score: 83, overall_rating: 'Good' },

            // Performance scores for managers
            { employee_id: 'MGR001', appraisal_period: currentPeriod, performance_score: 85, goals_achieved: 82, competency_score: 88, overall_rating: 'Good' },
            { employee_id: 'MGR002', appraisal_period: currentPeriod, performance_score: 78, goals_achieved: 75, competency_score: 81, overall_rating: 'Good' },
            { employee_id: 'MGR003', appraisal_period: currentPeriod, performance_score: 92, goals_achieved: 90, competency_score: 94, overall_rating: 'Excellent' },
            { employee_id: 'MGR004', appraisal_period: currentPeriod, performance_score: 87, goals_achieved: 85, competency_score: 89, overall_rating: 'Good' }
        ];

        await Performance.insertMany(performances);
        console.log(`✅ Created ${performances.length} performance records`);

        console.log('🗳️ Creating voting period...');
        const votingPeriod = {
            period_id: 'VP2024Q4',
            title: '2024 Q4 Performance Voting',
            description: 'Quarterly performance evaluation voting period',
            start_date: new Date(),
            end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
            current_stage: 'peer_voting',
            is_active: true,
            created_by: 'CHF001'
        };

        await VotingPeriod.create(votingPeriod);
        console.log('✅ Created voting period: VP2024Q4');

        console.log('\n🎉 Database initialized successfully!');
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
        console.log('📊 Performance Scores: Already loaded (50-92 range)');
        console.log('🗳️ Voting Period: VP2024Q4 (Active, Peer Voting Stage)');
        console.log('');
        console.log('🚀 Ready to test the complete voting workflow!');

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