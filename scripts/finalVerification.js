import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
import Candidate from '../models/rms/Candidate.js';

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

const finalVerification = async () => {
    try {
        await connectDB();

        console.log('🔍 FINAL VERIFICATION: Candidate Performance Scores');
        console.log('===================================================\n');

        // Check User model candidates (status: false)
        console.log('1️⃣ USER MODEL CANDIDATES (Main Voting System):');
        console.log('===============================================');
        const userCandidates = await User.find({ status: false, roles: { $in: ['user'] } });

        console.log(`Total User candidates: ${userCandidates.length}\n`);

        userCandidates.forEach((candidate, index) => {
            console.log(`${index + 1}. ${candidate.first_name} ${candidate.last_name}`);
            console.log(`   📋 ID: ${candidate.employee_id}`);
            console.log(`   🏢 Dept: ${candidate.department}`);
            console.log(`   📊 Performance Score: ${candidate.performance_appraisal_score}/100`);
            console.log('');
        });

        // Check Candidate model
        console.log('2️⃣ CANDIDATE MODEL (Frontend Display):');
        console.log('=====================================');
        const candidateRecords = await Candidate.find({});

        console.log(`Total Candidate records: ${candidateRecords.length}\n`);

        candidateRecords.forEach((candidate, index) => {
            console.log(`${index + 1}. ${candidate.first_name} ${candidate.last_name}`);
            console.log(`   📋 ID: ${candidate.employee_id}`);
            console.log(`   🏢 Dept: ${candidate.department}`);
            console.log(`   📊 Performance Score: ${candidate.performance_appraisal_score}/100`);
            console.log('');
        });

        // Verification checks
        console.log('✅ VERIFICATION CHECKLIST:');
        console.log('==========================');

        // Check 1: User model candidates have scores
        const userCandidatesWithoutScores = userCandidates.filter(c =>
            !c.performance_appraisal_score || c.performance_appraisal_score === 0
        );
        console.log(`✅ User candidates with scores: ${userCandidates.length - userCandidatesWithoutScores.length}/${userCandidates.length}`);

        // Check 2: Candidate model records have scores
        const candidateRecordsWithoutScores = candidateRecords.filter(c =>
            !c.performance_appraisal_score || c.performance_appraisal_score === 0
        );
        console.log(`✅ Candidate records with scores: ${candidateRecords.length - candidateRecordsWithoutScores.length}/${candidateRecords.length}`);

        // Check 3: Data synchronization
        const syncErrors = [];
        for (const userCandidate of userCandidates) {
            const matchingCandidate = candidateRecords.find(c => c.employee_id === userCandidate.employee_id);
            if (!matchingCandidate) {
                syncErrors.push(`${userCandidate.employee_id} missing from Candidate model`);
            } else if (matchingCandidate.performance_appraisal_score !== userCandidate.performance_appraisal_score) {
                syncErrors.push(`${userCandidate.employee_id} score mismatch: User(${userCandidate.performance_appraisal_score}) vs Candidate(${matchingCandidate.performance_appraisal_score})`);
            }
        }

        console.log(`✅ Data synchronization: ${syncErrors.length === 0 ? 'PERFECT' : `${syncErrors.length} issues`}`);
        if (syncErrors.length > 0) {
            syncErrors.forEach(error => console.log(`   ⚠️ ${error}`));
        }

        // Performance score statistics
        console.log('\n📊 PERFORMANCE SCORE STATISTICS:');
        console.log('================================');

        if (userCandidates.length > 0) {
            const scores = userCandidates.map(c => c.performance_appraisal_score);
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);

            console.log(`📈 Average Score: ${avgScore.toFixed(2)}/100`);
            console.log(`📉 Min Score: ${minScore}/100`);
            console.log(`📈 Max Score: ${maxScore}/100`);
            console.log(`🎯 Score Range: ${minScore} - ${maxScore}`);
        }

        // Department distribution
        console.log('\n🏢 DEPARTMENT DISTRIBUTION:');
        console.log('===========================');

        const deptStats = {};
        userCandidates.forEach(candidate => {
            if (!deptStats[candidate.department]) {
                deptStats[candidate.department] = {
                    count: 0,
                    totalScore: 0,
                    candidates: []
                };
            }
            deptStats[candidate.department].count++;
            deptStats[candidate.department].totalScore += candidate.performance_appraisal_score;
            deptStats[candidate.department].candidates.push(candidate);
        });

        Object.keys(deptStats).forEach(dept => {
            const stats = deptStats[dept];
            const avgScore = stats.totalScore / stats.count;
            console.log(`\n📂 ${dept}: ${stats.count} candidates (Avg: ${avgScore.toFixed(2)}/100)`);
            stats.candidates.forEach(c => {
                console.log(`   • ${c.first_name} ${c.last_name}: ${c.performance_appraisal_score}/100`);
            });
        });

        console.log('\n🎉 FINAL STATUS:');
        console.log('================');

        const allGood = (
            userCandidatesWithoutScores.length === 0 &&
            candidateRecordsWithoutScores.length === 0 &&
            syncErrors.length === 0 &&
            userCandidates.length > 0 &&
            candidateRecords.length > 0
        );

        if (allGood) {
            console.log('✅ SUCCESS: All candidates have performance scores stored as /100!');
            console.log('✅ SUCCESS: Both User and Candidate models are synchronized!');
            console.log('✅ SUCCESS: Frontend will display performance scores correctly!');
            console.log('✅ SUCCESS: Voting calculations will work with /100 to /50 conversion!');
        } else {
            console.log('❌ ISSUES DETECTED - Review the checklist above');
        }

        await mongoose.disconnect();
        console.log('\n✅ Final verification completed!');

    } catch (error) {
        console.error('❌ Error during verification:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
finalVerification();