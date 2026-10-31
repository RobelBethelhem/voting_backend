import express from "express";
import HierarchicalVote from "../../models/rms/HierarchicalVote.js";
import VotingPeriod from "../../models/rms/VotingPeriod.js";
import User from "../../models/rms/user.js";
import Candidate from "../../models/rms/Candidate.js";
import { VotingCalculator } from "../../utils/votingCalculations.js";
import authMiddleware from "../../middleware/authMiddleware.js";

const router = express.Router();

// Create a new voting period
router.post("/voting-period", authMiddleware, async (req, res) => {
    try {
        const {
            period_name,
            description,
            start_date,
            end_date,
            target_departments,
            target_functions,
            quota_per_function
        } = req.body;

        const period_id = `VP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const votingPeriod = new VotingPeriod({
            period_id,
            period_name,
            description,
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            target_departments: target_departments || [],
            target_functions: target_functions || [],
            quota_per_function: quota_per_function || 1,
            created_by: req.user.employee_id
        });

        await votingPeriod.save();

        res.status(201).json({
            success: true,
            message: "Voting period created successfully",
            data: votingPeriod
        });
    } catch (error) {
        console.error("Error creating voting period:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create voting period",
            error: error.message
        });
    }
});

// Initialize voting for candidates in a period
router.post("/initialize-candidates/:period_id", authMiddleware, async (req, res) => {
    try {
        const { period_id } = req.params;
        const { candidate_ids } = req.body; // Array of candidate employee IDs

        const votingPeriod = await VotingPeriod.findOne({ period_id });
        if (!votingPeriod) {
            return res.status(404).json({
                success: false,
                message: "Voting period not found"
            });
        }

        const initializedVotes = [];

        for (const candidateId of candidate_ids) {
            const candidate = await User.findOne({ employee_id: candidateId });
            if (!candidate) {
                console.log(`Candidate ${candidateId} not found`);
                continue;
            }

            // Check if already initialized
            const existingVote = await HierarchicalVote.findOne({
                voting_period_id: period_id,
                candidate_employee_id: candidateId
            });

            if (existingVote) {
                console.log(`Candidate ${candidateId} already initialized`);
                continue;
            }

            // Get manager and director information
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

            const hierarchicalVote = new HierarchicalVote({
                voting_period_id: period_id,
                voting_session_name: votingPeriod.period_name,
                candidate_employee_id: candidateId,
                candidate_first_name: candidate.first_name,
                candidate_last_name: candidate.last_name,
                candidate_position: candidate.position,
                candidate_department: candidate.department,
                candidate_function: candidate.function || "",
                candidate_job_grade: candidate.job_grade || "",
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
                created_by: req.user.employee_id
            });

            await hierarchicalVote.save();
            initializedVotes.push(hierarchicalVote);
        }

        // Update voting period statistics
        votingPeriod.total_candidates = initializedVotes.length;
        await votingPeriod.save();

        res.status(201).json({
            success: true,
            message: `Initialized ${initializedVotes.length} candidates for voting`,
            data: initializedVotes
        });
    } catch (error) {
        console.error("Error initializing candidates:", error);
        res.status(500).json({
            success: false,
            message: "Failed to initialize candidates",
            error: error.message
        });
    }
});

// Submit peer vote
router.post("/peer-vote/:period_id/:candidate_id", authMiddleware, async (req, res) => {
    try {
        const { period_id, candidate_id } = req.params;
        const {
            dedication,
            quality_of_work,
            collaboration_team_work,
            independence,
            customer_service,
            time_management,
            office_attire_dress_code,
            flexibility
        } = req.body;

        // Validate voting period
        const votingPeriod = await VotingPeriod.findOne({ period_id });
        if (!votingPeriod || votingPeriod.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Voting period is not active"
            });
        }

        // Get hierarchical vote record
        const hierarchicalVote = await HierarchicalVote.findOne({
            voting_period_id: period_id,
            candidate_employee_id: candidate_id
        });

        if (!hierarchicalVote) {
            return res.status(404).json({
                success: false,
                message: "Candidate not found in this voting period"
            });
        }

        // Validate peer voting eligibility
        const voter = await User.findOne({ employee_id: req.user.employee_id });
        if (!VotingCalculator.validatePeerVotingEligibility(
            voter.department,
            hierarchicalVote.candidate_department
        )) {
            return res.status(403).json({
                success: false,
                message: "You can only vote for candidates in your department"
            });
        }

        // Check if already voted
        const existingVote = hierarchicalVote.peer_votes.find(
            vote => vote.voter_employee_id === req.user.employee_id
        );

        if (existingVote) {
            return res.status(400).json({
                success: false,
                message: "You have already voted for this candidate"
            });
        }

        // Calculate total score
        const totalScore = VotingCalculator.calculatePeerVoteTotal({
            dedication,
            quality_of_work,
            collaboration_team_work,
            independence,
            customer_service,
            time_management,
            office_attire_dress_code,
            flexibility
        });

        // Add peer vote
        hierarchicalVote.peer_votes.push({
            voter_employee_id: req.user.employee_id,
            voter_name: `${voter.first_name} ${voter.last_name}`,
            voter_department: voter.department,
            dedication,
            quality_of_work,
            collaboration_team_work,
            independence,
            customer_service,
            time_management,
            office_attire_dress_code,
            flexibility,
            total_score: totalScore
        });

        // Recalculate voting statistics
        const calculationData = {
            performance_appraisal_score: hierarchicalVote.performance_appraisal_score,
            manager_rating_score: hierarchicalVote.manager_rating_score,
            director_rating_score: hierarchicalVote.director_rating_score,
            peer_votes: hierarchicalVote.peer_votes,
            total_eligible_peer_voters: hierarchicalVote.total_eligible_peer_voters,
            is_managerial: hierarchicalVote.is_managerial_position
        };

        const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);

        // Update the record with new calculations
        Object.assign(hierarchicalVote, calculations);
        hierarchicalVote.last_updated_by = req.user.employee_id;

        await hierarchicalVote.save();

        res.status(200).json({
            success: true,
            message: "Peer vote submitted successfully",
            data: {
                total_votes: hierarchicalVote.peer_votes.length,
                voting_percentage: calculations.peer_voting_percentage,
                average_rating: calculations.average_peer_rating
            }
        });
    } catch (error) {
        console.error("Error submitting peer vote:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit peer vote",
            error: error.message
        });
    }
});

// Submit manager/director rating
router.post("/managerial-rating/:period_id/:candidate_id", authMiddleware, async (req, res) => {
    try {
        const { period_id, candidate_id } = req.params;
        const { rating_score, rater_type } = req.body; // rater_type: 'manager' or 'director'

        // Validate voting period
        const votingPeriod = await VotingPeriod.findOne({ period_id });
        if (!votingPeriod) {
            return res.status(404).json({
                success: false,
                message: "Voting period not found"
            });
        }

        // Get hierarchical vote record
        const hierarchicalVote = await HierarchicalVote.findOne({
            voting_period_id: period_id,
            candidate_employee_id: candidate_id
        });

        if (!hierarchicalVote) {
            return res.status(404).json({
                success: false,
                message: "Candidate not found in this voting period"
            });
        }

        // Validate managerial voting eligibility
        const voter = await User.findOne({ employee_id: req.user.employee_id });
        if (!VotingCalculator.validateManagerialVotingEligibility(
            voter.roles,
            voter.department,
            hierarchicalVote.candidate_department
        )) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to rate this candidate"
            });
        }

        // Check for duplicate ratings - prevent both manager and director from rating if one already has
        if (rater_type === 'manager') {
            // Check if director has already rated
            if (hierarchicalVote.director_rating_score && hierarchicalVote.director_rating_score > 0) {
                return res.status(403).json({
                    success: false,
                    message: "Director has already rated this candidate. Only one managerial rating is allowed."
                });
            }
            // Check if manager has already rated
            if (hierarchicalVote.manager_rating_score && hierarchicalVote.manager_rating_score > 0) {
                return res.status(400).json({
                    success: false,
                    message: "You have already rated this candidate"
                });
            }
            hierarchicalVote.manager_rating_score = rating_score;
        } else if (rater_type === 'director') {
            // Check if manager has already rated
            if (hierarchicalVote.manager_rating_score && hierarchicalVote.manager_rating_score > 0) {
                return res.status(403).json({
                    success: false,
                    message: "Manager has already rated this candidate. Only one managerial rating is allowed."
                });
            }
            // Check if director has already rated
            if (hierarchicalVote.director_rating_score && hierarchicalVote.director_rating_score > 0) {
                return res.status(400).json({
                    success: false,
                    message: "You have already rated this candidate"
                });
            }
            hierarchicalVote.director_rating_score = rating_score;
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid rater type. Must be 'manager' or 'director'"
            });
        }

        // Recalculate scores
        const calculationData = {
            performance_appraisal_score: hierarchicalVote.performance_appraisal_score,
            manager_rating_score: hierarchicalVote.manager_rating_score,
            director_rating_score: hierarchicalVote.director_rating_score,
            peer_votes: hierarchicalVote.peer_votes,
            total_eligible_peer_voters: hierarchicalVote.total_eligible_peer_voters,
            is_managerial: hierarchicalVote.is_managerial_position
        };

        const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);
        Object.assign(hierarchicalVote, calculations);
        hierarchicalVote.last_updated_by = req.user.employee_id;

        await hierarchicalVote.save();

        res.status(200).json({
            success: true,
            message: `${rater_type} rating submitted successfully`,
            data: {
                [rater_type + '_rating']: rating_score,
                total_weighted_result: calculations.total_weighted_result
            }
        });
    } catch (error) {
        console.error("Error submitting managerial rating:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit managerial rating",
            error: error.message
        });
    }
});

// Chief approval/rejection
router.post("/chief-approval/:period_id/:candidate_id", authMiddleware, async (req, res) => {
    try {
        const { period_id, candidate_id } = req.params;
        const { approval_status, comments } = req.body; // 'approved' or 'rejected'

        // Validate user is chief
        const chief = await User.findOne({ employee_id: req.user.employee_id });
        if (!chief.roles.includes('chief')) {
            return res.status(403).json({
                success: false,
                message: "Only chief-level users can approve candidates"
            });
        }

        // Get hierarchical vote record
        const hierarchicalVote = await HierarchicalVote.findOne({
            voting_period_id: period_id,
            candidate_employee_id: candidate_id
        });

        if (!hierarchicalVote) {
            return res.status(404).json({
                success: false,
                message: "Candidate not found in this voting period"
            });
        }

        // Update approval status
        hierarchicalVote.chief_approval_status = approval_status;
        hierarchicalVote.chief_id = req.user.employee_id;
        hierarchicalVote.chief_name = `${chief.first_name} ${chief.last_name}`;
        hierarchicalVote.chief_approval_date = new Date();
        hierarchicalVote.chief_comments = comments || "";
        hierarchicalVote.last_updated_by = req.user.employee_id;

        await hierarchicalVote.save();

        res.status(200).json({
            success: true,
            message: `Candidate ${approval_status} successfully`,
            data: {
                candidate_name: `${hierarchicalVote.candidate_first_name} ${hierarchicalVote.candidate_last_name}`,
                approval_status,
                total_weighted_result: hierarchicalVote.total_weighted_result
            }
        });
    } catch (error) {
        console.error("Error processing chief approval:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process chief approval",
            error: error.message
        });
    }
});

// Get voting results for a period
router.get("/results/:period_id", authMiddleware, async (req, res) => {
    try {
        const { period_id } = req.params;
        const { department, function: func, approval_status } = req.query;

        let filter = { voting_period_id: period_id };

        if (department) filter.candidate_department = department;
        if (func) filter.candidate_function = func;
        if (approval_status) filter.chief_approval_status = approval_status;

        const results = await HierarchicalVote.find(filter)
            .sort({ total_weighted_result: -1 })
            .select('-peer_votes'); // Exclude detailed peer votes for summary

        const summary = {
            total_candidates: results.length,
            by_approval_status: {
                pending: results.filter(r => r.chief_approval_status === 'pending').length,
                approved: results.filter(r => r.chief_approval_status === 'approved').length,
                rejected: results.filter(r => r.chief_approval_status === 'rejected').length
            },
            by_position_type: {
                managerial: results.filter(r => r.is_managerial_position).length,
                non_managerial: results.filter(r => !r.is_managerial_position).length
            },
            average_scores: {
                performance: results.reduce((sum, r) => sum + r.performance_weighted_score, 0) / results.length || 0,
                total_weighted: results.reduce((sum, r) => sum + r.total_weighted_result, 0) / results.length || 0
            }
        };

        res.status(200).json({
            success: true,
            message: "Voting results retrieved successfully",
            data: results,
            summary
        });
    } catch (error) {
        console.error("Error retrieving voting results:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve voting results",
            error: error.message
        });
    }
});

// Get eligible candidates for peer voting (same department as voter)
router.get("/eligible-candidates", authMiddleware, async (req, res) => {
    try {
        const voter = await User.findOne({ employee_id: req.user.employee_id });
        if (!voter) {
            return res.status(404).json({
                success: false,
                message: "Voter not found"
            });
        }

        // Find active voting period
        const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
        if (!activeVotingPeriod) {
            return res.status(404).json({
                success: false,
                message: "No active voting period found"
            });
        }

        // Get all hierarchical votes for the active period in voter's department
        const eligibleCandidates = await HierarchicalVote.find({
            voting_period_id: activeVotingPeriod.period_id,
            candidate_department: voter.department,
            candidate_employee_id: { $ne: voter.employee_id } // Exclude voter themselves
        }).select('-peer_votes'); // Don't send detailed peer votes

        res.status(200).json({
            success: true,
            message: "Eligible candidates retrieved successfully",
            data: eligibleCandidates
        });

    } catch (error) {
        console.error("Error retrieving eligible candidates:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve eligible candidates",
            error: error.message
        });
    }
});

// Get candidates that managers/directors can rate
router.get("/managerial-candidates", authMiddleware, async (req, res) => {
    try {
        const manager = await User.findOne({ employee_id: req.user.employee_id });
        if (!manager) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Find active voting period
        const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
        if (!activeVotingPeriod) {
            return res.status(404).json({
                success: false,
                message: "No active voting period found"
            });
        }

        let filter = {
            voting_period_id: activeVotingPeriod.period_id
        };

        // If manager, show candidates in their department
        // If director, show candidates in departments they oversee
        if (manager.roles.includes('manager')) {
            filter.candidate_department = manager.department;
        } else if (manager.roles.includes('director')) {
            // Directors can rate candidates in departments they oversee
            // For now, we'll show all candidates (can be refined based on business logic)
        }

        const candidates = await HierarchicalVote.find(filter)
            .select('-peer_votes') // Don't send detailed peer votes
            .sort({ candidate_last_name: 1, candidate_first_name: 1 });

        res.status(200).json({
            success: true,
            message: "Managerial candidates retrieved successfully",
            data: candidates
        });

    } catch (error) {
        console.error("Error retrieving managerial candidates:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve managerial candidates",
            error: error.message
        });
    }
});

// Get pending approvals for chief
router.get("/chief-pending-approvals", authMiddleware, async (req, res) => {
    try {
        const chief = await User.findOne({ employee_id: req.user.employee_id });
        if (!chief || !chief.roles.includes('chief')) {
            return res.status(403).json({
                success: false,
                message: "Only chief-level users can access pending approvals"
            });
        }

        // Find active voting period
        const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
        if (!activeVotingPeriod) {
            return res.status(404).json({
                success: false,
                message: "No active voting period found"
            });
        }

        const pendingApprovalsRaw = await HierarchicalVote.find({
            voting_period_id: activeVotingPeriod.period_id,
            chief_approval_status: 'pending'
        });

        // Recalculate scores for each candidate to ensure accuracy
        const pendingApprovals = pendingApprovalsRaw.map(vote => {
            const calculationData = {
                performance_appraisal_score: vote.performance_appraisal_score,
                manager_rating_score: vote.manager_rating_score,
                director_rating_score: vote.director_rating_score,
                peer_votes: vote.peer_votes,
                total_eligible_peer_voters: vote.total_eligible_peer_voters,
                is_managerial: vote.is_managerial_position
            };

            const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);

            // Update the vote object with fresh calculations
            Object.assign(vote.toObject(), calculations);

            // Remove detailed peer votes for response
            const voteObj = vote.toObject();
            delete voteObj.peer_votes;

            return {
                ...voteObj,
                ...calculations
            };
        })
        .sort((a, b) => b.total_weighted_result - a.total_weighted_result); // Sort by highest score first

        res.status(200).json({
            success: true,
            message: "Pending approvals retrieved successfully",
            data: pendingApprovals
        });

    } catch (error) {
        console.error("Error retrieving pending approvals:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve pending approvals",
            error: error.message
        });
    }
});

// Get completed approvals for chief
router.get("/chief-completed-approvals", authMiddleware, async (req, res) => {
    try {
        const chief = await User.findOne({ employee_id: req.user.employee_id });
        if (!chief || !chief.roles.includes('chief')) {
            return res.status(403).json({
                success: false,
                message: "Only chief-level users can access completed approvals"
            });
        }

        // Find active voting period
        const activeVotingPeriod = await VotingPeriod.findOne({ status: "active" });
        if (!activeVotingPeriod) {
            return res.status(404).json({
                success: false,
                message: "No active voting period found"
            });
        }

        const completedApprovalsRaw = await HierarchicalVote.find({
            voting_period_id: activeVotingPeriod.period_id,
            chief_approval_status: { $in: ['approved', 'rejected'] }
        });

        // Recalculate scores for each candidate to ensure accuracy
        const completedApprovals = completedApprovalsRaw.map(vote => {
            const calculationData = {
                performance_appraisal_score: vote.performance_appraisal_score,
                manager_rating_score: vote.manager_rating_score,
                director_rating_score: vote.director_rating_score,
                peer_votes: vote.peer_votes,
                total_eligible_peer_voters: vote.total_eligible_peer_voters,
                is_managerial: vote.is_managerial_position
            };

            const calculations = VotingCalculator.calculateCompleteVotingScore(calculationData);

            // Remove detailed peer votes for response
            const voteObj = vote.toObject();
            delete voteObj.peer_votes;

            return {
                ...voteObj,
                ...calculations
            };
        })
        .sort((a, b) => new Date(b.chief_approval_date) - new Date(a.chief_approval_date)); // Sort by most recent first

        res.status(200).json({
            success: true,
            message: "Completed approvals retrieved successfully",
            data: completedApprovals
        });

    } catch (error) {
        console.error("Error retrieving completed approvals:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve completed approvals",
            error: error.message
        });
    }
});

// Get detailed voting information for a specific candidate
router.get("/candidate-details/:period_id/:candidate_id", authMiddleware, async (req, res) => {
    try {
        const { period_id, candidate_id } = req.params;

        const candidateVoting = await HierarchicalVote.findOne({
            voting_period_id: period_id,
            candidate_employee_id: candidate_id
        });

        if (!candidateVoting) {
            return res.status(404).json({
                success: false,
                message: "Candidate voting record not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Candidate details retrieved successfully",
            data: candidateVoting
        });
    } catch (error) {
        console.error("Error retrieving candidate details:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve candidate details",
            error: error.message
        });
    }
});

export default router;