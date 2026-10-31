import mongoose from 'mongoose';
import User from './models/rms/user.js';
import PerformanceAppraisal from './models/rms/PerformanceAppraisal.js';
import VotingPeriod from './models/rms/VotingPeriod.js';

// Connect to MongoDB
await mongoose.connect('mongodb://localhost:27017/voting_system');

console.log('🔍 Verifying database with proper models...\n');

// Check users with hierarchy
const userCount = await User.countDocuments();
console.log(`👥 Users in database: ${userCount}`);

const usersByLevel = await User.aggregate([
    { $group: { _id: "$level", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
]);

console.log('Users by level:');
usersByLevel.forEach(level => {
    console.log(`  ${level._id}: ${level.count}`);
});

// Check sample users from each level
console.log('\nSample user hierarchy:');
const chief = await User.findOne({ level: 'chief' }, 'employee_id user level performance_appraisal_score');
const director = await User.findOne({ level: 'director' }, 'employee_id user level director_id performance_appraisal_score');
const manager = await User.findOne({ level: 'manager' }, 'employee_id user level manager_id director_id performance_appraisal_score');
const professional = await User.findOne({ level: 'professional' }, 'employee_id user level manager_id director_id chief_id performance_appraisal_score');

console.log(`Chief: ${chief.employee_id} (${chief.user}) - Score: ${chief.performance_appraisal_score}`);
console.log(`Director: ${director.employee_id} (${director.user}) - Reports to: ${director.director_id || 'Chief'} - Score: ${director.performance_appraisal_score}`);
console.log(`Manager: ${manager.employee_id} (${manager.user}) - Reports to: ${manager.director_id} - Score: ${manager.performance_appraisal_score}`);
console.log(`Professional: ${professional.employee_id} (${professional.user}) - Manager: ${professional.manager_id}, Director: ${professional.director_id} - Score: ${professional.performance_appraisal_score}`);

// Check performance appraisals
const perfCount = await PerformanceAppraisal.countDocuments();
console.log(`\n📊 Performance appraisal records: ${perfCount}`);

const samplePerf = await PerformanceAppraisal.find({}, 'employee_id performance_score performance_weighted overall_rating').limit(3);
console.log('Sample performance records (with auto-calculated weights):');
samplePerf.forEach(perf => {
    console.log(`  ${perf.employee_id}: Score ${perf.performance_score} → Weighted ${perf.performance_weighted} (${perf.overall_rating})`);
});

// Check voting period
const votingPeriod = await VotingPeriod.findOne({}, 'period_id period_name status allow_peer_voting allow_manager_voting require_chief_approval');
console.log(`\n🗳️ Voting Period: ${votingPeriod.period_id} - ${votingPeriod.period_name}`);
console.log(`Status: ${votingPeriod.status}`);
console.log(`Peer voting: ${votingPeriod.allow_peer_voting}, Manager voting: ${votingPeriod.allow_manager_voting}, Chief approval: ${votingPeriod.require_chief_approval}`);

console.log('\n✅ Database verification complete!');
console.log('\n🎯 Ready for hierarchical voting testing:');
console.log('1. Professional peer voting (20% weight)');
console.log('2. Manager rating of professionals (30% weight)');
console.log('3. Director rating of managers (50% weight)');
console.log('4. Chief approval of final results');
console.log('5. Performance scores already integrated (50% weight)');

await mongoose.disconnect();