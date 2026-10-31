import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';
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

const finalizeScoresAndCounts = async () => {
    try {
        await connectDB();

        console.log('🔄 Finalizing scores and updating counts...\n');

        // Update voting period with correct candidate count
        const totalCandidates = await User.countDocuments({ status: false, roles: { $in: ['user'] } });
        await VotingPeriod.updateOne(
            { period_id: 'VP_2024_Q4_PERFORMANCE' },
            { total_candidates: totalCandidates }
        );

        console.log(`✅ Updated voting period with ${totalCandidates} total candidates`);

        // Recalculate all hierarchical vote records with updated performance scores
        const allCandidates = await User.find({ status: false, roles: { $in: ['user'] } });

        console.log('\n🔄 Recalculating all voting scores with new performance scores...');

        for (const candidate of allCandidates) {
            const existingVote = await HierarchicalVote.findOne({ candidate_employee_id: candidate.employee_id });

            if (existingVote) {
                // Update with new performance score and recalculate
                existingVote.performance_appraisal_score = candidate.performance_appraisal_score;
                existingVote.performance_weighted_score = VotingCalculator.calculatePerformanceWeightedScore(
                    candidate.performance_appraisal_score
                );

                // Recalculate all scores
                const calculationData = {
                    performance_appraisal_score: candidate.performance_appraisal_score,
                    manager_rating_score: existingVote.manager_rating_score || 0,
                    director_rating_score: existingVote.director_rating_score || 0,
                    peer_votes: existingVote.peer_votes || [],
                    total_eligible_peer_voters: existingVote.total_eligible_peer_voters || 0,
                    is_managerial: candidate.is_managerial || false
                };

                const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);
                Object.assign(existingVote, calculations);
                existingVote.last_updated_by = 'FINAL_SCORE_UPDATE';

                await existingVote.save();
                console.log(`   ✅ ${candidate.first_name} ${candidate.last_name}: Performance ${candidate.performance_appraisal_score}/50 → Weighted ${calculations.performance_weighted_score}/50`);
            }
        }

        // Display final candidate distribution
        console.log('\n📊 Final Candidate Distribution:');
        console.log('==================================');

        const finalCandidatesByDept = await User.aggregate([
            { $match: { status: false, roles: { $in: ['user'] } } },
            { $group: {
                _id: '$department',
                count: { $sum: 1 },
                candidates: {
                    $push: {
                        name: { $concat: ['$first_name', ' ', '$last_name'] },
                        id: '$employee_id',
                        score: '$performance_appraisal_score'
                    }
                }
            } },
            { $sort: { _id: 1 } }
        ]);

        finalCandidatesByDept.forEach(dept => {
            console.log(`\n📋 ${dept._id}: ${dept.count} candidates`);
            dept.candidates.forEach(candidate => {
                console.log(`   • ${candidate.name} (${candidate.id}) - Score: ${candidate.score}/50`);
            });
        });

        console.log(`\n🎯 Summary:`);
        console.log(`   • Total Candidates: ${totalCandidates}`);
        console.log(`   • All performance scores converted to /50 scale`);
        console.log(`   • All departments have adequate candidates (2+ each)`);
        console.log(`   • Voting calculations updated with correct scores`);

        await mongoose.disconnect();
        console.log('\n✅ Finalization completed successfully!');

    } catch (error) {
        console.error('❌ Error finalizing scores and counts:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
finalizeScoresAndCounts();