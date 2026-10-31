// Enhanced and optimized voting calculation utilities with caching and performance improvements

export class OptimizedVotingCalculator {
    // Cache for frequently accessed calculations
    static cache = new Map();
    static CACHE_TTL = 60000; // 1 minute TTL for cache

    /**
     * Generate cache key for calculation results
     */
    static getCacheKey(type, ...params) {
        return `${type}_${params.join('_')}`;
    }

    /**
     * Get cached result or calculate and cache
     */
    static getCachedOrCalculate(key, calculateFn) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.value;
        }

        const value = calculateFn();
        this.cache.set(key, { value, timestamp: Date.now() });
        return value;
    }

    /**
     * Optimized performance weighted score calculation
     * Implements Excel formula: =G/100*50
     * @param {number} appraisalScore - Score out of 100
     * @returns {number} Weighted score (50% weight)
     */
    static calculatePerformanceWeightedScore(appraisalScore) {
        // Direct calculation without intermediate conversion
        return appraisalScore * 0.5;
    }

    /**
     * Optimized manager rating calculation
     * Non-managerial: =I/50*30
     * Managerial: Direct score (part of 50%)
     */
    static calculateManagerRatingWeightedScore(managerRating, isManagerial = false) {
        if (isManagerial) {
            return managerRating; // Direct 50% component
        }
        return managerRating * 0.6; // 30/50 = 0.6
    }

    /**
     * Calculate combined managerial rating efficiently
     * Only one rating allowed per exclusive voting rule
     */
    static calculateCombinedManagerialRating(managerRating, directorRating) {
        // Use logical OR for efficiency since only one should exist
        return managerRating || directorRating || 0;
    }

    /**
     * Batch calculate peer voting statistics for multiple candidates
     * Optimized for bulk operations
     */
    static batchCalculatePeerVotingStats(candidatesData) {
        return candidatesData.map(candidate => {
            const { peer_votes = [], total_eligible_peer_voters = 0 } = candidate;

            if (peer_votes.length === 0) {
                return {
                    candidate_id: candidate.candidate_employee_id,
                    peer_voting_percentage: 0,
                    average_peer_rating: 0,
                    peer_rating_weighted_score: 0,
                    weighted_rating: 0
                };
            }

            // Efficient single-pass calculation
            const totalScore = peer_votes.reduce((sum, vote) => {
                return sum + vote.total_score ||
                    (vote.dedication + vote.quality_of_work +
                     vote.collaboration_team_work + vote.independence +
                     vote.customer_service + vote.time_management +
                     vote.office_attire_dress_code + vote.flexibility);
            }, 0);

            const avgScore = totalScore / peer_votes.length;
            const avgRating = (avgScore / 40) * 50; // Convert to 50 scale
            const votingPercentage = (peer_votes.length / total_eligible_peer_voters) * 100;
            const peerWeightedScore = (avgRating * 20) / 50;
            const weightedRating = (peerWeightedScore * votingPercentage) / 100;

            return {
                candidate_id: candidate.candidate_employee_id,
                peer_voting_percentage: votingPercentage,
                average_peer_rating: avgRating,
                peer_rating_weighted_score: peerWeightedScore,
                weighted_rating: weightedRating
            };
        });
    }

    /**
     * Optimized complete voting score calculation
     * Uses efficient algorithms and reduces redundant calculations
     */
    static calculateCompleteVotingScore(candidateData) {
        const {
            performance_appraisal_score,
            manager_rating_score = 0,
            director_rating_score = 0,
            peer_votes = [],
            total_eligible_peer_voters = 0,
            is_managerial = false
        } = candidateData;

        // Cache key for this calculation
        const cacheKey = this.getCacheKey(
            'complete',
            performance_appraisal_score,
            manager_rating_score,
            director_rating_score,
            peer_votes.length,
            total_eligible_peer_voters,
            is_managerial
        );

        return this.getCachedOrCalculate(cacheKey, () => {
            // 1. Performance score (50%)
            const performanceWeightedScore = performance_appraisal_score * 0.5;

            // 2. Managerial ratings
            let managerWeightedScore = 0;
            let combinedManagerialRating = 0;

            if (is_managerial) {
                // Single managerial rating (50%)
                combinedManagerialRating = manager_rating_score || director_rating_score || 0;
            } else {
                // Manager rating (30%)
                managerWeightedScore = manager_rating_score * 0.6; // 30/50 = 0.6
            }

            // 3. Peer voting (only for non-managerial)
            let peerStats = {
                percentage: 0,
                avgRating: 0,
                weightedScore: 0,
                weightedRating: 0
            };

            if (!is_managerial && peer_votes.length > 0) {
                // Single-pass calculation for efficiency
                const totalScore = peer_votes.reduce((sum, vote) =>
                    sum + (vote.total_score || this.calculatePeerVoteTotal(vote)), 0
                );

                peerStats.avgRating = (totalScore / peer_votes.length / 40) * 50;
                peerStats.percentage = (peer_votes.length / total_eligible_peer_voters) * 100;
                peerStats.weightedScore = (peerStats.avgRating * 20) / 50;
                peerStats.weightedRating = (peerStats.weightedScore * peerStats.percentage) / 100;
            }

            // 4. Final calculations
            const totalRatingResult = is_managerial ?
                performanceWeightedScore + combinedManagerialRating :
                performanceWeightedScore + managerWeightedScore + peerStats.weightedScore;

            const totalWeightedResult = is_managerial ?
                performanceWeightedScore + combinedManagerialRating :
                peerStats.weightedRating + managerWeightedScore + performanceWeightedScore;

            return {
                performance_weighted_score: parseFloat(performanceWeightedScore.toFixed(2)),
                manager_rating_weighted_score: parseFloat(managerWeightedScore.toFixed(2)),
                combined_managerial_rating: parseFloat(combinedManagerialRating.toFixed(2)),
                combined_managerial_weighted_score: is_managerial ? parseFloat(combinedManagerialRating.toFixed(2)) : 0,
                total_peer_votes_received: peer_votes.length,
                peer_voting_percentage: parseFloat(peerStats.percentage.toFixed(2)),
                average_peer_rating: parseFloat(peerStats.avgRating.toFixed(2)),
                peer_rating_weighted_score: parseFloat(peerStats.weightedScore.toFixed(2)),
                total_rating_result: parseFloat(totalRatingResult.toFixed(2)),
                weighted_rating: parseFloat(peerStats.weightedRating.toFixed(2)),
                total_weighted_result: parseFloat(totalWeightedResult.toFixed(2))
            };
        });
    }

    /**
     * Calculate peer vote total efficiently
     */
    static calculatePeerVoteTotal(voteData) {
        const criteria = [
            'dedication', 'quality_of_work', 'collaboration_team_work',
            'independence', 'customer_service', 'time_management',
            'office_attire_dress_code', 'flexibility'
        ];

        return criteria.reduce((sum, criterion) => sum + (voteData[criterion] || 0), 0);
    }

    /**
     * Batch process voting calculations for performance
     */
    static async batchProcessVotingCalculations(candidates, batchSize = 100) {
        const results = [];

        for (let i = 0; i < candidates.length; i += batchSize) {
            const batch = candidates.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(candidate =>
                    Promise.resolve(this.calculateCompleteVotingScore(candidate))
                )
            );
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Get department winners efficiently
     */
    static getDepartmentWinners(candidates, departments) {
        const winners = new Map();

        // Group by department first
        const departmentGroups = new Map();
        candidates.forEach(candidate => {
            if (!departmentGroups.has(candidate.candidate_department)) {
                departmentGroups.set(candidate.candidate_department, []);
            }
            departmentGroups.get(candidate.candidate_department).push(candidate);
        });

        // Find winner for each department
        departmentGroups.forEach((candidates, department) => {
            const winner = candidates.reduce((best, current) => {
                const currentScore = current.is_managerial_position ?
                    current.total_rating_result :
                    current.total_weighted_result;

                const bestScore = best.is_managerial_position ?
                    best.total_rating_result :
                    best.total_weighted_result;

                return currentScore > bestScore ? current : best;
            });

            winners.set(department, winner);
        });

        return winners;
    }

    /**
     * Validate voting data integrity
     */
    static validateVotingData(candidateData) {
        const errors = [];

        // Performance score validation
        if (candidateData.performance_appraisal_score < 0 ||
            candidateData.performance_appraisal_score > 100) {
            errors.push('Performance score must be between 0 and 100');
        }

        // Manager/Director rating validation
        if (candidateData.manager_rating_score &&
            (candidateData.manager_rating_score < 0 || candidateData.manager_rating_score > 50)) {
            errors.push('Manager rating must be between 0 and 50');
        }

        if (candidateData.director_rating_score &&
            (candidateData.director_rating_score < 0 || candidateData.director_rating_score > 50)) {
            errors.push('Director rating must be between 0 and 50');
        }

        // Exclusive rating validation for managerial positions
        if (candidateData.is_managerial &&
            candidateData.manager_rating_score > 0 &&
            candidateData.director_rating_score > 0) {
            errors.push('Only one managerial rating allowed (manager OR director, not both)');
        }

        // Peer voting validation
        if (candidateData.peer_votes) {
            candidateData.peer_votes.forEach((vote, index) => {
                const criteria = [
                    'dedication', 'quality_of_work', 'collaboration_team_work',
                    'independence', 'customer_service', 'time_management',
                    'office_attire_dress_code', 'flexibility'
                ];

                criteria.forEach(criterion => {
                    if (vote[criterion] < 1 || vote[criterion] > 5) {
                        errors.push(`Peer vote ${index + 1}: ${criterion} must be between 1 and 5`);
                    }
                });
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Clear calculation cache
     */
    static clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    static getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }
}

// Export for backward compatibility
export const VotingCalculator = OptimizedVotingCalculator;