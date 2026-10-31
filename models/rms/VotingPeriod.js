import mongoose from "mongoose";
import { fiscalYearPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

const votingPeriodSchema = new Schema({
    period_id: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    period_name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },

    // Voting Period Dates
    start_date: {
        type: Date,
        required: true,
    },
    end_date: {
        type: Date,
        required: true,
    },

    // Voting Configuration
    allow_peer_voting: {
        type: Boolean,
        default: true,
    },
    allow_manager_voting: {
        type: Boolean,
        default: true,
    },
    allow_director_voting: {
        type: Boolean,
        default: true,
    },
    require_chief_approval: {
        type: Boolean,
        default: true,
    },

    // Department/Function Configuration
    target_departments: [{
        type: String,
        trim: true,
    }],
    target_functions: [{
        type: String,
        trim: true,
    }],

    // Quota Configuration
    quota_per_function: {
        type: Number,
        default: 1,
    },

    // Status
    status: {
        type: String,
        enum: ["draft", "active", "peer_voting", "manager_review", "chief_approval", "completed", "cancelled"],
        default: "draft"
    },

    // Statistics
    total_candidates: {
        type: Number,
        default: 0,
    },
    total_peer_votes: {
        type: Number,
        default: 0,
    },
    total_manager_votes: {
        type: Number,
        default: 0,
    },
    total_director_votes: {
        type: Number,
        default: 0,
    },
    pending_chief_approvals: {
        type: Number,
        default: 0,
    },

    // Audit
    created_by: {
        type: String,
        required: true,
        trim: true,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_by: {
        type: String,
        trim: true,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    }
});

// Index for efficient queries
votingPeriodSchema.index({ status: 1 });
votingPeriodSchema.index({ start_date: 1, end_date: 1 });
votingPeriodSchema.index({ period_id: 1 });

// Pre-save middleware
votingPeriodSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

// Each fiscal year has one voting period; peer votes and director ratings are accepted only
// between its start and end (utils/votingPeriod.js)
votingPeriodSchema.plugin(fiscalYearPlugin);

const VotingPeriod = mongoose.model('VotingPeriod', votingPeriodSchema);
export default VotingPeriod;