import mongoose from "mongoose";
const Schema = mongoose.Schema;

const hierarchicalVoteSchema = new Schema({
    // Voting Session Info
    voting_period_id: {
        type: String,
        required: true,
        trim: true,
    },
    voting_session_name: {
        type: String,
        required: true,
        trim: true,
    },

    // Candidate Information
    candidate_employee_id: {
        type: String,
        required: true,
        trim: true,
    },
    candidate_first_name: {
        type: String,
        required: true,
        trim: true,
    },
    candidate_last_name: {
        type: String,
        required: true,
        trim: true,
    },
    candidate_position: {
        type: String,
        required: true,
        trim: true,
    },
    candidate_department: {
        type: String,
        required: true,
        trim: true,
    },
    candidate_function: {
        type: String,
        required: true,
        trim: true,
    },
    candidate_job_grade: {
        type: String,
        required: true,
        trim: true,
    },
    is_managerial_position: {
        type: Boolean,
        required: true,
        default: false
    },

    // Performance Appraisal (50% weight)
    performance_appraisal_score: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    performance_weighted_score: {
        type: Number,
        required: true,
    },

    // Manager Rating (30% for non-managerial, 50% for managerial)
    manager_rating_score: {
        type: Number,
        min: 0,
        max: 50
    },
    manager_rating_weighted_score: {
        type: Number,
    },
    manager_id: {
        type: String,
        trim: true,
    },
    manager_name: {
        type: String,
        trim: true,
    },

    // Director Rating (combined with manager for collective vote)
    director_rating_score: {
        type: Number,
        min: 0,
        max: 50
    },
    director_id: {
        type: String,
        trim: true,
    },
    director_name: {
        type: String,
        trim: true,
    },

    // Combined Manager + Director Rating
    combined_managerial_rating: {
        type: Number,
    },
    combined_managerial_weighted_score: {
        type: Number,
    },

    // Peer Voting (20% for non-managerial)
    peer_votes: [{
        voter_employee_id: {
            type: String,
            required: true,
            trim: true,
        },
        voter_name: {
            type: String,
            required: true,
            trim: true,
        },
        voter_department: {
            type: String,
            required: true,
            trim: true,
        },
        // Individual criterion scores (1-5)
        dedication: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        quality_of_work: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        collaboration_team_work: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        independence: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        customer_service: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        time_management: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        office_attire_dress_code: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        flexibility: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        total_score: {
            type: Number,
            required: true,
        },
        vote_timestamp: {
            type: Date,
            default: Date.now
        }
    }],

    // Peer Voting Statistics
    total_eligible_peer_voters: {
        type: Number,
        default: 0
    },
    total_peer_votes_received: {
        type: Number,
        default: 0
    },
    peer_voting_percentage: {
        type: Number,
        default: 0
    },
    average_peer_rating: {
        type: Number,
        default: 0
    },
    peer_rating_weighted_score: {
        type: Number,
        default: 0
    },

    // Final Calculations
    total_rating_result: {
        type: Number,
        default: 0
    },
    weighted_rating: {
        type: Number,
        default: 0
    },
    total_weighted_result: {
        type: Number,
        default: 0
    },

    // Chief Approval
    chief_approval_status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },
    chief_id: {
        type: String,
        trim: true,
    },
    chief_name: {
        type: String,
        trim: true,
    },
    chief_approval_date: {
        type: Date,
    },
    chief_comments: {
        type: String,
        trim: true,
    },

    // Audit Trail
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    created_by: {
        type: String,
        required: true,
        trim: true,
    },
    last_updated_by: {
        type: String,
        trim: true,
    }
});

// Index for efficient queries
hierarchicalVoteSchema.index({ voting_period_id: 1, candidate_employee_id: 1 });
hierarchicalVoteSchema.index({ candidate_department: 1, voting_period_id: 1 });
hierarchicalVoteSchema.index({ chief_approval_status: 1 });

// Pre-save middleware to update the updated_at field
hierarchicalVoteSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

const HierarchicalVote = mongoose.model('HierarchicalVote', hierarchicalVoteSchema);
export default HierarchicalVote;