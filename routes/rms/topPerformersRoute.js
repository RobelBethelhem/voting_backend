import express from "express";
import HierarchicalVote from "../../models/rms/HierarchicalVote.js";
import VotingPeriod from "../../models/rms/VotingPeriod.js";
import QuotaAllocation from "../../models/rms/QuotaAllocation.js";
import User from "../../models/rms/user.js";
import { QuotaBasedTopPerformerSelector } from "../../utils/quotaBasedSelection.js";
import { ThreePhaseTopPerformerSelection } from "../../utils/threePhaseTopPerformerSelection.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { currentFiscalYearFilter } from "../../utils/fiscalYear.js";

const router = express.Router();

/**
 * Get top performers for a specific voting period using quota-based selection
 * Uses Excel formulas for accurate score calculations
 */
router.get("/voting-period/:period_id/top-performers", authMiddleware, async (req, res) => {
    try {
        const { period_id } = req.params;
        const userInfo = req.user;

        // Validate voting period exists
        const votingPeriod = await VotingPeriod.findOne({ period_id });
        if (!votingPeriod) {
            return res.status(404).json({
                success: false,
                message: "Voting period not found"
            });
        }

        // Get chief's quota allocation
        let quotaAllocation = null;
        if (userInfo.roles.includes('chief')) {
            const chief = await User.findOne({ employee_id: userInfo.employee_id });
            if (chief) {
                quotaAllocation = await QuotaAllocation.findOne({ chief_id: chief._id, ...(await currentFiscalYearFilter()) });
            }
        }

        // Get all candidates for this voting period
        const candidates = await HierarchicalVote.find({
            voting_period_id: period_id
        }).populate('candidate_employee_id');

        if (candidates.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No candidates found for this voting period",
                data: {
                    winners: [],
                    statistics: { total_candidates: 0, total_selected: 0 }
                }
            });
        }

        // Use quota-based selection utility
        const selectionResults = QuotaBasedTopPerformerSelector.selectTopPerformersWithQuota(
            candidates,
            votingPeriod,
            quotaAllocation
        );

        // Generate detailed report
        const report = QuotaBasedTopPerformerSelector.generateSelectionReport(selectionResults);

        res.status(200).json({
            success: true,
            message: "Top performers calculated successfully using Excel formulas",
            data: {
                selection_results: selectionResults,
                detailed_report: report,
                excel_formulas: QuotaBasedTopPerformerSelector.getExcelFormulas(),
                voting_period: {
                    period_id: votingPeriod.period_id,
                    period_name: votingPeriod.period_name,
                    quota_per_function: votingPeriod.quota_per_function
                },
                quota_info: quotaAllocation ? {
                    quota_limit: quotaAllocation.quota_limit,
                    current_allocation: quotaAllocation.current_allocation,
                    available_slots: quotaAllocation.available_slots
                } : null
            }
        });

    } catch (error) {
        console.error("Error calculating top performers:", error);
        res.status(500).json({
            success: false,
            message: "Failed to calculate top performers",
            error: error.message
        });
    }
});

/**
 * Preview top performer selection without saving (for testing calculations)
 */
router.post("/calculate-top-performers", authMiddleware, async (req, res) => {
    try {
        const {
            period_id,
            chief_quota_limit,
            quota_per_function = 1,
            current_allocation = 0
        } = req.body;

        // Mock voting period and quota for calculation
        const mockVotingPeriod = {
            quota_per_function: quota_per_function
        };

        const mockQuotaAllocation = {
            quota_limit: chief_quota_limit,
            current_allocation: current_allocation
        };

        // Get candidates
        const candidates = await HierarchicalVote.find({
            voting_period_id: period_id
        }).populate('candidate_employee_id');

        if (candidates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No candidates found for the specified voting period"
            });
        }

        // Calculate top performers
        const selectionResults = QuotaBasedTopPerformerSelector.selectTopPerformersWithQuota(
            candidates,
            mockVotingPeriod,
            mockQuotaAllocation
        );

        // Validate quota availability
        const quotaValidation = QuotaBasedTopPerformerSelector.validateQuotaAvailability(
            mockQuotaAllocation,
            selectionResults.winners.length
        );

        res.status(200).json({
            success: true,
            message: "Top performer calculation completed (preview mode)",
            data: {
                selection_results: selectionResults,
                quota_validation: quotaValidation,
                excel_formulas_used: {
                    performance_weighted: "=G/100*50",
                    manager_rating_weighted: "=I/50*30",
                    peer_voting_percentage: "=M/K*100",
                    peer_rating_weighted: "=(O*20)/50",
                    weighted_rating: "=(P*N)/100",
                    total_weighted_result: "=R+J+H",
                    total_rating_result: "=P+J+H",
                    managerial_total: "=H+I"
                },
                calculation_parameters: {
                    chief_quota_limit,
                    quota_per_function,
                    current_allocation,
                    total_candidates: candidates.length
                }
            }
        });

    } catch (error) {
        console.error("Error calculating top performers preview:", error);
        res.status(500).json({
            success: false,
            message: "Failed to calculate top performers preview",
            error: error.message
        });
    }
});

/**
 * Validate quota availability for a chief
 */
router.post("/validate-quota", authMiddleware, async (req, res) => {
    try {
        const { required_slots = 1 } = req.body;
        const userInfo = req.user;

        if (!userInfo.roles.includes('chief')) {
            return res.status(403).json({
                success: false,
                message: "Only chiefs can validate quota availability"
            });
        }

        // Get chief's quota allocation
        const chief = await User.findOne({ employee_id: userInfo.employee_id });
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: "Chief user not found"
            });
        }

        const quotaAllocation = await QuotaAllocation.findOne({ chief_id: chief._id, ...(await currentFiscalYearFilter()) });
        if (!quotaAllocation) {
            return res.status(404).json({
                success: false,
                message: "Quota allocation not found for this chief"
            });
        }

        // Validate quota availability
        const validation = QuotaBasedTopPerformerSelector.validateQuotaAvailability(
            quotaAllocation,
            required_slots
        );

        res.status(200).json({
            success: true,
            message: "Quota validation completed",
            data: {
                validation_result: validation,
                quota_details: {
                    quota_limit: quotaAllocation.quota_limit,
                    current_allocation: quotaAllocation.current_allocation,
                    available_slots: quotaAllocation.available_slots,
                    utilization_percentage: quotaAllocation.utilization_percentage
                }
            }
        });

    } catch (error) {
        console.error("Error validating quota:", error);
        res.status(500).json({
            success: false,
            message: "Failed to validate quota",
            error: error.message
        });
    }
});

/**
 * Get Excel formulas reference for manual calculations
 */
router.get("/excel-formulas", (req, res) => {
    try {
        const formulas = QuotaBasedTopPerformerSelector.getExcelFormulas();

        res.status(200).json({
            success: true,
            message: "Excel formulas retrieved successfully",
            data: {
                formulas: formulas,
                column_descriptions: {
                    G: "Performance Appraisal Score (out of 100)",
                    H: "Performance result out of 50% (=G/100*50)",
                    I: "Manager/Director Rating (out of 50)",
                    J: "Manager Rating out of 30% (=I/50*30) OR Total for Managerial (=H+I)",
                    K: "Total Eligible Voters",
                    M: "Voted By (count)",
                    N: "Vote out of 100% (=M/K*100)",
                    O: "Average Peer Rating (out of 50)",
                    P: "Peer Rating converted to 20% (=(O*20)/50)",
                    Q: "Total rating Result without manager consideration (=P+J+H)",
                    R: "Weighted Rating (=(P*N)/100)",
                    S: "Total Weighted Result - final score (=R+J+H)"
                },
                usage_rules: {
                    non_managerial_with_manager: "Use Column S (Total Weighted Result) for final ranking",
                    non_managerial_without_manager: "Use Column Q (Total Rating Result) for final ranking",
                    managerial_positions: "Use Column J (Total Score) for final ranking"
                }
            }
        });

    } catch (error) {
        console.error("Error retrieving Excel formulas:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve Excel formulas",
            error: error.message
        });
    }
});

/**
 * Get department-wise statistics for top performer analysis
 */
router.get("/department-statistics/:period_id", authMiddleware, async (req, res) => {
    try {
        const { period_id } = req.params;

        // Get all candidates for this voting period
        const candidates = await HierarchicalVote.find({
            voting_period_id: period_id
        }).populate('candidate_employee_id');

        if (candidates.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No candidates found",
                data: { departments: [] }
            });
        }

        // Group by department and calculate statistics
        const departmentStats = {};

        candidates.forEach(candidate => {
            const dept = candidate.candidate_department || 'Unassigned';
            if (!departmentStats[dept]) {
                departmentStats[dept] = {
                    department: dept,
                    candidates: [],
                    total_count: 0,
                    avg_performance: 0,
                    avg_manager_rating: 0,
                    total_peer_votes: 0
                };
            }

            departmentStats[dept].candidates.push(candidate);
            departmentStats[dept].total_count++;
        });

        // Calculate averages for each department
        Object.keys(departmentStats).forEach(dept => {
            const deptData = departmentStats[dept];
            const candidates = deptData.candidates;

            deptData.avg_performance = candidates.reduce((sum, c) =>
                sum + (c.performance_appraisal_score || 0), 0) / candidates.length;

            deptData.avg_manager_rating = candidates.reduce((sum, c) =>
                sum + (c.manager_rating_score || 0), 0) / candidates.length;

            deptData.total_peer_votes = candidates.reduce((sum, c) =>
                sum + (c.peer_votes ? c.peer_votes.length : 0), 0);

            // Calculate top performer for this department
            const sortedCandidates = [...candidates].sort((a, b) => {
                // Use basic performance score for sorting
                return (b.performance_appraisal_score || 0) - (a.performance_appraisal_score || 0);
            });

            deptData.top_performer = sortedCandidates[0] ? {
                employee_id: sortedCandidates[0].candidate_employee_id,
                name: sortedCandidates[0].candidate_name,
                performance_score: sortedCandidates[0].performance_appraisal_score
            } : null;
        });

        res.status(200).json({
            success: true,
            message: "Department statistics calculated successfully",
            data: {
                departments: Object.values(departmentStats),
                summary: {
                    total_departments: Object.keys(departmentStats).length,
                    total_candidates: candidates.length,
                    overall_avg_performance: candidates.reduce((sum, c) =>
                        sum + (c.performance_appraisal_score || 0), 0) / candidates.length
                }
            }
        });

    } catch (error) {
        console.error("Error calculating department statistics:", error);
        res.status(500).json({
            success: false,
            message: "Failed to calculate department statistics",
            error: error.message
        });
    }
});

/**
 * 3-Phase Top Performer Selection System
 * Phase 1: Department level ranking based on performance score
 * Phase 2: Cross department ranking of top performers
 * Phase 3: Final quota-based selection
 */
router.get("/voting-period/:period_id/three-phase-selection", authMiddleware, async (req, res) => {
    try {
        const { period_id } = req.params;
        const userInfo = req.user;

        console.log(`🚀 Starting 3-Phase Selection for period: ${period_id}`);

        // Validate voting period exists
        const votingPeriod = await VotingPeriod.findOne({ period_id });
        if (!votingPeriod) {
            return res.status(404).json({
                success: false,
                message: "Voting period not found"
            });
        }

        // Get candidates for this voting period
        const candidates = await HierarchicalVote.find({
            voting_period_id: period_id
        }).lean();

        if (candidates.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No candidates found for this voting period",
                data: {
                    phase1_department_rankings: {},
                    phase2_cross_department_rankings: [],
                    phase3_final_selection: { selected_performers: [], statistics: {} },
                    process_summary: { total_candidates_evaluated: 0 }
                }
            });
        }

        // Get chief's quota allocation
        let quotaAllocation = null;
        if (userInfo?.roles?.includes('chief')) {
            const chief = await User.findOne({ employee_id: userInfo.employee_id });
            if (chief) {
                quotaAllocation = await QuotaAllocation.findOne({ chief_id: chief._id, ...(await currentFiscalYearFilter()) });
            }
        }

        const quotaInfo = quotaAllocation ? {
            quota_limit: quotaAllocation.quota_limit,
            current_allocation: quotaAllocation.current_allocation
        } : {
            quota_limit: 2, // Default quota
            current_allocation: 0
        };

        console.log(`📊 Processing ${candidates.length} candidates with quota:`, quotaInfo);

        // Execute complete 3-phase selection
        const completeResults = await ThreePhaseTopPerformerSelection.executeCompleteThreePhaseSelection(
            candidates,
            quotaInfo
        );

        // Generate detailed calculation review
        const calculationReview = ThreePhaseTopPerformerSelection.generateCalculationReview(completeResults);

        console.log(`✅ 3-Phase Selection Complete: Selected ${completeResults.phase3_final_selection.selected_performers.length} performers`);

        res.status(200).json({
            success: true,
            message: "3-Phase top performer selection completed successfully",
            data: {
                ...completeResults,
                calculation_review: calculationReview,
                voting_period: {
                    period_id: votingPeriod.period_id,
                    period_name: votingPeriod.period_name,
                    quota_per_function: votingPeriod.quota_per_function
                },
                quota_info: quotaInfo,
                excel_formulas: {
                    phase1_formulas: {
                        performance_50_percent: "Performance Score ÷ 2 = Performance out of 50",
                        manager_rating_30_percent: "Director Rating × (30/50) = Manager rating out of 30",
                        peer_voting_percentage: "(Votes for candidate ÷ Total eligible voters) × 100",
                        average_peer_rating: "(Sum of Total_Weight ÷ Number of votes)",
                        peer_rating_20_percent: "(Average peer rating × 20) ÷ 50",
                        total_rating_result: "Performance 50% + Manager 30% + Peer 20%",
                        weighted_rating: "(Peer 20% × Vote percentage) ÷ 100",
                        total_weighted_result: "Performance 50% + Manager 30% + Weighted rating",
                        managerial_total: "Performance 50% + Director rating 50%"
                    },
                    selection_rules: {
                        non_managerial_with_manager: "Use Total Weighted Result for final ranking",
                        non_managerial_without_manager: "Use Total Rating Result for final ranking",
                        managerial_positions: "Use Managerial Total for final ranking"
                    }
                }
            }
        });

    } catch (error) {
        console.error("❌ Error in 3-phase top performer selection:", error);
        res.status(500).json({
            success: false,
            message: "Failed to execute 3-phase top performer selection",
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * Generate detailed calculation review for 3-phase selection
 */
router.get("/voting-period/:period_id/three-phase-review", authMiddleware, async (req, res) => {
    try {
        const { period_id } = req.params;

        // Get candidates
        const candidates = await HierarchicalVote.find({
            voting_period_id: period_id
        }).lean();

        if (candidates.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No candidates found for detailed review"
            });
        }

        // Mock quota for review
        const quotaInfo = { quota_limit: 2, current_allocation: 0 };

        // Execute selection for review
        const completeResults = await ThreePhaseTopPerformerSelection.executeCompleteThreePhaseSelection(
            candidates,
            quotaInfo
        );

        // Generate detailed calculation review
        const calculationReview = ThreePhaseTopPerformerSelection.generateCalculationReview(completeResults);

        res.status(200).json({
            success: true,
            message: "Detailed calculation review generated",
            data: {
                calculation_review: calculationReview,
                raw_results: completeResults,
                methodology: {
                    phase1: "Calculate individual scores using exact Excel formulas, rank within departments",
                    phase2: "Extract top performer from each department, rank across all departments",
                    phase3: "Select top N performers based on available quota slots",
                    scoring_formulas: {
                        "Performance (50%)": "Original score ÷ 2",
                        "Manager Rating (30%)": "Director rating × 30/50",
                        "Peer Rating (20%)": "(Average Total_Weight/votes) × 20/50",
                        "Vote Percentage": "Votes received ÷ Total eligible × 100",
                        "Weighted Rating": "(Peer 20% × Vote %) ÷ 100",
                        "Final Scores": {
                            "Non-managerial WITH manager": "Performance + Manager + Weighted Rating",
                            "Non-managerial WITHOUT manager": "Performance + Manager + Peer Rating",
                            "Managerial": "Performance + Director Rating"
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error generating 3-phase review:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate calculation review",
            error: error.message
        });
    }
});

export default router;