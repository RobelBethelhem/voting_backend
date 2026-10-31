import mongoose from 'mongoose';
import CandidateQualificationService from './services/candidateQualificationService.js';
import VotingPeriod from './models/rms/VotingPeriod.js';

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

async function initializeCandidates() {
    try {
        console.log('🎯 Initializing candidates from qualified users...\n');

        // Get the active voting period
        const votingPeriod = await VotingPeriod.findOne({
            status: { $in: ['peer_voting', 'manager_review', 'active'] }
        });

        if (!votingPeriod) {
            console.log('❌ No active voting period found');
            console.log('Creating a test voting period...');

            // Create a voting period if none exists
            const testPeriod = {
                period_id: 'VP2024Q4',
                period_name: '2024 Q4 Performance Voting',
                description: 'Quarterly performance evaluation with qualified candidates',
                start_date: new Date(),
                end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
                status: 'peer_voting',
                allow_peer_voting: true,
                allow_manager_voting: true,
                allow_director_voting: true,
                require_chief_approval: true,
                target_departments: ['IT', 'Finance', 'HR'],
                created_by: 'SYSTEM_INIT'
            };

            await VotingPeriod.findOneAndUpdate(
                { period_id: testPeriod.period_id },
                testPeriod,
                { upsert: true, new: true }
            );

            console.log('✅ Created voting period: VP2024Q4');
        }

        console.log(`📋 Using voting period: ${votingPeriod?.period_id || 'VP2024Q4'}`);

        // Qualification criteria
        const qualificationCriteria = {
            minPerformanceScore: 60,        // Only users with performance >= 60
            includeManagers: true,          // Managers can be candidates
            includeProfessionals: true,     // Professionals can be candidates
            includeDirectors: false         // Directors are not typically candidates
        };

        console.log('📊 Qualification criteria:', qualificationCriteria);

        // Qualify users as candidates
        const result = await CandidateQualificationService.qualifyUsersForVoting(
            votingPeriod?.period_id || 'VP2024Q4',
            qualificationCriteria
        );

        console.log('\n🎉 Candidate initialization completed!');
        console.log('\n📈 Results:');
        console.log(`✅ Total qualified candidates: ${result.totalQualified}`);
        console.log(`👤 Professionals: ${result.breakdown.professionals}`);
        console.log(`👔 Managers: ${result.breakdown.managers}`);
        console.log(`🏢 Directors: ${result.breakdown.directors}`);

        console.log('\n📋 Candidate Summary:');
        console.log('- Only users with performance score >= 60 are qualified');
        console.log('- Professionals can be voted by peers and rated by managers');
        console.log('- Managers can be peer-voted and rated by directors');
        console.log('- Directors are excluded from candidate voting');

        console.log('\n🔍 Sample candidates:');
        if (result.candidates.length > 0) {
            result.candidates.slice(0, 3).forEach(candidate => {
                console.log(`  ${candidate.employee_id}: ${candidate.first_name} ${candidate.last_name}`);
                console.log(`    Level: ${candidate.level}, Department: ${candidate.department}`);
                console.log(`    Performance: ${candidate.performance_appraisal_score}/100`);
                console.log(`    Eligible for: ${Object.entries(candidate.qualification_criteria)
                    .filter(([key, value]) => value && key.includes('eligible'))
                    .map(([key]) => key.replace('eligible_for_', '').replace('_', ' '))
                    .join(', ')}`);
                console.log('');
            });
        }

        console.log('🚀 Ready for hierarchical voting with qualified candidates only!');

    } catch (error) {
        console.error('❌ Error initializing candidates:', error);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('📝 Database connection closed');
    }
}

// Run initialization
connectDB().then(() => {
    initializeCandidates();
});