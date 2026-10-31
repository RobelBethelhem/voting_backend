import mongoose from 'mongoose';
import { config } from 'dotenv';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';
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

const refreshAllCalculations = async () => {
    try {
        await connectDB();

        console.log('🔄 Refreshing all voting calculations...');

        // Get all hierarchical votes
        const hierarchicalVotes = await HierarchicalVote.find({});
        console.log(`Found ${hierarchicalVotes.length} voting records to refresh`);

        let updatedCount = 0;

        for (const vote of hierarchicalVotes) {
            const calculationData = {
                performance_appraisal_score: vote.performance_appraisal_score,
                manager_rating_score: vote.manager_rating_score,
                director_rating_score: vote.director_rating_score,
                peer_votes: vote.peer_votes,
                total_eligible_peer_voters: vote.total_eligible_peer_voters,
                is_managerial: vote.is_managerial_position
            };

            const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);

            // Update the record with fresh calculations
            Object.assign(vote, calculations);
            vote.last_updated_by = 'SYSTEM_REFRESH';

            await vote.save();
            updatedCount++;

            console.log(`✅ Updated: ${vote.candidate_first_name} ${vote.candidate_last_name} - Peer: ${calculations.peer_rating_weighted_score}/20`);
        }

        console.log(`\n🎉 Successfully refreshed ${updatedCount} voting calculation records!`);

        await mongoose.disconnect();
        console.log('✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error refreshing calculations:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
refreshAllCalculations();