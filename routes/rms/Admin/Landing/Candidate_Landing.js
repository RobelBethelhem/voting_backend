import { Router, request } from "express";
import auth from "../../../../middleware/rms/auth.js";
import roleCheck from "../../../../middleware/rms/roleCheck.js";

import Candidate from "../../../../models/rms/Candidate.js"
import User from "../../../../models/rms/user.js"
import Manager from "../../../../models/rms/Manager.js"
import Director from "../../../../models/rms/Director.js"
import Chief from "../../../../models/rms/Chief.js"
import CandidateQualificationService from "../../../../services/candidateQualificationService.js";
import VotingPeriod from "../../../../models/rms/VotingPeriod.js";

const router = Router();

router.get('/get_candidate', auth, roleCheck(["admin"]), async(req,res,next)=>{
  console.log("I am in the get_candidate")
    
    const getUser = await req.user;
    const id = getUser._id;
    const specific_user = await User.findOne({ _id: id });
    const user = { ...specific_user._doc };
    delete user._id;
    delete user.__v;
    delete user.password;


    var template = {
        id: '',
        employee_id: '',
        first_name: '',
        last_name: '',
        department: '',
        position: '',
        performance_appraisal_score: '',
        registered_By: '',
        Created_At: '',
        Updated_At: '',
        Updated_By: '',
      }

      var dataa = await Candidate.find();

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

      res.json(sendUsers);

})

router.get('/get_candidate_by_department', auth, async(req, res, next) => {
    try {
        console.log("Getting candidates by department for logged-in user");

        const getUser = req.user;
        const userId = getUser._id;
        const userRole = getUser.roles?.[0] || 'user';

        console.log(`Looking up user ${userId} with role: ${userRole}`);

        // Search for user across all models to get their department
        let userDepartment = null;
        let foundUser = null;

        const userModels = [
            { model: Chief, name: 'Chief' },
            { model: Director, name: 'Director' },
            { model: Manager, name: 'Manager' },
            { model: User, name: 'User' }
        ];

        // Find user in appropriate model based on their role or search all models
        for (const { model, name } of userModels) {
            try {
                foundUser = await model.findById(userId).select('department employee_id').lean();
                if (foundUser) {
                    userDepartment = foundUser.department;
                    console.log(`✅ User found in ${name} model, department: ${userDepartment}`);
                    break;
                }
            } catch (error) {
                console.log(`⚠️ Error searching ${name} model:`, error.message);
                continue;
            }
        }

        if (!userDepartment) {
            return res.status(404).json({
                error: true,
                message: "User department not found. Cannot retrieve candidates."
            });
        }

        // Get candidates from the same department, only active ones
        const candidates = await Candidate.find({
            department: userDepartment,
            status: true
        })
        .select('employee_id first_name last_name department position performance_appraisal_score')
        .sort({ performance_appraisal_score: -1, last_name: 1 }) // Sort by score desc, then name
        .lean();

        console.log(`Found ${candidates.length} candidates in department: ${userDepartment}`);

        // Security: Filter out potential XSS content
        const sanitizedCandidates = candidates.map(candidate => {
            const sanitized = {};
            for (const [key, value] of Object.entries(candidate)) {
                if (typeof value === 'string') {
                    // Check for potential XSS content
                    const hasScriptContent = value.includes('script') || value.includes('iframe') ||
                                           value.includes('<') || value.includes('>') || value.includes('alert');
                    if (!hasScriptContent) {
                        sanitized[key] = value;
                    }
                } else {
                    sanitized[key] = value;
                }
            }
            return {
                id: sanitized._id.toString(),
                employee_id: sanitized.employee_id,
                first_name: sanitized.first_name,
                last_name: sanitized.last_name,
                department: sanitized.department,
                position: sanitized.position,
                performance_appraisal_score: sanitized.performance_appraisal_score || 0
            };
        }).filter(candidate => candidate.first_name && candidate.last_name); // Only complete records

        const response = {
            error: false,
            data: sanitizedCandidates,
            meta: {
                totalRowCount: sanitizedCandidates.length,
                userDepartment: userDepartment,
                message: `Candidates from ${userDepartment} department`
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error("Error in get_candidate_by_department:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

router.get('/get_candidate_by_department_old', auth, async(req,res,next) =>{

  console.log("I am in the get_candidate")
    
    const getUser = await req.user;
    const id = getUser._id;
    const specific_user = await User.findOne({ _id: id });
    const user = { ...specific_user._doc };
    delete user._id;
    delete user.__v;
    delete user.password;


    var template = {
        id: '',
        first_name: '',
        last_name: '',
        employee_id: '',
      }
      var newObj = [];
      if(!user.status){
        var dataa = await Candidate.find({department: user.department, });

         
       newObj = dataa.map(item => {
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
      }
     


      res.json(newObj);

})


export default router;
