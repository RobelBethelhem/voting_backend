import mongoose from "mongoose";
import Vote from "../models/rms/Vote.js";
import ManagerialRating from "../models/rms/ManagerialRating.js";
import StaffApproval from "../models/rms/StaffApproval.js";
import QuotaAllocation from "../models/rms/QuotaAllocation.js";
import ReRatingRequest from "../models/rms/ReRatingRequest.js";
import FiscalYear from "../models/rms/FiscalYear.js";
import FiscalYearSnapshot from "../models/rms/FiscalYearSnapshot.js";
import User from "../models/rms/user.js";
import Manager from "../models/rms/Manager.js";
import Director from "../models/rms/Director.js";
import Chief from "../models/rms/Chief.js";
import Department from "../models/rms/Department.js";
import Candidate from "../models/rms/Candidate.js";
import VotingPeriod from "../models/rms/VotingPeriod.js";

// The once-only rules (one vote per voter, one approval per employee and chief, one quota
// per chief, one rating per rater, ratee and category, and unique employee IDs, usernames,
// emails and department codes) became once per fiscal year.
// Mongoose creates new indexes but never drops old ones, so the old once-ever unique
// indexes would still block a second year; syncIndexes replaces them.
const MODELS = [
    Vote, ManagerialRating, StaffApproval, QuotaAllocation, ReRatingRequest, FiscalYear, FiscalYearSnapshot,
    User, Manager, Director, Chief, Department, Candidate
];

export const syncFiscalYearIndexes = async () => {
    for (const model of MODELS) {
        try {
            const dropped = await model.syncIndexes();
            if (dropped.length > 0) {
                console.log(`${model.modelName}: replaced indexes ${dropped.join(', ')}`);
            }
        } catch (error) {
            console.error(`Could not sync ${model.modelName} indexes:`, error.message);
        }
    }
};

// Records saved before they were kept per fiscal year (or before this code ran) carry no
// fiscal year. Once a fiscal year is current they would be invisible to every scoped query,
// so they are assigned to the current year, the same way the first fiscal year takes over
// existing data.
// VotingPeriod only needs its year assigned (its own indexes are left as they are)
const YEARLY_MODELS = [...MODELS.filter(model => model !== FiscalYear && model !== FiscalYearSnapshot), VotingPeriod];

export const adoptUnassignedRecords = async () => {
    const current = await FiscalYear.findOne({ is_current: true }).lean();
    if (!current) return;
    for (const model of YEARLY_MODELS) {
        try {
            const result = await model.updateMany({ fiscal_year: null }, { $set: { fiscal_year: current._id } });
            if (result.modifiedCount > 0) {
                console.log(`${model.modelName}: ${result.modifiedCount} records assigned to fiscal year ${current.name}`);
            }
        } catch (error) {
            console.error(`Could not assign ${model.modelName} records to fiscal year ${current.name}:`, error.message);
        }
    }
};

export const syncFiscalYearIndexesOnConnect = () => {
    mongoose.connection.once('open', async () => {
        await syncFiscalYearIndexes();
        await adoptUnassignedRecords();
    });
};
