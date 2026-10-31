import User from '../models/rms/user.js';
import Candidate from '../models/rms/Candidate.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';

export class CandidateQualificationService {

    // Qualify users as candidates for a voting period
    static async qualifyUsersForVoting(votingPeriodId, qualificationCriteria = {}) {
        try {
            console.log(`🎯 Qualifying users as candidates for voting period: ${votingPeriodId}`);

            const defaultCriteria = {
                minPerformanceScore: 60,
                includeManagers: true,
                includeProfessionals: true,
                includeDirectors: false, // Directors usually don't get voted on by subordinates
                ...qualificationCriteria
            };

            // Get the voting period
            const votingPeriod = await VotingPeriod.findOne({ period_id: votingPeriodId });
            if (!votingPeriod) {
                throw new Error(`Voting period ${votingPeriodId} not found`);
            }

            // Clear existing candidates for this period
            await Candidate.deleteMany({ voting_period_id: votingPeriodId });

            // Get qualified users based on performance score and level
            const levelFilter = [];
            if (defaultCriteria.includeProfessionals) levelFilter.push('professional');
            if (defaultCriteria.includeManagers) levelFilter.push('manager');
            if (defaultCriteria.includeDirectors) levelFilter.push('director');

            const qualifiedUsers = await User.find({
                level: { $in: levelFilter },
                performance_appraisal_score: { $gte: defaultCriteria.minPerformanceScore },
                status: true
            });

            const candidates = [];

            for (const user of qualifiedUsers) {
                // Determine eligibility based on level
                const eligibility = this.determineEligibility(user.level);

                // Calculate performance weighted score (50% of total)
                const performanceWeighted = (user.performance_appraisal_score / 100) * 50;

                const candidateData = {
                    employee_id: user.employee_id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    department: user.department,
                    position: user.position,
                    level: user.level,
                    performance_appraisal_score: user.performance_appraisal_score,
                    performance_weighted: performanceWeighted,
                    manager_id: user.manager_id,
                    director_id: user.director_id,
                    chief_id: user.chief_id,
                    voting_period_id: votingPeriodId,
                    is_active: true,
                    qualification_criteria: {
                        min_performance_score: defaultCriteria.minPerformanceScore,
                        eligible_for_peer_voting: eligibility.peerVoting,
                        eligible_for_manager_rating: eligibility.managerRating,
                        eligible_for_director_rating: eligibility.directorRating
                    },
                    registered_By: 'SYSTEM_AUTO_QUALIFICATION',
                    Created_At: new Date(),
                    Updated_At: new Date()
                };

                candidates.push(candidateData);
            }

            // Insert all candidates
            const insertedCandidates = await Candidate.insertMany(candidates);

            console.log(`✅ Qualified ${insertedCandidates.length} candidates for voting`);

            return {
                success: true,
                votingPeriodId,
                totalQualified: insertedCandidates.length,
                candidates: insertedCandidates,
                breakdown: {
                    professionals: insertedCandidates.filter(c => c.level === 'professional').length,
                    managers: insertedCandidates.filter(c => c.level === 'manager').length,
                    directors: insertedCandidates.filter(c => c.level === 'director').length
                }
            };

        } catch (error) {
            console.error('❌ Error qualifying candidates:', error);
            throw error;
        }
    }

    // Determine voting eligibility based on level
    static determineEligibility(level) {
        switch (level) {
            case 'professional':
                return {
                    peerVoting: true,       // Professionals can be voted by peers
                    managerRating: true,    // Professionals can be rated by managers
                    directorRating: false   // Professionals not rated by directors directly
                };
            case 'manager':
                return {
                    peerVoting: true,       // Managers can be voted by peer managers
                    managerRating: false,   // Managers not rated by other managers
                    directorRating: true    // Managers are rated by directors
                };
            case 'director':
                return {
                    peerVoting: false,      // Directors typically not peer voted
                    managerRating: false,   // Directors not rated by managers
                    directorRating: false   // Directors rated by chief (separate process)
                };
            default:
                return {
                    peerVoting: false,
                    managerRating: false,
                    directorRating: false
                };
        }
    }

    // Get candidates that a specific user can vote on
    static async getCandidatesForVoter(voterEmployeeId, votingPeriodId) {
        try {
            const voter = await User.findOne({ employee_id: voterEmployeeId });
            if (!voter) {
                throw new Error('Voter not found');
            }

            let candidateQuery = {
                voting_period_id: votingPeriodId,
                is_active: true,
                employee_id: { $ne: voterEmployeeId } // Exclude self
            };

            // Filter candidates based on voter level and hierarchy
            switch (voter.level) {
                case 'professional':
                    // Professionals vote on peer professionals in same department
                    candidateQuery.level = 'professional';
                    candidateQuery.department = voter.department;
                    candidateQuery['qualification_criteria.eligible_for_peer_voting'] = true;
                    break;

                case 'manager':
                    // Managers rate professionals under them
                    candidateQuery.level = 'professional';
                    candidateQuery.manager_id = voter.employee_id;
                    candidateQuery['qualification_criteria.eligible_for_manager_rating'] = true;
                    break;

                case 'director':
                    // Directors rate managers under them
                    candidateQuery.level = 'manager';
                    candidateQuery.director_id = voter.employee_id;
                    candidateQuery['qualification_criteria.eligible_for_director_rating'] = true;
                    break;

                case 'chief':
                    // Chief can see all candidates for approval
                    // No additional filters
                    break;

                default:
                    throw new Error('Invalid voter level');
            }

            const candidates = await Candidate.find(candidateQuery).sort({
                department: 1,
                level: 1,
                performance_appraisal_score: -1
            });

            return {
                success: true,
                voterInfo: {
                    employee_id: voter.employee_id,
                    level: voter.level,
                    department: voter.department,
                    can_vote_on: this.getVoteType(voter.level)
                },
                candidates: candidates,
                totalCandidates: candidates.length
            };

        } catch (error) {
            console.error('❌ Error getting candidates for voter:', error);
            throw error;
        }
    }

    // Helper function to determine vote type
    static getVoteType(voterLevel) {
        switch (voterLevel) {
            case 'professional': return 'peer_rating';
            case 'manager': return 'manager_rating';
            case 'director': return 'director_rating';
            case 'chief': return 'approval';
            default: return 'unknown';
        }
    }

    // Get all candidates for admin view
    static async getAllCandidates(votingPeriodId) {
        try {
            const candidates = await Candidate.find({
                voting_period_id: votingPeriodId
            }).sort({
                department: 1,
                level: 1,
                performance_appraisal_score: -1
            });

            const summary = {
                total: candidates.length,
                byLevel: {
                    professional: candidates.filter(c => c.level === 'professional').length,
                    manager: candidates.filter(c => c.level === 'manager').length,
                    director: candidates.filter(c => c.level === 'director').length
                },
                byDepartment: candidates.reduce((acc, candidate) => {
                    acc[candidate.department] = (acc[candidate.department] || 0) + 1;
                    return acc;
                }, {}),
                averagePerformanceScore: candidates.reduce((sum, c) => sum + c.performance_appraisal_score, 0) / candidates.length
            };

            return {
                success: true,
                candidates,
                summary
            };

        } catch (error) {
            console.error('❌ Error getting all candidates:', error);
            throw error;
        }
    }
}

export default CandidateQualificationService;