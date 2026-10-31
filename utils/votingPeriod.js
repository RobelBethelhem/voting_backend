import VotingPeriod from "../models/rms/VotingPeriod.js";
import { getCurrentFiscalYear } from "./fiscalYear.js";

// Each fiscal year has one voting period (set on the Fiscal Years page). Peer votes and
// director ratings are accepted only between its start and end.

// A fiscal year's voting period. Before any fiscal year exists, the active one.
export const getVotingPeriodFor = async (fiscalYear) =>
    fiscalYear
        ? VotingPeriod.findOne({ fiscal_year: fiscalYear._id }).sort({ start_date: -1 }).lean()
        : VotingPeriod.findOne({ status: 'active' }).sort({ start_date: -1 }).lean();

const formatDate = (date) => new Date(date).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

// { open, state: 'open' | 'not_started' | 'closed' | 'not_set', message, period }
export const votingWindow = (period, now = new Date()) => {
    if (!period) {
        // Nothing configured: don't block, as before voting periods were enforced
        return { open: true, state: 'not_set', message: 'No voting period is set', period: null };
    }
    const summary = {
        period_id: period.period_id,
        period_name: period.period_name,
        start_date: period.start_date,
        end_date: period.end_date
    };
    if (now < new Date(period.start_date)) {
        return { open: false, state: 'not_started', message: `Voting opens on ${formatDate(period.start_date)}`, period: summary };
    }
    if (now > new Date(period.end_date)) {
        return { open: false, state: 'closed', message: `Voting closed on ${formatDate(period.end_date)}`, period: summary };
    }
    return { open: true, state: 'open', message: `Voting is open until ${formatDate(period.end_date)}`, period: summary };
};

export const currentVotingWindow = async () =>
    votingWindow(await getVotingPeriodFor(await getCurrentFiscalYear()));
