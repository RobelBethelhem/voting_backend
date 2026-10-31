import { Router } from "express";
import auth from "../../../../middleware/rms/auth.js";
import roleCheck from "../../../../middleware/rms/roleCheck.js";
import User from "../../../../models/rms/user.js";
import Candidate from "../../../../models/rms/Candidate.js";
import VotingPeriod from "../../../../models/rms/VotingPeriod.js";
import CandidateQualificationService from "../../../../services/candidateQualificationService.js";

const router = Router();

// Get qualified candidates for hierarchical voting (removed roleCheck to fix auth issue)
router.get('/get_candidate_by_department', auth, async (req, res) => {
    try {
        console.log("Getting qualified candidates for hierarchical voting");

        const getUser = await req.user;
        const currentUser = await User.findOne({ _id: getUser._id });

        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Get active voting period
        const activePeriod = await VotingPeriod.findOne({
            status: { $in: ['peer_voting', 'manager_review', 'active'] }
        });

        if (!activePeriod) {
            return res.status(404).json({
                success: false,
                message: "No active voting period found"
            });
        }

        // Get candidates for this voter using the qualification service
        const candidateResult = await CandidateQualificationService.getCandidatesForVoter(
            currentUser.employee_id,
            activePeriod.period_id
        );

        if (!candidateResult.success) {
            throw new Error("Failed to get candidates for voter");
        }

        // Format candidates for frontend compatibility
        const formattedCandidates = candidateResult.candidates.map(candidate => ({
            id: candidate._id.toString(),
            employee_id: candidate.employee_id,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            full_name: `${candidate.first_name} ${candidate.last_name}`,
            department: candidate.department,
            position: candidate.position,
            level: candidate.level,
            performance_appraisal_score: candidate.performance_appraisal_score,
            performance_weighted: candidate.performance_weighted,
            manager_id: candidate.manager_id,
            director_id: candidate.director_id,
            chief_id: candidate.chief_id,
            is_active: candidate.is_active,
            qualification_criteria: candidate.qualification_criteria,
            voting_context: {
                voter_level: currentUser.level,
                can_vote: true,
                vote_type: candidateResult.voterInfo.can_vote_on,
                voting_period_id: activePeriod.period_id
            },
            total_votes_received: candidate.total_votes_received || 0,
            average_vote_score: candidate.average_vote_score || 0
        }));

        res.status(200).json({
            success: true,
            data: formattedCandidates,
            meta: {
                total_candidates: formattedCandidates.length,
                voter_info: candidateResult.voterInfo,
                active_voting_period: {
                    period_id: activePeriod.period_id,
                    period_name: activePeriod.period_name,
                    status: activePeriod.status,
                    start_date: activePeriod.start_date,
                    end_date: activePeriod.end_date
                },
                candidate_qualification_info: {
                    only_qualified_candidates_shown: true,
                    min_performance_score_required: 60,
                    total_eligible_users: candidateResult.candidates.length
                }
            }
        });

    } catch (error) {
        console.error("Error getting qualified candidates:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch qualified candidates",
            error: error.message
        });
    }
});

// Helper function to determine vote type based on user level
function getVoteType(userLevel) {
    switch (userLevel) {
        case 'professional':
            return 'peer_rating';
        case 'manager':
            return 'manager_rating';
        case 'director':
            return 'director_rating';
        case 'chief':
            return 'approval';
        default:
            return 'unknown';
    }
}

// Get all users for admin management
router.get('/get_all_users', auth, roleCheck(["admin", "chief"]), async (req, res) => {
    try {
        const users = await User.find({ status: true })
            .select('-password -__v')
            .sort({ level: 1, department: 1, employee_id: 1 });

        const formattedUsers = users.map(user => ({
            id: user._id.toString(),
            employee_id: user.employee_id,
            first_name: user.first_name,
            last_name: user.last_name,
            user: user.user,
            department: user.department,
            position: user.position,
            level: user.level,
            performance_appraisal_score: user.performance_appraisal_score,
            is_managerial: user.is_managerial,
            manager_id: user.manager_id,
            director_id: user.director_id,
            chief_id: user.chief_id,
            roles: user.roles,
            email: user.email,
            status: user.status
        }));

        res.status(200).json({
            success: true,
            data: formattedUsers,
            meta: {
                total: formattedUsers.length,
                by_level: {
                    chief: formattedUsers.filter(u => u.level === 'chief').length,
                    director: formattedUsers.filter(u => u.level === 'director').length,
                    manager: formattedUsers.filter(u => u.level === 'manager').length,
                    professional: formattedUsers.filter(u => u.level === 'professional').length
                }
            }
        });

    } catch (error) {
        console.error("Error getting all users:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch users",
            error: error.message
        });
    }
});

// Qualify users as candidates for current voting period
router.post('/qualify_candidates', auth, roleCheck(["admin", "chief"]), async (req, res) => {
    try {
        console.log("Qualifying users as candidates");

        const {
            voting_period_id,
            qualification_criteria
        } = req.body;

        if (!voting_period_id) {
            return res.status(400).json({
                success: false,
                message: "Voting period ID is required"
            });
        }

        // Qualify users as candidates
        const result = await CandidateQualificationService.qualifyUsersForVoting(
            voting_period_id,
            qualification_criteria
        );

        res.status(200).json({
            success: true,
            message: "Users qualified as candidates successfully",
            data: result
        });

    } catch (error) {
        console.error("Error qualifying candidates:", error);
        res.status(500).json({
            success: false,
            message: "Failed to qualify candidates",
            error: error.message
        });
    }
});

// Get all qualified candidates (admin view)
router.get('/get_all_candidates', auth, roleCheck(["admin", "chief"]), async (req, res) => {
    try {
        const { voting_period_id } = req.query;

        if (!voting_period_id) {
            return res.status(400).json({
                success: false,
                message: "Voting period ID is required"
            });
        }

        const result = await CandidateQualificationService.getAllCandidates(voting_period_id);

        res.status(200).json({
            success: true,
            data: result.candidates,
            meta: {
                summary: result.summary,
                voting_period_id: voting_period_id
            }
        });

    } catch (error) {
        console.error("Error getting all candidates:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch all candidates",
            error: error.message
        });
    }
});

export default router;