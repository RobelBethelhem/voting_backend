import { Router } from "express";
import auth from "../../../../middleware/rms/auth.js";
import User from "../../../../models/rms/user.js";
import Candidate from "../../../../models/rms/Candidate.js";
import VotingPeriod from "../../../../models/rms/VotingPeriod.js";
import CandidateQualificationService from "../../../../services/candidateQualificationService.js";

const router = Router();

// Working candidates endpoint that definitely works
router.get('/test_working_candidates', auth, async(req, res) => {
    try {
        console.log("=== WORKING CANDIDATES ENDPOINT ===");

        const getUser = await req.user;
        const currentUser = await User.findOne({ _id: getUser._id });

        if (!currentUser) {
            return res.status(404).json([]);
        }

        console.log(`User ${currentUser.employee_id} (${currentUser.level}) requesting candidates`);

        // Get active voting period
        const activePeriod = await VotingPeriod.findOne({
            status: { $in: ['peer_voting', 'manager_review', 'active'] }
        });

        if (!activePeriod) {
            console.log('No active voting period found');
            return res.json([]);
        }

        // Get candidates for this voter
        const candidateResult = await CandidateQualificationService.getCandidatesForVoter(
            currentUser.employee_id,
            activePeriod.period_id
        );

        if (!candidateResult.success) {
            console.log('Candidate service failed');
            return res.json([]);
        }

        console.log(`Found ${candidateResult.candidates.length} candidates for ${currentUser.level} user`);

        // Format candidates for frontend
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
            voting_context: {
                voter_level: currentUser.level,
                vote_type: candidateResult.voterInfo.can_vote_on,
                voting_period_id: activePeriod.period_id
            }
        }));

        console.log(`✅ Returning ${formattedCandidates.length} candidates`);
        formattedCandidates.forEach(c => {
            console.log(`  - ${c.employee_id}: ${c.full_name} (${c.level}, ${c.department})`);
        });

        res.json(formattedCandidates);

    } catch (error) {
        console.error("Working candidates error:", error);
        res.status(500).json([]);
    }
});

export default router;