import mongoose from 'mongoose';
import User from './models/rms/user.js';

await mongoose.connect('mongodb://localhost:27017/voting_system');

console.log('🔍 Debugging login issue...\n');

// Test the exact email being used
const testEmail = 'ops.analyst@bank.com';
console.log(`Looking for user with email: ${testEmail}`);

const user = await User.findOne({ email: testEmail });
console.log('User found:', user ? 'YES' : 'NO');

if (user) {
    console.log('User details:');
    console.log('  Employee ID:', user.employee_id);
    console.log('  Username:', user.user);
    console.log('  Email:', user.email);
    console.log('  Level:', user.level);
    console.log('  Department:', user.department);
} else {
    console.log('❌ User not found!');
    console.log('\nLet me check all users with similar email pattern:');

    const allUsers = await User.find({
        email: { $regex: /ops\.analyst/i }
    }, 'employee_id user email');

    console.log('Found users with "ops.analyst" pattern:');
    allUsers.forEach(u => {
        console.log(`  ${u.employee_id}: ${u.user} | ${u.email}`);
    });

    console.log('\nAll professional users:');
    const professionals = await User.find({
        level: 'professional'
    }, 'employee_id user email');

    professionals.forEach(u => {
        console.log(`  ${u.employee_id}: ${u.user} | ${u.email}`);
    });
}

await mongoose.disconnect();