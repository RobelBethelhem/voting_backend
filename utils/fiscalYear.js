import mongoose from "mongoose";
import FiscalYear from "../models/rms/FiscalYear.js";

// The current fiscal year, cached briefly. Fiscal year routes clear it on every change.
const CACHE_MS = 30 * 1000;
let cachedCurrent;
let cachedAt = 0;

export const clearFiscalYearCache = () => {
    cachedCurrent = undefined;
};

export const getCurrentFiscalYear = async () => {
    if (cachedCurrent === undefined || Date.now() - cachedAt > CACHE_MS) {
        cachedCurrent = await FiscalYear.findOne({ is_current: true }).lean();
        cachedAt = Date.now();
    }
    return cachedCurrent;
};

// Records belonging to a fiscal year. Before any fiscal year is set up nothing is stamped,
// so { fiscal_year: null } matches every record and the system works as it did before.
export const fiscalYearFilter = (fiscalYear) => ({ fiscal_year: fiscalYear?._id ?? null });

export const currentFiscalYearFilter = async () => fiscalYearFilter(await getCurrentFiscalYear());

export class FiscalYearNotFound extends Error {}

// The fiscal year a report asks for with ?fiscal_year=<id>, or the current one
export const resolveFiscalYear = async (requested) => {
    if (!requested || requested === 'current') return getCurrentFiscalYear();
    if (!mongoose.isValidObjectId(requested)) throw new FiscalYearNotFound('Invalid fiscal year');
    const fiscalYear = await FiscalYear.findById(requested).lean();
    if (!fiscalYear) throw new FiscalYearNotFound('Fiscal year not found');
    return fiscalYear;
};

// Route middleware for reports: sets req.fiscalYear from ?fiscal_year=<id> (default: the
// current fiscal year, or null before any is set up)
export const withFiscalYear = async (req, res, next) => {
    try {
        req.fiscalYear = await resolveFiscalYear(req.query.fiscal_year);
        next();
    } catch (error) {
        if (error instanceof FiscalYearNotFound) {
            return res.status(404).json({ error: true, success: false, message: error.message });
        }
        next(error);
    }
};

// A closed year's reports come from its snapshot; an open year is computed live
export const isClosed = (fiscalYear) => fiscalYear?.status === 'closed';

const SCOPED_QUERIES = [
    'find', 'findOne', 'countDocuments', 'distinct',
    'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne'
];

// An _id filter that names particular documents (not e.g. { $ne: id })
const namesDocuments = (idFilter) =>
    idFilter !== undefined && (
        typeof idFilter !== 'object' ||
        idFilter instanceof mongoose.Types.ObjectId ||
        '$in' in idFilter ||
        '$eq' in idFilter
    );

// For data each fiscal year keeps its own copy of (people, departments, candidates).
// Besides stamping new documents, every query and aggregate is limited to the current
// fiscal year, so existing code keeps working on "this year's" organisation. A query is
// left alone when it names a fiscal_year itself, names documents by _id, or sets the
// allFiscalYears option. `shared` matches documents every year sees (e.g. admin accounts).
export const fiscalYearScopedPlugin = (schema, { shared } = {}) => {
    fiscalYearPlugin(schema);

    const currentYearClause = async () => {
        const clause = { fiscal_year: (await getCurrentFiscalYear())?._id ?? null };
        return shared ? { $or: [clause, shared] } : clause;
    };

    schema.pre(SCOPED_QUERIES, async function() {
        const filter = this.getFilter();
        if (this.getOptions().allFiscalYears || 'fiscal_year' in filter || namesDocuments(filter._id)) return;
        this.and([await currentYearClause()]);
    });

    schema.pre('aggregate', async function() {
        if (this.options?.allFiscalYears) return;
        const pipeline = this.pipeline();
        if (pipeline[0]?.$match && 'fiscal_year' in pipeline[0].$match) return;
        pipeline.unshift({ $match: await currentYearClause() });
    });

    schema.pre('insertMany', function(next, docs) {
        getCurrentFiscalYear()
            .then(current => {
                for (const doc of docs) {
                    if (!doc.fiscal_year) doc.fiscal_year = current?._id ?? null;
                }
                next();
            })
            .catch(next);
    });
};

// Adds fiscal_year to a schema and stamps each new document with the current fiscal year
// (unless it was given one explicitly)
export const fiscalYearPlugin = (schema) => {
    schema.add({
        fiscal_year: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FiscalYear',
            default: null,
            index: true
        }
    });
    schema.pre('save', async function() {
        if (this.isNew && !this.fiscal_year) {
            this.fiscal_year = (await getCurrentFiscalYear())?._id ?? null;
        }
    });
};
