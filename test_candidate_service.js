import dbConnect from './dbConnect.js';
import User from './models/rms/user.js';
import CandidateQualificationService from './services/candidateQualificationService.js';
import VotingPeriod from './models/rms/VotingPeriod.js';

async function testCandidateService() {
    try {
        console.log('🧪 Testing CandidateQualificationService directly...');

        // Connect to database
        await dbConnect();

        // Find the professional user
        const professionalUser = await User.findOne({ employee_id: 'PRO003' });
        if (!professionalUser) {
            console.log('❌ Professional user PRO003 not found');
            return;
        }

        console.log(`✅ Found user: ${professionalUser.employee_id} (${professionalUser.level}) in ${professionalUser.department}`);

        // Find active voting period
        const activePeriod = await VotingPeriod.findOne({
            status: { $in: ['peer_voting', 'manager_review', 'active'] }
        });

        if (!activePeriod) {
            console.log('❌ No active voting period found');
            return;
        }

        console.log(`✅ Found active voting period: ${activePeriod.period_id}`);

        // Test the candidate service directly
        const result = await CandidateQualificationService.getCandidatesForVoter(
            professionalUser.employee_id,
            activePeriod.period_id
        );

        if (result.success) {
            console.log(`🎉 SUCCESS! Found ${result.candidates.length} candidates for professional user:`);
            result.candidates.forEach(candidate => {
                console.log(`  - ${candidate.employee_id}: ${candidate.first_name} ${candidate.last_name} (${candidate.level}, ${candidate.department})`);
                console.log(`    Performance Score: ${candidate.performance_appraisal_score}`);
            });

            console.log(`\n✅ Voter Info:`);
            console.log(`   Can vote on: ${result.voterInfo.can_vote_on}`);
            console.log(`   Vote type: ${result.voterInfo.vote_type}`);

            console.log(`\n🏆 HIERARCHICAL VOTING SYSTEM IS WORKING!`);
            console.log(`   Professional user can vote on ${result.candidates.length} peer candidates`);

        } else {
            console.log('❌ Candidate service failed:', result.error);
        }

    } catch (error) {
        console.error('❌ Test error:', error.message);
    }

    process.exit(0);
}

testCandidateService();