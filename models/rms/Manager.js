import mongoose from "mongoose";
import { fiscalYearScopedPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

const managerSchema = new Schema({
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
        enum: ["user","admin","manager"],
        default: ["user", "manager"],
    },
    level: {
        type: String,
        default: "manager"
    },
    job_grade: {
        type: String,
        trim: true,
    },
    function: {
        type: String,
        trim: true,
    },
    director_id: {
        type: String,
        ref: 'Director',
        trim: true,
    },
    chief_id: {
        type: String,
        ref: 'Chief',
        trim: true,
    },
    // Managers supervise professionals
    subordinates: [{
        type: String,
        ref: 'User' // References to professional employees
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

// Index for efficient querying
managerSchema.index({ employee_id: 1 });
managerSchema.index({ department: 1 });
managerSchema.index({ director_id: 1 });
managerSchema.index({ chief_id: 1 });

// Each fiscal year keeps its own copy (imported fresh or copied from the year before);
// queries see the current year's unless they name a fiscal_year (utils/fiscalYear.js)
managerSchema.plugin(fiscalYearScopedPlugin);
managerSchema.index({ employee_id: 1, fiscal_year: 1 }, { unique: true });
managerSchema.index({ user: 1, fiscal_year: 1 }, { unique: true });
managerSchema.index({ email: 1, fiscal_year: 1 }, { unique: true });

const Manager = mongoose.models.Manager || mongoose.model('Manager', managerSchema);
export default Manager;