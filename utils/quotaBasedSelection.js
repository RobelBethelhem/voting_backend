// Quota-based Top Performer Selection Utility
import { OptimizedVotingCalculator } from './optimizedVotingCalculations.js';

export class QuotaBasedTopPerformerSelector {

    /**
     * Select top performers based on quota limits
     * @param {Array} candidates - Array of candidates with calculated scores
     * @param {Object} votingPeriod - Voting period configuration
     * @param {Object} quotaAllocation - Chief's quota allocation
     * @returns {Object} Selected winners and statistics
     */
    static selectTopPerformersWithQuota(candidates, votingPeriod, quotaAllocation) {
        // Validate inputs
        if (!candidates || candidates.length === 0) {
            return { winners: [], statistics: { totalSelected: 0, byDepartment: {} } };
        }

        const quotaPerFunction = votingPeriod?.quota_per_function || 1;
        const chiefQuotaLimit = quotaAllocation?.quota_limit || Infinity;
        const currentAllocation = quotaAllocation?.current_allocation || 0;
        const availableSlots = Math.min(
            chiefQuotaLimit - currentAllocation,
            candidates.length
        );

        // Step 1: Calculate complete scores for all candidates
        const candidatesWithScores = candidates.map(candidate => {
            const scores = OptimizedVotingCalculator.calculateCompleteVotingScore(candidate);

            // Determine which score to use based on candidate type
            let finalScore;
            if (candidate.is_managerial_position) {
                // Managerial: Use total rating result (Performance 50% + Manager Rating 50%)
                finalScore = scores.total_rating_result;
            } else if (candidate.has_manager) {
                // Non-managerial with manager: Use total weighted result
                finalScore = scores.total_weighted_result;
            } else {
                // Non-managerial without manager: Use total rating result
                finalScore = scores.total_rating_result;
            }

            return {
                ...candidate,
                calculated_scores: scores,
                final_score: finalScore,
                selection_criteria: candidate.is_managerial_position ? 'managerial' :
                                  candidate.has_manager ? 'non_managerial_with_manager' :
                                  'non_managerial_without_manager'
            };
        });

        // Step 2: Group by department/function
        const departmentGroups = new Map();
        candidatesWithScores.forEach(candidate => {
            const dept = candidate.candidate_department || candidate.candidate_function || 'Unassigned';
            if (!departmentGroups.has(dept)) {
                departmentGroups.set(dept, []);
            }
            departmentGroups.get(dept).push(candidate);
        });

        // Step 3: Sort within each department and select top performers
        const selectedWinners = [];
        const departmentStatistics = {};

        departmentGroups.forEach((deptCandidates, department) => {
            // Sort by final score (descending)
            deptCandidates.sort((a, b) => b.final_score - a.final_score);

            // Select top N based on quota_per_function
            const maxSelectFromDept = Math.min(
                quotaPerFunction,
                deptCandidates.length,
                availableSlots - selectedWinners.length
            );

            const deptWinners = deptCandidates.slice(0, maxSelectFromDept);
            selectedWinners.push(...deptWinners);

            // Track department statistics
            departmentStatistics[department] = {
                total_candidates: deptCandidates.length,
                selected: deptWinners.length,
                top_performer: deptWinners[0] || null,
                average_score: deptCandidates.reduce((sum, c) => sum + c.final_score, 0) / deptCandidates.length
            };

            // Stop if we've reached the chief's quota limit
            if (selectedWinners.length >= availableSlots) {
                return;
            }
        });

        // Step 4: If there are remaining slots, select best overall candidates
        if (selectedWinners.length < availableSlots) {
            const unselectedCandidates = candidatesWithScores.filter(
                c => !selectedWinners.includes(c)
            );

            // Sort unselected by score
            unselectedCandidates.sort((a, b) => b.final_score - a.final_score);

            // Fill remaining slots with best overall performers
            const additionalSlots = availableSlots - selectedWinners.length;
            const additionalWinners = unselectedCandidates.slice(0, additionalSlots);
            selectedWinners.push(...additionalWinners);
        }

        // Step 5: Prepare detailed results
        const results = {
            winners: selectedWinners.map((winner, index) => ({
                rank: index + 1,
                employee_id: winner.candidate_employee_id,
                name: winner.candidate_name,
                department: winner.candidate_department,
                function: winner.candidate_function,
                position_type: winner.is_managerial_position ? 'Managerial' : 'Non-Managerial',
                selection_criteria: winner.selection_criteria,
                scores: {
                    performance_score: winner.calculated_scores.performance_weighted_score,
                    manager_rating: winner.calculated_scores.manager_rating_weighted_score,
                    peer_rating: winner.calculated_scores.peer_rating_weighted_score,
                    final_score: winner.final_score
                },
                voting_details: {
                    total_peer_votes: winner.calculated_scores.total_peer_votes_received,
                    peer_voting_percentage: winner.calculated_scores.peer_voting_percentage,
                    has_manager_rating: winner.has_manager || false
                }
            })),
            statistics: {
                total_candidates: candidates.length,
                total_selected: selectedWinners.length,
                quota_utilization: {
                    used: selectedWinners.length,
                    available: availableSlots,
                    chief_quota_limit: chiefQuotaLimit,
                    current_allocation: currentAllocation,
                    quota_per_function: quotaPerFunction
                },
                by_department: departmentStatistics,
                selection_summary: {
                    managerial: selectedWinners.filter(w => w.is_managerial_position).length,
                    non_managerial_with_manager: selectedWinners.filter(w => !w.is_managerial_position && w.has_manager).length,
                    non_managerial_without_manager: selectedWinners.filter(w => !w.is_managerial_position && !w.has_manager).length
                }
            }
        };

        return results;
    }

    /**
     * Validate if selection can proceed based on quota availability
     */
    static validateQuotaAvailability(quotaAllocation, requiredSlots = 1) {
        if (!quotaAllocation) {
            return {
                canProceed: false,
                reason: 'No quota allocation found for chief',
                availableSlots: 0
            };
        }

        const availableSlots = quotaAllocation.quota_limit - quotaAllocation.current_allocation;

        if (availableSlots <= 0) {
            return {
                canProceed: false,
                reason: 'Quota limit reached - no available slots',
                availableSlots: 0
            };
        }

        if (availableSlots < requiredSlots) {
            return {
                canProceed: true,
                reason: `Only ${availableSlots} slots available (${requiredSlots} requested)`,
                availableSlots: availableSlots,
                partial: true
            };
        }

        return {
            canProceed: true,
            reason: 'Sufficient quota available',
            availableSlots: availableSlots,
            partial: false
        };
    }

    /**
     * Get Excel-like formulas for quota-based selection
     * These formulas can be used in Excel for the same calculations
     */
    static getExcelFormulas() {
        return {
            // Score Calculation Formulas
            performance_weighted: '=G2/100*50',
            manager_rating_non_managerial: '=I2/50*30',
            manager_rating_managerial: '=I2',
            peer_voting_percentage: '=M2/K2*100',
            peer_rating_weighted: '=(O2*20)/50',
            total_rating_no_manager: '=P2+J2+H2',
            weighted_peer_rating: '=(P2*N2)/100',
            total_weighted_result: '=R2+J2+H2',

            // Winner Selection Formula (using RANK and conditional logic)
            // Assumes data in columns A-S with headers in row 1
            winner_selection: `
                =IF(
                    RANK(
                        IF(D2="Managerial", J2, IF(I2>0, S2, Q2)),
                        IF(D2="Managerial", J:J, IF(I2>0, S:S, Q:Q)),
                        0
                    ) <= QUOTA_PER_DEPT,
                    "WINNER",
                    "NOT SELECTED"
                )`,

            // Department-wise ranking
            dept_rank: `=COUNTIFS($C:$C, C2, IF($D:$D="Managerial", $J:$J, IF($I:$I>0, $S:$S, $Q:$Q)), ">"&IF(D2="Managerial", J2, IF(I2>0, S2, Q2))) + 1`,

            // Quota validation
            quota_check: '=IF(COUNTIF(T:T, "WINNER") <= QUOTA_LIMIT, "WITHIN QUOTA", "EXCEEDS QUOTA")'
        };
    }

    /**
     * Generate summary report for quota-based selection
     */
    static generateSelectionReport(selectionResults) {
        const { winners, statistics } = selectionResults;

        const report = {
            executive_summary: {
                total_winners: winners.length,
                quota_utilization_percentage: (statistics.quota_utilization.used / statistics.quota_utilization.chief_quota_limit * 100).toFixed(2) + '%',
                departments_represented: Object.keys(statistics.by_department).length
            },
            top_performers: winners.slice(0, 5).map(w => ({
                name: w.name,
                department: w.department,
                score: w.scores.final_score.toFixed(2)
            })),
            department_distribution: Object.entries(statistics.by_department).map(([dept, stats]) => ({
                department: dept,
                selected: stats.selected,
                total: stats.total_candidates,
                selection_rate: (stats.selected / stats.total_candidates * 100).toFixed(2) + '%'
            })),
            scoring_breakdown: {
                average_performance_score: (winners.reduce((sum, w) => sum + w.scores.performance_score, 0) / winners.length).toFixed(2),
                average_manager_rating: (winners.reduce((sum, w) => sum + w.scores.manager_rating, 0) / winners.length).toFixed(2),
                average_peer_rating: (winners.filter(w => w.scores.peer_rating > 0).reduce((sum, w) => sum + w.scores.peer_rating, 0) / winners.filter(w => w.scores.peer_rating > 0).length || 0).toFixed(2)
            }
        };

        return report;
    }
}

// Export for use in other modules
export default QuotaBasedTopPerformerSelector;