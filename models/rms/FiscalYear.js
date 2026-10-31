import mongoose from "mongoose";
const Schema = mongoose.Schema;

// One cycle of the best-staff selection (peer votes, director ratings, chief approvals,
// quotas). Exactly one fiscal year is current; votes, ratings, approvals, quotas and
// re-rating requests are stamped with it when created. A closed year is read-only and its
// reports are served from snapshots taken when it closed.
const fiscalYearSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    start_date: {
        type: Date,
        required: true
    },
    end_date: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ["open", "closed"],
        default: "open"
    },
    is_current: {
        type: Boolean,
        default: false,
        index: true
    },
    notes: {
        type: String,
        trim: true
    },
    closed_at: {
        type: Date
    },
    closed_by: {
        type: String,
        trim: true
    },
    created_by: {
        type: String,
        trim: true
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

fiscalYearSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updated_at = new Date();
    }
    next();
});

const FiscalYear = mongoose.models.FiscalYear || mongoose.model('FiscalYear', fiscalYearSchema);
export default FiscalYear;
