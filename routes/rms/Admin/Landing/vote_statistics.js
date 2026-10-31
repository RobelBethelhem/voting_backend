import { Router, request } from "express";
import auth from "../../../../middleware/rms/auth.js";
import roleCheck from "../../../../middleware/rms/roleCheck.js";

import Vote from "../../../../models/rms/Vote.js"
import User from "../../../../models/rms/User.js"
import EvaluationCriteria from "../../../../models/rms/EvaluationCriteria.js"
import ManagerialRating from "../../../../models/rms/ManagerialRating.js"
import { currentFiscalYearFilter, fiscalYearFilter, isClosed, withFiscalYear } from "../../../../utils/fiscalYear.js";

const router = Router();

// Criteria names the old fixed Vote fields were saved under
const LEGACY_VOTE_FIELDS = {
  Dedication: 'Dedication',
  Quality_of_Work: 'Quality of Work',
  Collaboration_Or_Team_Work: 'Collaboration/Team Work',
  Independence: 'Independence',
  Customer_Service: 'Customer Service',
  Time_Mgt: 'Time Management',
  Proper_Office_Attire_and_Dress_Code: 'Office Attire & Dress Code',
  Flexibility: 'Flexibility',
}

// One table column per criterion: the active ones for the category, plus any
// no-longer-active criteria that saved ratings still refer to. A closed fiscal year only
// shows the criteria its ratings used.
const buildCriteriaColumns = async (category, savedRatings, includeActive = true) => {
  const active = includeActive
    ? await EvaluationCriteria.find({ category, is_active: true }).sort({ created_at: 1 }).lean()
    : [];
  const columns = active.map(c => ({ key: `kpi_${c._id}`, name: c.criteria_name, weight: c.weight }));
  for (const r of savedRatings) {
    const key = `kpi_${r.criteria_id}`;
    if (!columns.some(c => c.key === key)) {
      columns.push({ key, name: r.criteria_name, weight: r.weight });
    }
  }
  return columns;
}

const criteriaValues = (criteriaRatings, columns) => {
  const values = {};
  for (const c of columns) values[c.key] = '';
  for (const r of criteriaRatings) values[`kpi_${r.criteria_id}`] = r.rating;
  return values;
}

const peerVoteValues = (vote, columns) => {
  if (vote.criteria_ratings && vote.criteria_ratings.length > 0) {
    return criteriaValues(vote.criteria_ratings, columns);
  }
  // Older votes only kept the fixed fields. Ratings start at 1, so a 0 there
  // means that criterion was not recorded and is left blank.
  const values = criteriaValues([], columns);
  for (const [field, name] of Object.entries(LEGACY_VOTE_FIELDS)) {
    const column = columns.find(c => c.name === name);
    if (column && vote[field]) values[column.key] = vote[field];
  }
  return values;
}

// ?fiscal_year=<id> (default: the current fiscal year)
router.get('/get_vote_stastics', auth, roleCheck(["admin"]), withFiscalYear, async(req,res,next)=>{
  console.log("I am in the landing get_vote_stastics")
    
    const getUser = await req.user;
    const id = getUser._id;
    const specific_user = await User.findOne({ _id: id });
    const user = { ...specific_user._doc };
    delete user._id;
    delete user.__v;
    delete user.password;


    var template = {
        id: '',

        voter_first_name: '',
        voter_last_name: '',
        voter_emp_id: '',

        voter_position: '',
        voter_department: '',

        candidate_first_name: '',
        candidate_last_name: '',
        candidate_emp_id: '',

        candidate_position: '',
        candidate_department: '',

        Total_Weight: '',
        Accrue_Weight: '',
        TimeStamp: '',
      }

      var dataa = await Vote.find(fiscalYearFilter(req.fiscalYear)).lean();
      const criteriaColumns = await buildCriteriaColumns('peer', dataa.flatMap(v => v.criteria_ratings || []), !isClosed(req.fiscalYear));

      var newObj = dataa.map(item => {
        var { _id, __v, criteria_ratings, ...rest } = item;
        const hasScriptProperty = Object.values(rest).some(propValue => typeof propValue === 'string' && (propValue.includes('script') || propValue.includes('iframe') || propValue.includes('<') || propValue.includes('>') || propValue.includes('alert')));
        if (!hasScriptProperty) {
          return { ...template, id: _id.toString(), ...rest, ...peerVoteValues(item, criteriaColumns) };
        }
        return null;
      }).filter(Boolean);


      const sendUsers = {};
      const meta = {};
      sendUsers.data = newObj;
      meta.totalRowCount = dataa.length;
      meta.criteria = criteriaColumns;
      sendUsers.meta = meta;

      res.json(sendUsers);

})

// Ratings directors give: category is non_managerial_staff (staff) or managerial_staff (managers).
// ?fiscal_year=<id> (default: the current fiscal year)
router.get('/get_director_ratings', auth, roleCheck(["admin"]), withFiscalYear, async (req, res) => {
  try {
    const { category } = req.query;
    if (!['non_managerial_staff', 'managerial_staff'].includes(category)) {
      return res.status(400).json({ error: true, message: "Invalid category" });
    }

    const ratings = await ManagerialRating.find({ rating_category: category, ...fiscalYearFilter(req.fiscalYear) }).sort({ timestamp: -1 }).lean();
    const criteriaColumns = await buildCriteriaColumns(category, ratings.flatMap(r => r.criteria_ratings || []), !isClosed(req.fiscalYear));

    const data = ratings.map(r => ({
      id: r._id.toString(),
      rater_first_name: r.rater_first_name,
      rater_last_name: r.rater_last_name,
      rater_emp_id: r.rater_emp_id,
      rater_position: r.rater_position,
      rater_department: r.rater_department,
      rater_role: r.rater_role,
      ratee_first_name: r.ratee_first_name,
      ratee_last_name: r.ratee_last_name,
      ratee_emp_id: r.ratee_emp_id,
      ratee_position: r.ratee_position,
      ratee_department: r.ratee_department,
      ...criteriaValues(r.criteria_ratings || [], criteriaColumns),
      total_weighted_score: r.total_weighted_score,
      max_possible_score: r.max_possible_score,
      percentage_score: r.percentage_score,
      evaluation_period: r.evaluation_period,
      timestamp: r.timestamp,
    }));

    res.json({ data, meta: { totalRowCount: data.length, criteria: criteriaColumns } });
  }
  catch (e) {
    console.log("Error", e);
    res.status(500).json({ error: true, message: "Could not load director ratings" });
  }
})

router.get('/get_vote_stasticss', auth, roleCheck(["admin"]), async(req,res,next)=>{
  console.log("I am in the landing get_vote_stastics")
    
    const getUser = await req.user;
    const id = getUser._id;
    const specific_user = await User.findOne({ _id: id });
    const user = { ...specific_user._doc };
    delete user._id;
    delete user.__v;
    delete user.password;


    var template = {
        id: '',

        voter_first_name: '',
        voter_last_name: '',
        voter_emp_id: '',

        voter_position: '',
        voter_department: '',

        candidate_first_name: '',
        candidate_last_name: '',
        candidate_emp_id: '',

        candidate_position: '',
        candidate_department: '',

        Dedication: '',
        Quality_of_Work: '',
        Collaboration_Or_Team_Work: '',
        Independence: '',
        Customer_Service: '',
        Time_Mgt: '',
        Proper_Office_Attire_and_Dress_Code: '',
        Flexibility: '',
        Total_Weight: '',
        Accrue_Weight: '',
        TimeStamp: '',
      }

      // The older admin dashboard shows the current fiscal year
      var dataa = await Vote.find(await currentFiscalYearFilter());

      var newObj = dataa.map(item => {
        var { _id, __v, ...rest } = item._doc;
        const hasScriptProperty = Object.values(rest).some(propValue => typeof propValue === 'string' && (propValue.includes('script') || propValue.includes('iframe') || propValue.includes('<') || propValue.includes('>') || propValue.includes('alert')));
        if (!hasScriptProperty) {
          return { ...template, id: _id.toString(), ...rest };
        }
        return null;
      }).filter(Boolean); 

     
      const sendUsers = {};
      const meta = {};
      sendUsers.data = newObj;
      meta.totalRowCount = dataa.length;
      sendUsers.meta = meta;

      res.json(newObj);

})


export default router;
