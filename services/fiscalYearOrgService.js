import User from '../models/rms/user.js';
import Manager from '../models/rms/Manager.js';
import Director from '../models/rms/Director.js';
import Chief from '../models/rms/Chief.js';
import Department from '../models/rms/Department.js';
import Candidate from '../models/rms/Candidate.js';
import QuotaAllocation from '../models/rms/QuotaAllocation.js';

// The organisation each fiscal year keeps its own copy of, in the order to copy it, with the
// field that identifies the same record from one year to the next
export const ORG_DATA = {
    departments: { model: Department, key: 'department_code', label: 'Departments' },
    chiefs: { model: Chief, key: 'employee_id', label: 'Chiefs' },
    directors: { model: Director, key: 'employee_id', label: 'Directors' },
    managers: { model: Manager, key: 'employee_id', label: 'Managers' },
    employees: { model: User, key: 'employee_id', label: 'Employees' },
    candidates: { model: Candidate, key: 'employee_id', label: 'Candidates' }
};

// Admin accounts are shared by every fiscal year (models/rms/user.js), so they are not copied
const isSharedAccount = (entity, doc) => entity === 'employees' && (doc.roles || []).includes('admin');

// Copies the chosen kinds of records from one fiscal year into another, skipping any the
// target year already has. Returns { [entity]: { copied, skipped, failed } }.
export const copyOrgData = async (fromYear, toYear, entities) => {
    const result = {};
    for (const [entity, { model, key }] of Object.entries(ORG_DATA)) {
        if (!entities.includes(entity)) continue;

        const existing = new Set(await model.distinct(key, { fiscal_year: toYear._id }));
        const source = await model.find({ fiscal_year: fromYear._id }).lean();
        const copies = source
            .filter(doc => !existing.has(doc[key]) && !isSharedAccount(entity, doc))
            .map(({ _id, __v, ...doc }) => ({ ...doc, fiscal_year: toYear._id }));

        let copied = copies.length;
        let failed = 0;
        if (copies.length > 0) {
            try {
                // Raw insert: keeps the stored (already hashed) passwords as they are
                await model.insertMany(copies, { ordered: false });
            } catch (error) {
                const errors = error.writeErrors || [];
                failed = errors.length || copies.length;
                copied = copies.length - failed;
                console.error(`Copying ${entity}: ${failed} failed`, errors.slice(0, 3).map(e => e.errmsg || e.message));
            }
        }
        result[entity] = { copied, skipped: source.length - copies.length, failed };
    }
    return result;
};

// The current fiscal year's record for the same person. A token issued before the year
// changed still carries last year's record _id; quotas point at this year's record.
export const currentYearChief = async (chief) =>
    (chief && (await Chief.findOne({ employee_id: chief.employee_id }))) || chief;

// Quotas point at a Chief record, and every fiscal year has its own Chief records. Points a
// year's quotas at that year's record for the same chief (matched by employee ID) once it
// exists, e.g. after the chiefs were copied or imported. Returns how many were relinked.
export const relinkQuotaChiefs = async (fiscalYear) => {
    if (!fiscalYear) return 0;
    const quotas = await QuotaAllocation.find({ fiscal_year: fiscalYear._id }).lean();
    if (quotas.length === 0) return 0;

    const linkedChiefs = await Chief.find({ _id: { $in: quotas.map(q => q.chief_id) } }).lean();
    const employeeIdOf = new Map(linkedChiefs.map(c => [String(c._id), { employee_id: c.employee_id, year: String(c.fiscal_year) }]));
    const yearChiefs = await Chief.find({ fiscal_year: fiscalYear._id }).lean();
    const chiefIdFor = new Map(yearChiefs.map(c => [c.employee_id, c._id]));

    let relinked = 0;
    for (const quota of quotas) {
        const linked = employeeIdOf.get(String(quota.chief_id));
        if (!linked || linked.year === String(fiscalYear._id)) continue;
        const target = chiefIdFor.get(linked.employee_id);
        if (!target) continue;
        await QuotaAllocation.updateOne({ _id: quota._id }, { $set: { chief_id: target } });
        relinked++;
    }
    return relinked;
};
