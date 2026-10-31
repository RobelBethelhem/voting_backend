import mongoose from "mongoose";
import { fiscalYearScopedPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

const departmentSchema = new Schema({
    department_code: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    department_name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    manager_id: {
        type: String,
        ref: 'User',
        required: false  // Will be set through hierarchy mapping
    },
    director_id: {
        type: String,
        ref: 'User',
        required: false  // Will be set through hierarchy mapping
    },
    chief_id: {
        type: String,
        ref: 'User',
        required: false  // Will be set through hierarchy mapping
    },
    is_active: {
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
departmentSchema.index({ department_code: 1 });
departmentSchema.index({ manager_id: 1 });
departmentSchema.index({ director_id: 1 });
departmentSchema.index({ chief_id: 1 });

// Each fiscal year keeps its own copy (imported fresh or copied from the year before);
// queries see the current year's unless they name a fiscal_year (utils/fiscalYear.js)
departmentSchema.plugin(fiscalYearScopedPlugin);
departmentSchema.index({ department_code: 1, fiscal_year: 1 }, { unique: true });

const Department = mongoose.model("Department", departmentSchema);
export default Department;