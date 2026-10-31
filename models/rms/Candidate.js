import mongoose from "mongoose";
import { fiscalYearScopedPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

// Candidate model - exact copy of Employee (User) model structure
const candidateSchema =  new Schema({
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
        required: true,
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
        enum: ["user","admin","manager","director","chief"],
        default: ["user"],
    },
    job_grade: {
        type: String,
        trim: true,
    },
    function: {
        type: String,
        trim: true,
    },
    manager_id: {
        type: String,
        trim: true,
    },
    director_id: {
        type: String,
        trim: true,
    },
    chief_id: {
        type: String,
        trim: true,
    },
    performance_appraisal_score: {
        type: Number,
        default: 0
    },
    is_managerial: {
        type: Boolean,
        default: false
    },
    status:{
        type: Boolean,
        default: true
    },

    // Candidate-specific fields
    qualified_at: {
        type: Date,
        default: Date.now
    },
    qualification_criteria: {
        min_performance_score: {
            type: Number,
            default: 0
        }
    }
});

// Indexes for optimized querying
candidateSchema.index({ department: 1, status: 1 }); // Compound index for department filtering
candidateSchema.index({ employee_id: 1 }); // Unique identifier index
candidateSchema.index({ performance_appraisal_score: -1 }); // Score sorting index
candidateSchema.index({ status: 1 }); // Status filtering index

// Each fiscal year keeps its own copy (imported fresh or copied from the year before);
// queries see the current year's unless they name a fiscal_year (utils/fiscalYear.js)
candidateSchema.plugin(fiscalYearScopedPlugin);
candidateSchema.index({ employee_id: 1, fiscal_year: 1 }, { unique: true });
candidateSchema.index({ user: 1, fiscal_year: 1 }, { unique: true });
candidateSchema.index({ email: 1, fiscal_year: 1 }, { unique: true });

const Candidate = mongoose.model('Candidate', candidateSchema);
export default Candidate;

    