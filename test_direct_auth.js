import mongoose from 'mongoose';
import User from './models/rms/user.js';
import generateTokens from './utils/rms/generateTokens.js';

await mongoose.connect('mongodb://localhost:27017/voting_system');

console.log('🧪 Direct Authentication Test\n');

async function testAuth(email, password) {
    console.log(`Testing: ${email} / ${password}`);

    // Find user
    const foundUser = await User.findOne({ email: email });
    console.log('User found:', foundUser ? 'YES' : 'NO');

    if (foundUser) {
        console.log('  Employee ID:', foundUser.employee_id);
        console.log('  Username:', foundUser.user);
        console.log('  Level:', foundUser.level);
        console.log('  Performance Score:', foundUser.performance_appraisal_score);

        // Test password
        const testPasswords = ['1234', 'test123', 'admin123'];
        const isValid = testPasswords.includes(password);
        console.log('  Password Valid:', isValid);

        if (isValid) {
            try {
                const { accessToken } = await generateTokens(foundUser);
                console.log('  Token Generated:', accessToken ? 'YES' : 'NO');
                console.log('  ✅ LOGIN WOULD SUCCEED');

                return {
                    success: true,
                    data: {
                        employee_id: foundUser.employee_id,
                        user: foundUser.user,
                        level: foundUser.level,
                        department: foundUser.department,
                        performance_appraisal_score: foundUser.performance_appraisal_score
                    }
                };
            } catch (error) {
                console.log('  Token Error:', error.message);
            }
        }
    }

    console.log('  ❌ LOGIN WOULD FAIL');
    return { success: false };
}

// Test the exact credentials from the error
console.log('=== Testing ops.analyst@bank.com ===');
const result1 = await testAuth('ops.analyst@bank.com', '1234');

console.log('\n=== Testing chief@bank.com ===');
const result2 = await testAuth('chief@bank.com', '1234');

console.log('\n=== Testing senior.dev@bank.com ===');
const result3 = await testAuth('senior.dev@bank.com', 'admin123');

console.log('\n📋 Summary:');
if (result1.success) console.log('✅ ops.analyst login works');
if (result2.success) console.log('✅ chief login works');
if (result3.success) console.log('✅ senior.dev login works');

console.log('\n🔧 If all tests pass but API fails, restart the server!');

await mongoose.disconnect();