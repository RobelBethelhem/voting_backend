import mongoose from 'mongoose';

// Connect to MongoDB
await mongoose.connect('mongodb://localhost:27017/voting_system');

// Define schemas (simplified)
const UserSchema = new mongoose.Schema({}, { strict: false });
const PerformanceSchema = new mongoose.Schema({}, { strict: false });
const VotingPeriodSchema = new mongoose.Schema({}, { strict: false });

const User = mongoose.model('User', UserSchema);
const Performance = mongoose.model('Performance', PerformanceSchema);
const VotingPeriod = mongoose.model('VotingPeriod', VotingPeriodSchema);

console.log('🔍 Verifying database contents...\n');

// Check users
const userCount = await User.countDocuments();
console.log(`👥 Users in database: ${userCount}`);

if (userCount > 0) {
    const sampleUsers = await User.find({}, 'employee_id username level department position').limit(5);
    console.log('Sample users:');
    sampleUsers.forEach(user => {
        console.log(`  ${user.employee_id} | ${user.username} | ${user.level} | ${user.department}`);
    });
}

// Check performance records
const perfCount = await Performance.countDocuments();
console.log(`\n📊 Performance records: ${perfCount}`);

if (perfCount > 0) {
    const samplePerf = await Performance.find({}, 'employee_id performance_score overall_rating').limit(3);
    console.log('Sample performance scores:');
    samplePerf.forEach(perf => {
        console.log(`  ${perf.employee_id}: ${perf.performance_score} (${perf.overall_rating})`);
    });
}

// Check voting periods
const votingCount = await VotingPeriod.countDocuments();
console.log(`\n🗳️ Voting periods: ${votingCount}`);

if (votingCount > 0) {
    const votingPeriods = await VotingPeriod.find({}, 'period_id title current_stage is_active');
    votingPeriods.forEach(period => {
        console.log(`  ${period.period_id}: ${period.title} (${period.current_stage}, Active: ${period.is_active})`);
    });
}

console.log('\n✅ Database verification complete!');
await mongoose.disconnect();