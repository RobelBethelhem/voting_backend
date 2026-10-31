// 3-Phase Top Performer Selection System Implementation
// Phase 1: Department level ranking based on performance score
// Phase 2: Cross department ranking of top performers
// Phase 3: Final quota-based selection

import User from '../models/rms/user.js';
import Vote from '../models/rms/Vote.js';
import ManagerialRating from '../models/rms/ManagerialRating.js';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';
import { currentFiscalYearFilter } from './fiscalYear.js';

export class ThreePhaseTopPerformerSelection {

    /**
     * PHASE 1: Department Level Ranking
     * Calculate scores for all candidates within their departments using exact formulas
     */
    static async calculatePhase1DepartmentRanking(candidates) {
        const departmentResults = {};

        for (const candidate of candidates) {
            const department = candidate.candidate_department || 'Unassigned';

            if (!departmentResults[department]) {
                departmentResults[department] = {
                    department: department,
                    candidates: [],
                    eligible_voters_count: 0,
                    total_department_voters_count: 0
                };
            }

            // Calculate individual candidate scores
            const candidateScores = await this.calculateIndividualCandidateScore(candidate);

            departmentResults[department].candidates.push({
                ...candidate,
                calculated_scores: candidateScores
            });
        }

        // Calculate department statistics and rankings
        for (const [department, deptData] of Object.entries(departmentResults)) {
            // Get eligible voters count for this department
            const eligibleVotersCount = await User.countDocuments({
                department: department,
                status: 'active'
            });

            // Get total voters who actually voted in this department
            const totalDepartmentVoters = await Vote.distinct('voter_emp_id', {
                voter_department: department,
                ...(await currentFiscalYearFilter())
            });

            deptData.eligible_voters_count = eligibleVotersCount;
            deptData.total_department_voters_count = totalDepartmentVoters.length;

            // Sort candidates within department by their final scores
            deptData.candidates.sort((a, b) => {
                const scoreA = this.getFinalScoreForComparison(a);
                const scoreB = this.getFinalScoreForComparison(b);
                return scoreB - scoreA; // Highest first
            });

            // Add department rankings
            deptData.candidates = deptData.candidates.map((candidate, index) => ({
                ...candidate,
                department_rank: index + 1,
                department_rank_label: `${index + 1} of ${deptData.candidates.length}`
            }));

            // Identify department top performer
            deptData.top_performer = deptData.candidates[0] || null;
        }

        return departmentResults;
    }

    /**
     * Calculate individual candidate score using exact formulas
     */
    static async calculateIndividualCandidateScore(candidate) {
        const candidateEmployeeId = candidate.candidate_employee_id;
        const department = candidate.candidate_department;
        const isManagerial = candidate.is_managerial_position;

        // 1. Performance Score (50% weight)
        // Formula: Performance score ÷ 2 = Performance out of 50
        const performanceScore = candidate.performance_appraisal_score || 0;
        const performanceOutOf50 = performanceScore / 2; // Convert 100 scale to 50 scale

        // 2. Managerial Rating (30% for non-managerial, 50% for managerial)
        let managerialRating = 0;
        let managerialOutOf30 = 0;
        let managerialOutOf50 = 0;

        // Get director rating from ManagerialRating model
        const directorRating = await ManagerialRating.findOne({
            ratee_emp_id: candidateEmployeeId,
            rating_category: isManagerial ? 'managerial_staff' : 'non_managerial_staff',
            status: { $in: ['submitted', 'approved'] },
            ...(await currentFiscalYearFilter())
        });

        if (directorRating) {
            // Use percentage_score as the rating out of 50
            managerialRating = (directorRating.percentage_score / 100) * 50;

            if (isManagerial) {
                managerialOutOf50 = managerialRating; // 50% weight for managers
            } else {
                managerialOutOf30 = managerialRating * (30 / 50); // Convert to 30% weight for non-managerial
            }
        }

        if (isManagerial) {
            // For managerial positions: Performance 50% + Managerial Rating 50%
            const totalScore = performanceOutOf50 + managerialOutOf50;

            return {
                performance_out_of_50: parseFloat(performanceOutOf50.toFixed(2)),
                managerial_rating_out_of_50: parseFloat(managerialOutOf50.toFixed(2)),
                final_score: parseFloat(totalScore.toFixed(2)),
                score_type: 'managerial',
                formula_used: 'Performance 50% + Managerial Rating 50%',
                excel_formula: '=H+I (where H=G/2, I=Director Rating out of 50)'
            };
        } else {
            // For non-managerial positions: Need peer voting calculation (20%)

            // 3. Peer Voting Calculations (20% weight)
            const peerVotingResults = await this.calculatePeerVotingScore(candidateEmployeeId, department);

            // Total Rating Result = Performance 50% + Manager 30% + Peer 20%
            const totalRatingResult = performanceOutOf50 + managerialOutOf30 + peerVotingResults.peer_rating_out_of_20;

            // Check if department has manager for weighted calculation
            const departmentHasManager = await this.checkIfDepartmentHasManager(department);

            let finalScore = totalRatingResult;
            let scoreType = 'total_rating_result';
            let formulaUsed = 'Performance 50% + Manager 30% + Peer 20%';
            let excelFormula = '=H+J+P (where H=G/2, J=I*30/50, P=(O*20)/50)';

            if (departmentHasManager && peerVotingResults.vote_percentage > 0) {
                // Calculate Weighted Rating and Total Weighted Result
                const weightedRating = (peerVotingResults.peer_rating_out_of_20 * peerVotingResults.vote_percentage) / 100;
                const totalWeightedResult = performanceOutOf50 + managerialOutOf30 + weightedRating;

                finalScore = totalWeightedResult;
                scoreType = 'total_weighted_result';
                formulaUsed = 'Performance 50% + Manager 30% + Weighted Peer Rating';
                excelFormula = '=H+J+R (where R=(P*N)/100, N=Vote %, P=Peer 20%)';

                return {
                    performance_out_of_50: parseFloat(performanceOutOf50.toFixed(2)),
                    managerial_rating_out_of_30: parseFloat(managerialOutOf30.toFixed(2)),
                    peer_voting_percentage: parseFloat(peerVotingResults.vote_percentage.toFixed(2)),
                    average_peer_rating_out_of_50: parseFloat(peerVotingResults.average_peer_rating.toFixed(2)),
                    peer_rating_out_of_20: parseFloat(peerVotingResults.peer_rating_out_of_20.toFixed(2)),
                    weighted_rating: parseFloat(weightedRating.toFixed(2)),
                    total_rating_result: parseFloat(totalRatingResult.toFixed(2)),
                    final_score: parseFloat(totalWeightedResult.toFixed(2)),
                    score_type: scoreType,
                    formula_used: formulaUsed,
                    excel_formula: excelFormula,
                    has_department_manager: true
                };
            } else {
                return {
                    performance_out_of_50: parseFloat(performanceOutOf50.toFixed(2)),
                    managerial_rating_out_of_30: parseFloat(managerialOutOf30.toFixed(2)),
                    peer_voting_percentage: parseFloat(peerVotingResults.vote_percentage.toFixed(2)),
                    average_peer_rating_out_of_50: parseFloat(peerVotingResults.average_peer_rating.toFixed(2)),
                    peer_rating_out_of_20: parseFloat(peerVotingResults.peer_rating_out_of_20.toFixed(2)),
                    final_score: parseFloat(totalRatingResult.toFixed(2)),
                    score_type: scoreType,
                    formula_used: formulaUsed,
                    excel_formula: excelFormula,
                    has_department_manager: false
                };
            }
        }
    }

    /**
     * Calculate peer voting score (20% component for non-managerial staff)
     */
    static async calculatePeerVotingScore(candidateEmployeeId, department) {
        // Get total eligible voters in department
        const totalEligibleVoters = await User.countDocuments({
            department: department,
            status: 'active'
        });

        // Get all votes for this candidate
        const votesForCandidate = await Vote.find({
            candidate_emp_id: candidateEmployeeId,
            voter_department: department,
            ...(await currentFiscalYearFilter())
        });

        const votesCount = votesForCandidate.length;

        // Vote percentage = (votes received / total eligible) * 100
        const votePercentage = totalEligibleVoters > 0 ? (votesCount / totalEligibleVoters) * 100 : 0;

        let averagePeerRating = 0;

        if (votesCount > 0) {
            // Calculate average peer rating from Total_Weight
            const totalWeight = votesForCandidate.reduce((sum, vote) => sum + vote.Total_Weight, 0);

            // Average peer rating = Total Weight given by all voters ÷ Number of voters who voted
            // Convert to 50 scale: (average) - Total_Weight is already out of 50
            averagePeerRating = totalWeight / votesCount;
        }

        // Peer rating converted to 20% = (average_rating * 20) / 50
        const peerRatingOutOf20 = (averagePeerRating * 20) / 50;

        return {
            total_eligible_voters: totalEligibleVoters,
            votes_received: votesCount,
            vote_percentage: votePercentage,
            average_peer_rating: averagePeerRating,
            peer_rating_out_of_20: peerRatingOutOf20
        };
    }

    /**
     * Check if department has a manager
     */
    static async checkIfDepartmentHasManager(department) {
        const managerCount = await User.countDocuments({
            department: department,
            roles: { $in: ['manager'] },
            status: 'active'
        });
        return managerCount > 0;
    }

    /**
     * Get final score for comparison based on candidate type and department structure
     */
    static getFinalScoreForComparison(candidate) {
        const scores = candidate.calculated_scores;

        if (scores.score_type === 'managerial') {
            return scores.final_score;
        } else if (scores.has_department_manager && scores.score_type === 'total_weighted_result') {
            return scores.final_score; // Use Total Weighted Result
        } else {
            return scores.final_score; // Use Total Rating Result
        }
    }

    /**
     * PHASE 2: Cross-Department Ranking
     * Get top performer from each department and rank them across departments
     */
    static async calculatePhase2CrossDepartmentRanking(phase1Results) {
        const topPerformersFromDepartments = [];

        // Extract top performer from each department
        Object.values(phase1Results).forEach(deptData => {
            if (deptData.top_performer) {
                topPerformersFromDepartments.push({
                    ...deptData.top_performer,
                    department_info: {
                        department: deptData.department,
                        total_candidates_in_dept: deptData.candidates.length,
                        eligible_voters: deptData.eligible_voters_count,
                        actual_voters: deptData.total_department_voters_count
                    }
                });
            }
        });

        // Sort top performers across departments
        topPerformersFromDepartments.sort((a, b) => {
            const scoreA = this.getFinalScoreForComparison(a);
            const scoreB = this.getFinalScoreForComparison(b);
            return scoreB - scoreA; // Highest first
        });

        // Add cross-department rankings
        const crossDepartmentRanked = topPerformersFromDepartments.map((performer, index) => ({
            ...performer,
            cross_department_rank: index + 1,
            cross_department_rank_label: `${index + 1} of ${topPerformersFromDepartments.length}`,
            final_comparison_score: this.getFinalScoreForComparison(performer)
        }));

        return crossDepartmentRanked;
    }

    /**
     * PHASE 3: Final Quota-Based Selection
     * Select top N performers based on quota limit
     */
    static calculatePhase3QuotaBasedSelection(phase2Results, quotaInfo) {
        const quotaLimit = quotaInfo?.quota_limit || 2;
        const currentAllocation = quotaInfo?.current_allocation || 0;
        const availableSlots = Math.max(0, quotaLimit - currentAllocation);

        if (availableSlots === 0) {
            return {
                selected_performers: [],
                quota_status: 'quota_full',
                statistics: {
                    available_slots: 0,
                    quota_limit: quotaLimit,
                    current_allocation: currentAllocation
                }
            };
        }

        // Select top N based on available quota slots
        const slotsToFill = Math.min(availableSlots, phase2Results.length);
        const selectedPerformers = phase2Results.slice(0, slotsToFill);

        // Add final selection rankings
        const finalSelection = selectedPerformers.map((performer, index) => ({
            ...performer,
            final_selection_rank: index + 1,
            selection_reason: 'quota_based_top_performer'
        }));

        // Calculate statistics
        const statistics = {
            total_departments_represented: new Set(selectedPerformers.map(p => p.department_info.department)).size,
            available_slots: availableSlots,
            slots_filled: finalSelection.length,
            quota_limit: quotaLimit,
            current_allocation: currentAllocation,
            quota_utilization_percentage: ((currentAllocation + finalSelection.length) / quotaLimit) * 100,
            average_selected_score: finalSelection.reduce((sum, p) => sum + p.final_comparison_score, 0) / finalSelection.length,
            score_range: {
                highest: finalSelection[0]?.final_comparison_score || 0,
                lowest: finalSelection[finalSelection.length - 1]?.final_comparison_score || 0
            }
        };

        return {
            selected_performers: finalSelection,
            quota_status: finalSelection.length < availableSlots ? 'partial_filled' : 'fully_utilized',
            statistics: statistics
        };
    }

    /**
     * Execute complete 3-phase selection process
     */
    static async executeCompleteThreePhaseSelection(candidates, quotaInfo) {
        console.log('=== STARTING 3-PHASE TOP PERFORMER SELECTION ===');
        console.log(`Total candidates: ${candidates.length}`);
        console.log(`Quota info:`, quotaInfo);

        // PHASE 1: Department Level Ranking
        console.log('\n--- PHASE 1: Department Level Ranking ---');
        const phase1Results = await this.calculatePhase1DepartmentRanking(candidates);

        console.log('Phase 1 Results:');
        Object.values(phase1Results).forEach(dept => {
            console.log(`${dept.department}: ${dept.candidates.length} candidates, Top: ${dept.top_performer?.candidate_name || 'None'} (Score: ${dept.top_performer?.calculated_scores?.final_score || 'N/A'})`);
        });

        // PHASE 2: Cross-Department Ranking
        console.log('\n--- PHASE 2: Cross-Department Ranking ---');
        const phase2Results = await this.calculatePhase2CrossDepartmentRanking(phase1Results);

        console.log('Phase 2 Results (Top 5):');
        phase2Results.slice(0, 5).forEach(performer => {
            console.log(`Rank ${performer.cross_department_rank}: ${performer.candidate_name} (${performer.department_info.department}) - Score: ${performer.final_comparison_score.toFixed(2)}`);
        });

        // PHASE 3: Final Quota-Based Selection
        console.log('\n--- PHASE 3: Final Quota-Based Selection ---');
        const phase3Results = this.calculatePhase3QuotaBasedSelection(phase2Results, quotaInfo);

        console.log('Phase 3 Results:');
        console.log(`Selected ${phase3Results.selected_performers.length} performers out of ${phase3Results.statistics.available_slots} available slots`);
        phase3Results.selected_performers.forEach(performer => {
            console.log(`Final Rank ${performer.final_selection_rank}: ${performer.candidate_name} (${performer.department_info.department}) - Score: ${performer.final_comparison_score.toFixed(2)}`);
        });

        return {
            phase1_department_rankings: phase1Results,
            phase2_cross_department_rankings: phase2Results,
            phase3_final_selection: phase3Results,
            process_summary: {
                total_candidates_evaluated: candidates.length,
                departments_involved: Object.keys(phase1Results).length,
                cross_department_top_performers: phase2Results.length,
                final_selected_count: phase3Results.selected_performers.length,
                quota_status: phase3Results.quota_status
            }
        };
    }

    /**
     * Generate detailed calculation review for debugging and verification
     */
    static generateCalculationReview(completeResults) {
        const review = {
            title: "3-Phase Top Performer Selection - Calculation Review",
            phases: {
                phase1: {
                    title: "Phase 1: Department Level Ranking",
                    description: "Individual candidate scoring within departments",
                    departments: {}
                },
                phase2: {
                    title: "Phase 2: Cross-Department Ranking",
                    description: "Top performers from each department ranked against each other",
                    results: []
                },
                phase3: {
                    title: "Phase 3: Final Quota-Based Selection",
                    description: "Final selection based on available quota slots",
                    results: []
                }
            },
            excel_formulas: {
                performance_50_percent: "=G/2 (Performance score divided by 2)",
                manager_rating_30_percent: "=I*30/50 (Director rating converted to 30%)",
                peer_voting_percentage: "=(Votes for candidate / Total eligible voters) * 100",
                average_peer_rating: "=(Sum of Total_Weight / Number of votes)",
                peer_rating_20_percent: "=(Average peer rating * 20) / 50",
                total_rating_result: "=Performance 50% + Manager 30% + Peer 20%",
                weighted_rating: "=(Peer 20% * Vote percentage) / 100",
                total_weighted_result: "=Performance 50% + Manager 30% + Weighted rating",
                managerial_total: "=Performance 50% + Director rating 50%"
            }
        };

        // Phase 1 details
        Object.entries(completeResults.phase1_department_rankings).forEach(([deptName, deptData]) => {
            review.phases.phase1.departments[deptName] = {
                total_candidates: deptData.candidates.length,
                eligible_voters: deptData.eligible_voters_count,
                actual_voters: deptData.total_department_voters_count,
                candidates: deptData.candidates.map(candidate => ({
                    rank: candidate.department_rank,
                    name: candidate.candidate_name,
                    employee_id: candidate.candidate_employee_id,
                    score_breakdown: candidate.calculated_scores,
                    final_score: candidate.calculated_scores.final_score
                }))
            };
        });

        // Phase 2 details
        review.phases.phase2.results = completeResults.phase2_cross_department_rankings.map(performer => ({
            cross_dept_rank: performer.cross_department_rank,
            name: performer.candidate_name,
            department: performer.department_info.department,
            dept_rank: performer.department_rank,
            final_score: performer.final_comparison_score,
            score_type: performer.calculated_scores.score_type
        }));

        // Phase 3 details
        review.phases.phase3.results = completeResults.phase3_final_selection.selected_performers.map(performer => ({
            final_rank: performer.final_selection_rank,
            name: performer.candidate_name,
            department: performer.department_info.department,
            cross_dept_rank: performer.cross_department_rank,
            final_score: performer.final_comparison_score,
            selection_reason: performer.selection_reason
        }));

        review.phases.phase3.statistics = completeResults.phase3_final_selection.statistics;

        return review;
    }
}

export default ThreePhaseTopPerformerSelection;