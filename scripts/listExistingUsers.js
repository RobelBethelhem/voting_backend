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

const listExistingUsers = async () => {
    try {
        await connectDB();

        console.log('👥 EXISTING USERS IN DATABASE:');
        console.log('==============================\n');

        // Get all users who can vote (status: true)
        const voters = await User.find({ status: true });
        console.log(`📊 Found ${voters.length} voters (status: true)`);

        if (voters.length > 0) {
            console.log('\n🗳️ AVAILABLE VOTERS:');
            console.log('===================');
            voters.forEach((user, index) => {
                console.log(`${index + 1}. ${user.first_name} ${user.last_name}`);
                console.log(`   📋 Employee ID: ${user.employee_id}`);
                console.log(`   📧 Email: ${user.email || user.user}`);
                console.log(`   👤 Role: ${user.roles.join(', ')}`);
                console.log(`   🏢 Department: ${user.department}`);
                console.log(`   💼 Position: ${user.position}`);
                console.log('');
            });
        }

        // Get all candidates (status: false)
        const candidates = await User.find({ status: false, roles: { $in: ['user'] } });
        console.log(`\n📊 Found ${candidates.length} candidates (status: false)`);

        if (candidates.length > 0) {
            console.log('\n🏆 AVAILABLE CANDIDATES:');
            console.log('========================');
            candidates.forEach((candidate, index) => {
                console.log(`${index + 1}. ${candidate.first_name} ${candidate.last_name}`);
                console.log(`   📋 Employee ID: ${candidate.employee_id}`);
                console.log(`   🏢 Department: ${candidate.department}`);
                console.log(`   📊 Performance Score: ${candidate.performance_appraisal_score}/100`);
                console.log('');
            });
        }

        console.log('🎯 END-TO-END TESTING INSTRUCTIONS:');
        console.log('===================================');

        if (voters.length > 0) {
            const testVoter = voters[0];
            console.log('STEP 1: Login as a Voter');
            console.log(`   📧 Email: ${testVoter.email || testVoter.user}`);
            console.log(`   🔐 Password: (You need to know or reset this)`);
            console.log(`   👤 Role: ${testVoter.roles.join(', ')}`);
            console.log('');

            console.log('STEP 2: Navigate to Hierarchical Voting');
            console.log('   - Go to the voting section');
            console.log('   - Look for peer evaluation or hierarchical voting');
            console.log('');

            console.log('STEP 3: Submit Votes');
            console.log('   - Vote for candidates using performance-weighted system');
            console.log('   - Rate candidates on various criteria');
            console.log('');

            console.log('STEP 4: Check Results');
            console.log('   - Login as admin or manager to view results');
            console.log('   - Verify performance scores are integrated correctly');
            console.log('   - Check voting calculations show proper weightings');
        } else {
            console.log('⚠️ No voters found. You may need to:');
            console.log('   1. Create test users with status: true');
            console.log('   2. Or change existing users to status: true to make them voters');
        }

        await mongoose.disconnect();
        console.log('\n✅ User listing completed!');

    } catch (error) {
        console.error('❌ Error listing users:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
listExistingUsers();