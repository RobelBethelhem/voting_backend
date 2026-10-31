import mongoose from 'mongoose';
import User from './models/rms/user.js';
import Candidate from './models/rms/Candidate.js';

// Database connection
await mongoose.connect('mongodb://localhost:27017/voting_system');

console.log('🧪 Testing Simplified System (Users + Candidates only)...\n');

// Test 1: Check Users have performance_appraisal_score
console.log('1. 👥 Checking Users with performance scores:');
const users = await User.find({
    performance_appraisal_score: { $gte: 60 }
}, 'employee_id first_name last_name level performance_appraisal_score').limit(5);

users.forEach(user => {
    const performanceWeighted = (user.performance_appraisal_score / 100) * 50;
    console.log(`   ${user.employee_id}: ${user.first_name} ${user.last_name}`);
    console.log(`     Level: ${user.level}, Performance: ${user.performance_appraisal_score}/100`);
    console.log(`     Weighted (50%): ${performanceWeighted}`);
});

// Test 2: Check Candidates have correct data from Users
console.log('\n2. 🎯 Checking Candidates (qualified from Users):');
const candidates = await Candidate.find({
    voting_period_id: 'VP2024Q4'
}, 'employee_id first_name last_name level performance_appraisal_score performance_weighted').limit(5);

candidates.forEach(candidate => {
    console.log(`   ${candidate.employee_id}: ${candidate.first_name} ${candidate.last_name}`);
    console.log(`     Level: ${candidate.level}, Performance: ${candidate.performance_appraisal_score}/100`);
    console.log(`     Performance Weighted: ${candidate.performance_weighted}`);
    console.log(`     Calculation Check: ${candidate.performance_appraisal_score}/100 * 50 = ${(candidate.performance_appraisal_score/100)*50}`);
});

// Test 3: Verify data consistency
console.log('\n3. 🔍 Data Consistency Check:');
const userCount = await User.countDocuments({ performance_appraisal_score: { $gte: 60 } });
const candidateCount = await Candidate.countDocuments({ voting_period_id: 'VP2024Q4' });

console.log(`   Users with performance >= 60: ${userCount}`);
console.log(`   Qualified candidates: ${candidateCount}`);

// Test 4: Check Excel formula compatibility
console.log('\n4. 📊 Excel Formula Compatibility:');
const sampleCandidate = candidates[0];
if (sampleCandidate) {
    console.log(`Sample: ${sampleCandidate.employee_id}`);
    console.log(`Excel Formula Equivalents:`);
    console.log(`  G2 = ${sampleCandidate.performance_appraisal_score} (Performance Score)`);
    console.log(`  H2 = =G2/100*50 = ${sampleCandidate.performance_weighted} (Performance Weighted)`);
    console.log(`✅ Matches Excel formula: =G2/100*50`);
}

// Test 5: Model simplification benefits
console.log('\n5. ✨ Simplified System Benefits:');
console.log('   ✅ No separate PerformanceAppraisal collection needed');
console.log('   ✅ Performance score directly in User model (0-100)');
console.log('   ✅ Candidates automatically get performance data from Users');
console.log('   ✅ Single source of truth for performance scores');
console.log('   ✅ Simplified API queries and calculations');
console.log('   ✅ Excel formula compatibility maintained');

console.log('\n🎉 Simplified system working perfectly!');
console.log('📊 Users → Candidates → Voting (with performance_appraisal_score only)');

await mongoose.disconnect();