import { Router, request } from "express";
import auth from "../../../../middleware/rms/auth.js";
import roleCheck from "../../../../middleware/rms/roleCheck.js";

import Candidate from "../../../../models/rms/Candidate.js"
import User from "../../../../models/rms/User.js"

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

router.get('/get_candidate_by_department', auth, roleCheck(["user","admin"]), async(req,res,next) =>{

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
