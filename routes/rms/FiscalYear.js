import { Router } from "express";
import mongoose from "mongoose";
import auth from "../../middleware/rms/auth.js";
import roleCheck from "../../middleware/rms/roleCheck.js";
import FiscalYear from "../../models/rms/FiscalYear.js";
import FiscalYearSnapshot from "../../models/rms/FiscalYearSnapshot.js";
import Vote from "../../models/rms/Vote.js";
import ManagerialRating from "../../models/rms/ManagerialRating.js";
import StaffApproval from "../../models/rms/StaffApproval.js";
import QuotaAllocation from "../../models/rms/QuotaAllocation.js";
import ReRatingRequest from "../../models/rms/ReRatingRequest.js";
import Chief from "../../models/rms/Chief.js";
import { buildChiefSelectionDetails } from "../../services/selectionDetailsService.js";
import { buildParticipation } from "./Admin/Landing/participation_dashboard.js";
import { ORG_DATA, copyOrgData, relinkQuotaChiefs } from "../../services/fiscalYearOrgService.js";
import { clearFiscalYearCache, getCurrentFiscalYear } from "../../utils/fiscalYear.js";
import VotingPeriod from "../../models/rms/VotingPeriod.js";
import { currentVotingWindow, votingWindow } from "../../utils/votingPeriod.js";

const router = Router();

// Everything stamped with a fiscal year, by the name the counts are reported under
const YEARLY_DATA = {
    votes: Vote,
    director_ratings: ManagerialRating,
    approvals: StaffApproval,
    quotas: QuotaAllocation,
    re_rating_requests: ReRatingRequest
};

// Everything a fiscal year holds: its process data and its own copy of the organisation
const ALL_DATA = {
    ...YEARLY_DATA,
    ...Object.fromEntries(Object.entries(ORG_DATA).map(([key, { model }]) => [key, model]))
};

const emptyCounts = () => Object.fromEntries(Object.keys(ALL_DATA).map(k => [k, 0]));

// { [fiscal year id or 'unassigned']: { votes, director_ratings, ..., departments, chiefs, ... } }
const countsByFiscalYear = async () => {
    const counts = {};
    for (const [key, model] of Object.entries(ALL_DATA)) {
        const groups = await model
            .aggregate([{ $group: { _id: '$fiscal_year', count: { $sum: 1 } } }])
            .option({ allFiscalYears: true });
        for (const group of groups) {
            const id = group._id ? String(group._id) : 'unassigned';
            counts[id] = counts[id] || emptyCounts();
            counts[id][key] = group.count;
        }
    }
    return counts;
};

const ORG_ENTITIES = Object.keys(ORG_DATA);
const validEntities = (entities) => Array.isArray(entities) ? entities.filter(e => ORG_ENTITIES.includes(e)) : [];

const validateYear = ({ name, start_date, end_date }) => {
    if (!name || !name.trim()) return "Name is required";
    const start = new Date(start_date);
    const end = new Date(end_date);
    if (isNaN(start) || isNaN(end)) return "Start and end dates are required";
    if (start >= end) return "The end date must be after the start date";
    return null;
};

// When voting opens and closes (both or neither). Future dates are fine.
const validateVoting = ({ voting_start, voting_end }) => {
    if (voting_start === undefined && voting_end === undefined) return null;
    const start = new Date(voting_start);
    const end = new Date(voting_end);
    if (!voting_start || !voting_end || isNaN(start) || isNaN(end)) return "Give both when voting opens and when it closes";
    if (start >= end) return "Voting must close after it opens";
    return null;
};

// Each fiscal year's voting period is set with the year and can be changed afterwards.
// The current year's period is the 'active' one, which older code also looks up.
const saveVotingPeriod = async (fiscalYear, { voting_start, voting_end }, actor) => {
    if (voting_start === undefined && voting_end === undefined) return null;
    const status = fiscalYear.is_current ? 'active' : 'completed';
    const existing = await VotingPeriod.findOne({ fiscal_year: fiscalYear._id }).sort({ start_date: -1 });
    if (existing) {
        existing.start_date = voting_start;
        existing.end_date = voting_end;
        existing.status = status;
        existing.updated_by = actor;
        await existing.save();
        return existing;
    }
    let periodId = `FY ${fiscalYear.name}`;
    if (await VotingPeriod.exists({ period_id: periodId })) periodId = `FY ${fiscalYear.name} ${fiscalYear._id}`;
    return VotingPeriod.create({
        period_id: periodId,
        period_name: `Best Staff Selection ${fiscalYear.name}`,
        start_date: voting_start,
        end_date: voting_end,
        status,
        created_by: actor,
        fiscal_year: fiscalYear._id
    });
};

// Voting only ever happens in the current year, so a closed year's voting is closed too
const yearVoting = (fiscalYear, period) => {
    const window = votingWindow(period);
    return fiscalYear.status === 'closed' && window.period
        ? { ...window, open: false, state: 'closed', message: `Closed with fiscal year ${fiscalYear.name}` }
        : window;
};

const setVotingPeriodStatus = (fiscalYear, status) =>
    VotingPeriod.updateMany({ fiscal_year: fiscalYear._id }, { $set: { status, updated_at: new Date() } });

// Reports of a year that depend on data which changes over time (appraisal scores,
// hierarchy, candidates) are frozen when the year closes
const buildSnapshots = async (fiscalYear) => {
    const approvalChiefIds = await StaffApproval.distinct('chief_id', { fiscal_year: fiscalYear._id });
    const chiefs = await Chief.find({
        $or: [{ status: true }, { employee_id: { $in: approvalChiefIds } }]
    }).lean();

    const selection = [];
    for (const chief of chiefs) {
        selection.push(await buildChiefSelectionDetails(chief, fiscalYear));
    }

    return {
        selection_details: { chiefs: selection },
        participation: await buildParticipation(fiscalYear)
    };
};

const saveSnapshots = async (fiscalYear, snapshots) => {
    for (const [kind, data] of Object.entries(snapshots)) {
        await FiscalYearSnapshot.findOneAndUpdate(
            { fiscal_year: fiscalYear._id, kind },
            { $set: { data, created_at: new Date() } },
            { upsert: true }
        );
    }
};

// Freezes the current year's reports and closes it. Returns null when another request
// already changed the current year.
const closeCurrentYear = async (current, closedBy) => {
    const snapshots = await buildSnapshots(current);
    const closed = await FiscalYear.findOneAndUpdate(
        { _id: current._id, is_current: true },
        {
            $set: {
                status: 'closed',
                is_current: false,
                closed_at: new Date(),
                closed_by: closedBy,
                updated_at: new Date()
            }
        },
        { new: true }
    );
    if (!closed) return null;
    await saveSnapshots(closed, snapshots);
    await setVotingPeriodStatus(closed, 'completed');
    return closed;
};

const reopenYear = async (fiscalYear) => {
    await FiscalYear.updateOne(
        { _id: fiscalYear._id },
        {
            $set: { status: 'open', is_current: true, updated_at: new Date() },
            $unset: { closed_at: '', closed_by: '' }
        }
    );
    await setVotingPeriodStatus(fiscalYear, 'active');
};

const describe = (fiscalYear, counts) => ({
    ...fiscalYear,
    counts: counts[String(fiscalYear._id)] || emptyCounts()
});

// All fiscal years, newest first, with how much data each holds. Any signed-in user can
// read them (report pages offer them as a choice).
router.get('/', auth, async (req, res) => {
    try {
        const [years, counts] = await Promise.all([
            FiscalYear.find().sort({ start_date: -1 }).lean(),
            countsByFiscalYear()
        ]);
        const snapshots = await FiscalYearSnapshot.find({}, { fiscal_year: 1, kind: 1, created_at: 1 }).lean();
        const periods = await VotingPeriod.find({ fiscal_year: { $in: years.map(y => y._id) } }).sort({ start_date: -1 }).lean();

        res.status(200).json({
            success: true,
            data: years.map(year => ({
                ...describe(year, counts),
                snapshot_at: snapshots.find(s => String(s.fiscal_year) === String(year._id))?.created_at || null,
                voting: yearVoting(year, periods.find(p => String(p.fiscal_year) === String(year._id)))
            })),
            meta: {
                current: years.find(y => y.is_current) || null,
                unassigned: counts.unassigned || emptyCounts()
            }
        });

    } catch (error) {
        console.error('Error listing fiscal years:', error);
        res.status(500).json({
            success: false,
            message: "Error listing fiscal years",
            error: error.message
        });
    }
});

router.get('/current', auth, async (req, res) => {
    try {
        // voting: whether peer votes and director ratings are accepted now
        res.status(200).json({
            success: true,
            data: await getCurrentFiscalYear(),
            voting: await currentVotingWindow()
        });
    } catch (error) {
        console.error('Error getting current fiscal year:', error);
        res.status(500).json({
            success: false,
            message: "Error getting current fiscal year",
            error: error.message
        });
    }
});

// Create a fiscal year and make it current.
// - The first fiscal year takes over all existing data.
// - Later ones start a new cycle: the current year's reports are frozen and it is closed,
//   and (copy_quotas, default true) each chief's quota is carried over with nothing allocated.
router.post('/', auth, roleCheck(['admin']), async (req, res) => {
    try {
        // copy_org: which parts of the organisation to copy from the year being closed
        // (departments, chiefs, directors, managers, employees, candidates); the rest is
        // imported fresh for the new year
        // voting_start / voting_end: this year's voting period
        const { name, start_date, end_date, notes, copy_quotas = true, copy_org = [], voting_start, voting_end } = req.body;

        const invalid = validateYear({ name, start_date, end_date }) || validateVoting({ voting_start, voting_end });
        if (invalid) {
            return res.status(400).json({ success: false, message: invalid });
        }
        if (await FiscalYear.exists({ name: name.trim() })) {
            return res.status(400).json({ success: false, message: `A fiscal year named ${name.trim()} already exists` });
        }

        const isFirst = !(await FiscalYear.exists({}));
        const current = await FiscalYear.findOne({ is_current: true }).lean();
        const actor = req.user.employee_id;

        let closed = null;
        if (current) {
            closed = await closeCurrentYear(current, actor);
            if (!closed) {
                return res.status(409).json({ success: false, message: "The current fiscal year was just changed by someone else. Refresh and try again." });
            }
        }

        let fiscalYear;
        try {
            fiscalYear = await FiscalYear.create({
                name: name.trim(),
                start_date,
                end_date,
                notes,
                status: 'open',
                is_current: true,
                created_by: actor
            });
        } catch (error) {
            // Put the previous year back so there is still a current one
            if (closed) await reopenYear(closed);
            throw error;
        } finally {
            clearFiscalYearCache();
        }

        const result = { closed_fiscal_year: closed?.name || null, adopted: null, org_copied: null, quotas_copied: 0 };

        if (isFirst) {
            // Everything recorded so far, people and departments included, belongs to the
            // first fiscal year
            result.adopted = {};
            for (const [key, model] of Object.entries(ALL_DATA)) {
                const update = await model.updateMany({ fiscal_year: null }, { $set: { fiscal_year: fiscalYear._id } });
                result.adopted[key] = update.modifiedCount;
            }
            await VotingPeriod.updateMany({ fiscal_year: null }, { $set: { fiscal_year: fiscalYear._id } });
        }

        await saveVotingPeriod(fiscalYear, { voting_start, voting_end }, actor);

        const entities = validEntities(copy_org);
        if (closed && entities.length > 0) {
            result.org_copied = await copyOrgData(closed, fiscalYear, entities);
        }

        if (!isFirst && closed && copy_quotas) {
            const quotas = await QuotaAllocation.find({ fiscal_year: closed._id, is_active: true }).lean();
            for (const quota of quotas) {
                await new QuotaAllocation({
                    chief_id: quota.chief_id,
                    quota_limit: quota.quota_limit,
                    description: quota.description,
                    created_by: actor,
                    fiscal_year: fiscalYear._id
                }).save();
            }
            result.quotas_copied = quotas.length;
        }
        // Copied quotas still point at last year's chief records until this year's exist
        await relinkQuotaChiefs(fiscalYear);

        console.log(`Fiscal year ${fiscalYear.name} started by ${actor}`, result);

        res.status(201).json({
            success: true,
            message: closed
                ? `Fiscal year ${fiscalYear.name} started. ${closed.name} is closed and its reports are kept as they were.`
                : `Fiscal year ${fiscalYear.name} created`,
            data: fiscalYear,
            result
        });

    } catch (error) {
        console.error('Error creating fiscal year:', error);
        res.status(500).json({
            success: false,
            message: "Error creating fiscal year",
            error: error.message
        });
    }
});

// Make a closed fiscal year current again (e.g. it was closed too early). The year that is
// current now is closed and frozen in its place.
router.post('/:id/reopen', auth, roleCheck(['admin']), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: "Fiscal year not found" });
        }
        const target = await FiscalYear.findById(req.params.id).lean();
        if (!target) {
            return res.status(404).json({ success: false, message: "Fiscal year not found" });
        }
        if (target.is_current) {
            return res.status(400).json({ success: false, message: `${target.name} is already the current fiscal year` });
        }

        const current = await FiscalYear.findOne({ is_current: true }).lean();
        let closed = null;
        if (current) {
            closed = await closeCurrentYear(current, req.user.employee_id);
            if (!closed) {
                return res.status(409).json({ success: false, message: "The current fiscal year was just changed by someone else. Refresh and try again." });
            }
        }
        await reopenYear(target);
        clearFiscalYearCache();

        res.status(200).json({
            success: true,
            message: closed
                ? `${target.name} is current again. ${closed.name} is closed and its reports are kept as they were.`
                : `${target.name} is current again`,
            data: await FiscalYear.findById(target._id).lean()
        });

    } catch (error) {
        console.error('Error reopening fiscal year:', error);
        res.status(500).json({
            success: false,
            message: "Error reopening fiscal year",
            error: error.message
        });
    }
});

// Copy part of the organisation (departments, chiefs, directors, managers, employees,
// candidates) from another fiscal year into the current one, e.g. when a new year keeps last
// year's structure. Records the current year already has (same code or employee ID) are kept.
router.post('/copy', auth, roleCheck(['admin']), async (req, res) => {
    try {
        const { from_fiscal_year, entities } = req.body;
        const chosen = validEntities(entities);
        if (chosen.length === 0) {
            return res.status(400).json({ success: false, message: "Choose what to copy" });
        }
        if (!mongoose.isValidObjectId(from_fiscal_year)) {
            return res.status(404).json({ success: false, message: "Fiscal year to copy from not found" });
        }

        const [from, current] = await Promise.all([
            FiscalYear.findById(from_fiscal_year).lean(),
            FiscalYear.findOne({ is_current: true }).lean()
        ]);
        if (!from) {
            return res.status(404).json({ success: false, message: "Fiscal year to copy from not found" });
        }
        if (!current) {
            return res.status(400).json({ success: false, message: "There is no current fiscal year to copy into" });
        }
        if (String(from._id) === String(current._id)) {
            return res.status(400).json({ success: false, message: "Choose a different fiscal year to copy from" });
        }

        const copied = await copyOrgData(from, current, chosen);
        const quotasRelinked = await relinkQuotaChiefs(current);
        const total = Object.values(copied).reduce((sum, c) => sum + c.copied, 0);

        res.status(200).json({
            success: true,
            message: `Copied ${total} records from ${from.name} into ${current.name}`,
            data: { copied, quotas_relinked: quotasRelinked }
        });

    } catch (error) {
        console.error('Error copying from fiscal year:', error);
        res.status(500).json({
            success: false,
            message: "Error copying from fiscal year",
            error: error.message
        });
    }
});

// Rename a fiscal year or change its dates or notes
router.patch('/:id', auth, roleCheck(['admin']), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: "Fiscal year not found" });
        }
        const fiscalYear = await FiscalYear.findById(req.params.id);
        if (!fiscalYear) {
            return res.status(404).json({ success: false, message: "Fiscal year not found" });
        }

        const { name, start_date, end_date, notes, voting_start, voting_end } = req.body;
        const next = {
            name: name ?? fiscalYear.name,
            start_date: start_date ?? fiscalYear.start_date,
            end_date: end_date ?? fiscalYear.end_date
        };
        const invalid = validateYear(next) || validateVoting({ voting_start, voting_end });
        if (invalid) {
            return res.status(400).json({ success: false, message: invalid });
        }
        if (await FiscalYear.exists({ name: next.name.trim(), _id: { $ne: fiscalYear._id } })) {
            return res.status(400).json({ success: false, message: `A fiscal year named ${next.name.trim()} already exists` });
        }

        fiscalYear.name = next.name.trim();
        fiscalYear.start_date = next.start_date;
        fiscalYear.end_date = next.end_date;
        if (notes !== undefined) fiscalYear.notes = notes;
        await fiscalYear.save();
        await saveVotingPeriod(fiscalYear, { voting_start, voting_end }, req.user.employee_id);
        clearFiscalYearCache();

        res.status(200).json({
            success: true,
            message: "Fiscal year updated",
            data: fiscalYear
        });

    } catch (error) {
        console.error('Error updating fiscal year:', error);
        res.status(500).json({
            success: false,
            message: "Error updating fiscal year",
            error: error.message
        });
    }
});

// Delete a fiscal year created by mistake: only one that is not current and holds no data
router.delete('/:id', auth, roleCheck(['admin']), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ success: false, message: "Fiscal year not found" });
        }
        const fiscalYear = await FiscalYear.findById(req.params.id).lean();
        if (!fiscalYear) {
            return res.status(404).json({ success: false, message: "Fiscal year not found" });
        }
        if (fiscalYear.is_current) {
            return res.status(400).json({ success: false, message: "The current fiscal year cannot be deleted" });
        }

        for (const [key, model] of Object.entries(ALL_DATA)) {
            if (await model.exists({ fiscal_year: fiscalYear._id })) {
                return res.status(400).json({
                    success: false,
                    message: `${fiscalYear.name} still holds ${key.replace(/_/g, ' ')} and cannot be deleted`
                });
            }
        }

        await FiscalYearSnapshot.deleteMany({ fiscal_year: fiscalYear._id });
        await VotingPeriod.deleteMany({ fiscal_year: fiscalYear._id });
        await FiscalYear.deleteOne({ _id: fiscalYear._id });
        clearFiscalYearCache();

        res.status(200).json({
            success: true,
            message: `Fiscal year ${fiscalYear.name} deleted`
        });

    } catch (error) {
        console.error('Error deleting fiscal year:', error);
        res.status(500).json({
            success: false,
            message: "Error deleting fiscal year",
            error: error.message
        });
    }
});

export default router;
