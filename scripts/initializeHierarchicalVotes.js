import mongoose from 'mongoose';
import { config } from 'dotenv';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';
import User from '../models/rms/user.js';
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

const initializeHierarchicalVotes = async () => {
    try {
        await connectDB();

        console.log('🔄 Initializing hierarchical votes...');

        // Clear existing hierarchical votes
        await HierarchicalVote.deleteMany({});
        console.log('Cleared existing hierarchical votes');

        // Get the active voting period
        const votingPeriod = await VotingPeriod.findOne({ period_id: 'VP_2024_001' });
        if (!votingPeriod) {
            console.error('❌ Voting period not found');
            return;
        }

        // Get candidate employee IDs
        const candidateIds = ['EMP001', 'EMP002', 'EMP003', 'MGR001'];

        for (const candidateId of candidateIds) {
            const candidate = await User.findOne({ employee_id: candidateId });
            if (!candidate) {
                console.log(`⚠️ Candidate ${candidateId} not found`);
                continue;
            }

            // Get manager, director, and chief information
            const manager = candidate.manager_id ?
                await User.findOne({ employee_id: candidate.manager_id }) : null;
            const director = candidate.director_id ?
                await User.findOne({ employee_id: candidate.director_id }) : null;
            const chief = candidate.chief_id ?
                await User.findOne({ employee_id: candidate.chief_id }) : null;

            // Count eligible peer voters (same department, excluding the candidate)
            const eligiblePeerVoters = await User.countDocuments({
                department: candidate.department,
                employee_id: { $ne: candidateId },
                roles: { $in: ["user"] }
            });

            // Create hierarchical vote record
            const hierarchicalVote = new HierarchicalVote({
                voting_period_id: votingPeriod.period_id,
                voting_session_name: votingPeriod.period_name,
                candidate_employee_id: candidateId,
                candidate_first_name: candidate.first_name,
                candidate_last_name: candidate.last_name,
                candidate_position: candidate.position,
                candidate_department: candidate.department,
                candidate_function: candidate.function || "Chief Credit",
                candidate_job_grade: candidate.job_grade || "VII",
                is_managerial_position: candidate.is_managerial || false,
                performance_appraisal_score: candidate.performance_appraisal_score || 0,
                performance_weighted_score: VotingCalculator.calculatePerformanceWeightedScore(
                    candidate.performance_appraisal_score || 0
                ),
                manager_id: candidate.manager_id,
                manager_name: manager ? `${manager.first_name} ${manager.last_name}` : "",
                director_id: candidate.director_id,
                director_name: director ? `${director.first_name} ${director.last_name}` : "",
                chief_id: candidate.chief_id,
                chief_name: chief ? `${chief.first_name} ${chief.last_name}` : "",
                total_eligible_peer_voters: eligiblePeerVoters,
                created_by: 'CHIEF001'
            });

            await hierarchicalVote.save();
            console.log(`✅ Initialized hierarchical vote for ${candidate.first_name} ${candidate.last_name}`);
        }

        // Update voting period statistics
        votingPeriod.total_candidates = candidateIds.length;
        await votingPeriod.save();

        console.log('\n🎉 Hierarchical votes initialized successfully!');
        console.log('\n📊 Summary:');
        console.log(`📋 Voting Period: ${votingPeriod.period_name}`);
        console.log(`👥 Total Candidates: ${candidateIds.length}`);
        console.log('🗳️ Candidates initialized for voting:');

        const votes = await HierarchicalVote.find({ voting_period_id: votingPeriod.period_id });
        votes.forEach(vote => {
            console.log(`   • ${vote.candidate_first_name} ${vote.candidate_last_name} (${vote.candidate_department})`);
            console.log(`     - Performance Score: ${vote.performance_appraisal_score}/100`);
            console.log(`     - Eligible Peer Voters: ${vote.total_eligible_peer_voters}`);
            console.log(`     - Position Type: ${vote.is_managerial_position ? 'Managerial' : 'Non-Managerial'}`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error initializing hierarchical votes:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
initializeHierarchicalVotes();