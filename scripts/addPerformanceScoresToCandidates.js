import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
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

const generateRandomPerformanceScore = (min = 70, max = 100) => {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
};

const addPerformanceScoresToCandidates = async () => {
    try {
        await connectDB();

        console.log('🔍 Checking candidates for missing performance scores...\n');

        // Find all candidates (users with status: false)
        const candidates = await User.find({ status: false, roles: { $in: ['user'] } });
        console.log(`Found ${candidates.length} candidates\n`);

        let updatedCount = 0;
        let alreadyHadScores = 0;

        for (const candidate of candidates) {
            if (!candidate.performance_appraisal_score || candidate.performance_appraisal_score === 0) {
                // Generate performance score based on role hierarchy
                let newScore;
                if (candidate.roles.includes('manager')) {
                    newScore = generateRandomPerformanceScore(85, 95);
                } else {
                    newScore = generateRandomPerformanceScore(75, 90);
                }

                // Update the candidate
                await User.updateOne(
                    { employee_id: candidate.employee_id },
                    { performance_appraisal_score: newScore }
                );

                console.log(`✅ Added score to ${candidate.first_name} ${candidate.last_name}: ${newScore}/100`);
                updatedCount++;

                // Update corresponding HierarchicalVote record if it exists
                const hierarchicalVote = await HierarchicalVote.findOne({
                    candidate_employee_id: candidate.employee_id
                });

                if (hierarchicalVote) {
                    // Store the /100 performance score
                    hierarchicalVote.performance_appraisal_score = newScore;

                    // Recalculate all scores using the VotingCalculator
                    const calculationData = {
                        performance_appraisal_score: newScore,
                        manager_rating_score: hierarchicalVote.manager_rating_score || 0,
                        director_rating_score: hierarchicalVote.director_rating_score || 0,
                        peer_votes: hierarchicalVote.peer_votes || [],
                        total_eligible_peer_voters: hierarchicalVote.total_eligible_peer_voters || 0,
                        is_managerial: candidate.is_managerial || false
                    };

                    const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);
                    Object.assign(hierarchicalVote, calculations);
                    hierarchicalVote.last_updated_by = 'PERFORMANCE_SCORE_FIX';

                    await hierarchicalVote.save();
                    console.log(`   📊 Updated voting calculations for ${candidate.first_name} ${candidate.last_name}`);
                }
            } else {
                console.log(`ℹ️  ${candidate.first_name} ${candidate.last_name}: Already has score ${candidate.performance_appraisal_score}/100`);
                alreadyHadScores++;
            }
        }

        console.log('\n📋 Summary:');
        console.log('============');
        console.log(`✅ Updated ${updatedCount} candidates with new performance scores`);
        console.log(`ℹ️  ${alreadyHadScores} candidates already had performance scores`);
        console.log(`📊 Total candidates: ${candidates.length}`);

        // Verify all candidates now have performance scores
        console.log('\n🔍 Verification:');
        console.log('================');
        const candidatesAfterUpdate = await User.find({
            status: false,
            roles: { $in: ['user'] },
            $or: [
                { performance_appraisal_score: { $exists: false } },
                { performance_appraisal_score: 0 }
            ]
        });

        if (candidatesAfterUpdate.length === 0) {
            console.log('✅ All candidates now have performance scores stored as /100!');
        } else {
            console.log(`❌ ${candidatesAfterUpdate.length} candidates still missing performance scores`);
            candidatesAfterUpdate.forEach(candidate => {
                console.log(`   - ${candidate.first_name} ${candidate.last_name} (${candidate.employee_id})`);
            });
        }

        await mongoose.disconnect();
        console.log('\n✅ Performance score update completed successfully!');

    } catch (error) {
        console.error('❌ Error adding performance scores:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
addPerformanceScoresToCandidates();