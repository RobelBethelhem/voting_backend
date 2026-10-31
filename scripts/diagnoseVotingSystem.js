import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
import Candidate from '../models/rms/Candidate.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';

config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DB);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

const diagnoseVotingSystem = async () => {
    try {
        await connectDB();

        console.log('\n🔍 VOTING SYSTEM DIAGNOSIS');
        console.log('===========================\n');

        // 1. Check Voting Periods
        console.log('📅 VOTING PERIODS:');
        console.log('------------------');
        const votingPeriods = await VotingPeriod.find();

        if (votingPeriods.length === 0) {
            console.log('❌ No voting periods found');
        } else {
            votingPeriods.forEach(period => {
                console.log(`\nPeriod: ${period.period_name}`);
                console.log(`  ID: ${period.period_id}`);
                console.log(`  Status: ${period.status}`);
                console.log(`  Start: ${period.start_date}`);
                console.log(`  End: ${period.end_date}`);
                console.log(`  Active: ${period.status === 'peer_voting' || period.status === 'manager_review' || period.status === 'active' ? '✅ YES' : '❌ NO'}`);
            });
        }

        // Get active period
        const activePeriod = await VotingPeriod.findOne({
            status: { $in: ['peer_voting', 'manager_review', 'active'] }
        });

        if (!activePeriod) {
            console.log('\n❌ NO ACTIVE VOTING PERIOD - This is why candidates aren\'t showing!');
            console.log('   Solution: Create or activate a voting period with status "peer_voting"');
        } else {
            console.log(`\n✅ Active Period: ${activePeriod.period_name} (${activePeriod.period_id})`);
        }

        // 2. Check Users
        console.log('\n\n👥 USERS ANALYSIS:');
        console.log('-------------------');

        const allUsers = await User.find();
        const activeUsers = await User.find({ status: true });
        const professionals = await User.find({ level: 'professional' });
        const managers = await User.find({ level: 'manager' });
        const directors = await User.find({ level: 'director' });
        const chiefs = await User.find({ level: 'chief' });

        console.log(`Total Users: ${allUsers.length}`);
        console.log(`Active Users: ${activeUsers.length}`);
        console.log(`\nBy Level:`);
        console.log(`  Professionals: ${professionals.length}`);
        console.log(`  Managers: ${managers.length}`);
        console.log(`  Directors: ${directors.length}`);
        console.log(`  Chiefs: ${chiefs.length}`);

        // Check PRO004 specifically
        const pro004 = await User.findOne({ employee_id: 'PRO004' });
        if (pro004) {
            console.log('\n🎯 PRO004 USER DETAILS:');
            console.log(`  Name: ${pro004.first_name} ${pro004.last_name}`);
            console.log(`  Department: ${pro004.department}`);
            console.log(`  Level: ${pro004.level}`);
            console.log(`  Status: ${pro004.status ? 'Active' : 'Inactive'}`);
            console.log(`  Performance Score: ${pro004.performance_appraisal_score}`);
            console.log(`  Manager ID: ${pro004.manager_id || 'None'}`);
        } else {
            console.log('\n❌ PRO004 user not found!');
        }

        // Check Finance department users
        const financeUsers = await User.find({ department: 'Finance' });
        console.log(`\n📊 Finance Department: ${financeUsers.length} total users`);

        const financeProfessionals = financeUsers.filter(u => u.level === 'professional');
        console.log(`  Professionals in Finance: ${financeProfessionals.length}`);

        if (financeProfessionals.length > 0) {
            console.log('  Finance Professionals:');
            financeProfessionals.forEach(u => {
                console.log(`    - ${u.employee_id}: ${u.first_name} ${u.last_name} (Score: ${u.performance_appraisal_score})`);
            });
        }

        // 3. Check Candidates
        console.log('\n\n🎫 CANDIDATES ANALYSIS:');
        console.log('------------------------');

        const allCandidates = await Candidate.find();
        console.log(`Total Candidates (all periods): ${allCandidates.length}`);

        if (activePeriod) {
            const currentPeriodCandidates = await Candidate.find({
                voting_period_id: activePeriod.period_id
            });

            console.log(`\nCandidates for Active Period (${activePeriod.period_id}): ${currentPeriodCandidates.length}`);

            if (currentPeriodCandidates.length === 0) {
                console.log('❌ NO CANDIDATES FOR CURRENT PERIOD - This is the problem!');
                console.log('\n🔧 SOLUTION:');
                console.log('   Run: node scripts/initializeCandidatesForCurrentPeriod.js');
            } else {
                // Check Finance candidates
                const financeCandidates = currentPeriodCandidates.filter(c => c.department === 'Finance');
                console.log(`\nFinance Department Candidates: ${financeCandidates.length}`);

                const financeProCandidates = financeCandidates.filter(c => c.level === 'professional');
                console.log(`Finance Professional Candidates: ${financeProCandidates.length}`);

                if (financeProCandidates.length > 0) {
                    console.log('\nFinance Professional Candidates (eligible for peer voting):');
                    financeProCandidates.forEach(c => {
                        console.log(`  - ${c.employee_id}: ${c.first_name} ${c.last_name}`);
                        console.log(`    Peer Voting Eligible: ${c.qualification_criteria?.eligible_for_peer_voting ? '✅' : '❌'}`);
                    });
                }

                // Show what PRO004 should see
                if (pro004) {
                    const eligibleForPro004 = currentPeriodCandidates.filter(c =>
                        c.department === 'Finance' &&
                        c.level === 'professional' &&
                        c.employee_id !== 'PRO004' &&
                        c.is_active === true &&
                        c.qualification_criteria?.eligible_for_peer_voting === true
                    );

                    console.log(`\n✨ Candidates PRO004 should see: ${eligibleForPro004.length}`);
                    if (eligibleForPro004.length > 0) {
                        eligibleForPro004.forEach(c => {
                            console.log(`  ✓ ${c.employee_id}: ${c.first_name} ${c.last_name}`);
                        });
                    }
                }
            }

            // Check if candidates have required fields
            if (currentPeriodCandidates.length > 0) {
                const sampleCandidate = currentPeriodCandidates[0];
                console.log('\n🔍 Sample Candidate Structure Check:');
                console.log(`  Has voting_period_id: ${sampleCandidate.voting_period_id ? '✅' : '❌'}`);
                console.log(`  Has level field: ${sampleCandidate.level ? '✅' : '❌'}`);
                console.log(`  Has department: ${sampleCandidate.department ? '✅' : '❌'}`);
                console.log(`  Has qualification_criteria: ${sampleCandidate.qualification_criteria ? '✅' : '❌'}`);
                console.log(`  Has performance_appraisal_score: ${sampleCandidate.performance_appraisal_score !== undefined ? '✅' : '❌'}`);
                console.log(`  Has is_active: ${sampleCandidate.is_active !== undefined ? '✅' : '❌'}`);
            }
        }

        // 4. Summary and Recommendations
        console.log('\n\n📋 DIAGNOSIS SUMMARY:');
        console.log('======================');

        const issues = [];
        const solutions = [];

        if (!activePeriod) {
            issues.push('No active voting period');
            solutions.push('Create or activate a voting period with status "peer_voting"');
        }

        if (activePeriod && allCandidates.length === 0) {
            issues.push('No candidates in Candidate collection');
            solutions.push('Run initialization script to populate candidates');
        }

        if (activePeriod) {
            const currentCandidates = await Candidate.find({ voting_period_id: activePeriod.period_id });
            if (currentCandidates.length === 0) {
                issues.push('No candidates for current voting period');
                solutions.push('Run: node scripts/initializeCandidatesForCurrentPeriod.js');
            }

            const financePros = currentCandidates.filter(c =>
                c.department === 'Finance' &&
                c.level === 'professional'
            );
            if (financePros.length === 0) {
                issues.push('No Finance professional candidates');
                solutions.push('Check if Finance users have level field set and performance score >= 60');
            }
        }

        if (issues.length === 0) {
            console.log('✅ System appears to be configured correctly!');
            console.log('   If candidates still don\'t show, check:');
            console.log('   1. API endpoint routing');
            console.log('   2. Frontend API call configuration');
            console.log('   3. Authentication/authorization');
        } else {
            console.log('❌ ISSUES FOUND:');
            issues.forEach((issue, i) => {
                console.log(`   ${i + 1}. ${issue}`);
            });

            console.log('\n🔧 RECOMMENDED SOLUTIONS:');
            solutions.forEach((solution, i) => {
                console.log(`   ${i + 1}. ${solution}`);
            });
        }

        console.log('\n📌 QUICK FIX STEPS:');
        console.log('1. Ensure voting period exists and is active');
        console.log('2. Run: node scripts/initializeCandidatesForCurrentPeriod.js');
        console.log('3. Restart the backend server');
        console.log('4. Test the API endpoint again');

        await mongoose.disconnect();
        console.log('\n👋 Diagnosis complete. Database connection closed.');

    } catch (error) {
        console.error('❌ Diagnosis error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run diagnosis
diagnoseVotingSystem();