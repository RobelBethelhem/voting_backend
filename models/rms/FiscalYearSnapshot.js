import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Reports of a fiscal year frozen when it closed. They depend on data that changes from
// year to year (appraisal scores, hierarchy, who is a candidate), so a closed year is
// reported from here rather than recomputed.
//   selection_details: { chiefs: [...] } as GET /api/staff-approval/selection-details returns
//   participation:     the GET /api/rms/admin/landing/participation-dashboard payload
const fiscalYearSnapshotSchema = new Schema({
    fiscal_year: {
        type: Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    },
    kind: {
        type: String,
        enum: ["selection_details", "participation"],
        required: true
    },
    data: {
        type: Schema.Types.Mixed,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

fiscalYearSnapshotSchema.index({ fiscal_year: 1, kind: 1 }, { unique: true });

const FiscalYearSnapshot = mongoose.models.FiscalYearSnapshot || mongoose.model('FiscalYearSnapshot', fiscalYearSnapshotSchema);
export default FiscalYearSnapshot;
