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

const initializeCandidatesForVoting = async () => {
    try {
        await connectDB();

        console.log('🚀 INITIALIZING CANDIDATES FOR HIERARCHICAL VOTING');
        console.log('====================================================\n');

        // 1. Get active voting period
        const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
        if (!activeVotingPeriod) {
            console.log('❌ No active voting period found');
            await mongoose.disconnect();
            return;
        }

        console.log(`✅ Using active voting period: ${activeVotingPeriod.period_name}`);
        console.log(`📅 Period ID: ${activeVotingPeriod.period_id}\n`);

        // 2. Get all candidates from User model
        const candidates = await User.find({ status: false, roles: { $in: ['user'] } });
        console.log(`👥 Found ${candidates.length} candidates to initialize\n`);

        // 3. Initialize each candidate in HierarchicalVote table
        const initializedCandidates = [];

        for (const candidate of candidates) {
            // Check if already initialized
            const existingVote = await HierarchicalVote.findOne({
                voting_period_id: activeVotingPeriod.period_id,
                candidate_employee_id: candidate.employee_id
            });

            if (existingVote) {
                console.log(`⚠️ ${candidate.first_name} ${candidate.last_name} already initialized - skipping`);
                continue;
            }

            // Get manager information
            const manager = candidate.manager_id ?
                await User.findOne({ employee_id: candidate.manager_id }) : null;

            // Get director information (manager's manager or department director)
            let director = null;
            if (manager && manager.manager_id) {
                director = await User.findOne({ employee_id: manager.manager_id });
            } else {
                // Find director in same department
                director = await User.findOne({
                    department: candidate.department,
                    roles: { $in: ['director'] }
                });
            }

            // Get chief information
            const chief = await User.findOne({ roles: { $in: ['chief'] } });

            // Count eligible peer voters (same department, excluding candidate)
            const eligiblePeerVoters = await User.countDocuments({
                department: candidate.department,
                employee_id: { $ne: candidate.employee_id },
                status: true // Active users who can vote
            });

            // Create HierarchicalVote record
            const hierarchicalVoteData = {
                voting_period_id: activeVotingPeriod.period_id,
                voting_session_name: activeVotingPeriod.period_name,
                candidate_employee_id: candidate.employee_id,
                candidate_first_name: candidate.first_name,
                candidate_last_name: candidate.last_name,
                candidate_department: candidate.department,
                candidate_position: candidate.position,
                candidate_function: candidate.department, // Use department as function for now
                candidate_job_grade: 'Grade-5', // Default job grade
                performance_appraisal_score: candidate.performance_appraisal_score || 0,

                // Manager information
                manager_employee_id: manager ? manager.employee_id : null,
                manager_first_name: manager ? manager.first_name : null,
                manager_last_name: manager ? manager.last_name : null,
                manager_rating_score: 0, // Will be filled when manager rates

                // Director information
                director_employee_id: director ? director.employee_id : null,
                director_first_name: director ? director.first_name : null,
                director_last_name: director ? director.last_name : null,
                director_rating_score: 0, // Will be filled when director rates

                // Chief information
                chief_employee_id: chief ? chief.employee_id : null,
                chief_first_name: chief ? chief.first_name : null,
                chief_last_name: chief ? chief.last_name : null,

                // Voting statistics
                total_eligible_peer_voters: eligiblePeerVoters,
                peer_votes: [], // Will be populated as peers vote

                // Status fields
                is_managerial_position: candidate.roles.includes('manager') || candidate.roles.includes('director'),
                manager_rating_status: 'pending',
                director_rating_status: 'pending',
                chief_approval_status: 'pending',

                // Calculated scores (will be updated as voting progresses)
                performance_weighted_score: 0,
                manager_rating_weighted_score: 0,
                director_rating_weighted_score: 0,
                average_peer_rating: 0,
                peer_rating_weighted_score: 0,
                peer_voting_percentage: 0,
                weighted_rating: 0,
                total_rating_result: 0,
                total_weighted_result: 0,

                // Metadata
                created_by: 'SYSTEM_INITIALIZATION',
                created_at: new Date(),
                last_updated_by: 'SYSTEM_INITIALIZATION',
                last_updated_at: new Date()
            };

            const hierarchicalVote = new HierarchicalVote(hierarchicalVoteData);
            await hierarchicalVote.save();

            console.log(`✅ Initialized: ${candidate.first_name} ${candidate.last_name} (${candidate.employee_id})`);
            console.log(`   🏢 Department: ${candidate.department}`);
            console.log(`   👔 Manager: ${manager ? `${manager.first_name} ${manager.last_name}` : 'None'}`);
            console.log(`   🎯 Director: ${director ? `${director.first_name} ${director.last_name}` : 'None'}`);
            console.log(`   📊 Performance Score: ${candidate.performance_appraisal_score}/100`);
            console.log(`   🤝 Eligible Peer Voters: ${eligiblePeerVoters}`);
            console.log('');

            initializedCandidates.push(hierarchicalVote);
        }

        // 4. Verification
        console.log('🔍 VERIFICATION:');
        console.log('================');

        const totalHierarchicalVotes = await HierarchicalVote.countDocuments({
            voting_period_id: activeVotingPeriod.period_id
        });

        console.log(`✅ Total candidates initialized: ${initializedCandidates.length}`);
        console.log(`✅ Total HierarchicalVote records for period: ${totalHierarchicalVotes}`);

        // Group by department for summary
        const deptSummary = {};
        for (const vote of await HierarchicalVote.find({ voting_period_id: activeVotingPeriod.period_id })) {
            if (!deptSummary[vote.candidate_department]) {
                deptSummary[vote.candidate_department] = [];
            }
            deptSummary[vote.candidate_department].push(vote);
        }

        console.log('\n📊 DEPARTMENT SUMMARY:');
        console.log('======================');
        Object.keys(deptSummary).forEach(dept => {
            const candidates = deptSummary[dept];
            console.log(`🏢 ${dept}: ${candidates.length} candidates initialized`);
            candidates.forEach(candidate => {
                console.log(`   - ${candidate.candidate_first_name} ${candidate.candidate_last_name} (${candidate.candidate_employee_id})`);
            });
        });

        console.log('\n🎯 NEXT STEPS:');
        console.log('==============');
        console.log('1. ✅ Candidates are now initialized in HierarchicalVote table');
        console.log('2. ✅ Managers can now see candidates in their department via /managerial-candidates');
        console.log('3. ✅ Voting workflow is ready to begin');
        console.log('4. Test the managerial-candidates endpoint again');

        await mongoose.disconnect();
        console.log('\n🎉 Candidate initialization completed successfully!');

    } catch (error) {
        console.error('❌ Error initializing candidates:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
initializeCandidatesForVoting();