import mongoose from "mongoose";
import { fiscalYearPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

const managerialRatingSchema = new Schema({
    // Rater information (Director)
    rater_first_name: {
        type: String,
        required: true,
        trim: true,
    },
    rater_last_name: {
        type: String,
        required: true,
        trim: true,
    },
    rater_emp_id: {
        type: String,
        required: true,
        trim: true,
    },
    rater_position: {
        type: String,
        required: true,
        trim: true,
    },
    rater_department: {
        type: String,
        required: true,
        trim: true,
    },
    rater_role: {
        type: String,
        required: true,
        enum: ['director', 'chief', 'manager'],
        default: 'director'
    },

    // Ratee information (Manager or Staff)
    ratee_first_name: {
        type: String,
        required: true,
        trim: true,
    },
    ratee_last_name: {
        type: String,
        required: true,
        trim: true,
    },
    ratee_emp_id: {
        type: String,
        required: true,
        trim: true,
    },
    ratee_position: {
        type: String,
        required: true,
        trim: true,
    },
    ratee_department: {
        type: String,
        required: true,
        trim: true,
    },
    ratee_role: {
        type: String,
        required: true,
        enum: ['manager', 'user', 'professional'],
        default: 'user'
    },

    // Rating category
    rating_category: {
        type: String,
        required: true,
        enum: ['managerial_staff', 'non_managerial_staff'],
    },

    // Evaluation period
    evaluation_period: {
        type: String,
        default: () => {
            const now = new Date();
            return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
        }
    },

    // Dynamic criteria storage
    criteria_ratings: [{
        criteria_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'EvaluationCriteria',
            required: true
        },
        criteria_name: {
            type: String,
            required: true
        },
        weight: {
            type: Number,
            required: true
        },
        rating: {
            type: Number,
            required: true
        },
        rating_description: {
            type: String
        }
    }],

    // Score calculations
    total_weighted_score: {
        type: Number,
        required: true
    },
    max_possible_score: {
        type: Number,
        required: true
    },
    percentage_score: {
        type: Number,
        required: true
    },

    // Status and metadata
    status: {
        type: String,
        enum: ['draft', 'submitted', 'reviewed', 'approved'],
        default: 'submitted'
    },
    comments: {
        type: String,
        trim: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

managerialRatingSchema.plugin(fiscalYearPlugin);

// Compound index to prevent duplicate ratings: one per rater, ratee and category each fiscal year
managerialRatingSchema.index({
    rater_emp_id: 1,
    ratee_emp_id: 1,
    rating_category: 1,
    fiscal_year: 1
}, { unique: true });

// Indexes for efficient querying
managerialRatingSchema.index({ rater_emp_id: 1 });
managerialRatingSchema.index({ ratee_emp_id: 1 });
managerialRatingSchema.index({ rating_category: 1 });
managerialRatingSchema.index({ timestamp: -1 });

// Pre-save middleware to update timestamp
managerialRatingSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updated_at = new Date();
    }
    next();
});

// Virtual for ratee full name
managerialRatingSchema.virtual('ratee_full_name').get(function() {
    return `${this.ratee_first_name} ${this.ratee_last_name}`;
});

// Virtual for rater full name
managerialRatingSchema.virtual('rater_full_name').get(function() {
    return `${this.rater_first_name} ${this.rater_last_name}`;
});

// Ensure virtuals are included when converting to JSON
managerialRatingSchema.set('toJSON', { virtuals: true });
managerialRatingSchema.set('toObject', { virtuals: true });

const ManagerialRating = mongoose.models.ManagerialRating || mongoose.model('ManagerialRating', managerialRatingSchema);
export default ManagerialRating;