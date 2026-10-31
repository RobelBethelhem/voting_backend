// Voting calculation utilities based on Excel formula analysis

export class VotingCalculator {

    /**
     * Calculate performance weighted score (50% for all positions)
     * Formula: (Appraisal_Score / 100) * 50
     * Note: Input appraisalScore should be out of 100, automatically converts to 50 scale
     */
    static calculatePerformanceWeightedScore(appraisalScore) {
        // Convert /100 to /50 scale first, then apply 50% weight
        const scoreOutOf50 = appraisalScore / 2; // Convert 100 scale to 50 scale
        return (scoreOutOf50 / 50) * 50; // This gives the weighted score out of 50
    }

    /**
     * Calculate manager rating weighted score (30% for non-managerial)
     * Formula: (Manager_Rating / 50) * 30
     */
    static calculateManagerRatingWeightedScore(managerRating, isManagerial = false) {
        if (isManagerial) {
            // For managerial positions, manager rating is part of combined 50%
            return 0; // Will be calculated in combined score
        }
        return (managerRating / 50) * 30;
    }

    /**
     * Calculate combined manager + director rating for managerial positions (50%)
     * Since only one can rate (exclusive), use whichever rating exists
     * Formula: Single_Rating (as 50% weight)
     */
    static calculateCombinedManagerialRating(managerRating, directorRating) {
        // Since only one rating is allowed (exclusive), use whichever exists
        const singleRating = managerRating > 0 ? managerRating : directorRating;
        return singleRating; // This becomes the 50% component directly
    }

    /**
     * Calculate peer voting statistics
     * Formula: (Voted_Count / Total_Eligible) * 100
     */
    static calculatePeerVotingPercentage(votedCount, totalEligible) {
        if (totalEligible === 0) return 0;
        return (votedCount / totalEligible) * 100;
    }

    /**
     * Calculate average peer rating from all peer votes
     * Each peer vote has 8 criteria (1-5 scale), total possible = 40
     * Excel O4: Returns score out of 50 (not percentage)
     */
    static calculateAveragePeerRating(peerVotes) {
        if (peerVotes.length === 0) return 0;

        const totalScores = peerVotes.map(vote => {
            return vote.dedication + vote.quality_of_work +
                   vote.collaboration_team_work + vote.independence +
                   vote.customer_service + vote.time_management +
                   vote.office_attire_dress_code + vote.flexibility;
        });

        const averageTotal = totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;

        // Convert to score out of 50 (Excel O4 format)
        return (averageTotal / 40) * 50;
    }

    /**
     * Calculate peer rating weighted score (20% for non-managerial)
     * Formula: (Average_Peer_Rating * 20) / 50
     */
    static calculatePeerRatingWeightedScore(averagePeerRating, isManagerial = false) {
        if (isManagerial) {
            // Managerial positions don't have peer voting component
            return 0;
        }
        return (averagePeerRating * 20) / 50;
    }

    /**
     * Calculate total rating result
     * Non-managerial: Performance + Manager + Peer
     * Managerial: Performance + Combined Managerial Rating
     */
    static calculateTotalRatingResult(performanceScore, managerScore, peerScore, isManagerial = false) {
        if (isManagerial) {
            return performanceScore + managerScore; // managerScore is combined manager+director
        }
        return performanceScore + managerScore + peerScore;
    }

    /**
     * Calculate weighted rating
     * Formula: (Peer_Weighted_Score * Voting_Percentage) / 100
     */
    static calculateWeightedRating(peerWeightedScore, votingPercentage) {
        return (peerWeightedScore * votingPercentage) / 100;
    }

    /**
     * Calculate total weighted result
     * Formula: Weighted_Rating + Manager_Score + Performance_Score
     */
    static calculateTotalWeightedResult(weightedRating, managerScore, performanceScore, isManagerial = false) {
        if (isManagerial) {
            // For managerial: Performance + Combined Managerial Rating (no weighted peer component)
            return performanceScore + managerScore;
        }
        return weightedRating + managerScore + performanceScore;
    }

    /**
     * Complete calculation for a candidate
     * Note: performance_appraisal_score should be out of 100 (will be auto-converted to 50 scale)
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

        // 1. Performance weighted score (50%) - auto-converts /100 to /50
        const performanceWeightedScore = this.calculatePerformanceWeightedScore(performance_appraisal_score);

        // 2. Manager/Director ratings
        let managerRatingWeightedScore = 0;
        let combinedManagerialRating = 0;

        if (is_managerial) {
            // For managerial: combined manager + director rating (50%)
            combinedManagerialRating = this.calculateCombinedManagerialRating(
                manager_rating_score,
                director_rating_score
            );
        } else {
            // For non-managerial: manager rating (30%)
            managerRatingWeightedScore = this.calculateManagerRatingWeightedScore(manager_rating_score);
        }

        // 3. Peer voting calculations (only for non-managerial)
        let peerVotingPercentage = 0;
        let averagePeerRating = 0;
        let peerRatingWeightedScore = 0;
        let weightedRating = 0;

        if (!is_managerial && peer_votes.length > 0) {
            peerVotingPercentage = this.calculatePeerVotingPercentage(
                peer_votes.length,
                total_eligible_peer_voters
            );

            averagePeerRating = this.calculateAveragePeerRating(peer_votes);

            peerRatingWeightedScore = this.calculatePeerRatingWeightedScore(averagePeerRating);

            weightedRating = this.calculateWeightedRating(peerRatingWeightedScore, peerVotingPercentage);
        }

        // 4. Final calculations
        const totalRatingResult = this.calculateTotalRatingResult(
            performanceWeightedScore,
            is_managerial ? combinedManagerialRating : managerRatingWeightedScore,
            peerRatingWeightedScore,
            is_managerial
        );

        const totalWeightedResult = this.calculateTotalWeightedResult(
            weightedRating,
            is_managerial ? combinedManagerialRating : managerRatingWeightedScore,
            performanceWeightedScore,
            is_managerial
        );

        return {
            performance_weighted_score: parseFloat(performanceWeightedScore.toFixed(2)),
            manager_rating_weighted_score: parseFloat(managerRatingWeightedScore.toFixed(2)),
            combined_managerial_rating: parseFloat(combinedManagerialRating.toFixed(2)),
            combined_managerial_weighted_score: is_managerial ? parseFloat(combinedManagerialRating.toFixed(2)) : 0,
            total_peer_votes_received: peer_votes.length,
            peer_voting_percentage: parseFloat(peerVotingPercentage.toFixed(2)),
            average_peer_rating: parseFloat(averagePeerRating.toFixed(2)),
            peer_rating_weighted_score: parseFloat(peerRatingWeightedScore.toFixed(2)),
            total_rating_result: parseFloat(totalRatingResult.toFixed(2)),
            weighted_rating: parseFloat(weightedRating.toFixed(2)),
            total_weighted_result: parseFloat(totalWeightedResult.toFixed(2))
        };
    }

    /**
     * Validate voting eligibility for peer voters
     */
    static validatePeerVotingEligibility(voterDepartment, candidateDepartment) {
        // Peers can only vote within same department
        return voterDepartment === candidateDepartment;
    }

    /**
     * Validate managerial voting eligibility
     */
    static validateManagerialVotingEligibility(voterRoles, voterDepartment, candidateDepartment) {
        // Managers and directors can vote for candidates in their department/function
        const hasManagerialRole = voterRoles.includes('manager') ||
                                 voterRoles.includes('director') ||
                                 voterRoles.includes('chief');
        return hasManagerialRole && voterDepartment === candidateDepartment;
    }

    /**
     * Calculate individual peer vote total score
     */
    static calculatePeerVoteTotal(voteData) {
        const {
            dedication,
            quality_of_work,
            collaboration_team_work,
            independence,
            customer_service,
            time_management,
            office_attire_dress_code,
            flexibility
        } = voteData;

        return dedication + quality_of_work + collaboration_team_work +
               independence + customer_service + time_management +
               office_attire_dress_code + flexibility;
    }
}