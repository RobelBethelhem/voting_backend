// Batch processing utility for efficient large-scale operations

import { OptimizedVotingCalculator } from './optimizedVotingCalculations.js';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';

export class BatchProcessor {
    constructor(options = {}) {
        this.batchSize = options.batchSize || 100;
        this.concurrency = options.concurrency || 10;
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.progressCallback = options.progressCallback || null;
        this.errorCallback = options.errorCallback || null;
    }

    /**
     * Process items in batches with concurrency control
     */
    async processBatches(items, processFn, options = {}) {
        const results = [];
        const errors = [];
        const totalItems = items.length;
        let processedItems = 0;

        // Split items into batches
        const batches = this.createBatches(items, this.batchSize);

        // Process batches with concurrency control
        for (let i = 0; i < batches.length; i += this.concurrency) {
            const concurrentBatches = batches.slice(i, i + this.concurrency);

            const batchPromises = concurrentBatches.map(batch =>
                this.processSingleBatch(batch, processFn, options)
            );

            const batchResults = await Promise.allSettled(batchPromises);

            // Collect results and errors
            batchResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    results.push(...result.value.results);
                    errors.push(...result.value.errors);
                } else {
                    errors.push({
                        batch: i + index,
                        error: result.reason
                    });
                }
            });

            // Update progress
            processedItems += concurrentBatches.reduce((sum, batch) => sum + batch.length, 0);
            this.reportProgress(processedItems, totalItems);
        }

        return {
            results,
            errors,
            summary: {
                total: totalItems,
                processed: results.length,
                failed: errors.length,
                successRate: (results.length / totalItems * 100).toFixed(2) + '%'
            }
        };
    }

    /**
     * Process a single batch with retry logic
     */
    async processSingleBatch(batch, processFn, options) {
        const results = [];
        const errors = [];

        for (const item of batch) {
            let attempts = 0;
            let lastError = null;

            while (attempts < this.retryAttempts) {
                try {
                    const result = await processFn(item, options);
                    results.push(result);
                    break;
                } catch (error) {
                    lastError = error;
                    attempts++;

                    if (attempts < this.retryAttempts) {
                        await this.delay(this.retryDelay * attempts);
                    }
                }
            }

            if (attempts === this.retryAttempts) {
                errors.push({
                    item,
                    error: lastError,
                    attempts
                });

                if (this.errorCallback) {
                    this.errorCallback(item, lastError);
                }
            }
        }

        return { results, errors };
    }

    /**
     * Create batches from items array
     */
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Report progress to callback
     */
    reportProgress(processed, total) {
        if (this.progressCallback) {
            const percentage = (processed / total * 100).toFixed(2);
            this.progressCallback({
                processed,
                total,
                percentage,
                remaining: total - processed
            });
        }
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Batch calculate voting scores for multiple candidates
     */
    async batchCalculateVotingScores(candidates) {
        const processFn = async (candidate) => {
            const scores = OptimizedVotingCalculator.calculateCompleteVotingScore(candidate);
            return {
                candidate_id: candidate.candidate_employee_id,
                ...scores
            };
        };

        return this.processBatches(candidates, processFn);
    }

    /**
     * Batch update database records efficiently
     */
    async batchUpdateVotingRecords(updates) {
        const processFn = async (update) => {
            const { candidate_id, voting_period_id, ...updateData } = update;

            const result = await HierarchicalVote.findOneAndUpdate(
                {
                    candidate_employee_id: candidate_id,
                    voting_period_id: voting_period_id
                },
                {
                    $set: {
                        ...updateData,
                        updated_at: new Date()
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            return result;
        };

        return this.processBatches(updates, processFn);
    }

    /**
     * Batch initialize candidates for voting period
     */
    async batchInitializeCandidates(votingPeriod, candidateIds, createdBy) {
        const processFn = async (candidateId) => {
            // Fetch candidate details
            const User = (await import('../models/rms/user.js')).default;
            const candidate = await User.findOne({ employee_id: candidateId });

            if (!candidate) {
                throw new Error(`Candidate ${candidateId} not found`);
            }

            // Check if already initialized
            const existing = await HierarchicalVote.findOne({
                voting_period_id: votingPeriod.period_id,
                candidate_employee_id: candidateId
            });

            if (existing) {
                return { skipped: true, candidateId };
            }

            // Get hierarchy information
            const [manager, director, chief] = await Promise.all([
                candidate.manager_id ? User.findOne({ employee_id: candidate.manager_id }) : null,
                candidate.director_id ? User.findOne({ employee_id: candidate.director_id }) : null,
                candidate.chief_id ? User.findOne({ employee_id: candidate.chief_id }) : null
            ]);

            // Count eligible peer voters
            const eligiblePeerVoters = await User.countDocuments({
                department: candidate.department,
                employee_id: { $ne: candidateId },
                roles: { $in: ["user", "professional"] }
            });

            // Create voting record
            const votingRecord = new HierarchicalVote({
                voting_period_id: votingPeriod.period_id,
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
                performance_weighted_score: OptimizedVotingCalculator.calculatePerformanceWeightedScore(
                    candidate.performance_appraisal_score || 0
                ),
                manager_id: candidate.manager_id,
                manager_name: manager ? `${manager.first_name} ${manager.last_name}` : "",
                director_id: candidate.director_id,
                director_name: director ? `${director.first_name} ${director.last_name}` : "",
                chief_id: candidate.chief_id,
                chief_name: chief ? `${chief.first_name} ${chief.last_name}` : "",
                total_eligible_peer_voters: eligiblePeerVoters,
                created_by: createdBy
            });

            await votingRecord.save();
            return votingRecord;
        };

        return this.processBatches(candidateIds, processFn);
    }

    /**
     * Batch process peer votes
     */
    async batchProcessPeerVotes(votes, votingPeriodId) {
        const processFn = async (vote) => {
            const { candidate_id, voter_id, ...voteData } = vote;

            // Get voting record
            const votingRecord = await HierarchicalVote.findOne({
                voting_period_id: votingPeriodId,
                candidate_employee_id: candidate_id
            });

            if (!votingRecord) {
                throw new Error(`Voting record not found for candidate ${candidate_id}`);
            }

            // Check for duplicate vote
            const existingVote = votingRecord.peer_votes.find(
                v => v.voter_employee_id === voter_id
            );

            if (existingVote) {
                return { skipped: true, reason: 'Duplicate vote', candidate_id, voter_id };
            }

            // Calculate vote total
            const totalScore = OptimizedVotingCalculator.calculatePeerVoteTotal(voteData);

            // Add vote
            votingRecord.peer_votes.push({
                voter_employee_id: voter_id,
                ...voteData,
                total_score: totalScore,
                vote_timestamp: new Date()
            });

            // Recalculate scores
            const scores = OptimizedVotingCalculator.calculateCompleteVotingScore({
                performance_appraisal_score: votingRecord.performance_appraisal_score,
                manager_rating_score: votingRecord.manager_rating_score,
                director_rating_score: votingRecord.director_rating_score,
                peer_votes: votingRecord.peer_votes,
                total_eligible_peer_voters: votingRecord.total_eligible_peer_voters,
                is_managerial: votingRecord.is_managerial_position
            });

            Object.assign(votingRecord, scores);
            await votingRecord.save();

            return { success: true, candidate_id, voter_id, scores };
        };

        return this.processBatches(votes, processFn);
    }

    /**
     * Batch approve candidates by chief
     */
    async batchApproveCandidate(approvals, chiefId, chiefName) {
        const processFn = async (approval) => {
            const { candidate_id, voting_period_id, status, comments } = approval;

            const result = await HierarchicalVote.findOneAndUpdate(
                {
                    candidate_employee_id: candidate_id,
                    voting_period_id: voting_period_id
                },
                {
                    $set: {
                        chief_approval_status: status,
                        chief_id: chiefId,
                        chief_name: chiefName,
                        chief_approval_date: new Date(),
                        chief_comments: comments || "",
                        updated_at: new Date(),
                        last_updated_by: chiefId
                    }
                },
                {
                    new: true,
                    select: 'candidate_employee_id chief_approval_status total_weighted_result'
                }
            );

            return result;
        };

        return this.processBatches(approvals, processFn);
    }

    /**
     * Batch calculate department winners
     */
    async batchCalculateDepartmentWinners(votingPeriodId) {
        // Fetch all approved candidates
        const candidates = await HierarchicalVote.find({
            voting_period_id: votingPeriodId,
            chief_approval_status: 'approved'
        }).lean();

        // Group by department
        const departmentGroups = new Map();
        candidates.forEach(candidate => {
            const dept = candidate.candidate_department;
            if (!departmentGroups.has(dept)) {
                departmentGroups.set(dept, []);
            }
            departmentGroups.get(dept).push(candidate);
        });

        // Find winner for each department
        const winners = [];
        for (const [department, deptCandidates] of departmentGroups) {
            const winner = deptCandidates.reduce((best, current) => {
                const currentScore = current.is_managerial_position ?
                    current.total_rating_result :
                    current.total_weighted_result;

                const bestScore = best.is_managerial_position ?
                    best.total_rating_result :
                    best.total_weighted_result;

                return currentScore > bestScore ? current : best;
            });

            winners.push({
                department,
                winner: {
                    employee_id: winner.candidate_employee_id,
                    name: `${winner.candidate_first_name} ${winner.candidate_last_name}`,
                    position: winner.candidate_position,
                    score: winner.is_managerial_position ?
                        winner.total_rating_result :
                        winner.total_weighted_result,
                    type: winner.is_managerial_position ? 'managerial' : 'non-managerial'
                }
            });
        }

        return winners;
    }

    /**
     * Generate batch processing report
     */
    generateBatchReport(results) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: results.summary,
            successfulOperations: results.results.length,
            failedOperations: results.errors.length,
            errorDetails: results.errors.map(err => ({
                item: err.item?.candidate_employee_id || err.item,
                error: err.error?.message || err.error,
                attempts: err.attempts
            })),
            performance: {
                totalTime: results.processingTime || 0,
                averageTimePerItem: results.results.length > 0 ?
                    (results.processingTime / results.results.length).toFixed(2) : 0,
                itemsPerSecond: results.processingTime > 0 ?
                    (results.results.length / (results.processingTime / 1000)).toFixed(2) : 0
            }
        };

        return report;
    }
}

// Create singleton instance with default configuration
const defaultBatchProcessor = new BatchProcessor({
    batchSize: 100,
    concurrency: 10,
    retryAttempts: 3,
    retryDelay: 1000
});

export default defaultBatchProcessor;