import mongoose from "mongoose";
import { fiscalYearScopedPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

const chiefSchema = new Schema({
    first_name: {
        type: String,
        required: true,
        trim: true,
    },
    last_name: {
        type: String,
        required: true,
        trim: true,
    },

    employee_id: {
        type: String,
        required: true,
        trim: true,
    },

    user: {
        type: String,
        required: true,
        trim: true,
    },
    username: {
        type: String,
        trim: true,
    },

    position: {
        type: String,
        required: true,
        trim: true,
    },
    department: {
        type: String,
        required: false, // Will be assigned through hierarchy mapping
        trim: true,
    },

    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
        default: "$2b$10$FPGWuVHDUTNQ7gyiDa5mzubgI4CFvrud0P7pA1ku2lGh9Br3MXYQa"
    },

    roles: {
        type: [String],
        enum: ["user","admin","chief"],
        default: ["user", "chief"],
    },
    level: {
        type: String,
        default: "chief"
    },
    job_grade: {
        type: String,
        trim: true,
    },
    function: {
        type: String,
        trim: true,
    },
    // Chiefs supervise directors
    subordinates: [{
        type: String,
        ref: 'Director' // References to directors
    }],
    performance_appraisal_score: {
        type: Number,
        default: 0
    },
    is_managerial: {
        type: Boolean,
        default: true
    },
    status: {
        type: Boolean,
        default: true
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Virtual for full name
chiefSchema.virtual('name').get(function() {
    return `${this.first_name} ${this.last_name}`;
});

// Virtual for is_active (using status field)
chiefSchema.virtual('is_active').get(function() {
    return this.status;
});

// Ensure virtuals are included when converting to JSON
chiefSchema.set('toJSON', { virtuals: true });
chiefSchema.set('toObject', { virtuals: true });

// Index for efficient querying
chiefSchema.index({ employee_id: 1 });
chiefSchema.index({ department: 1 });
chiefSchema.index({ status: 1 });

// Each fiscal year keeps its own copy (imported fresh or copied from the year before);
// queries see the current year's unless they name a fiscal_year (utils/fiscalYear.js)
chiefSchema.plugin(fiscalYearScopedPlugin);
chiefSchema.index({ employee_id: 1, fiscal_year: 1 }, { unique: true });
chiefSchema.index({ user: 1, fiscal_year: 1 }, { unique: true });
chiefSchema.index({ email: 1, fiscal_year: 1 }, { unique: true });

const Chief = mongoose.models.Chief || mongoose.model('Chief', chiefSchema);
export default Chief;