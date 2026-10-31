import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
import Candidate from '../models/rms/Candidate.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';
import CandidateQualificationService from '../services/candidateQualificationService.js';

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

const initializeCandidatesForCurrentPeriod = async () => {
    try {
        await connectDB();

        console.log('\n🎯 INITIALIZING CANDIDATES FOR CURRENT VOTING PERIOD');
        console.log('=====================================================\n');

        // 1. Get the active voting period
        const activePeriod = await VotingPeriod.findOne({
            status: { $in: ['peer_voting', 'manager_review', 'active'] }
        });

        if (!activePeriod) {
            console.log('❌ No active voting period found');
            console.log('Please ensure there is an active voting period with status: peer_voting, manager_review, or active');
            await mongoose.disconnect();
            return;
        }

        console.log(`📅 Active Voting Period: ${activePeriod.period_name}`);
        console.log(`🆔 Period ID: ${activePeriod.period_id}`);
        console.log(`📊 Status: ${activePeriod.status}`);
        console.log(`📅 Start Date: ${activePeriod.start_date}`);
        console.log(`📅 End Date: ${activePeriod.end_date}\n`);

        // 2. Check if candidates already exist for this period
        const existingCandidates = await Candidate.find({
            voting_period_id: activePeriod.period_id
        });

        if (existingCandidates.length > 0) {
            console.log(`⚠️  Found ${existingCandidates.length} existing candidates for this period`);
            console.log('Do you want to clear and re-initialize? This will DELETE existing candidates.');

            // For safety, we'll skip if candidates already exist
            console.log('🔒 Skipping re-initialization to preserve existing data');
            console.log('To force re-initialization, manually delete candidates first\n');

            // Show existing candidates summary
            const deptSummary = {};
            existingCandidates.forEach(c => {
                if (!deptSummary[c.department]) {
                    deptSummary[c.department] = { count: 0, professionals: 0, managers: 0 };
                }
                deptSummary[c.department].count++;
                if (c.level === 'professional') deptSummary[c.department].professionals++;
                if (c.level === 'manager') deptSummary[c.department].managers++;
            });

            console.log('📊 EXISTING CANDIDATES SUMMARY:');
            console.log('================================');
            Object.keys(deptSummary).forEach(dept => {
                const stats = deptSummary[dept];
                console.log(`${dept}: ${stats.count} candidates (${stats.professionals} professionals, ${stats.managers} managers)`);
            });

            await mongoose.disconnect();
            return;
        }

        // 3. Get all eligible users
        console.log('🔍 Finding eligible users...\n');

        // Get users with status: true (active employees) who are eligible to be candidates
        const eligibleUsers = await User.find({
            $or: [
                { level: 'professional' },
                { level: 'manager' },
                { level: 'director' }
            ],
            performance_appraisal_score: { $gte: 60 } // Minimum performance score
        });

        console.log(`👥 Found ${eligibleUsers.length} eligible users with performance score >= 60\n`);

        // 4. Group users by department for summary
        const departmentGroups = {};
        eligibleUsers.forEach(user => {
            if (!departmentGroups[user.department]) {
                departmentGroups[user.department] = [];
            }
            departmentGroups[user.department].push(user);
        });

        console.log('📂 DEPARTMENT BREAKDOWN:');
        console.log('========================');
        Object.keys(departmentGroups).forEach(dept => {
            const users = departmentGroups[dept];
            const professionals = users.filter(u => u.level === 'professional').length;
            const managers = users.filter(u => u.level === 'manager').length;
            const directors = users.filter(u => u.level === 'director').length;

            console.log(`\n${dept} Department:`);
            console.log(`  • Total: ${users.length} eligible users`);
            console.log(`  • Professionals: ${professionals}`);
            console.log(`  • Managers: ${managers}`);
            console.log(`  • Directors: ${directors}`);
        });

        // 5. Create candidate records
        console.log('\n\n📝 CREATING CANDIDATE RECORDS...');
        console.log('==================================\n');

        const candidatesToInsert = [];

        for (const user of eligibleUsers) {
            // Get hierarchy information
            let manager = null;
            let director = null;
            let chief = null;

            // Find manager
            if (user.manager_id) {
                manager = await User.findOne({ employee_id: user.manager_id });
            }

            // Find director (could be user's direct manager if manager is a director)
            if (user.director_id) {
                director = await User.findOne({ employee_id: user.director_id });
            } else if (manager && manager.level === 'director') {
                director = manager;
            } else {
                // Find department director
                director = await User.findOne({
                    department: user.department,
                    level: 'director'
                });
            }

            // Find chief
            chief = await User.findOne({ level: 'chief' });

            // Calculate performance weighted score (50% of total)
            const performanceWeighted = (user.performance_appraisal_score / 100) * 50;

            // Determine eligibility based on level
            const eligibility = CandidateQualificationService.determineEligibility(user.level);

            const candidateData = {
                employee_id: user.employee_id,
                first_name: user.first_name,
                last_name: user.last_name,
                department: user.department,
                position: user.position || 'Not Specified',
                level: user.level,
                performance_appraisal_score: user.performance_appraisal_score,
                performance_weighted: performanceWeighted,
                manager_id: manager ? manager.employee_id : null,
                director_id: director ? director.employee_id : null,
                chief_id: chief ? chief.employee_id : null,
                voting_period_id: activePeriod.period_id,
                is_active: true,
                qualification_criteria: {
                    min_performance_score: 60,
                    eligible_for_peer_voting: eligibility.peerVoting,
                    eligible_for_manager_rating: eligibility.managerRating,
                    eligible_for_director_rating: eligibility.directorRating
                },
                registered_By: 'SYSTEM_INITIALIZATION',
                Created_At: new Date(),
                Updated_At: new Date(),
                Updated_By: 'SYSTEM_INITIALIZATION'
            };

            candidatesToInsert.push(candidateData);

            console.log(`✅ Prepared: ${user.first_name} ${user.last_name} (${user.employee_id})`);
            console.log(`   Level: ${user.level} | Dept: ${user.department} | Score: ${user.performance_appraisal_score}`);
            console.log(`   Manager: ${manager ? manager.employee_id : 'None'} | Director: ${director ? director.employee_id : 'None'}`);
            console.log(`   Eligible for: ${eligibility.peerVoting ? 'Peer Voting' : ''} ${eligibility.managerRating ? 'Manager Rating' : ''} ${eligibility.directorRating ? 'Director Rating' : ''}`);
            console.log('');
        }

        // 6. Bulk insert candidates
        console.log('\n💾 INSERTING CANDIDATES INTO DATABASE...');
        console.log('=========================================\n');

        if (candidatesToInsert.length > 0) {
            const insertedCandidates = await Candidate.insertMany(candidatesToInsert);
            console.log(`✅ Successfully inserted ${insertedCandidates.length} candidates\n`);

            // 7. Verification
            console.log('🔍 VERIFICATION:');
            console.log('================\n');

            // Verify Finance department specifically
            const financeCandidates = await Candidate.find({
                voting_period_id: activePeriod.period_id,
                department: 'Finance'
            });

            console.log(`📊 Finance Department: ${financeCandidates.length} candidates`);
            financeCandidates.forEach(c => {
                console.log(`   - ${c.employee_id}: ${c.first_name} ${c.last_name} (${c.level})`);
            });

            // Overall statistics
            const allCandidates = await Candidate.find({
                voting_period_id: activePeriod.period_id
            });

            const stats = {
                total: allCandidates.length,
                byLevel: {
                    professional: allCandidates.filter(c => c.level === 'professional').length,
                    manager: allCandidates.filter(c => c.level === 'manager').length,
                    director: allCandidates.filter(c => c.level === 'director').length
                },
                byDepartment: {}
            };

            allCandidates.forEach(c => {
                if (!stats.byDepartment[c.department]) {
                    stats.byDepartment[c.department] = 0;
                }
                stats.byDepartment[c.department]++;
            });

            console.log('\n📈 FINAL STATISTICS:');
            console.log('====================');
            console.log(`Total Candidates: ${stats.total}`);
            console.log(`\nBy Level:`);
            console.log(`  • Professionals: ${stats.byLevel.professional}`);
            console.log(`  • Managers: ${stats.byLevel.manager}`);
            console.log(`  • Directors: ${stats.byLevel.director}`);
            console.log(`\nBy Department:`);
            Object.keys(stats.byDepartment).forEach(dept => {
                console.log(`  • ${dept}: ${stats.byDepartment[dept]} candidates`);
            });

            // Test query for PRO004
            console.log('\n🧪 TEST QUERY FOR PRO004:');
            console.log('=========================');

            const testCandidates = await Candidate.find({
                voting_period_id: activePeriod.period_id,
                department: 'Finance',
                level: 'professional',
                is_active: true,
                'qualification_criteria.eligible_for_peer_voting': true,
                employee_id: { $ne: 'PRO004' } // Exclude self
            });

            console.log(`Found ${testCandidates.length} Finance professionals eligible for peer voting by PRO004`);
            testCandidates.forEach(c => {
                console.log(`  ✓ ${c.employee_id}: ${c.first_name} ${c.last_name}`);
            });

        } else {
            console.log('⚠️  No candidates to insert. Please check user data and eligibility criteria.');
        }

        console.log('\n✨ INITIALIZATION COMPLETE!');
        console.log('============================');
        console.log('Next steps:');
        console.log('1. PRO004 should now be able to see Finance department peers for voting');
        console.log('2. Test the /api/rms/admin/landing/get_candidate_by_department endpoint');
        console.log('3. Verify candidates appear in the voting interface');

        await mongoose.disconnect();
        console.log('\n👋 Database connection closed');

    } catch (error) {
        console.error('❌ Error initializing candidates:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the initialization
initializeCandidatesForCurrentPeriod();