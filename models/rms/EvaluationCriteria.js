import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Evaluation Criteria Model
const evaluationCriteriaSchema = new Schema({
    criteria_name: {
        type: String,
        required: true,
        trim: true
    },
    weight: {
        type: Number,
        required: true,
        min: 1,
        max: 50
    },
    category: {
        type: String,
        required: true,
        enum: ["managerial_staff", "non_managerial_staff", "peer"],
        index: true
    },
    description: {
        type: String,
        trim: true
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

// Index for efficient queries
evaluationCriteriaSchema.index({ category: 1, is_active: 1 });
evaluationCriteriaSchema.index({ criteria_name: 'text' }); // Text search

// Pre-save middleware to update timestamp
evaluationCriteriaSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updated_at = new Date();
    }
    next();
});

const EvaluationCriteria = mongoose.model('EvaluationCriteria', evaluationCriteriaSchema);
export default EvaluationCriteria;