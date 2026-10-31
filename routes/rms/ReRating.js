import { Router } from "express";
import auth from "../../middleware/rms/auth.js";
import roleCheck from "../../middleware/rms/roleCheck.js";
import ReRatingRequest from "../../models/rms/ReRatingRequest.js";
import ManagerialRating from "../../models/rms/ManagerialRating.js";
import StaffApproval from "../../models/rms/StaffApproval.js";
import User from "../../models/rms/user.js";
import Director from "../../models/rms/Director.js";
import Chief from "../../models/rms/Chief.js";
import { currentFiscalYearFilter, fiscalYearFilter, getCurrentFiscalYear, withFiscalYear } from "../../utils/fiscalYear.js";

const router = Router();

// The Deputy Chief Human Capital is a Chief account, recognised by its position title
// (e.g. "Deputy Chief Human Capital Officer" or "Deputy Chief HC")
const DEPUTY_CHIEF_HC_POSITION = /human\s*capital|\bHC\b/i;

// Admins and the Deputy Chief Human Capital review re-rating requests
const findReviewer = async (userInfo) => {
    if (userInfo.roles?.includes('admin')) {
        const admin = await User.findById(userInfo._id).lean();
        if (admin) {
            return {
                employee_id: admin.employee_id,
                name: `${admin.first_name} ${admin.last_name}`,
                position: admin.position
            };
        }
    }

    if (userInfo.roles?.includes('chief') || userInfo.level === 'chief') {
        const chief = await Chief.findById(userInfo._id).lean();
        if (chief && DEPUTY_CHIEF_HC_POSITION.test(chief.position || '')) {
            return {
                employee_id: chief.employee_id,
                name: `${chief.first_name} ${chief.last_name}`,
                position: chief.position
            };
        }
    }

    return null;
};

// Requests of a closed fiscal year are kept for the record but can no longer be acted on
const inCurrentFiscalYear = async (request) =>
    String(request.fiscal_year ?? '') === String((await getCurrentFiscalYear())?._id ?? '');

const directorIdsUnderChief = async (chiefId) => {
    const directors = await Director.find({ chief_id: chiefId }).select('employee_id').lean();
    return directors.map(d => d.employee_id);
};

// Client view of a request: the audit copies are summarised, not sent in full
const describe = async (request) => {
    const progress = await request.refreshProgress();
    const { deleted_ratings, cleared_approvals, ...summary } = request.toObject();

    const described = {
        ...summary,
        deleted_ratings_count: deleted_ratings.length,
        cleared_approvals_count: cleared_approvals.length,
        progress
    };

    // Show the reviewer what approving would remove
    if (request.status === 'pending') {
        const directorIds = await directorIdsUnderChief(request.chief_id);
        described.ratings_to_delete = await ManagerialRating.countDocuments({
            rater_emp_id: { $in: directorIds },
            rater_role: 'director',
            fiscal_year: request.fiscal_year
        });
        described.approvals_to_clear = await StaffApproval.countDocuments({
            chief_id: request.chief_id,
            is_active: true,
            fiscal_year: request.fiscal_year
        });
        described.director_count = directorIds.length;
    }

    return described;
};

// Chief sends a rejection to the Deputy Chief Human Capital
router.post('/request', auth, roleCheck(['chief']), async (req, res) => {
    try {
        const { employee_id, comments } = req.body;

        const chief = await Chief.findById(req.user._id).lean();
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief not found"
            });
        }

        const rejection = await StaffApproval.findOne({
            employee_id: employee_id,
            chief_id: chief.employee_id,
            approval_status: 'rejected',
            is_active: true,
            ...(await currentFiscalYearFilter())
        }).lean();

        if (!rejection) {
            return res.status(400).json({
                success: false,
                message: "Reject the staff member before requesting re-rating"
            });
        }

        const openRequest = await ReRatingRequest.findOpenForChief(chief.employee_id);
        if (openRequest) {
            return res.status(400).json({
                success: false,
                message: openRequest.status === 'pending'
                    ? "A re-rating request is already waiting for the Deputy Chief Human Capital"
                    : "Directors are already re-rating your staff"
            });
        }

        const request = await ReRatingRequest.create({
            chief_id: chief.employee_id,
            chief_name: `${chief.first_name} ${chief.last_name}`,
            chief_position: chief.position,
            rejected_employee_id: rejection.employee_id,
            rejected_employee_name: rejection.employee_name,
            rejected_employee_department: rejection.department,
            rejection_reason: rejection.rejection_reason,
            comments: comments
        });

        res.status(201).json({
            success: true,
            message: "Re-rating request sent to the Deputy Chief Human Capital",
            data: await describe(request)
        });

    } catch (error) {
        console.error('Error creating re-rating request:', error);
        res.status(500).json({
            success: false,
            message: "Error creating re-rating request",
            error: error.message
        });
    }
});

// Chief's latest request and its re-rating progress
router.get('/my-status', auth, roleCheck(['chief']), async (req, res) => {
    try {
        const chief = await Chief.findById(req.user._id).lean();
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief not found"
            });
        }

        const request = await ReRatingRequest.findOne({
            chief_id: chief.employee_id,
            ...(await currentFiscalYearFilter())
        }).sort({ created_at: -1 });

        res.status(200).json({
            success: true,
            data: request ? await describe(request) : null
        });

    } catch (error) {
        console.error('Error getting re-rating status:', error);
        res.status(500).json({
            success: false,
            message: "Error getting re-rating status",
            error: error.message
        });
    }
});

// Director's open re-rating, with the employees they still need to rate again
router.get('/director-status', auth, roleCheck(['director']), async (req, res) => {
    try {
        const director = await Director.findById(req.user._id).lean();
        if (!director || !director.chief_id) {
            return res.status(200).json({ success: true, data: null });
        }

        const request = await ReRatingRequest.findOpenForChief(director.chief_id);
        if (!request || request.status !== 're_rating') {
            return res.status(200).json({ success: true, data: null });
        }

        const progress = await request.refreshProgress();

        res.status(200).json({
            success: true,
            data: {
                chief_name: request.chief_name,
                reviewed_by_name: request.reviewed_by_name,
                reviewed_at: request.reviewed_at,
                remaining: progress.remaining.filter(r => r.rater_emp_id === director.employee_id)
            }
        });

    } catch (error) {
        console.error('Error getting director re-rating status:', error);
        res.status(500).json({
            success: false,
            message: "Error getting re-rating status",
            error: error.message
        });
    }
});

// All requests, for the Deputy Chief Human Capital and admins
router.get('/requests', auth, roleCheck(['admin', 'chief']), withFiscalYear, async (req, res) => {
    try {
        const reviewer = await findReviewer(req.user);
        if (!reviewer) {
            return res.status(403).json({
                success: false,
                message: "Only the Deputy Chief Human Capital or an admin can review re-rating requests"
            });
        }

        const requests = await ReRatingRequest.find(fiscalYearFilter(req.fiscalYear)).sort({ created_at: -1 });
        const data = [];
        for (const request of requests) {
            data.push(await describe(request));
        }

        res.status(200).json({
            success: true,
            data: data,
            meta: { reviewer, fiscal_year: req.fiscalYear }
        });

    } catch (error) {
        console.error('Error listing re-rating requests:', error);
        res.status(500).json({
            success: false,
            message: "Error listing re-rating requests",
            error: error.message
        });
    }
});

// Approve or decline. Approving removes every director rating given under the chief
// (for managers and non-managerial staff) and the chief's earlier approval decisions,
// so directors rate again and the chief approves the recalculated selection.
// Peer votes are not touched.
router.post('/requests/:id/review', auth, roleCheck(['admin', 'chief']), async (req, res) => {
    try {
        const { decision, comments } = req.body;

        const reviewer = await findReviewer(req.user);
        if (!reviewer) {
            return res.status(403).json({
                success: false,
                message: "Only the Deputy Chief Human Capital or an admin can review re-rating requests"
            });
        }

        if (!['approved', 'declined'].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Decision must be 'approved' or 'declined'"
            });
        }

        const existing = await ReRatingRequest.findById(req.params.id).lean();
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Re-rating request not found"
            });
        }

        if (!(await inCurrentFiscalYear(existing))) {
            return res.status(400).json({
                success: false,
                message: "This request belongs to a closed fiscal year"
            });
        }

        if (existing.chief_id === reviewer.employee_id) {
            return res.status(403).json({
                success: false,
                message: "You cannot review your own re-rating request"
            });
        }

        // Claim the pending request so two reviewers cannot act on it at once
        const request = await ReRatingRequest.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            {
                $set: {
                    status: decision === 'approved' ? 're_rating' : 'declined',
                    reviewed_by_id: reviewer.employee_id,
                    reviewed_by_name: reviewer.name,
                    reviewed_by_position: reviewer.position,
                    review_comments: comments,
                    reviewed_at: new Date(),
                    updated_at: new Date()
                }
            },
            { new: true }
        );

        if (!request) {
            return res.status(400).json({
                success: false,
                message: "This request has already been reviewed"
            });
        }

        if (decision === 'approved') {
            const directorIds = await directorIdsUnderChief(request.chief_id);
            // Only this fiscal year's ratings and approvals; earlier years stay as they were
            const ratings = await ManagerialRating.find({
                rater_emp_id: { $in: directorIds },
                rater_role: 'director',
                fiscal_year: request.fiscal_year
            }).lean();
            const approvals = await StaffApproval.find({
                chief_id: request.chief_id,
                is_active: true,
                fiscal_year: request.fiscal_year
            }).lean();

            // Keep the audit copies before removing anything
            request.affected_director_ids = directorIds;
            request.deleted_ratings = ratings;
            request.cleared_approvals = approvals;
            await request.save();

            await ManagerialRating.deleteMany({ _id: { $in: ratings.map(r => r._id) } });
            await StaffApproval.updateMany(
                { _id: { $in: approvals.map(a => a._id) } },
                { $set: { is_active: false, updated_at: new Date() } }
            );

            console.log(`Re-rating approved for chief ${request.chief_id}: removed ${ratings.length} director ratings and ${approvals.length} approval records`);
        }

        res.status(200).json({
            success: true,
            message: decision === 'approved'
                ? `Approved. Removed ${request.deleted_ratings.length} director ratings; directors can now rate again.`
                : "Re-rating request declined",
            data: await describe(request)
        });

    } catch (error) {
        console.error('Error reviewing re-rating request:', error);
        res.status(500).json({
            success: false,
            message: "Error reviewing re-rating request",
            error: error.message
        });
    }
});

// Close re-rating before every removed rating is given again, e.g. when a director has left
router.post('/requests/:id/complete', auth, roleCheck(['admin', 'chief']), async (req, res) => {
    try {
        const reviewer = await findReviewer(req.user);
        if (!reviewer) {
            return res.status(403).json({
                success: false,
                message: "Only the Deputy Chief Human Capital or an admin can close re-rating"
            });
        }

        const request = await ReRatingRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Re-rating request not found"
            });
        }

        if (!(await inCurrentFiscalYear(request))) {
            return res.status(400).json({
                success: false,
                message: "This request belongs to a closed fiscal year"
            });
        }

        await request.refreshProgress();
        if (request.status !== 're_rating') {
            return res.status(400).json({
                success: false,
                message: "Only a request that is in re-rating can be closed"
            });
        }

        request.status = 'completed';
        request.completed_at = new Date();
        request.closed_by_reviewer = true;
        await request.save();

        res.status(200).json({
            success: true,
            message: "Re-rating closed",
            data: await describe(request)
        });

    } catch (error) {
        console.error('Error closing re-rating:', error);
        res.status(500).json({
            success: false,
            message: "Error closing re-rating",
            error: error.message
        });
    }
});

export default router;
