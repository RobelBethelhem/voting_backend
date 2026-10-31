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

const checkPerformanceScoresInHierarchicalVote = async () => {
    try {
        await connectDB();

        console.log('🔍 CHECKING PERFORMANCE SCORES IN HIERARCHICAL VOTE RECORDS');
        console.log('===========================================================\n');

        // Get all HierarchicalVote records
        const allRecords = await HierarchicalVote.find({}).sort({ candidate_department: 1, candidate_last_name: 1 });

        console.log(`Total HierarchicalVote records: ${allRecords.length}\n`);

        allRecords.forEach((record, index) => {
            console.log(`${index + 1}. ${record.candidate_first_name} ${record.candidate_last_name} (${record.candidate_employee_id})`);
            console.log(`   🏢 Department: ${record.candidate_department}`);
            console.log(`   📊 Raw Performance Score: ${record.performance_appraisal_score}`);
            console.log(`   📊 Performance Weighted Score: ${record.performance_weighted_score || 'Not calculated'}`);
            console.log(`   🔢 Manager Rating Score: ${record.manager_rating_score || 0}`);
            console.log(`   🔢 Manager Rating Weighted: ${record.manager_rating_weighted_score || 'Not calculated'}`);
            console.log(`   📈 Total Weighted Result: ${record.total_weighted_result || 'Not calculated'}`);

            // Test the calculation manually
            if (record.performance_appraisal_score) {
                const weightedScore = VotingCalculator.calculatePerformanceWeightedScore(record.performance_appraisal_score);
                console.log(`   🧮 Manual Calculation (should be /50): ${weightedScore}/50`);

                if (record.performance_weighted_score === 0 && weightedScore > 0) {
                    console.log(`   ⚠️ ISSUE: Performance weighted score is 0 but should be ${weightedScore}`);
                }
            }
            console.log('');
        });

        console.log('🔧 DIAGNOSIS:');
        console.log('=============');

        const recordsWithZeroWeighted = allRecords.filter(r => r.performance_weighted_score === 0);
        const recordsWithValidScores = allRecords.filter(r => r.performance_appraisal_score > 0);

        console.log(`📊 Records with valid raw performance scores: ${recordsWithValidScores.length}`);
        console.log(`⚠️ Records with zero weighted scores: ${recordsWithZeroWeighted.length}`);

        if (recordsWithZeroWeighted.length > 0) {
            console.log('\n❌ ISSUE IDENTIFIED: Performance weighted scores are not calculated');
            console.log('   CAUSE: The weighted scores need to be recalculated using VotingCalculator');
            console.log('   SOLUTION: Update all records with proper weighted score calculations');
        }

        // Check the VotingCalculator function
        console.log('\n🧮 TESTING VOTING CALCULATOR:');
        console.log('==============================');

        const testScore = 80.5;
        const calculatedWeighted = VotingCalculator.calculatePerformanceWeightedScore(testScore);
        console.log(`Test input: ${testScore}/100`);
        console.log(`Calculated weighted: ${calculatedWeighted}/50`);
        console.log(`Expected: ${testScore / 2}/50`);

        if (Math.abs(calculatedWeighted - (testScore / 2)) < 0.01) {
            console.log('✅ VotingCalculator is working correctly');
        } else {
            console.log('❌ VotingCalculator has an issue');
        }

        await mongoose.disconnect();
        console.log('\n✅ Performance score analysis completed!');

    } catch (error) {
        console.error('❌ Error checking performance scores:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
checkPerformanceScoresInHierarchicalVote();