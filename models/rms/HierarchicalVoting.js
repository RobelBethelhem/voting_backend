import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Hierarchical Vote Schema for the new voting system
const hierarchicalVoteSchema = new Schema({
    voting_period_id: {
        type: String,
        required: true,
        trim: true,
    },
    candidate_id: {
        type: String,
        required: true,
        trim: true,
    },
    voter_id: {
        type: String,
        required: true,
        trim: true,
    },
    vote_type: {
        type: String,
        enum: ["peer_rating", "manager_rating", "director_rating"],
        required: true,
    },
    score: {
        type: Number,
        required: true,
        min: 0,
        max: 50,
    },
    comments: {
        type: String,
        trim: true,
    },

    // Calculated weights (auto-calculated)
    weighted_score: {
        type: Number,
        default: 0,
    },

    // Audit trail
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    }
});

// Compound index to prevent duplicate votes
hierarchicalVoteSchema.index({
    voting_period_id: 1,
    candidate_id: 1,
    voter_id: 1,
    vote_type: 1
}, { unique: true });

// Index for efficient queries
hierarchicalVoteSchema.index({ voting_period_id: 1, vote_type: 1 });
hierarchicalVoteSchema.index({ candidate_id: 1 });
hierarchicalVoteSchema.index({ voter_id: 1 });

const HierarchicalVoting = mongoose.model('HierarchicalVoting', hierarchicalVoteSchema);
export default HierarchicalVoting;