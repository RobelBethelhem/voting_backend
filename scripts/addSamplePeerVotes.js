import mongoose from 'mongoose';
import { config } from 'dotenv';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';
import User from '../models/rms/user.js';
import { VotingCalculator } from '../utils/votingCalculations.js';

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

const addSamplePeerVotes = async () => {
    try {
        await connectDB();

        console.log('🔄 Adding sample peer votes for testing...');

        // Get a candidate to vote for (EMP001)
        const candidate = await HierarchicalVote.findOne({ candidate_employee_id: 'EMP001' });
        if (!candidate) {
            console.log('No candidate found with EMP001');
            return;
        }

        // Get some users from same department to be peer voters
        const peerVoters = await User.find({
            department: candidate.candidate_department,
            employee_id: { $ne: 'EMP001' } // Exclude the candidate themselves
        }).limit(3);

        console.log(`Found ${peerVoters.length} potential peer voters for ${candidate.candidate_first_name} ${candidate.candidate_last_name}`);

        // Add peer votes with different ratings
        const sampleVotes = [
            {
                dedication: 4,
                quality_of_work: 5,
                collaboration_team_work: 4,
                independence: 4,
                customer_service: 5,
                time_management: 4,
                office_attire_dress_code: 5,
                flexibility: 4
            },
            {
                dedication: 3,
                quality_of_work: 4,
                collaboration_team_work: 4,
                independence: 3,
                customer_service: 4,
                time_management: 3,
                office_attire_dress_code: 4,
                flexibility: 4
            },
            {
                dedication: 5,
                quality_of_work: 4,
                collaboration_team_work: 5,
                independence: 4,
                customer_service: 4,
                time_management: 5,
                office_attire_dress_code: 4,
                flexibility: 5
            }
        ];

        // Add votes for each peer voter
        for (let i = 0; i < Math.min(peerVoters.length, sampleVotes.length); i++) {
            const voter = peerVoters[i];
            const voteData = sampleVotes[i];

            const totalScore = VotingCalculator.calculatePeerVoteTotal(voteData);

            candidate.peer_votes.push({
                voter_employee_id: voter.employee_id,
                voter_name: `${voter.first_name} ${voter.last_name}`,
                voter_department: voter.department,
                ...voteData,
                total_score: totalScore
            });

            console.log(`Added vote from ${voter.first_name} ${voter.last_name} (Total: ${totalScore}/40)`);
        }

        // Recalculate scores
        const calculationData = {
            performance_appraisal_score: candidate.performance_appraisal_score,
            manager_rating_score: candidate.manager_rating_score,
            director_rating_score: candidate.director_rating_score,
            peer_votes: candidate.peer_votes,
            total_eligible_peer_voters: candidate.total_eligible_peer_voters,
            is_managerial: candidate.is_managerial_position
        };

        const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);

        // Update the record with new calculations
        Object.assign(candidate, calculations);
        candidate.last_updated_by = 'SAMPLE_DATA';

        await candidate.save();

        console.log(`\n✅ Updated calculations for ${candidate.candidate_first_name} ${candidate.candidate_last_name}:`);
        console.log(`   • Peer Votes Received: ${calculations.total_peer_votes_received}`);
        console.log(`   • Voting Percentage: ${calculations.peer_voting_percentage}%`);
        console.log(`   • Average Peer Rating: ${calculations.average_peer_rating}/50`);
        console.log(`   • Peer Rating Weighted Score: ${calculations.peer_rating_weighted_score}/20`);
        console.log(`   • Weighted Rating: ${calculations.weighted_rating}`);
        console.log(`   • Total Weighted Result: ${calculations.total_weighted_result}`);

        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error adding sample peer votes:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
addSamplePeerVotes();