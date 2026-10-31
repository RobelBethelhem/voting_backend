import mongoose from 'mongoose';
import User from './models/rms/user.js';

await mongoose.connect('mongodb://localhost:27017/voting_system');

console.log('📋 Available users for login:');
const users = await User.find({}, 'employee_id user email level').sort({level: 1});

users.forEach(u => {
    console.log(`  ${u.employee_id}: ${u.user} | ${u.email} | ${u.level}`);
});

console.log('\n🔐 Login Options:');
console.log('For temp-login endpoint:');
console.log('1. Use EMAIL + password 1234 or test123');
console.log('2. Use USERNAME + password 1234 or test123');

console.log('\nExamples:');
console.log('  Email: chief@bank.com + 1234');
console.log('  Username: chief.admin + 1234');

await mongoose.disconnect();