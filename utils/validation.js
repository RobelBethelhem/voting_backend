// Validation and error handling utilities for hierarchical voting system

import HierarchyConfig from '../config/hierarchyConfig.js';

export class VotingValidator {
    /**
     * Validate candidate data before initialization
     */
    static validateCandidateData(candidate) {
        const errors = [];
        const warnings = [];

        // Required fields validation
        const requiredFields = [
            'employee_id',
            'first_name',
            'last_name',
            'department',
            'position'
        ];

        requiredFields.forEach(field => {
            if (!candidate[field]) {
                errors.push({
                    field,
                    message: `${field} is required`,
                    type: 'MISSING_REQUIRED_FIELD'
                });
            }
        });

        // Performance score validation
        if (candidate.performance_appraisal_score !== undefined) {
            if (candidate.performance_appraisal_score < 0 || candidate.performance_appraisal_score > 100) {
                errors.push({
                    field: 'performance_appraisal_score',
                    message: 'Performance score must be between 0 and 100',
                    type: 'INVALID_RANGE',
                    value: candidate.performance_appraisal_score
                });
            }
        } else {
            warnings.push({
                field: 'performance_appraisal_score',
                message: 'No performance score provided, defaulting to 0',
                type: 'MISSING_SCORE'
            });
        }

        // Hierarchy validation
        if (candidate.is_managerial && !candidate.manager_id && !candidate.director_id) {
            warnings.push({
                field: 'hierarchy',
                message: 'Managerial employee has no supervisor assigned',
                type: 'MISSING_SUPERVISOR'
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Validate peer vote submission
     */
    static validatePeerVote(vote, voter, candidate) {
        const errors = [];

        // Check if voter can vote for candidate
        if (!this.canVoteForCandidate(voter, candidate)) {
            errors.push({
                type: 'UNAUTHORIZED_VOTE',
                message: 'Voter is not authorized to vote for this candidate'
            });
        }

        // Validate voting criteria scores
        const criteria = HierarchyConfig.peerVotingCriteria;
        criteria.forEach(criterion => {
            const score = vote[criterion.id];

            if (score === undefined) {
                errors.push({
                    field: criterion.id,
                    type: 'MISSING_CRITERIA',
                    message: `${criterion.label} score is missing`
                });
            } else if (score < 1 || score > 5) {
                errors.push({
                    field: criterion.id,
                    type: 'INVALID_SCORE_RANGE',
                    message: `${criterion.label} score must be between 1 and 5`,
                    value: score
                });
            }
        });

        // Check for duplicate vote
        if (this.hasAlreadyVoted(voter.employee_id, candidate)) {
            errors.push({
                type: 'DUPLICATE_VOTE',
                message: 'Voter has already voted for this candidate'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate manager/director rating
     */
    static validateManagerialRating(rating, rater, candidate) {
        const errors = [];

        // Validate rating score
        if (rating.score === undefined || rating.score === null) {
            errors.push({
                type: 'MISSING_RATING',
                message: 'Rating score is required'
            });
        } else if (rating.score < 0 || rating.score > 50) {
            errors.push({
                type: 'INVALID_RATING_RANGE',
                message: 'Rating score must be between 0 and 50',
                value: rating.score
            });
        }

        // Check authorization
        if (!this.canRateCandidate(rater, candidate)) {
            errors.push({
                type: 'UNAUTHORIZED_RATING',
                message: 'Rater is not authorized to rate this candidate'
            });
        }

        // Check for exclusive rating rule
        if (candidate.is_managerial_position) {
            if (candidate.manager_rating_score > 0 && candidate.director_rating_score > 0) {
                errors.push({
                    type: 'EXCLUSIVE_RATING_VIOLATION',
                    message: 'Only one managerial rating allowed (manager OR director)'
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate chief approval
     */
    static validateChiefApproval(approval, chief, candidate) {
        const errors = [];

        // Validate approval status
        const validStatuses = ['approved', 'rejected'];
        if (!validStatuses.includes(approval.status)) {
            errors.push({
                type: 'INVALID_STATUS',
                message: `Approval status must be one of: ${validStatuses.join(', ')}`,
                value: approval.status
            });
        }

        // Check if chief is authorized
        if (!chief.roles.includes('chief')) {
            errors.push({
                type: 'UNAUTHORIZED_APPROVAL',
                message: 'Only chief-level users can approve candidates'
            });
        }

        // Check if candidate has required scores
        if (!candidate.performance_weighted_score && candidate.performance_weighted_score !== 0) {
            errors.push({
                type: 'MISSING_REQUIRED_SCORE',
                message: 'Candidate must have performance score before approval'
            });
        }

        // Validate rejection reason if rejected
        if (approval.status === 'rejected' && !approval.comments) {
            errors.push({
                type: 'MISSING_REJECTION_REASON',
                message: 'Rejection reason is required when rejecting a candidate'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Check if voter can vote for candidate
     */
    static canVoteForCandidate(voter, candidate) {
        // Same department rule
        if (voter.department !== candidate.candidate_department) {
            return false;
        }

        // Cannot vote for self
        if (voter.employee_id === candidate.candidate_employee_id) {
            return false;
        }

        // Check role-based permissions
        const voterLevel = this.getUserHierarchyLevel(voter.roles);
        const candidateLevel = this.getCandidateHierarchyLevel(candidate);

        // Professionals can only vote for other professionals (peer voting)
        if (voterLevel === 'PROFESSIONAL' && candidateLevel !== 'PROFESSIONAL') {
            return false;
        }

        return true;
    }

    /**
     * Check if rater can rate candidate
     */
    static canRateCandidate(rater, candidate) {
        // Check if rater is the assigned manager or director
        if (rater.employee_id === candidate.manager_id ||
            rater.employee_id === candidate.director_id) {
            return true;
        }

        // Check department match
        if (rater.department !== candidate.candidate_department) {
            return false;
        }

        // Check role hierarchy
        const raterRoles = rater.roles || [];
        if (raterRoles.includes('manager') && !candidate.is_managerial_position) {
            return true;
        }

        if (raterRoles.includes('director') && candidate.is_managerial_position) {
            return true;
        }

        return false;
    }

    /**
     * Check if voter has already voted
     */
    static hasAlreadyVoted(voterId, candidate) {
        return candidate.peer_votes?.some(vote =>
            vote.voter_employee_id === voterId
        ) || false;
    }

    /**
     * Get user hierarchy level
     */
    static getUserHierarchyLevel(roles) {
        if (!roles || roles.length === 0) return 'PROFESSIONAL';

        if (roles.includes('chief')) return 'CHIEF';
        if (roles.includes('director')) return 'DIRECTOR';
        if (roles.includes('manager')) return 'MANAGER';

        return 'PROFESSIONAL';
    }

    /**
     * Get candidate hierarchy level
     */
    static getCandidateHierarchyLevel(candidate) {
        if (candidate.is_managerial_position) {
            return 'MANAGER';
        }
        return 'PROFESSIONAL';
    }

    /**
     * Validate voting period data
     */
    static validateVotingPeriod(periodData) {
        const errors = [];

        // Required fields
        if (!periodData.period_name) {
            errors.push({
                field: 'period_name',
                type: 'MISSING_FIELD',
                message: 'Period name is required'
            });
        }

        // Date validation
        const startDate = new Date(periodData.start_date);
        const endDate = new Date(periodData.end_date);

        if (isNaN(startDate.getTime())) {
            errors.push({
                field: 'start_date',
                type: 'INVALID_DATE',
                message: 'Invalid start date'
            });
        }

        if (isNaN(endDate.getTime())) {
            errors.push({
                field: 'end_date',
                type: 'INVALID_DATE',
                message: 'Invalid end date'
            });
        }

        if (startDate >= endDate) {
            errors.push({
                type: 'INVALID_DATE_RANGE',
                message: 'End date must be after start date'
            });
        }

        // Validate quota
        if (periodData.quota_per_function !== undefined) {
            if (!Number.isInteger(periodData.quota_per_function) ||
                periodData.quota_per_function < 1) {
                errors.push({
                    field: 'quota_per_function',
                    type: 'INVALID_QUOTA',
                    message: 'Quota must be a positive integer'
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate Excel import data
     */
    static validateExcelImport(data) {
        const errors = [];
        const warnings = [];
        const validRows = [];

        data.forEach((row, index) => {
            const rowNumber = index + 2; // Excel row number (accounting for header)

            // Validate each row
            const validation = this.validateCandidateData(row);

            if (validation.isValid) {
                validRows.push(row);

                if (validation.warnings.length > 0) {
                    warnings.push({
                        row: rowNumber,
                        warnings: validation.warnings
                    });
                }
            } else {
                errors.push({
                    row: rowNumber,
                    errors: validation.errors
                });
            }
        });

        return {
            isValid: errors.length === 0,
            totalRows: data.length,
            validRows: validRows.length,
            errors,
            warnings,
            data: validRows
        };
    }

    /**
     * Validate calculation results
     */
    static validateCalculationResults(results) {
        const errors = [];

        // Check for NaN or Infinity
        Object.keys(results).forEach(key => {
            const value = results[key];
            if (typeof value === 'number') {
                if (isNaN(value)) {
                    errors.push({
                        field: key,
                        type: 'INVALID_CALCULATION',
                        message: `${key} resulted in NaN`
                    });
                }

                if (!isFinite(value)) {
                    errors.push({
                        field: key,
                        type: 'INVALID_CALCULATION',
                        message: `${key} resulted in Infinity`
                    });
                }

                // Check for negative values where not expected
                const nonNegativeFields = [
                    'performance_weighted_score',
                    'manager_rating_weighted_score',
                    'peer_voting_percentage',
                    'average_peer_rating',
                    'total_rating_result',
                    'total_weighted_result'
                ];

                if (nonNegativeFields.includes(key) && value < 0) {
                    errors.push({
                        field: key,
                        type: 'NEGATIVE_VALUE',
                        message: `${key} should not be negative`,
                        value
                    });
                }
            }
        });

        // Validate percentage fields
        if (results.peer_voting_percentage > 100) {
            errors.push({
                field: 'peer_voting_percentage',
                type: 'INVALID_PERCENTAGE',
                message: 'Peer voting percentage cannot exceed 100%',
                value: results.peer_voting_percentage
            });
        }

        // Validate total scores don't exceed maximum
        const maxTotalScore = 100;
        if (results.total_weighted_result > maxTotalScore) {
            errors.push({
                field: 'total_weighted_result',
                type: 'EXCEEDED_MAXIMUM',
                message: `Total weighted result cannot exceed ${maxTotalScore}`,
                value: results.total_weighted_result
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

/**
 * Error handler class for consistent error responses
 */
export class VotingErrorHandler {
    /**
     * Handle validation errors
     */
    static handleValidationError(validation, context = '') {
        if (validation.isValid) {
            return null;
        }

        const error = new Error(`Validation failed${context ? ` for ${context}` : ''}`);
        error.type = 'VALIDATION_ERROR';
        error.details = validation.errors;
        error.statusCode = 400;

        return error;
    }

    /**
     * Handle database errors
     */
    static handleDatabaseError(error, operation = '') {
        const dbError = new Error(`Database operation failed${operation ? `: ${operation}` : ''}`);
        dbError.type = 'DATABASE_ERROR';
        dbError.originalError = error.message;
        dbError.statusCode = 500;

        // Handle specific MongoDB errors
        if (error.code === 11000) {
            dbError.type = 'DUPLICATE_KEY_ERROR';
            dbError.statusCode = 409;
            dbError.message = 'Duplicate entry found';
        }

        return dbError;
    }

    /**
     * Handle authorization errors
     */
    static handleAuthorizationError(message = 'Unauthorized access') {
        const error = new Error(message);
        error.type = 'AUTHORIZATION_ERROR';
        error.statusCode = 403;

        return error;
    }

    /**
     * Handle not found errors
     */
    static handleNotFoundError(resource = 'Resource') {
        const error = new Error(`${resource} not found`);
        error.type = 'NOT_FOUND_ERROR';
        error.statusCode = 404;

        return error;
    }

    /**
     * Handle business logic errors
     */
    static handleBusinessLogicError(message, details = {}) {
        const error = new Error(message);
        error.type = 'BUSINESS_LOGIC_ERROR';
        error.details = details;
        error.statusCode = 422;

        return error;
    }

    /**
     * Format error response
     */
    static formatErrorResponse(error) {
        return {
            success: false,
            error: {
                type: error.type || 'UNKNOWN_ERROR',
                message: error.message,
                details: error.details || null,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Log error with context
     */
    static logError(error, context = {}) {
        console.error('Voting System Error:', {
            timestamp: new Date().toISOString(),
            type: error.type || 'UNKNOWN',
            message: error.message,
            stack: error.stack,
            context
        });
    }
}

// Export default validator instance
const validator = new VotingValidator();
export default validator;