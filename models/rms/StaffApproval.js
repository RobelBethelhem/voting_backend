import mongoose from "mongoose";
import { fiscalYearPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

// Staff Approval Model
const staffApprovalSchema = new Schema({
    // Employee being approved/rejected
    employee_id: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    employee_name: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    position: {
        type: String,
        trim: true
    },

    // Chief who made the approval decision
    chief_id: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    chief_name: {
        type: String,
        required: true,
        trim: true
    },

    // Approval decision
    approval_status: {
        type: String,
        enum: ["approved", "rejected", "pending"],
        required: true,
        default: "pending",
        index: true
    },

    // Performance metrics
    final_score: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    ranking_position: {
        type: Number,
        min: 1
    },
    performance_appraisal_score: {
        type: Number,
        min: 0,
        max: 100
    },

    // Detailed scoring breakdown
    score_breakdown: {
        performance_out_of_50: { type: Number, default: 0 },
        managerial_rating_out_of_30: { type: Number, default: 0 },
        director_rating_out_of_50: { type: Number, default: 0 },
        peer_rating_out_of_20: { type: Number, default: 0 },
        weighted_rating: { type: Number, default: 0 },
        total_weighted_result: { type: Number, default: 0 },
        score_type: {
            type: String,
            enum: ["managerial", "total_weighted_result", "total_rating_result"],
            default: "total_rating_result"
        }
    },

    // Quota information
    quota_allocation_id: {
        type: Schema.Types.ObjectId,
        ref: 'QuotaAllocation'
    },
    selection_phase: {
        type: String,
        enum: ["phase1_department", "phase2_cross_department", "phase3_quota_selection"],
        default: "phase3_quota_selection"
    },

    // Comments and reasons
    approval_comments: {
        type: String,
        trim: true
    },
    rejection_reason: {
        type: String,
        trim: true,
        required: function() {
            return this.approval_status === 'rejected';
        }
    },

    // Timestamps
    submitted_at: {
        type: Date,
        default: Date.now
    },
    reviewed_at: {
        type: Date
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },

    // Metadata
    selection_criteria: {
        type: String,
        default: "3-phase quota-based selection"
    },
    is_active: {
        type: Boolean,
        default: true
    }
});

staffApprovalSchema.plugin(fiscalYearPlugin);

// Compound indexes for efficient queries
staffApprovalSchema.index({ chief_id: 1, approval_status: 1 });
staffApprovalSchema.index({ department: 1, approval_status: 1 });
staffApprovalSchema.index({ employee_id: 1, chief_id: 1, fiscal_year: 1 }, { unique: true });
staffApprovalSchema.index({ final_score: -1, ranking_position: 1 });

// Text search index
staffApprovalSchema.index({
    employee_name: 'text',
    department: 'text',
    position: 'text',
    approval_comments: 'text',
    rejection_reason: 'text'
});

// Pre-save middleware
staffApprovalSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updated_at = new Date();
    }

    // Set reviewed_at when status changes from pending
    if (this.isModified('approval_status') && this.approval_status !== 'pending') {
        this.reviewed_at = new Date();
    }

    next();
});

// Virtual for approval duration
staffApprovalSchema.virtual('approval_duration_hours').get(function() {
    if (this.reviewed_at && this.submitted_at) {
        return Math.round((this.reviewed_at - this.submitted_at) / (1000 * 60 * 60));
    }
    return null;
});

// Instance methods
staffApprovalSchema.methods.approve = function(comments) {
    this.approval_status = 'approved';
    this.approval_comments = comments;
    this.reviewed_at = new Date();
    return this.save();
};

staffApprovalSchema.methods.reject = function(reason, comments) {
    this.approval_status = 'rejected';
    this.rejection_reason = reason;
    this.approval_comments = comments;
    this.reviewed_at = new Date();
    return this.save();
};

// Static methods. fiscalYearFilter: { fiscal_year } from utils/fiscalYear.js
staffApprovalSchema.statics.findByChief = function(chiefId, status = null, fiscalYearFilter = {}) {
    const query = { chief_id: chiefId, is_active: true, ...fiscalYearFilter };
    if (status) {
        query.approval_status = status;
    }
    return this.find(query).sort({ final_score: -1, ranking_position: 1 });
};

staffApprovalSchema.statics.findApprovedByChief = function(chiefId, fiscalYearFilter = {}) {
    return this.find({
        chief_id: chiefId,
        approval_status: 'approved',
        is_active: true,
        ...fiscalYearFilter
    }).sort({ final_score: -1 });
};

staffApprovalSchema.statics.findByDepartment = function(department, status = null, fiscalYearFilter = {}) {
    const query = { department: department, is_active: true, ...fiscalYearFilter };
    if (status) {
        query.approval_status = status;
    }
    return this.find(query).sort({ final_score: -1 });
};

staffApprovalSchema.statics.getApprovalSummary = function(chiefId = null, fiscalYearFilter = {}) {
    const matchStage = { is_active: true, ...fiscalYearFilter };
    if (chiefId) {
        matchStage.chief_id = chiefId;
    }

    return this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$approval_status',
                count: { $sum: 1 },
                avg_final_score: { $avg: '$final_score' },
                total_final_score: { $sum: '$final_score' }
            }
        }
    ]);
};

staffApprovalSchema.statics.getTopPerformers = function(chiefId, limit = 10, fiscalYearFilter = {}) {
    return this.find({
        chief_id: chiefId,
        approval_status: 'approved',
        is_active: true,
        ...fiscalYearFilter
    })
    .sort({ final_score: -1, ranking_position: 1 })
    .limit(limit);
};

// Ensure virtuals are included when converting to JSON
staffApprovalSchema.set('toJSON', { virtuals: true });
staffApprovalSchema.set('toObject', { virtuals: true });

const StaffApproval = mongoose.model('StaffApproval', staffApprovalSchema);
export default StaffApproval;