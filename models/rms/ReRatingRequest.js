import mongoose from "mongoose";
import ManagerialRating from "./ManagerialRating.js";
import { currentFiscalYearFilter, fiscalYearPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

// A chief's request, after rejecting a system-selected staff member, to have every
// director under them rate again. The Deputy Chief Human Capital (or an admin) reviews it.
//
// pending   -> waiting for the Deputy Chief Human Capital
// re_rating -> approved: director ratings were removed and directors are rating again
// completed -> every removed rating was given again (or the reviewer closed re-rating)
// declined  -> the reviewer kept the existing ratings
const reRatingRequestSchema = new Schema({
    // Chief who rejected the selection
    chief_id: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    chief_name: {
        type: String,
        required: true,
        trim: true
    },
    chief_position: {
        type: String,
        trim: true
    },

    // Staff member whose rejection started the request
    rejected_employee_id: {
        type: String,
        required: true,
        trim: true
    },
    rejected_employee_name: {
        type: String,
        trim: true
    },
    rejected_employee_department: {
        type: String,
        trim: true
    },
    rejection_reason: {
        type: String,
        trim: true
    },
    comments: {
        type: String,
        trim: true
    },

    status: {
        type: String,
        enum: ["pending", "re_rating", "completed", "declined"],
        default: "pending",
        index: true
    },

    // Review by the Deputy Chief Human Capital (or an admin)
    reviewed_by_id: {
        type: String,
        trim: true
    },
    reviewed_by_name: {
        type: String,
        trim: true
    },
    reviewed_by_position: {
        type: String,
        trim: true
    },
    review_comments: {
        type: String,
        trim: true
    },
    reviewed_at: {
        type: Date
    },

    // Audit copies of what the approval removed, so nothing is lost
    affected_director_ids: {
        type: [String],
        default: []
    },
    deleted_ratings: {
        type: [Schema.Types.Mixed],
        default: []
    },
    cleared_approvals: {
        type: [Schema.Types.Mixed],
        default: []
    },

    completed_at: {
        type: Date
    },
    closed_by_reviewer: {
        type: Boolean,
        default: false
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

reRatingRequestSchema.plugin(fiscalYearPlugin);
reRatingRequestSchema.index({ chief_id: 1, status: 1 });

reRatingRequestSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.updated_at = new Date();
    }
    next();
});

const ratingKey = (r) => `${r.rater_emp_id}|${r.ratee_emp_id}|${r.rating_category}`;

// Which of the removed director ratings have been given again. Marks the request
// completed once all of them have.
reRatingRequestSchema.methods.refreshProgress = async function() {
    if (!['re_rating', 'completed'].includes(this.status)) {
        return null;
    }

    const removed = this.deleted_ratings || [];
    const raterIds = [...new Set(removed.map(r => r.rater_emp_id))];
    const current = await ManagerialRating.find({ rater_emp_id: { $in: raterIds }, fiscal_year: this.fiscal_year })
        .select('rater_emp_id ratee_emp_id rating_category')
        .lean();
    const given = new Set(current.map(ratingKey));

    const remaining = removed
        .filter(r => !given.has(ratingKey(r)))
        .map(r => ({
            rater_emp_id: r.rater_emp_id,
            rater_name: `${r.rater_first_name} ${r.rater_last_name}`,
            ratee_emp_id: r.ratee_emp_id,
            ratee_name: `${r.ratee_first_name} ${r.ratee_last_name}`,
            ratee_position: r.ratee_position,
            rating_category: r.rating_category
        }));

    if (this.status === 're_rating' && remaining.length === 0) {
        this.status = 'completed';
        this.completed_at = new Date();
        await this.save();
    }

    return {
        total: removed.length,
        done: removed.length - remaining.length,
        remaining
    };
};

// The chief's request in the current fiscal year that is still waiting for review or
// re-rating, if any
reRatingRequestSchema.statics.findOpenForChief = async function(chiefId) {
    const request = await this.findOne({
        chief_id: chiefId,
        status: { $in: ['pending', 're_rating'] },
        ...(await currentFiscalYearFilter())
    }).sort({ created_at: -1 });

    if (request && request.status === 're_rating') {
        await request.refreshProgress();
        if (request.status !== 're_rating') {
            return null;
        }
    }
    return request;
};

const ReRatingRequest = mongoose.models.ReRatingRequest || mongoose.model('ReRatingRequest', reRatingRequestSchema);
export default ReRatingRequest;
