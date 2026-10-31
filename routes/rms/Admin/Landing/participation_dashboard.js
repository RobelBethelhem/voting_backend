import { Router } from "express";
import auth from "../../../../middleware/rms/auth.js";
import roleCheck from "../../../../middleware/rms/roleCheck.js";

import User from "../../../../models/rms/user.js";
import Candidate from "../../../../models/rms/Candidate.js";
import Vote from "../../../../models/rms/Vote.js";
import Manager from "../../../../models/rms/Manager.js";
import Director from "../../../../models/rms/Director.js";
import Chief from "../../../../models/rms/Chief.js";
import Department from "../../../../models/rms/Department.js";
import ManagerialRating from "../../../../models/rms/ManagerialRating.js";
import FiscalYearSnapshot from "../../../../models/rms/FiscalYearSnapshot.js";
import { fiscalYearFilter, isClosed, withFiscalYear } from "../../../../utils/fiscalYear.js";
import { getVotingPeriodFor } from "../../../../utils/votingPeriod.js";

const router = Router();

const MANAGERIAL_ROLES = ['manager', 'director', 'chief'];
// Managers below this appraisal score are not listed for directors to rate
// (/api/managerial-rating/managers-under-director)
const MIN_MANAGER_APPRAISAL = 90.5;

const fullName = (person) => (person ? `${person.first_name} ${person.last_name}` : '');
const byEmployeeId = (people) => new Map(people.map(p => [p.employee_id, p]));

// Who has and has not taken part in a fiscal year: peer votes by eligible staff, and director
// ratings of the managers and non-managerial staff each director is asked to rate. Rows are
// flat so the dashboard can filter and total them by chief, director and department.
export const buildParticipation = async (fiscalYear) => {
    const inYear = fiscalYearFilter(fiscalYear);
    const [users, candidates, votes, managers, directors, chiefs, departments, ratings, votingPeriod] = await Promise.all([
      User.find({ status: true })
        .select('employee_id first_name last_name email position department job_grade level roles manager_id director_id chief_id')
        .lean(),
      Candidate.find({ status: true })
        .select('employee_id first_name last_name position department performance_appraisal_score manager_id roles')
        .lean(),
      Vote.find(inYear).select('voter_emp_id candidate_emp_id TimeStamp').lean(),
      Manager.find().select('employee_id first_name last_name position director_id status performance_appraisal_score').lean(),
      Director.find().select('employee_id first_name last_name position chief_id status').lean(),
      Chief.find().select('employee_id first_name last_name position status').lean(),
      Department.find({ is_active: true }).select('department_name manager_id director_id chief_id').lean(),
      ManagerialRating.find(inYear).select('rater_emp_id ratee_emp_id rating_category timestamp').lean(),
      getVotingPeriodFor(fiscalYear)
    ]);

    const managerById = byEmployeeId(managers);
    const directorById = byEmployeeId(directors);
    const chiefById = byEmployeeId(chiefs);
    const departmentByName = new Map(departments.map(d => [d.department_name, d]));
    const activeDirectorIds = new Set(directors.filter(d => d.status).map(d => d.employee_id));

    // Manager -> director -> chief, from the person's own links, then their manager's
    // and director's, then the department's hierarchy mapping
    const hierarchyFor = ({ department, manager_id, director_id, chief_id }) => {
      const dept = departmentByName.get(department);
      const manager = managerById.get(manager_id || dept?.manager_id);
      const director = directorById.get(director_id || manager?.director_id || dept?.director_id);
      const chief = chiefById.get(chief_id || director?.chief_id || dept?.chief_id);
      return {
        manager_name: fullName(manager),
        director_id: director?.employee_id || '',
        director_name: fullName(director),
        chief_id: chief?.employee_id || '',
        chief_name: fullName(chief)
      };
    };

    // --- Peer voting: non-managerial staff in a department that has candidates ---
    const candidatesPerDepartment = {};
    for (const c of candidates) {
      candidatesPerDepartment[c.department] = (candidatesPerDepartment[c.department] || 0) + 1;
    }

    const votedAt = new Map();
    for (const v of votes) {
      if (!votedAt.has(v.voter_emp_id) || v.TimeStamp < votedAt.get(v.voter_emp_id)) {
        votedAt.set(v.voter_emp_id, v.TimeStamp);
      }
    }

    const staff = users.filter(u =>
      !MANAGERIAL_ROLES.includes(u.level) &&
      !(u.roles || []).some(role => MANAGERIAL_ROLES.includes(role) || role === 'admin')
    );

    const voters = [];
    let staffWithoutCandidates = 0;
    for (const u of staff) {
      if (!candidatesPerDepartment[u.department]) {
        staffWithoutCandidates++;
        continue;
      }
      voters.push({
        employee_id: u.employee_id,
        name: fullName(u),
        email: u.email || '',
        position: u.position || '',
        job_grade: u.job_grade || '',
        department: u.department,
        candidates_in_department: candidatesPerDepartment[u.department],
        ...hierarchyFor(u),
        voted: votedAt.has(u.employee_id),
        voted_at: votedAt.get(u.employee_id) || null
      });
    }

    // --- Director ratings: the lists each director's Managerial Rating page shows ---
    const ratedAt = new Map(ratings.map(r => [`${r.rater_emp_id}|${r.ratee_emp_id}|${r.rating_category}`, r.timestamp]));
    const rateableManagerIds = new Set();
    const rateableStaffIds = new Set();
    const directorRatings = [];
    const directorsWithoutManagers = [];

    for (const director of directors.filter(d => d.status)) {
      const chief = chiefById.get(director.chief_id);
      const raterInfo = {
        director_id: director.employee_id,
        director_name: fullName(director),
        director_position: director.position || '',
        chief_id: chief?.employee_id || '',
        chief_name: fullName(chief)
      };
      const addItem = (ratee, category, department) => {
        const key = `${director.employee_id}|${ratee.employee_id}|${category}`;
        directorRatings.push({
          ...raterInfo,
          ratee_id: ratee.employee_id,
          ratee_name: fullName(ratee),
          ratee_position: ratee.position || '',
          ratee_department: department,
          rating_category: category,
          performance_appraisal_score: ratee.performance_appraisal_score || 0,
          rated: ratedAt.has(key),
          rated_at: ratedAt.get(key) || null
        });
      };

      // /managers-under-director
      const directorManagers = managers.filter(m => m.director_id === director.employee_id && m.status);
      if (directorManagers.length === 0) {
        directorsWithoutManagers.push(raterInfo);
        continue;
      }
      for (const m of directorManagers.filter(m => (m.performance_appraisal_score || 0) >= MIN_MANAGER_APPRAISAL)) {
        rateableManagerIds.add(m.employee_id);
        const dept = departments.find(d => d.manager_id === m.employee_id);
        addItem(m, 'managerial_staff', dept?.department_name || 'Not Assigned');
      }

      // /departments-under-director then /staff-in-department: candidates managed by the
      // director's managers, in departments where those managers have staff
      const managerIds = new Set(directorManagers.map(m => m.employee_id));
      const staffDepartments = new Set(users.filter(u => managerIds.has(u.manager_id)).map(u => u.department));
      for (const c of candidates.filter(c => managerIds.has(c.manager_id) && staffDepartments.has(c.department))) {
        rateableStaffIds.add(c.employee_id);
        addItem(c, 'non_managerial_staff', c.department);
      }
    }

    // --- Not covered: qualifying people no director is asked to rate, and why ---
    const managerGapReason = (m) => {
      if (!m.director_id) return 'Manager not linked to a director';
      if (!activeDirectorIds.has(m.director_id)) return "Manager's director not found or inactive";
      return 'Not listed for any director';
    };
    const staffGapReason = (c) => {
      const manager = managerById.get(c.manager_id);
      if (!c.manager_id) return 'No manager assigned';
      if (!manager || !manager.status) return 'Manager not found or inactive';
      if (!manager.director_id) return `Manager ${fullName(manager)} not linked to a director`;
      if (!activeDirectorIds.has(manager.director_id)) return `Director of ${fullName(manager)} not found or inactive`;
      return "Department differs from the manager's staff";
    };

    const notCovered = [
      ...managers
        .filter(m => m.status && (m.performance_appraisal_score || 0) >= MIN_MANAGER_APPRAISAL && !rateableManagerIds.has(m.employee_id))
        .map(m => {
          const dept = departments.find(d => d.manager_id === m.employee_id);
          return {
            employee_id: m.employee_id,
            name: fullName(m),
            position: m.position || '',
            department: dept?.department_name || 'Not Assigned',
            rating_category: 'managerial_staff',
            performance_appraisal_score: m.performance_appraisal_score || 0,
            ...hierarchyFor({ department: dept?.department_name, director_id: m.director_id }),
            reason: managerGapReason(m)
          };
        }),
      ...candidates
        .filter(c => !(c.roles || []).includes('admin') && !rateableStaffIds.has(c.employee_id))
        .map(c => ({
          employee_id: c.employee_id,
          name: fullName(c),
          position: c.position || '',
          department: c.department,
          rating_category: 'non_managerial_staff',
          performance_appraisal_score: c.performance_appraisal_score || 0,
          ...hierarchyFor({ department: c.department, manager_id: c.manager_id }),
          reason: staffGapReason(c)
        }))
    ];

    return {
        generated_at: new Date(),
        fiscal_year: fiscalYear,
        voting_period: votingPeriod
          ? {
              period_id: votingPeriod.period_id,
              period_name: votingPeriod.period_name,
              start_date: votingPeriod.start_date,
              end_date: votingPeriod.end_date
            }
          : null,
        voters,
        staff_without_candidates: staffWithoutCandidates,
        director_ratings: directorRatings,
        directors_without_managers: directorsWithoutManagers,
        not_covered: notCovered
    };
};

// ?fiscal_year=<id> (default: the current fiscal year). A closed year is shown as it stood
// when it closed.
router.get('/participation-dashboard', auth, roleCheck(["admin"]), withFiscalYear, async (req, res) => {
  try {
    if (isClosed(req.fiscalYear)) {
      const snapshot = await FiscalYearSnapshot.findOne({
        fiscal_year: req.fiscalYear._id,
        kind: 'participation'
      }).lean();
      if (snapshot) {
        return res.status(200).json({
          error: false,
          data: { ...snapshot.data, fiscal_year: req.fiscalYear, snapshot_at: snapshot.created_at }
        });
      }
    }

    res.status(200).json({
      error: false,
      data: await buildParticipation(req.fiscalYear)
    });

  } catch (error) {
    console.error("Error building participation dashboard:", error);
    res.status(500).json({
      error: true,
      message: "Could not load participation dashboard"
    });
  }
});

export default router;
