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

const updatePerformanceWeightedScores = async () => {
    try {
        await connectDB();

        console.log('🔧 UPDATING PERFORMANCE WEIGHTED SCORES');
        console.log('=======================================\n');

        // Get all HierarchicalVote records
        const allRecords = await HierarchicalVote.find({});

        console.log(`Processing ${allRecords.length} HierarchicalVote records...\n`);

        let updatedCount = 0;

        for (const record of allRecords) {
            console.log(`Processing: ${record.candidate_first_name} ${record.candidate_last_name} (${record.candidate_employee_id})`);

            // Calculate the correct weighted score
            const rawScore = record.performance_appraisal_score || 0;
            const weightedScore = VotingCalculator.calculatePerformanceWeightedScore(rawScore);

            console.log(`   📊 Raw Score: ${rawScore}/100`);
            console.log(`   🔢 Calculated Weighted: ${weightedScore}/50`);

            // Update the record
            await HierarchicalVote.updateOne(
                { _id: record._id },
                {
                    performance_weighted_score: weightedScore,
                    last_updated_by: 'PERFORMANCE_SCORE_FIX',
                    last_updated_at: new Date()
                }
            );

            console.log(`   ✅ Updated performance_weighted_score to ${weightedScore}/50`);
            console.log('');

            updatedCount++;
        }

        console.log('🔍 VERIFICATION:');
        console.log('================');

        // Verify the updates
        const updatedRecords = await HierarchicalVote.find({}).sort({ candidate_department: 1 });

        updatedRecords.forEach((record, index) => {
            const expectedWeighted = record.performance_appraisal_score / 2;
            const actualWeighted = record.performance_weighted_score;
            const isCorrect = Math.abs(expectedWeighted - actualWeighted) < 0.01;

            console.log(`${index + 1}. ${record.candidate_first_name} ${record.candidate_last_name}`);
            console.log(`   📊 Raw: ${record.performance_appraisal_score}/100 → Weighted: ${actualWeighted}/50 ${isCorrect ? '✅' : '❌'}`);
        });

        console.log('\n📊 SUMMARY:');
        console.log('===========');
        console.log(`✅ Updated ${updatedCount} records successfully`);

        const allHaveValidScores = updatedRecords.every(r => r.performance_weighted_score > 0);
        if (allHaveValidScores) {
            console.log('✅ All records now have valid performance weighted scores');
            console.log('✅ Frontend should now display correct scores like 39.00/50 instead of 0.00/50');
        } else {
            console.log('❌ Some records still have invalid scores');
        }

        console.log('\n🎯 EXPECTED RESULT:');
        console.log('==================');
        console.log('When managers view candidates, they should now see:');
        updatedRecords.forEach(record => {
            if (record.candidate_department === 'Operations') {
                console.log(`• ${record.candidate_first_name} ${record.candidate_last_name}: ${record.performance_weighted_score.toFixed(2)}/50`);
            }
        });

        await mongoose.disconnect();
        console.log('\n🎉 Performance weighted scores updated successfully!');

    } catch (error) {
        console.error('❌ Error updating performance scores:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
updatePerformanceWeightedScores();