import mongoose from "mongoose";
import { fiscalYearPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

// Quota Allocation Model
const quotaAllocationSchema = new Schema({
    chief_id: {
        type: Schema.Types.ObjectId,
        ref: 'Chief',
        required: true,
        index: true
    },
    quota_limit: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: Number.isInteger,
            message: 'Quota limit must be an integer'
        }
    },
    current_allocation: {
        type: Number,
        default: 0,
        min: 0,
        validate: {
            validator: Number.isInteger,
            message: 'Current allocation must be an integer'
        }
    },
    description: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ["active", "inactive", "full"],
        default: "active"
    },
    is_active: {
        type: Boolean,
        default: true
    },
    created_by: {
        type: String,
        default: "Admin"
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_by: {
        type: String
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

quotaAllocationSchema.plugin(fiscalYearPlugin);

// Indexes for efficient queries
quotaAllocationSchema.index({ chief_id: 1, fiscal_year: 1 }, { unique: true });
quotaAllocationSchema.index({ status: 1, is_active: 1 });

// Text search index for searching
quotaAllocationSchema.index({
    description: 'text'
});

// Pre-save middleware to update timestamp and status
quotaAllocationSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updated_at = new Date();
    }

    // Auto-update status based on allocation
    if (this.current_allocation >= this.quota_limit) {
        this.status = 'full';
    } else if (this.current_allocation > 0) {
        this.status = 'active';
    }

    next();
});

// Virtual for available slots
quotaAllocationSchema.virtual('available_slots').get(function() {
    return Math.max(0, this.quota_limit - this.current_allocation);
});

// Virtual for utilization percentage
quotaAllocationSchema.virtual('utilization_percentage').get(function() {
    return this.quota_limit > 0 ? Math.round((this.current_allocation / this.quota_limit) * 100) : 0;
});

// Instance methods
quotaAllocationSchema.methods.canAllocate = function(count = 1) {
    return this.current_allocation + count <= this.quota_limit;
};

quotaAllocationSchema.methods.allocateStaff = function(count = 1) {
    if (!this.canAllocate(count)) {
        throw new Error('Quota limit exceeded');
    }
    this.current_allocation += count;
    return this.save();
};

quotaAllocationSchema.methods.deallocateStaff = function(count = 1) {
    this.current_allocation = Math.max(0, this.current_allocation - count);
    return this.save();
};

// Static methods
// fiscalYearFilter: { fiscal_year } from utils/fiscalYear.js
quotaAllocationSchema.statics.findByChief = function(chiefId, fiscalYearFilter = {}) {
    return this.find({ chief_id: chiefId, is_active: true, ...fiscalYearFilter });
};

// Removed findByDepartment method since department field no longer exists

quotaAllocationSchema.statics.getUtilizationSummary = function(fiscalYearFilter = {}) {
    return this.aggregate([
        { $match: { is_active: true, ...fiscalYearFilter } },
        {
            $group: {
                _id: null,
                total_quotas: { $sum: 1 },
                total_limit: { $sum: '$quota_limit' },
                current_staff: { $sum: '$current_allocation' },
                avg_utilization: { $avg: { $multiply: [{ $divide: ['$current_allocation', '$quota_limit'] }, 100] } }
            }
        }
    ]);
};

// Ensure virtuals are included when converting to JSON
quotaAllocationSchema.set('toJSON', { virtuals: true });
quotaAllocationSchema.set('toObject', { virtuals: true });

const QuotaAllocation = mongoose.model('QuotaAllocation', quotaAllocationSchema);
export default QuotaAllocation;