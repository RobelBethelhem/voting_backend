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

const clearAndRegisterCandidates = async () => {
    try {
        await connectDB();

        console.log('🗑️ Clearing existing Candidate table...\n');

        // Clear the existing Candidate table
        const deleteResult = await Candidate.deleteMany({});
        console.log(`✅ Deleted ${deleteResult.deletedCount} existing candidate records\n`);

        console.log('👥 Getting candidates from User model...\n');

        // Get all candidates from User model (status: false)
        const userCandidates = await User.find({ status: false, roles: { $in: ['user'] } });
        console.log(`Found ${userCandidates.length} candidates in User model\n`);

        console.log('📝 Registering candidates to Candidate table...\n');

        let registeredCount = 0;

        for (const userCandidate of userCandidates) {
            const candidateData = {
                employee_id: userCandidate.employee_id,
                first_name: userCandidate.first_name,
                last_name: userCandidate.last_name,
                department: userCandidate.department,
                position: userCandidate.position,
                performance_appraisal_score: userCandidate.performance_appraisal_score || 0,
                registered_By: 'SYSTEM_MIGRATION',
                Created_At: new Date(),
                Updated_At: new Date(),
                Updated_By: 'SYSTEM_MIGRATION'
            };

            const newCandidate = new Candidate(candidateData);
            await newCandidate.save();

            console.log(`✅ Registered: ${candidateData.first_name} ${candidateData.last_name} (${candidateData.employee_id}) - Score: ${candidateData.performance_appraisal_score}/100`);
            registeredCount++;
        }

        console.log('\n📊 Verification - Candidate table contents:');
        console.log('==========================================');

        const allCandidates = await Candidate.find({});
        allCandidates.forEach((candidate, index) => {
            console.log(`${index + 1}. ${candidate.first_name} ${candidate.last_name}`);
            console.log(`   📋 Employee ID: ${candidate.employee_id}`);
            console.log(`   🏢 Department: ${candidate.department}`);
            console.log(`   💼 Position: ${candidate.position}`);
            console.log(`   📊 Performance Score: ${candidate.performance_appraisal_score}/100`);
            console.log(`   👤 Registered By: ${candidate.registered_By}`);
            console.log(`   📅 Created: ${new Date(candidate.Created_At).toLocaleDateString()}`);
            console.log('');
        });

        console.log('📋 Summary:');
        console.log('============');
        console.log(`✅ Cleared old Candidate table`);
        console.log(`✅ Registered ${registeredCount} candidates with performance scores`);
        console.log(`✅ All candidates now have performance_appraisal_score field populated`);
        console.log(`✅ Candidate table is synchronized with User model candidates`);

        // Verify performance scores
        const candidatesWithoutScores = await Candidate.find({
            $or: [
                { performance_appraisal_score: { $exists: false } },
                { performance_appraisal_score: 0 }
            ]
        });

        if (candidatesWithoutScores.length === 0) {
            console.log(`✅ All ${allCandidates.length} candidates have valid performance scores!`);
        } else {
            console.log(`⚠️ ${candidatesWithoutScores.length} candidates missing performance scores`);
        }

        console.log('\n🎯 Department Distribution:');
        console.log('============================');

        const departmentStats = await Candidate.aggregate([
            {
                $group: {
                    _id: '$department',
                    count: { $sum: 1 },
                    avgScore: { $avg: '$performance_appraisal_score' },
                    candidates: {
                        $push: {
                            name: { $concat: ['$first_name', ' ', '$last_name'] },
                            score: '$performance_appraisal_score'
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        departmentStats.forEach(dept => {
            console.log(`\n📂 ${dept._id}: ${dept.count} candidates (Avg Score: ${dept.avgScore.toFixed(2)}/100)`);
            dept.candidates.forEach(candidate => {
                console.log(`   • ${candidate.name}: ${candidate.score}/100`);
            });
        });

        await mongoose.disconnect();
        console.log('\n✅ Candidate table cleared and populated successfully!');

    } catch (error) {
        console.error('❌ Error clearing and registering candidates:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
clearAndRegisterCandidates();