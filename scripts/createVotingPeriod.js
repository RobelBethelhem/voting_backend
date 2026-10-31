import mongoose from 'mongoose';
import { config } from 'dotenv';
import VotingPeriod from '../models/rms/VotingPeriod.js';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';
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

const createVotingPeriod = async () => {
    try {
        await connectDB();

        console.log('🔄 Creating voting period and initializing candidates...');

        // Clear existing voting data
        await VotingPeriod.deleteMany({});
        await HierarchicalVote.deleteMany({});
        console.log('Cleared existing voting periods and hierarchical votes');

        // Create a new voting period
        const votingPeriod = new VotingPeriod({
            period_id: 'VP_2024_Q4_PERFORMANCE',
            period_name: '2024 Q4 Performance Evaluation',
            description: 'Quarterly performance evaluation for all departments',
            start_date: new Date('2024-10-01'),
            end_date: new Date('2024-12-31'),
            target_departments: ['Credit Appraisal', 'Credit Portfolio Management', 'Risk Management'],
            target_functions: ['Credit Appraisal', 'Portfolio Management', 'Risk Management'],
            quota_per_function: 2,
            status: 'active',
            total_candidates: 0,
            created_by: 'ADMIN001'
        });

        await votingPeriod.save();
        console.log('✅ Voting period created successfully');

        // Get candidate users (employees with status false - indicating they are candidates)
        const candidates = await User.find({
            status: false,
            roles: { $in: ['user'] }
        });

        console.log(`Found ${candidates.length} candidates to initialize`);

        const initializedVotes = [];

        for (const candidate of candidates) {
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
                employee_id: { $ne: candidate.employee_id },
                roles: { $in: ["user"] }
            });

            const hierarchicalVote = new HierarchicalVote({
                voting_period_id: votingPeriod.period_id,
                voting_session_name: votingPeriod.period_name,
                candidate_employee_id: candidate.employee_id,
                candidate_first_name: candidate.first_name,
                candidate_last_name: candidate.last_name,
                candidate_position: candidate.position,
                candidate_department: candidate.department,
                candidate_function: candidate.function || candidate.department,
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
                chief_approval_status: 'pending',
                peer_votes: [],
                created_by: 'ADMIN001'
            });

            await hierarchicalVote.save();
            initializedVotes.push(hierarchicalVote);
        }

        // Update voting period with candidate count
        votingPeriod.total_candidates = initializedVotes.length;
        await votingPeriod.save();

        console.log(`✅ Initialized ${initializedVotes.length} candidates for voting`);

        console.log('\n🎉 Voting period setup completed!');
        console.log('\n📋 Voting Period Details:');
        console.log('================================');
        console.log(`Period: ${votingPeriod.period_name}`);
        console.log(`Status: ${votingPeriod.status}`);
        console.log(`Candidates: ${votingPeriod.total_candidates}`);
        console.log(`Start Date: ${votingPeriod.start_date.toDateString()}`);
        console.log(`End Date: ${votingPeriod.end_date.toDateString()}`);

        console.log('\n👥 Initialized Candidates:');
        initializedVotes.forEach(vote => {
            console.log(`   • ${vote.candidate_first_name} ${vote.candidate_last_name} (${vote.candidate_department})`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Database connection closed');

    } catch (error) {
        console.error('❌ Error creating voting period:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
createVotingPeriod();