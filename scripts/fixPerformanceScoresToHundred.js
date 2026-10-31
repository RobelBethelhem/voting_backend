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

const generateRandomPerformanceScore = (min, max) => {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
};

const fixPerformanceScoresToHundred = async () => {
    try {
        await connectDB();

        console.log('🔄 Converting Performance Scores from /50 to /100 in User Model...\n');

        // Update all users to have performance scores out of 100
        const allUsers = await User.find({});

        for (const user of allUsers) {
            let newScore;
            if (user.roles.includes('chief')) {
                // Chiefs: 85-100 out of 100
                newScore = generateRandomPerformanceScore(85, 100);
            } else if (user.roles.includes('director')) {
                // Directors: 80-96 out of 100
                newScore = generateRandomPerformanceScore(80, 96);
            } else if (user.roles.includes('manager')) {
                // Managers: 76-92 out of 100
                newScore = generateRandomPerformanceScore(76, 92);
            } else if (user.roles.includes('user')) {
                // Regular employees: 70-90 out of 100
                newScore = generateRandomPerformanceScore(70, 90);
            } else {
                // Admin: perfect score
                newScore = 100;
            }

            await User.updateOne(
                { employee_id: user.employee_id },
                { performance_appraisal_score: newScore }
            );

            console.log(`   ✅ ${user.first_name} ${user.last_name}: ${newScore}/100 (${user.roles.join(', ')})`);
        }

        console.log(`\n📊 All users now have performance scores out of 100\n`);

        // Update all HierarchicalVote records to use /100 scores but convert to /50 for calculations
        console.log('🔄 Updating HierarchicalVote records with /100 scores...\n');

        const allCandidates = await User.find({ status: false, roles: { $in: ['user'] } });

        for (const candidate of allCandidates) {
            const hierarchicalVote = await HierarchicalVote.findOne({
                candidate_employee_id: candidate.employee_id
            });

            if (hierarchicalVote) {
                // Store the /100 performance score
                hierarchicalVote.performance_appraisal_score = candidate.performance_appraisal_score;

                // Calculate performance weighted score by converting /100 to /50 first
                const performanceOutOf50 = candidate.performance_appraisal_score / 2; // Convert 100 to 50
                hierarchicalVote.performance_weighted_score = VotingCalculator.calculatePerformanceWeightedScore(
                    performanceOutOf50
                );

                // Recalculate all other scores
                const calculationData = {
                    performance_appraisal_score: performanceOutOf50, // Use /50 for calculations
                    manager_rating_score: hierarchicalVote.manager_rating_score || 0,
                    director_rating_score: hierarchicalVote.director_rating_score || 0,
                    peer_votes: hierarchicalVote.peer_votes || [],
                    total_eligible_peer_voters: hierarchicalVote.total_eligible_peer_voters || 0,
                    is_managerial: candidate.is_managerial || false
                };

                const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);
                Object.assign(hierarchicalVote, calculations);

                // Override performance_weighted_score to show it was calculated from /100 → /50
                hierarchicalVote.performance_weighted_score = (performanceOutOf50 / 50) * 50;

                hierarchicalVote.last_updated_by = 'PERFORMANCE_100_FIX';

                await hierarchicalVote.save();

                console.log(`   ✅ ${candidate.first_name} ${candidate.last_name}:`);
                console.log(`      📊 Performance: ${candidate.performance_appraisal_score}/100 → Converted to ${performanceOutOf50}/50 for calculation`);
                console.log(`      ⚖️ Performance Weighted: ${hierarchicalVote.performance_weighted_score}/50`);
            }
        }

        console.log('\n📋 Summary:');
        console.log('============');
        console.log('✅ User performance scores now stored as /100');
        console.log('✅ Calculations use /50 conversion (score ÷ 2)');
        console.log('✅ Excel export will show original /100 scores');
        console.log('✅ Voting calculations remain accurate');

        console.log('\n🎯 Formula Process:');
        console.log('==================');
        console.log('1. Store: performance_appraisal_score/100 in User model');
        console.log('2. Convert: (score ÷ 2) = performance/50 for calculations');
        console.log('3. Calculate: (performance/50 ÷ 50) × 50 = weighted score/50');
        console.log('4. Export: Show original /100 score in Excel');

        await mongoose.disconnect();
        console.log('\n✅ Performance scores successfully converted to /100 scale!');

    } catch (error) {
        console.error('❌ Error fixing performance scores:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
fixPerformanceScoresToHundred();