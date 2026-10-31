import mongoose from 'mongoose';
import { config } from 'dotenv';
import User from '../models/rms/user.js';
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

const generateRandomManagerRating = (min = 30, max = 50) => {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
};

const addCompleteCalculatedResults = async () => {
    try {
        await connectDB();

        console.log('📊 Adding Complete Calculated Results for All Candidates...\n');

        // Get all candidates
        const candidates = await User.find({ status: false, roles: { $in: ['user'] } });
        console.log(`Found ${candidates.length} candidates to add complete results\n`);

        console.log('🔄 Generating complete voting results for Excel formatting...\n');

        for (const candidate of candidates) {
            const hierarchicalVote = await HierarchicalVote.findOne({
                candidate_employee_id: candidate.employee_id
            });

            if (hierarchicalVote) {
                // Add realistic manager/director ratings for complete results
                let managerRating = 0;
                let directorRating = 0;

                if (candidate.is_managerial) {
                    // For managerial positions, either manager OR director rates (exclusive)
                    if (Math.random() > 0.5) {
                        managerRating = generateRandomManagerRating(35, 50);
                        directorRating = 0;
                    } else {
                        managerRating = 0;
                        directorRating = generateRandomManagerRating(35, 50);
                    }
                } else {
                    // For non-managerial positions, only manager rates (30% weight)
                    managerRating = generateRandomManagerRating(30, 48);
                    directorRating = 0;
                }

                // Add some realistic peer votes (2-4 peer votes per candidate)
                const peerVoteCount = Math.floor(Math.random() * 3) + 2; // 2-4 votes
                const peerVotes = [];

                for (let i = 0; i < peerVoteCount; i++) {
                    const peerVote = {
                        voter_employee_id: `PEER${i + 1}`,
                        voter_name: `Peer Voter ${i + 1}`,
                        voter_department: candidate.department,
                        dedication: Math.floor(Math.random() * 2) + 4, // 4-5
                        quality_of_work: Math.floor(Math.random() * 2) + 4, // 4-5
                        collaboration_team_work: Math.floor(Math.random() * 3) + 3, // 3-5
                        independence: Math.floor(Math.random() * 2) + 4, // 4-5
                        customer_service: Math.floor(Math.random() * 3) + 3, // 3-5
                        time_management: Math.floor(Math.random() * 2) + 4, // 4-5
                        office_attire_dress_code: Math.floor(Math.random() * 1) + 5, // 5
                        flexibility: Math.floor(Math.random() * 2) + 4 // 4-5
                    };

                    peerVote.total_score = peerVote.dedication + peerVote.quality_of_work +
                                          peerVote.collaboration_team_work + peerVote.independence +
                                          peerVote.customer_service + peerVote.time_management +
                                          peerVote.office_attire_dress_code + peerVote.flexibility;

                    peerVotes.push(peerVote);
                }

                // Update hierarchical vote with ratings and peer votes
                hierarchicalVote.manager_rating_score = managerRating;
                hierarchicalVote.director_rating_score = directorRating;
                hierarchicalVote.peer_votes = peerVotes;

                // Calculate complete results
                const calculationData = {
                    performance_appraisal_score: candidate.performance_appraisal_score,
                    manager_rating_score: managerRating,
                    director_rating_score: directorRating,
                    peer_votes: peerVotes,
                    total_eligible_peer_voters: hierarchicalVote.total_eligible_peer_voters,
                    is_managerial: candidate.is_managerial || false
                };

                const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);

                // Apply all calculations to the record
                Object.assign(hierarchicalVote, calculations);
                hierarchicalVote.last_updated_by = 'COMPLETE_RESULTS';

                await hierarchicalVote.save();

                console.log(`✅ ${candidate.first_name} ${candidate.last_name} (${candidate.department})`);
                console.log(`   📊 Performance: ${candidate.performance_appraisal_score}/50 → Weighted: ${calculations.performance_weighted_score}/50`);

                if (candidate.is_managerial) {
                    console.log(`   👨‍💼 Managerial Rating: ${calculations.combined_managerial_rating}/50 (${calculations.combined_managerial_weighted_score}/50 weighted)`);
                    console.log(`   🎯 Final Score: ${calculations.total_weighted_result}/100`);
                } else {
                    console.log(`   👨‍💼 Manager Rating: ${managerRating}/50 → Weighted: ${calculations.manager_rating_weighted_score}/30`);
                    console.log(`   👥 Peer Votes: ${calculations.total_peer_votes_received} (${calculations.peer_voting_percentage}%)`);
                    console.log(`   👥 Peer Rating: ${calculations.average_peer_rating}/50 → Weighted: ${calculations.peer_rating_weighted_score}/20`);
                    console.log(`   ⚖️ Weighted Rating: ${calculations.weighted_rating}/20`);
                    console.log(`   🎯 Final Score: ${calculations.total_weighted_result}/100`);
                }
                console.log('');
            }
        }

        // Summary of complete results
        console.log('📋 Complete Results Summary:');
        console.log('============================');

        const completedVotes = await HierarchicalVote.find({});

        let managerialCount = 0;
        let nonManagerialCount = 0;
        let totalScoreSum = 0;

        for (const vote of completedVotes) {
            if (vote.is_managerial_position) {
                managerialCount++;
            } else {
                nonManagerialCount++;
            }
            totalScoreSum += vote.total_weighted_result;
        }

        console.log(`\n📊 Statistics:`);
        console.log(`   • Total Candidates: ${completedVotes.length}`);
        console.log(`   • Managerial Positions: ${managerialCount}`);
        console.log(`   • Non-Managerial Positions: ${nonManagerialCount}`);
        console.log(`   • Average Final Score: ${(totalScoreSum / completedVotes.length).toFixed(2)}/100`);

        console.log(`\n🎯 Excel Formatting Ready:`);
        console.log(`   ✅ Performance Appraisal Scores (out of 50)`);
        console.log(`   ✅ Manager/Director Ratings (out of 50)`);
        console.log(`   ✅ Peer Voting Results (with participation %)`);
        console.log(`   ✅ Complete Weighted Calculations`);
        console.log(`   ✅ Final 100% Results for Export`);

        await mongoose.disconnect();
        console.log('\n✅ Complete calculated results added successfully!');
        console.log('🎉 System is now ready for Excel export with full 100% results!');

    } catch (error) {
        console.error('❌ Error adding complete results:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

// Run the script
addCompleteCalculatedResults();