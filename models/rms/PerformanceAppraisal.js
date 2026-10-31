import mongoose from "mongoose";
const Schema = mongoose.Schema;

const performanceAppraisalSchema = new Schema({
    employee_id: {
        type: String,
        required: true,
        trim: true,
    },
    appraisal_period: {
        type: String,
        required: true,
        trim: true,
    },
    performance_score: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
    },
    goals_achieved: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
    },
    competency_score: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
    },
    overall_rating: {
        type: String,
        enum: ["Excellent", "Good", "Satisfactory", "Needs Improvement"],
        required: true,
    },

    // Calculated weighted performance (auto-calculated)
    performance_weighted: {
        type: Number,
        default: 0,
    },

    // Audit trail
    created_by: {
        type: String,
        required: true,
        trim: true,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    }
});

// Compound index for unique performance records per period
performanceAppraisalSchema.index({
    employee_id: 1,
    appraisal_period: 1
}, { unique: true });

// Calculate weighted performance before saving
performanceAppraisalSchema.pre('save', function(next) {
    this.performance_weighted = (this.performance_score / 100) * 50;
    this.updated_at = new Date();
    next();
});

const PerformanceAppraisal = mongoose.model('PerformanceAppraisal', performanceAppraisalSchema);
export default PerformanceAppraisal;