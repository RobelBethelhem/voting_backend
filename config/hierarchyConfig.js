// Hierarchical configuration for banking organization structure

export const HierarchyConfig = {
    // Organization levels with their properties
    levels: {
        CHIEF: {
            level: 4,
            title: 'Chief',
            permissions: {
                canApprove: true,
                canVote: false,
                canBeVoted: false,
                canViewAll: true,
                canExport: true,
                canModifyResults: true
            },
            votingRules: {
                approvalRequired: false,
                requiresApprovalFrom: null,
                canApproveFor: ['DIRECTOR', 'MANAGER', 'PROFESSIONAL']
            }
        },
        DIRECTOR: {
            level: 3,
            title: 'Director',
            permissions: {
                canApprove: false,
                canVote: true,
                canBeVoted: true,
                canViewDepartment: true,
                canExport: true,
                canModifyResults: false
            },
            votingRules: {
                approvalRequired: true,
                requiresApprovalFrom: 'CHIEF',
                canVoteFor: ['MANAGER'],
                votingWeight: 50 // 50% weight when voting for managers
            }
        },
        MANAGER: {
            level: 2,
            title: 'Manager',
            permissions: {
                canApprove: false,
                canVote: true,
                canBeVoted: true,
                canViewTeam: true,
                canExport: false,
                canModifyResults: false
            },
            votingRules: {
                approvalRequired: true,
                requiresApprovalFrom: 'CHIEF',
                canVoteFor: ['PROFESSIONAL'],
                votingWeight: 30, // 30% weight when voting for professionals
                isManagerial: true
            }
        },
        PROFESSIONAL: {
            level: 1,
            title: 'Professional',
            permissions: {
                canApprove: false,
                canVote: true,
                canBeVoted: true,
                canViewSelf: true,
                canExport: false,
                canModifyResults: false
            },
            votingRules: {
                approvalRequired: true,
                requiresApprovalFrom: 'CHIEF',
                canVoteFor: ['PROFESSIONAL'], // Peer voting
                votingWeight: 20, // 20% weight for peer voting
                isManagerial: false
            }
        }
    },

    // Voting weight configurations
    weights: {
        nonManagerial: {
            performance: 50,      // Performance appraisal
            managerRating: 30,    // Manager's rating
            peerRating: 20        // Peer voting
        },
        managerial: {
            performance: 50,      // Performance appraisal
            supervisorRating: 50  // Manager OR Director rating (exclusive)
        }
    },

    // Scoring scales
    scales: {
        performanceAppraisal: {
            min: 0,
            max: 100,
            excelColumn: 'G'
        },
        managerRating: {
            min: 0,
            max: 50,
            excelColumn: 'I'
        },
        peerVoteCriteria: {
            min: 1,
            max: 5,
            criteriaCount: 8,
            maxTotal: 40
        }
    },

    // Peer voting criteria configuration
    peerVotingCriteria: [
        {
            id: 'dedication',
            label: 'Dedication',
            description: 'Commitment to work and organization',
            weight: 1
        },
        {
            id: 'quality_of_work',
            label: 'Quality of Work',
            description: 'Excellence in deliverables and output',
            weight: 1
        },
        {
            id: 'collaboration_team_work',
            label: 'Collaboration & Team Work',
            description: 'Ability to work effectively with others',
            weight: 1
        },
        {
            id: 'independence',
            label: 'Independence',
            description: 'Self-directed work capability',
            weight: 1
        },
        {
            id: 'customer_service',
            label: 'Customer Service',
            description: 'Service quality and customer satisfaction',
            weight: 1
        },
        {
            id: 'time_management',
            label: 'Time Management',
            description: 'Efficiency and punctuality',
            weight: 1
        },
        {
            id: 'office_attire_dress_code',
            label: 'Office Attire & Dress Code',
            description: 'Professional appearance',
            weight: 1
        },
        {
            id: 'flexibility',
            label: 'Flexibility',
            description: 'Adaptability to change and challenges',
            weight: 1
        }
    ],

    // Workflow states
    workflowStates: {
        INITIALIZED: 'initialized',
        PEER_VOTING: 'peer_voting',
        MANAGER_RATING: 'manager_rating',
        DIRECTOR_RATING: 'director_rating',
        PENDING_APPROVAL: 'pending_approval',
        APPROVED: 'approved',
        REJECTED: 'rejected',
        FINALIZED: 'finalized'
    },

    // Approval workflow configuration
    approvalWorkflow: {
        stages: [
            {
                stage: 1,
                name: 'Peer Voting',
                participants: ['PROFESSIONAL'],
                duration: 7, // days
                reminders: [3, 1] // days before deadline
            },
            {
                stage: 2,
                name: 'Manager Rating',
                participants: ['MANAGER'],
                duration: 3, // days
                reminders: [2, 1]
            },
            {
                stage: 3,
                name: 'Director Rating',
                participants: ['DIRECTOR'],
                duration: 2, // days
                reminders: [1]
            },
            {
                stage: 4,
                name: 'Chief Approval',
                participants: ['CHIEF'],
                duration: 2, // days
                reminders: [1]
            }
        ]
    },

    // Validation rules
    validationRules: {
        minimumPeerVotingPercentage: 50, // Minimum 50% participation
        requiredFieldsForApproval: [
            'performance_appraisal_score',
            'candidate_department',
            'candidate_position'
        ],
        duplicateVotePrevention: true,
        crossDepartmentVoting: false // Prevent voting across departments
    },

    // Excel column mappings
    excelColumns: {
        // Employee Information
        A: 'employee_id',
        B: 'first_name',
        C: 'last_name',
        D: 'department',
        E: 'position',
        F: 'job_grade',

        // Scores and Calculations
        G: 'performance_appraisal_score',
        H: 'performance_weighted_score',
        I: 'manager_rating_score',
        J: 'manager_rating_weighted_score',
        K: 'total_eligible_peer_voters',
        L: 'peers_who_voted',
        M: 'voted_by_count',
        N: 'peer_voting_percentage',
        O: 'average_peer_rating',
        P: 'peer_rating_weighted_score',
        Q: 'total_rating_result',
        R: 'weighted_rating',
        S: 'total_weighted_result',

        // Approval
        T: 'approval_status',
        U: 'chief_comments',
        V: 'approval_date'
    },

    // Department configuration
    departments: {
        enableDepartmentWinners: true,
        maxWinnersPerDepartment: 1,
        requiredMinimumEmployees: 3
    },

    // Function/Role configuration
    functions: {
        enableFunctionWinners: true,
        maxWinnersPerFunction: 1
    },

    // Notification settings
    notifications: {
        emailEnabled: true,
        smsEnabled: false,
        inAppEnabled: true,
        reminderFrequency: 24, // hours
        escalationEnabled: true,
        escalationAfter: 48 // hours
    },

    // Security settings
    security: {
        encryptVotes: true,
        auditTrailEnabled: true,
        requireTwoFactorForApproval: true,
        sessionTimeout: 30, // minutes
        maxLoginAttempts: 5
    },

    // Performance optimization settings
    performance: {
        batchSize: 100,
        cacheEnabled: true,
        cacheTTL: 60000, // milliseconds
        maxConcurrentCalculations: 10,
        enableLazyLoading: true
    },

    // Helper methods
    helpers: {
        /**
         * Get hierarchy level for a role
         */
        getHierarchyLevel(role) {
            return this.levels[role]?.level || 0;
        },

        /**
         * Check if user can vote for another user
         */
        canVoteFor(voterRole, candidateRole) {
            const voterConfig = this.levels[voterRole];
            if (!voterConfig) return false;

            return voterConfig.votingRules.canVoteFor?.includes(candidateRole) || false;
        },

        /**
         * Get voting weight for a specific configuration
         */
        getVotingWeight(voterRole, isManagerialCandidate) {
            if (isManagerialCandidate) {
                return this.weights.managerial;
            }
            return this.weights.nonManagerial;
        },

        /**
         * Validate score ranges
         */
        validateScore(scoreType, value) {
            const scale = this.scales[scoreType];
            if (!scale) return false;

            return value >= scale.min && value <= scale.max;
        },

        /**
         * Get Excel formula for calculation
         */
        getExcelFormula(calculationType, row = 2) {
            const formulas = {
                performanceWeighted: `=G${row}/100*50`,
                managerWeightedNonManagerial: `=I${row}/50*30`,
                peerVotingPercentage: `=M${row}/K${row}*100`,
                peerWeightedScore: `=(O${row}*20)/50`,
                weightedRating: `=(P${row}*N${row})/100`,
                totalWeightedNonManagerial: `=R${row}+J${row}+H${row}`,
                totalWeightedManagerial: `=H${row}+I${row}`
            };

            return formulas[calculationType] || '';
        }
    }
};

// Export configuration as default
export default HierarchyConfig;