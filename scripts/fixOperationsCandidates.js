import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';

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

const fixOperationsCandidates = async () => {
    try {
        await connectDB();

        console.log('🔧 FIXING OPERATIONS DEPARTMENT CANDIDATES');
        console.log('==========================================\n');

        // Operations employees who should be candidates
        const operationsCandidateIds = ['EMP008', 'EMP009', 'EMP010'];

        console.log('1. Converting Operations employees to candidates...');

        for (const empId of operationsCandidateIds) {
            const employee = await User.findOne({ employee_id: empId });

            if (employee) {
                // Change status from true (voter) to false (candidate)
                await User.updateOne(
                    { employee_id: empId },
                    { status: false }
                );

                console.log(`✅ ${employee.first_name} ${employee.last_name} (${empId}) → Changed to CANDIDATE`);
                console.log(`   📊 Performance Score: ${employee.performance_appraisal_score}/100`);
                console.log(`   👔 Manager: ${employee.manager_id}`);
            } else {
                console.log(`❌ Employee ${empId} not found`);
            }
        }

        console.log('\n2. Initializing Operations candidates in HierarchicalVote table...');

        // Get active voting period
        const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
        if (!activeVotingPeriod) {
            console.log('❌ No active voting period found');
            await mongoose.disconnect();
            return;
        }

        const operationsCandidates = await User.find({
            employee_id: { $in: operationsCandidateIds },
            status: false
        });

        for (const candidate of operationsCandidates) {
            // Check if already initialized
            const existingVote = await HierarchicalVote.findOne({
                voting_period_id: activeVotingPeriod.period_id,
                candidate_employee_id: candidate.employee_id
            });

            if (existingVote) {
                console.log(`⚠️ ${candidate.first_name} ${candidate.last_name} already in HierarchicalVote - skipping`);
                continue;
            }

            // Get manager information
            const manager = candidate.manager_id ?
                await User.findOne({ employee_id: candidate.manager_id }) : null;

            // Get director information
            const director = await User.findOne({
                department: candidate.department,
                roles: { $in: ['director'] }
            });

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
                candidate_function: candidate.department,
                candidate_job_grade: 'Grade-5',
                performance_appraisal_score: candidate.performance_appraisal_score || 0,

                // Manager information
                manager_employee_id: manager ? manager.employee_id : null,
                manager_first_name: manager ? manager.first_name : null,
                manager_last_name: manager ? manager.last_name : null,
                manager_rating_score: 0,

                // Director information
                director_employee_id: director ? director.employee_id : null,
                director_first_name: director ? director.first_name : null,
                director_last_name: director ? director.last_name : null,
                director_rating_score: 0,

                // Chief information
                chief_employee_id: chief ? chief.employee_id : null,
                chief_first_name: chief ? chief.first_name : null,
                chief_last_name: chief ? chief.last_name : null,

                // Voting statistics
                total_eligible_peer_voters: eligiblePeerVoters,
                peer_votes: [],

                // Status fields
                is_managerial_position: candidate.roles.includes('manager') || candidate.roles.includes('director'),
                manager_rating_status: 'pending',
                director_rating_status: 'pending',
                chief_approval_status: 'pending',

                // Calculated scores
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
                created_by: 'OPERATIONS_FIX',
                created_at: new Date(),
                last_updated_by: 'OPERATIONS_FIX',
                last_updated_at: new Date()
            };

            const hierarchicalVote = new HierarchicalVote(hierarchicalVoteData);
            await hierarchicalVote.save();

            console.log(`✅ Initialized in HierarchicalVote: ${candidate.first_name} ${candidate.last_name}`);
            console.log(`   🏢 Department: ${candidate.department}`);
            console.log(`   👔 Manager: ${manager ? `${manager.first_name} ${manager.last_name} (${manager.employee_id})` : 'None'}`);
            console.log(`   📊 Performance Score: ${candidate.performance_appraisal_score}/100`);
            console.log('');
        }

        // 3. Verification
        console.log('🔍 VERIFICATION:');
        console.log('================');

        const operationsCandidatesNow = await User.find({
            department: 'Operations',
            status: false,
            roles: { $in: ['user'] }
        });

        console.log(`✅ Operations candidates now: ${operationsCandidatesNow.length}`);
        operationsCandidatesNow.forEach(candidate => {
            console.log(`   - ${candidate.first_name} ${candidate.last_name} (${candidate.employee_id})`);
            console.log(`     Manager: ${candidate.manager_id}, Performance: ${candidate.performance_appraisal_score}/100`);
        });

        const operationsHierarchicalVotes = await HierarchicalVote.find({
            voting_period_id: activeVotingPeriod.period_id,
            candidate_department: 'Operations'
        });

        console.log(`✅ Operations HierarchicalVote records: ${operationsHierarchicalVotes.length}`);
        operationsHierarchicalVotes.forEach(vote => {
            console.log(`   - ${vote.candidate_first_name} ${vote.candidate_last_name} (${vote.candidate_employee_id})`);
        });

        console.log('\n🎯 RESULT:');
        console.log('==========');
        console.log('✅ Tigist Kebede (MGR007) will now see 3 candidates in Operations department');
        console.log('✅ Managerial-candidates endpoint will return data for Operations managers');
        console.log('✅ Operations department voting is now enabled');

        await mongoose.disconnect();
        console.log('\n🎉 Operations candidates fix completed successfully!');

    } catch (error) {
        console.error('❌ Error fixing Operations candidates:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
fixOperationsCandidates();