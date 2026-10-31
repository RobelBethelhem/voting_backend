import User from '../models/rms/user.js';
import Manager from '../models/rms/Manager.js';
import Director from '../models/rms/Director.js';
import Department from '../models/rms/Department.js';
import Vote from '../models/rms/Vote.js';
import ManagerialRating from '../models/rms/ManagerialRating.js';
import QuotaAllocation from '../models/rms/QuotaAllocation.js';
import StaffApproval from '../models/rms/StaffApproval.js';
import { fiscalYearFilter } from '../utils/fiscalYear.js';

// Recomputes, for every candidate under a chief, the figures the Chief Approval page
// ranks on (voting/src/views/admin/HierarchicalVoting/ChiefApproval.js:
// fetchAvailableStaff and calculatePhase1/2/3), so the Selected Best Staff export
// shows the same numbers the chief approved. Keep the two in step.

// Performance (50%) must be at least 45.25, i.e. an appraisal score of 90.5
const MIN_PERFORMANCE_OUT_OF_50 = 45.25;
const DEFAULT_QUOTA_LIMIT = 2;
const MANAGERIAL_LEVELS = ['manager', 'director', 'chief'];

const round2 = (value) => parseFloat(value.toFixed(2));

// isEmployeeManager on the Chief Approval page, applied to the fields staff-under-chief returns
const isManager = (person) =>
    person.level?.toLowerCase() === 'manager' ||
    !!person.position?.toLowerCase().includes('manager') ||
    !!person.employee_id?.toUpperCase().startsWith('MGR');

// /api/managerial-rating/staff-under-chief: managers under the chief's directors, then
// the users they manage. A manager also stored as a user is listed once.
const staffUnderChief = async (chief) => {
    const directors = await Director.find({ chief_id: chief.employee_id, status: true }).select('employee_id').lean();
    const directorIds = directors.map(d => d.employee_id);

    const managers = await Manager.find({ director_id: { $in: directorIds }, status: true })
        .select('employee_id first_name last_name position job_grade function performance_appraisal_score')
        .lean();
    const managerIds = managers.map(m => m.employee_id);

    const users = await User.find({
        $or: [
            { manager_id: { $in: managerIds }, status: true },
            { employee_id: { $in: managerIds }, status: true }
        ]
    }).select('employee_id first_name last_name position department level job_grade function performance_appraisal_score').lean();

    const seen = new Set();
    return [
        ...managers.map(m => ({ ...m, level: 'manager', department: 'Management' })),
        ...users
    ].filter(person => {
        if (seen.has(person.employee_id)) return false;
        seen.add(person.employee_id);
        return true;
    });
};

// Managers belong to the department they manage
const managerDepartmentMap = async () => {
    const departments = await Department.find({ is_active: true }).sort({ department_code: 1 }).lean();
    const map = {};
    for (const dept of departments) {
        if (dept.manager_id && dept.department_name) map[dept.manager_id] = dept.department_name;
    }
    return map;
};

const departmentFor = (person, managerToDepartment) => {
    let department = person.department;
    if (isManager(person) && managerToDepartment[person.employee_id]) {
        department = managerToDepartment[person.employee_id];
    }
    if (!department || department.toLowerCase() === 'management') {
        department = 'Unassigned';
    }
    return department;
};

// Latest submitted rating per ratee, as /director-rating and /manager-rating pick it
const latestByRatee = (ratings) => {
    const latest = {};
    for (const rating of ratings) {
        const current = latest[rating.ratee_emp_id];
        if (!current || rating.created_at > current.created_at) latest[rating.ratee_emp_id] = rating;
    }
    return latest;
};

const ratingOutOf = (rating, scale) =>
    rating && rating.max_possible_score > 0 ? (rating.total_weighted_score / rating.max_possible_score) * scale : 0;

// fiscalYear: the year whose votes, ratings, quota and approvals to use (null before any
// fiscal year is set up)
export const buildChiefSelectionDetails = async (chief, fiscalYear = null) => {
    const inYear = fiscalYearFilter(fiscalYear);
    const managerToDepartment = await managerDepartmentMap();
    const candidates = (await staffUnderChief(chief))
        .map(person => ({ ...person, department: departmentFor(person, managerToDepartment) }))
        .filter(person => (person.performance_appraisal_score || 0) / 2 >= MIN_PERFORMANCE_OUT_OF_50);

    const departments = [...new Set(candidates.map(c => c.department))];
    const candidateIds = candidates.map(c => c.employee_id);

    const [ratings, votes, eligibleCounts, quota, approvals] = await Promise.all([
        ManagerialRating.find({
            ratee_emp_id: { $in: candidateIds },
            status: { $in: ['submitted', 'approved'] },
            ...inYear
        }).lean(),
        Vote.find({ voter_department: { $in: departments }, ...inYear })
            .select('voter_emp_id voter_department candidate_emp_id Total_Weight')
            .lean(),
        // /api/zemen_vote_candidate/eligible-voters/:department
        User.aggregate([
            {
                $match: {
                    department: { $in: departments },
                    level: { $nin: MANAGERIAL_LEVELS },
                    roles: { $nin: MANAGERIAL_LEVELS }
                }
            },
            { $group: { _id: '$department', count: { $sum: 1 } } }
        ]),
        QuotaAllocation.findOne({ chief_id: chief._id, is_active: true, ...inYear }).lean(),
        StaffApproval.find({ chief_id: chief.employee_id, is_active: true, ...inYear }).lean()
    ]);

    const directorRatings = latestByRatee(ratings.filter(r => r.rating_category === 'managerial_staff'));
    const managerRatings = latestByRatee(ratings.filter(r => r.rating_category === 'non_managerial_staff'));
    const eligibleByDepartment = Object.fromEntries(eligibleCounts.map(e => [e._id, e.count]));
    const approvalByEmployee = Object.fromEntries(approvals.map(a => [a.employee_id, a]));

    const rows = candidates.map(person => {
        const performanceAppraisal = person.performance_appraisal_score || 0;
        const performanceOutOf50 = performanceAppraisal / 2;
        const approval = approvalByEmployee[person.employee_id];
        const base = {
            employee_id: person.employee_id,
            name: `${person.first_name} ${person.last_name}`,
            position: person.position || '',
            function: person.function || chief.position || '',
            job_grade: person.job_grade || '',
            department: person.department,
            performance_appraisal_score: performanceAppraisal,
            performance_out_of_50: performanceOutOf50,
            approval_status: approval?.approval_status || null,
            rejection_reason: approval?.rejection_reason || null
        };

        if (isManager(person)) {
            // Performance 50% + Director Rating 50%; no peer voting for managers
            const directorRatingOutOf50 = ratingOutOf(directorRatings[person.employee_id], 50);
            const total = performanceOutOf50 + directorRatingOutOf50;
            return {
                ...base,
                is_managerial: true,
                director_rating_out_of_50: directorRatingOutOf50,
                total_out_of_100: total,
                final_score: round2(total),
                score_type: 'managerial'
            };
        }

        // Performance 50% + Manager 30% + Peer 20%, the peer part weighted by participation
        const managerRatingOutOf30 = ratingOutOf(managerRatings[person.employee_id], 30);
        const departmentVotes = votes.filter(v => v.voter_department === person.department);
        const received = departmentVotes.filter(v => v.candidate_emp_id === person.employee_id);
        const eligibleVoters = eligibleByDepartment[person.department] || 0;
        const votePercentage = eligibleVoters > 0 ? (received.length / eligibleVoters) * 100 : 0;
        const averagePeerRating = received.length > 0
            ? received.reduce((sum, v) => sum + (v.Total_Weight || 0), 0) / received.length
            : 0;
        const peerRatingOutOf20 = (averagePeerRating * 20) / 50;
        const weightedRating = (peerRatingOutOf20 * votePercentage) / 100;
        const totalRatingResult = performanceOutOf50 + managerRatingOutOf30 + peerRatingOutOf20;
        const totalWeightedResult = performanceOutOf50 + managerRatingOutOf30 + weightedRating;
        const hasManagerRating = managerRatingOutOf30 > 0;

        return {
            ...base,
            is_managerial: false,
            manager_rating_out_of_50: (managerRatingOutOf30 / 30) * 50,
            manager_rating_out_of_30: managerRatingOutOf30,
            total_eligible_voters: eligibleVoters,
            total_voters_voted: new Set(departmentVotes.map(v => v.voter_emp_id)).size,
            voted_by: received.length,
            vote_percentage: votePercentage,
            average_peer_rating: averagePeerRating,
            peer_rating_out_of_20: peerRatingOutOf20,
            total_rating_result: totalRatingResult,
            weighted_rating: weightedRating,
            total_weighted_result: totalWeightedResult,
            final_score: round2(hasManagerRating ? totalWeightedResult : totalRatingResult),
            score_type: hasManagerRating ? 'total_weighted_result' : 'total_rating_result'
        };
    });

    // Phase 1: rank managers and staff together within each department
    const byDepartment = {};
    for (const row of rows) {
        (byDepartment[row.department] ||= []).push(row);
    }
    for (const deptRows of Object.values(byDepartment)) {
        deptRows.sort((a, b) => b.final_score - a.final_score);
        deptRows.forEach((row, index) => { row.department_rank = index + 1; });
    }

    // Phase 2 and 3: department top performers ranked against each other, up to the open quota
    const quotaLimit = quota?.quota_limit || DEFAULT_QUOTA_LIMIT;
    const currentAllocation = quota?.current_allocation || 0;
    const availableSlots = Math.max(0, quotaLimit - currentAllocation);
    Object.values(byDepartment)
        .map(deptRows => deptRows[0])
        .sort((a, b) => b.final_score - a.final_score)
        .slice(0, availableSlots)
        .forEach((row, index) => { row.system_rank = index + 1; });

    const ordered = Object.keys(byDepartment)
        .sort((a, b) => a.localeCompare(b))
        .flatMap(department => byDepartment[department]);

    return {
        chief_id: chief.employee_id,
        chief_name: `${chief.first_name} ${chief.last_name}`,
        position: chief.position,
        quota_limit: quotaLimit,
        current_allocation: currentAllocation,
        approved: approvals
            .filter(a => a.approval_status === 'approved')
            .sort((a, b) => (a.ranking_position || 0) - (b.ranking_position || 0))
            .map(a => ({
                employee_id: a.employee_id,
                name: a.employee_name,
                department: a.department,
                position: a.position,
                final_score: a.final_score,
                ranking_position: a.ranking_position
            })),
        non_managerial: ordered.filter(row => !row.is_managerial),
        managerial: ordered.filter(row => row.is_managerial)
    };
};
