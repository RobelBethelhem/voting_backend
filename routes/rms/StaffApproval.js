import { Router } from "express";
import auth from "../../middleware/rms/auth.js";
import roleCheck from "../../middleware/rms/roleCheck.js";
import StaffApproval from "../../models/rms/StaffApproval.js";
import User from "../../models/rms/user.js";
import Chief from "../../models/rms/Chief.js";
import QuotaAllocation from "../../models/rms/QuotaAllocation.js";
import ReRatingRequest from "../../models/rms/ReRatingRequest.js";
import FiscalYearSnapshot from "../../models/rms/FiscalYearSnapshot.js";
import { buildChiefSelectionDetails } from "../../services/selectionDetailsService.js";
import { currentYearChief } from "../../services/fiscalYearOrgService.js";
import { currentFiscalYearFilter, fiscalYearFilter, isClosed, withFiscalYear } from "../../utils/fiscalYear.js";

const router = Router();

// While a re-rating request is open the current ranking is about to change, so the
// chief's approval decisions wait for it
const reRatingHold = async (chiefId) => {
    const openRequest = await ReRatingRequest.findOpenForChief(chiefId);
    if (!openRequest) return null;
    return openRequest.status === 'pending'
        ? "Your re-rating request is waiting for the Deputy Chief Human Capital"
        : "Directors are still re-rating your staff";
};

// Submit staff for approval (from 3-phase selection)
router.post('/submit-for-approval', auth, roleCheck(['chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        const { selectedStaff } = req.body;

        if (!selectedStaff || !Array.isArray(selectedStaff) || selectedStaff.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Selected staff array is required"
            });
        }

        // Find chief info
        const chief = await Chief.findById(userInfo._id);
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief not found"
            });
        }

        const holdMessage = await reRatingHold(chief.employee_id);
        if (holdMessage) {
            return res.status(409).json({
                success: false,
                message: holdMessage
            });
        }

        // Approvals and quota of the current fiscal year
        const fiscalYear = await currentFiscalYearFilter();

        // Get quota allocation (quotas point at this fiscal year's record of the chief)
        const quotaAllocation = await QuotaAllocation.findOne({
            chief_id: (await currentYearChief(chief))._id,
            is_active: true,
            ...fiscalYear
        });

        const staffApprovals = [];

        for (let i = 0; i < selectedStaff.length; i++) {
            const staff = selectedStaff[i];

            // Check if already exists (prevent duplicates). Records cleared by a re-rating
            // are inactive but still hold the unique employee/chief pair, so reuse them.
            const existingApproval = await StaffApproval.findOne({
                employee_id: staff.employee_id,
                chief_id: chief.employee_id,
                ...fiscalYear
            });

            if (existingApproval) {
                if (!existingApproval.is_active) {
                    existingApproval.is_active = true;
                    existingApproval.rejection_reason = undefined;
                    existingApproval.approval_comments = undefined;
                    existingApproval.reviewed_at = undefined;
                    existingApproval.submitted_at = new Date();
                    existingApproval.performance_appraisal_score = staff.performance_appraisal_score || 0;
                    existingApproval.quota_allocation_id = quotaAllocation?._id;
                }

                // Update existing record
                existingApproval.final_score = staff.final_score || staff.calculated_scores?.final_score || 0;
                existingApproval.ranking_position = i + 1;
                existingApproval.score_breakdown = staff.calculated_scores || staff.score_breakdown || {};
                existingApproval.approval_status = 'pending';
                existingApproval.updated_at = new Date();

                await existingApproval.save();
                staffApprovals.push(existingApproval);
            } else {
                // Create new approval record
                const staffApproval = new StaffApproval({
                    employee_id: staff.employee_id,
                    employee_name: `${staff.first_name} ${staff.last_name}`,
                    department: staff.department,
                    position: staff.position,
                    chief_id: chief.employee_id,
                    chief_name: `${chief.first_name} ${chief.last_name}`,
                    final_score: staff.final_score || staff.calculated_scores?.final_score || 0,
                    ranking_position: i + 1,
                    performance_appraisal_score: staff.performance_appraisal_score || 0,
                    score_breakdown: staff.calculated_scores || staff.score_breakdown || {},
                    quota_allocation_id: quotaAllocation?._id,
                    selection_phase: 'phase3_quota_selection',
                    approval_status: 'pending'
                });

                await staffApproval.save();
                staffApprovals.push(staffApproval);
            }
        }

        res.status(200).json({
            success: true,
            message: `${staffApprovals.length} staff submitted for approval`,
            data: {
                submitted_count: staffApprovals.length,
                chief_name: `${chief.first_name} ${chief.last_name}`,
                staff_approvals: staffApprovals
            }
        });

    } catch (error) {
        console.error('Error submitting staff for approval:', error);
        res.status(500).json({
            success: false,
            message: "Error submitting staff for approval",
            error: error.message
        });
    }
});

// Approve or reject staff
router.post('/approve-reject-staff', auth, roleCheck(['chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        const { employee_id, approval_status, comments, rejection_reason } = req.body;

        if (!employee_id || !approval_status) {
            return res.status(400).json({
                success: false,
                message: "Employee ID and approval status are required"
            });
        }

        if (!['approved', 'rejected'].includes(approval_status)) {
            return res.status(400).json({
                success: false,
                message: "Approval status must be 'approved' or 'rejected'"
            });
        }

        if (approval_status === 'rejected' && !rejection_reason) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required when rejecting staff"
            });
        }

        // Find chief info
        const chief = await Chief.findById(userInfo._id);
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief not found"
            });
        }

        const holdMessage = await reRatingHold(chief.employee_id);
        if (holdMessage) {
            return res.status(409).json({
                success: false,
                message: holdMessage
            });
        }

        // Find the staff approval record in the current fiscal year
        const staffApproval = await StaffApproval.findOne({
            employee_id: employee_id,
            chief_id: chief.employee_id,
            is_active: true,
            ...(await currentFiscalYearFilter())
        });

        if (!staffApproval) {
            return res.status(404).json({
                success: false,
                message: "Staff approval record not found"
            });
        }

        // Update approval status
        if (approval_status === 'approved') {
            await staffApproval.approve(comments);
        } else {
            await staffApproval.reject(rejection_reason, comments);
        }

        res.status(200).json({
            success: true,
            message: `Staff ${approval_status} successfully`,
            data: {
                employee_id: staffApproval.employee_id,
                employee_name: staffApproval.employee_name,
                approval_status: staffApproval.approval_status,
                final_score: staffApproval.final_score,
                reviewed_at: staffApproval.reviewed_at
            }
        });

    } catch (error) {
        console.error('Error processing staff approval:', error);
        res.status(500).json({
            success: false,
            message: "Error processing staff approval",
            error: error.message
        });
    }
});

// Get all staff approvals for a chief
router.get('/my-staff-approvals', auth, roleCheck(['chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        const { status } = req.query;

        // Find chief info
        const chief = await Chief.findById(userInfo._id);
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief not found"
            });
        }

        // Get staff approvals
        const staffApprovals = await StaffApproval.findByChief(chief.employee_id, status, await currentFiscalYearFilter());

        res.status(200).json({
            success: true,
            message: "Staff approvals retrieved successfully",
            data: {
                chief_name: `${chief.first_name} ${chief.last_name}`,
                total_count: staffApprovals.length,
                staff_approvals: staffApprovals
            }
        });

    } catch (error) {
        console.error('Error getting staff approvals:', error);
        res.status(500).json({
            success: false,
            message: "Error retrieving staff approvals",
            error: error.message
        });
    }
});

// Get approved staff by chief (for reporting)
router.get('/approved-staff-by-chief/:chiefId?', auth, roleCheck(['admin', 'director', 'chief']), withFiscalYear, async (req, res) => {
    try {
        const userInfo = req.user;
        let targetChiefId = req.params.chiefId;

        // If no chief ID provided, use current user (if they're a chief)
        if (!targetChiefId && userInfo.roles.includes('chief')) {
            const chief = await Chief.findById(userInfo._id);
            if (chief) {
                targetChiefId = chief.employee_id;
            }
        }

        if (!targetChiefId) {
            return res.status(400).json({
                success: false,
                message: "Chief ID is required"
            });
        }

        // Find chief info for name, as the chief was in that fiscal year
        const chief = await Chief.findOne({ employee_id: targetChiefId, ...fiscalYearFilter(req.fiscalYear) });
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief not found"
            });
        }

        // Get approved staff
        const approvedStaff = await StaffApproval.findApprovedByChief(targetChiefId, fiscalYearFilter(req.fiscalYear));

        // Format response with only essential fields
        const formattedStaff = approvedStaff.map(staff => ({
            employee_id: staff.employee_id,
            name: staff.employee_name,
            department: staff.department,
            position: staff.position,
            final_score: staff.final_score,
            ranking_position: staff.ranking_position,
            approved_at: staff.reviewed_at,
            score_breakdown: staff.score_breakdown
        }));

        res.status(200).json({
            success: true,
            message: "Approved staff retrieved successfully",
            data: {
                chief_id: targetChiefId,
                chief_name: `${chief.first_name} ${chief.last_name}`,
                total_approved: formattedStaff.length,
                approved_staff: formattedStaff
            }
        });

    } catch (error) {
        console.error('Error getting approved staff by chief:', error);
        res.status(500).json({
            success: false,
            message: "Error retrieving approved staff",
            error: error.message
        });
    }
});

// Get all approved staff (admin view)
router.get('/all-approved-staff', auth, roleCheck(['admin', 'director']), withFiscalYear, async (req, res) => {
    try {
        const approvedStaff = await StaffApproval.find({
            approval_status: 'approved',
            is_active: true,
            ...fiscalYearFilter(req.fiscalYear)
        })
        .sort({ final_score: -1, ranking_position: 1 })
        .lean();

        // Group by chief
        const staffByChief = {};
        approvedStaff.forEach(staff => {
            if (!staffByChief[staff.chief_id]) {
                staffByChief[staff.chief_id] = {
                    chief_id: staff.chief_id,
                    chief_name: staff.chief_name,
                    approved_count: 0,
                    staff: []
                };
            }

            staffByChief[staff.chief_id].approved_count++;
            staffByChief[staff.chief_id].staff.push({
                employee_id: staff.employee_id,
                name: staff.employee_name,
                department: staff.department,
                final_score: staff.final_score,
                ranking_position: staff.ranking_position,
                approved_at: staff.reviewed_at
            });
        });

        res.status(200).json({
            success: true,
            message: "All approved staff retrieved successfully",
            data: {
                total_approved: approvedStaff.length,
                chiefs_count: Object.keys(staffByChief).length,
                staff_by_chief: Object.values(staffByChief)
            }
        });

    } catch (error) {
        console.error('Error getting all approved staff:', error);
        res.status(500).json({
            success: false,
            message: "Error retrieving all approved staff",
            error: error.message
        });
    }
});

// Get best staff grouped by chiefs with detailed info (admin view)
router.get('/best-staff-by-chiefs', auth, roleCheck(['admin']), withFiscalYear, async (req, res) => {
    try {
        // Get all approved staff of the requested fiscal year
        const approvedStaff = await StaffApproval.find({
            approval_status: 'approved',
            is_active: true,
            ...fiscalYearFilter(req.fiscalYear)
        })
        .sort({ chief_id: 1, ranking_position: 1 })
        .lean();

        // Get all chiefs info
        const chiefIds = [...new Set(approvedStaff.map(staff => staff.chief_id))];
        // Chiefs and employees as they were in that fiscal year
        const chiefs = await Chief.find({
            employee_id: { $in: chiefIds },
            status: true,
            ...fiscalYearFilter(req.fiscalYear)
        }).lean();

        // Get all employee IDs to fetch their positions from User model
        const employeeIds = approvedStaff.map(staff => staff.employee_id);
        const users = await User.find({
            employee_id: { $in: employeeIds },
            status: true,
            ...fiscalYearFilter(req.fiscalYear)
        }).lean();

        // Create user lookup map by employee_id
        const userMap = {};
        users.forEach(user => {
            userMap[user.employee_id] = {
                position: user.position,
                department: user.department,
                full_name: `${user.first_name} ${user.last_name}`
            };
        });

        // Create chief lookup map
        const chiefMap = {};
        chiefs.forEach(chief => {
            chiefMap[chief.employee_id] = {
                chief_id: chief.employee_id,
                chief_name: `${chief.first_name} ${chief.last_name}`,
                position: chief.position,
                department: chief.department
            };
        });

        // Group staff by chief with rank
        const staffByChief = {};
        approvedStaff.forEach((staff, index) => {
            if (!staffByChief[staff.chief_id]) {
                staffByChief[staff.chief_id] = {
                    ...chiefMap[staff.chief_id],
                    total_approved: 0,
                    top_performers: []
                };
            }

            // Get position from user model
            const userInfo = userMap[staff.employee_id];

            staffByChief[staff.chief_id].total_approved++;
            staffByChief[staff.chief_id].top_performers.push({
                rank: staff.ranking_position,
                name: staff.employee_name,
                department: staff.department,
                position: userInfo?.position || staff.position || 'N/A',
                final_score: staff.final_score,
                approved_at: staff.reviewed_at
            });
        });

        res.status(200).json({
            success: true,
            message: "Best staff by chiefs retrieved successfully",
            data: {
                fiscal_year: req.fiscalYear,
                total_chiefs: Object.keys(staffByChief).length,
                total_approved_staff: approvedStaff.length,
                chiefs: Object.values(staffByChief)
            }
        });

    } catch (error) {
        console.error('Error getting best staff by chiefs:', error);
        res.status(500).json({
            success: false,
            message: "Error retrieving best staff by chiefs",
            error: error.message
        });
    }
});

// Every candidate under each chief with the score details the chief ranked on, for the
// Selected Best Staff Excel export. ?chief_id=<employee id> for one chief, otherwise every
// chief with approved staff.
router.get('/selection-details', auth, roleCheck(['admin']), withFiscalYear, async (req, res) => {
    try {
        const { chief_id } = req.query;

        // A closed year is reported as it stood when it closed
        if (isClosed(req.fiscalYear)) {
            const snapshot = await FiscalYearSnapshot.findOne({
                fiscal_year: req.fiscalYear._id,
                kind: 'selection_details'
            }).lean();
            if (snapshot) {
                const chiefs = snapshot.data.chiefs.filter(c =>
                    chief_id ? c.chief_id === chief_id : c.approved.length > 0
                );
                return res.status(200).json({
                    success: true,
                    message: "Selection details retrieved from the closed fiscal year",
                    data: {
                        fiscal_year: req.fiscalYear,
                        snapshot_at: snapshot.created_at,
                        chiefs
                    }
                });
            }
        }

        const chiefIds = chief_id
            ? [chief_id]
            : await StaffApproval.distinct('chief_id', {
                approval_status: 'approved',
                is_active: true,
                ...fiscalYearFilter(req.fiscalYear)
            });

        const chiefs = await Chief.find({
            employee_id: { $in: chiefIds },
            status: true
        }).lean();

        if (chief_id && chiefs.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Chief not found"
            });
        }

        const details = [];
        for (const chief of chiefs) {
            details.push(await buildChiefSelectionDetails(chief, req.fiscalYear));
        }

        res.status(200).json({
            success: true,
            message: "Selection details retrieved successfully",
            data: {
                fiscal_year: req.fiscalYear,
                chiefs: details
            }
        });

    } catch (error) {
        console.error('Error getting selection details:', error);
        res.status(500).json({
            success: false,
            message: "Error retrieving selection details",
            error: error.message
        });
    }
});

// Get approval statistics
router.get('/approval-statistics/:chiefId?', auth, roleCheck(['admin', 'director', 'chief']), withFiscalYear, async (req, res) => {
    try {
        const userInfo = req.user;
        let targetChiefId = req.params.chiefId;

        // If no chief ID provided, use current user (if they're a chief)
        if (!targetChiefId && userInfo.roles.includes('chief')) {
            const chief = await Chief.findById(userInfo._id);
            if (chief) {
                targetChiefId = chief.employee_id;
            }
        }

        // Get approval summary
        const summary = await StaffApproval.getApprovalSummary(targetChiefId, fiscalYearFilter(req.fiscalYear));

        // Get top performers
        let topPerformers = [];
        if (targetChiefId) {
            topPerformers = await StaffApproval.getTopPerformers(targetChiefId, 5, fiscalYearFilter(req.fiscalYear));
        }

        res.status(200).json({
            success: true,
            message: "Approval statistics retrieved successfully",
            data: {
                chief_id: targetChiefId,
                approval_summary: summary,
                top_performers: topPerformers.map(staff => ({
                    employee_id: staff.employee_id,
                    name: staff.employee_name,
                    department: staff.department,
                    final_score: staff.final_score,
                    ranking_position: staff.ranking_position
                }))
            }
        });

    } catch (error) {
        console.error('Error getting approval statistics:', error);
        res.status(500).json({
            success: false,
            message: "Error retrieving approval statistics",
            error: error.message
        });
    }
});

// Delete/deactivate staff approval (admin only)
router.delete('/delete-approval/:employee_id', auth, roleCheck(['admin']), async (req, res) => {
    try {
        const { employee_id } = req.params;
        const { chief_id } = req.query;

        const query = { employee_id: employee_id, ...(await currentFiscalYearFilter()) };
        if (chief_id) {
            query.chief_id = chief_id;
        }

        const staffApproval = await StaffApproval.findOne(query);
        if (!staffApproval) {
            return res.status(404).json({
                success: false,
                message: "Staff approval record not found"
            });
        }

        // Soft delete by setting is_active to false
        staffApproval.is_active = false;
        staffApproval.updated_at = new Date();
        await staffApproval.save();

        res.status(200).json({
            success: true,
            message: "Staff approval record deactivated successfully"
        });

    } catch (error) {
        console.error('Error deleting staff approval:', error);
        res.status(500).json({
            success: false,
            message: "Error deleting staff approval",
            error: error.message
        });
    }
});

export default router;