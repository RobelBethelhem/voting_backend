import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';

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

const checkVotingPeriodAndRecords = async () => {
    try {
        await connectDB();

        console.log('🔍 DIAGNOSING MANAGERIAL-CANDIDATES ENDPOINT ISSUE');
        console.log('====================================================\n');

        // 1. Check for active voting periods
        console.log('1. 📅 CHECKING VOTING PERIODS:');
        console.log('===============================');

        const allVotingPeriods = await VotingPeriod.find({});
        console.log(`Total Voting Periods: ${allVotingPeriods.length}`);

        if (allVotingPeriods.length === 0) {
            console.log('❌ No voting periods found at all');
        } else {
            allVotingPeriods.forEach(period => {
                console.log(`   📋 Period: ${period.period_name}`);
                console.log(`   🆔 ID: ${period.period_id}`);
                console.log(`   📊 Status: ${period.status}`);
                console.log(`   📅 Start: ${period.start_date}`);
                console.log(`   📅 End: ${period.end_date}`);
                console.log('');
            });
        }

        const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
        if (activeVotingPeriod) {
            console.log(`✅ Active voting period found: ${activeVotingPeriod.period_name}`);
        } else {
            console.log('❌ No active voting period found');
        }

        // 2. Check HierarchicalVote records
        console.log('\n2. 🗳️ CHECKING HIERARCHICAL VOTE RECORDS:');
        console.log('==========================================');

        const allHierarchicalVotes = await HierarchicalVote.find({});
        console.log(`Total HierarchicalVote records: ${allHierarchicalVotes.length}`);

        if (allHierarchicalVotes.length === 0) {
            console.log('❌ No HierarchicalVote records found');
        } else {
            console.log('📊 HierarchicalVote records by voting period:');
            const recordsByPeriod = {};
            allHierarchicalVotes.forEach(vote => {
                if (!recordsByPeriod[vote.voting_period_id]) {
                    recordsByPeriod[vote.voting_period_id] = [];
                }
                recordsByPeriod[vote.voting_period_id].push(vote);
            });

            Object.keys(recordsByPeriod).forEach(periodId => {
                const votes = recordsByPeriod[periodId];
                console.log(`   📅 Period ${periodId}: ${votes.length} candidates`);
                votes.forEach(vote => {
                    console.log(`      - ${vote.candidate_first_name} ${vote.candidate_last_name} (${vote.candidate_employee_id})`);
                    console.log(`        Department: ${vote.candidate_department}`);
                });
            });
        }

        // 3. Check candidates in User model
        console.log('\n3. 👥 CHECKING CANDIDATES IN USER MODEL:');
        console.log('=========================================');

        const candidates = await User.find({ status: false, roles: { $in: ['user'] } });
        console.log(`Total candidates in User model: ${candidates.length}`);

        const candidatesByDept = {};
        candidates.forEach(candidate => {
            if (!candidatesByDept[candidate.department]) {
                candidatesByDept[candidate.department] = [];
            }
            candidatesByDept[candidate.department].push(candidate);
        });

        Object.keys(candidatesByDept).forEach(dept => {
            const deptCandidates = candidatesByDept[dept];
            console.log(`   🏢 ${dept}: ${deptCandidates.length} candidates`);
            deptCandidates.forEach(candidate => {
                console.log(`      - ${candidate.first_name} ${candidate.last_name} (${candidate.employee_id})`);
                console.log(`        Manager: ${candidate.manager_id}`);
            });
        });

        // 4. Test manager lookup
        console.log('\n4. 👔 TESTING MANAGER HIERARCHY:');
        console.log('=================================');

        const managers = await User.find({ roles: { $in: ['manager'] } });
        console.log(`Total managers: ${managers.length}`);

        managers.forEach(manager => {
            console.log(`   👔 Manager: ${manager.first_name} ${manager.last_name} (${manager.employee_id})`);
            console.log(`      Department: ${manager.department}`);
            console.log(`      Roles: ${manager.roles.join(', ')}`);

            // Find candidates under this manager
            const managedCandidates = candidates.filter(candidate => candidate.manager_id === manager.employee_id);
            console.log(`      Reports: ${managedCandidates.length} candidates`);
            managedCandidates.forEach(candidate => {
                console.log(`         - ${candidate.first_name} ${candidate.last_name}`);
            });
            console.log('');
        });

        // 5. Propose solution
        console.log('🔧 DIAGNOSIS AND SOLUTION:');
        console.log('===========================');

        if (!activeVotingPeriod) {
            console.log('❌ ISSUE 1: No active voting period');
            console.log('   SOLUTION: Create an active voting period');
        }

        if (allHierarchicalVotes.length === 0) {
            console.log('❌ ISSUE 2: No HierarchicalVote records');
            console.log('   SOLUTION: Initialize candidates in HierarchicalVote table');
        }

        if (activeVotingPeriod && allHierarchicalVotes.length === 0) {
            console.log('🎯 RECOMMENDED ACTION:');
            console.log('   1. Create/activate a voting period');
            console.log('   2. Initialize all candidates in HierarchicalVote table');
            console.log('   3. Test the managerial-candidates endpoint again');
        }

        await mongoose.disconnect();
        console.log('\n✅ Diagnosis completed!');

    } catch (error) {
        console.error('❌ Error during diagnosis:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
checkVotingPeriodAndRecords();