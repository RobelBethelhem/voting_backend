import {Router} from "express";
import User from "../../models/rms/user.js";
import bcrypt from "bcrypt";
import {signUpBodyValidation , loginBodyValidation} from "../../utils/rms/validationSchema.js"
import generateTokens from "../../utils/rms/generateTokens.js";
import UsedToken from "../../models/rms/UsedToken.js";
import jwt from "jsonwebtoken";
// import {getAllUsers,authentication} from "../../utils/rms/ldapconnect.js" // Commented out for testing

import mongoose from 'mongoose';
import { fiscalYearFilter, withFiscalYear } from "../../utils/fiscalYear.js";


const router = Router();

// Helper function to get hierarchy for a department with recursive lookup
async function getHierarchyForDepartment(departmentName) {
    try {
        console.log('Getting hierarchy for department:', departmentName);

        // Import all models
        const Department = (await import('../../models/rms/Department.js')).default;
        const Manager = (await import('../../models/rms/Manager.js')).default;
        const Director = (await import('../../models/rms/Director.js')).default;
        const Chief = (await import('../../models/rms/Chief.js')).default;

        let manager_id = '';
        let director_id = '';
        let chief_id = '';

        const dept = await Department.findOne({ department_name: departmentName });
        if (dept) {
            console.log('Found department:', {
                name: dept.department_name,
                code: dept.department_code,
                manager_id: dept.manager_id,
                director_id: dept.director_id,
                chief_id: dept.chief_id
            });

            // Step 1: Get manager_id from department
            manager_id = dept.manager_id || '';
            console.log('Step 1 - Manager ID from department:', manager_id);

            // Step 2: If we have manager_id, find the manager and get director_id
            if (manager_id) {
                const manager = await Manager.findOne({ employee_id: manager_id });
                console.log('Step 2 - Found manager record:', manager ? {
                    employee_id: manager.employee_id,
                    director_id: manager.director_id,
                    department: manager.department
                } : 'Not found');

                if (manager && manager.director_id) {
                    director_id = manager.director_id;
                    console.log('Step 2 - Director ID from manager:', director_id);

                    // Step 3: If we have director_id, find the director and get chief_id
                    const director = await Director.findOne({ employee_id: director_id });
                    console.log('Step 3 - Found director record:', director ? {
                        employee_id: director.employee_id,
                        chief_id: director.chief_id,
                        department: director.department
                    } : 'Not found');

                    if (director && director.chief_id) {
                        chief_id = director.chief_id;
                        console.log('Step 3 - Chief ID from director:', chief_id);
                    } else {
                        console.log('Step 3 - No chief_id found in director record');
                    }
                } else {
                    console.log('Step 2 - No director_id found in manager record');
                }
            } else {
                console.log('Step 1 - No manager_id found in department');
            }

            // Fallback: If department doesn't have manager_id, try to find hierarchy records by department name
            if (!manager_id) {
                console.log('Fallback: Searching for hierarchy by department name...');

                const manager = await Manager.findOne({ department: departmentName });
                if (manager) {
                    manager_id = manager.employee_id;
                    console.log('Fallback - Found manager by department:', manager_id);

                    if (manager.director_id) {
                        director_id = manager.director_id;
                        console.log('Fallback - Director ID from manager:', director_id);

                        const director = await Director.findOne({ employee_id: director_id });
                        if (director && director.chief_id) {
                            chief_id = director.chief_id;
                            console.log('Fallback - Chief ID from director:', chief_id);
                        }
                    }
                }
            }

            console.log('Final recursive hierarchy mapping:', { manager_id, director_id, chief_id });
        } else {
            console.log('Department not found:', departmentName);
        }

        return { manager_id, director_id, chief_id };
    } catch (error) {
        console.error('Error during recursive hierarchy lookup:', error);
        return { manager_id: '', director_id: '', chief_id: '' };
    }
}

//signup

router.post("/verify-token", async(req,res)=>{
    try{
        const token = req.header("x-access-token");
        const accessToken = process.env.ACCESS_TOKEN_PRIVATE_KEY
        if(!token){
            res.status(401).json({error:true, message:"Error finding access token"})
        }
        const isUsedToken = await UsedToken.find({token:token});
        if(isUsedToken.length > 0)
            res.status(401).json({error:true, message:"Used Token"})
        
        jwt.verify(token,accessToken);
      

        res.status(200).json({error: false, message: "Correct"})
    }
    catch (err){
        console.error("Error: ", err);
        res.status(500).json({error:true, message: "Internal Server Error"});
    }
})

router.post("/signUp", async(req,res)=>{
    try{
        console.log("Received signUp request:", req.body);

        delete req.body.id;

        // Set default password if not provided
        if (!req.body.password) {
            req.body.password = "@Test1234";
        }

        // Handle roles properly
        if (req.body.roles && !Array.isArray(req.body.roles)) {
            req.body.roles = [req.body.roles];
        } else if (!req.body.roles) {
            req.body.roles = ["user"];  // Default role
        }

        const {site_id} = req.body;

        // Site validation only if site_id is provided
        if (site_id) {
            if (!mongoose.Types.ObjectId.isValid(site_id)) {
                return res.status(400).json({error: true, message: "Invalid site_id format"});
            }

            const Site = (await import('../../models/rms/Site.js')).default;
            const site = await Site.findOne({_id: site_id});

            if(!site) {
                return res.status(400).json({error: true, message: "Error finding Site with Given SiteID"});
            }

            // Update req.body with ObjectId
            delete req.body.site_id;
            req.body.site_id = new mongoose.Types.ObjectId(site_id);
        }


       





        console.log("hhhhhhhhhhh", req.body);
        // Skip validation for professional employee registration
        // const {error} = signUpBodyValidation(req.body);
        // if(error)
        //     return res.status(400).json({error:true, message:error.details[0].message});

        // site_id already handled above if provided
        
        const user = await User.findOne({email: req.body.email});
        if(user)
            return res.status(400).json({error:true, message:"User with given email already exist"});

        // Get department hierarchy if department is provided
        let manager_id = '';
        let director_id = '';
        let chief_id = '';

        if (req.body.department) {
            console.log('Getting hierarchy for department:', req.body.department);
            const hierarchy = await getHierarchyForDepartment(req.body.department);
            manager_id = hierarchy.manager_id;
            director_id = hierarchy.director_id;
            chief_id = hierarchy.chief_id;
            console.log('Assigned hierarchy:', { manager_id, director_id, chief_id });
        }

        const salt = await bcrypt.genSalt(Number(process.env.SALT));
        const hashPassword = await bcrypt.hash(req.body.password, salt);

        // Create user with hierarchy
        const userData = {
            ...req.body,
            password: hashPassword,
            manager_id,
            director_id,
            chief_id
        };

        await new User(userData).save();
        
        res.status(201).json({error: false, message:"Account created Sucessfully"});
    }
    catch (e) {
        console.log(e)
        if (e.code === 11000 && e.keyPattern && e.keyPattern.city) {
          return res.status(400).json({ error: true, message: "A Site with this User already exists" });
        }
        if (e.name === 'BSONError' && e.message.includes('input must be a 24 character hex string')) {
          
          return res.status(400).json({ error: true, message: 'Invalid site_id' });
        }
        if (e instanceof mongoose.CastError && e.name === 'CastError') {
          return res.status(400).json({ error: true, message: 'Invalid site_id' });
        } 
        res.status(500).json({ error: true, message: "Internal Server Error" });
      }
});

//login
router.post("/login", async(req,res)=>{
    try{
       
       
      
      


        var {email, password } = req.body;
        if(email == "Robel.Asfaw@zemenbank.com"){
            const user = await User.findOne({email: req.body.email});
            if(!user)
                return res.status(401).json({error: true, message: "Invalid Email"})
    
            const verifiedPassword = await bcrypt.compare(
                req.body.password, user.password
            )
            if(!verifiedPassword)
                return res.status(401).json({error: true, message: "Invalid Password"})

            const isVote = user.status;
            console.log("isVoteisVoteisVoteisVoteisVoteisVote",isVote)
    
            //generate access and refresh token
            const {accessToken, refreshToken} = await generateTokens(user);
            res.status(200).json({error: false, accessToken, refreshToken, isVote:isVote, message: "Logged in Successfully"});
        }
        else{
            var userEmail;
            if (email.toLowerCase().includes('@zemenbank.com')) {
              email = email.replace('@zemenbank.com', '');
              userEmail = 'Zemenbank\\' + email.toLowerCase();
            }
            else{
              userEmail = 'Zemenbank\\' + email.toLowerCase();
            
            }
          
    
            const query = {
                $or: [
                  { email: { $regex: new RegExp(email, 'i') } },
                  { name: { $regex: new RegExp(email, 'i') } }
                ]
              };
    
              const {error} = loginBodyValidation(req.body);
              console.log("Error: ", error);
              if(error)
                  return res.status(400).json({error: true, message: error.details[0].message})
    
    
              const user = await User.findOne(query);
    
              if(user){
                (async () => {
                    try {
                      // const users = await authentication(userEmail, password); // Commented out for testing
                      const {accessToken, refreshToken} = await generateTokens(user);
                      
                      res.cookie('accessToken', accessToken,{
                        httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
                        secure: true, // Ensures the cookie is sent over HTTPS
                        sameSite: 'strict' // Helps prevent CSRF attacks
                      });
                      res.cookie('refreshToken', refreshToken,{
                        httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
                        secure: true, // Ensures the cookie is sent over HTTPS
                        sameSite: 'strict' // Helps prevent CSRF attacks
                      });
                      res.status(200).json({  error: false, accessToken, refreshToken, message: "Logged in Successfully" });
                    } catch (err) {
                      res.status(400).json({message: "Invalid email or Password"});
                    }
                  })();
                    
              }
              else{
                res.status(400).json({message: "Invalid email or Password"});
              }
    
    
    
    
    
            // const user = await User.findOne({email: req.body.email});
            // if(!user)
            //     return res.status(401).json({error: true, message: "Invalid Email"})
    
            // const verifiedPassword = await bcrypt.compare(
            //     req.body.password, user.password
            // )
            // if(!verifiedPassword)
            //     return res.status(401).json({error: true, message: "Invalid Password"})
    
            // //generate access and refresh token
            // const {accessToken, refreshToken} = await generateTokens(user);
            // res.status(200).json({error: false, accessToken, refreshToken, message: "Logged in Successfully"});
    
        }


      

    }
    catch(error){
        console.log("Error:", error);
        res.status(500).json({error:true, message: "Internal Server Error"});
    }
})

    


// ?fiscal_year=<id> (default: the current fiscal year)
router.get("/getUsers", withFiscalYear, async(req,res)=>{
    try{
       
        const sendUsers = {};
        const meta = {};
        const users = await User.find({ ...fiscalYearFilter(req.fiscalYear) });
        
        // Map over the users array to transform the data
        sendUsers.data = users.map((user) => ({
          id: user._id.toString(), // Convert ObjectId to string
          first_name: user.first_name,
          last_name: user.last_name,
          employee_id: user.employee_id,
          user: user.user,
          email: user.email,
          position: user.position,
          department: user.department,
          level: user.level,
          performance_appraisal_score: user.performance_appraisal_score,
          job_grade: user.job_grade,
          is_managerial: user.is_managerial,
          roles: user.roles,

        }));
        
        meta.totalRowCount = users.length;
        sendUsers.meta = meta;
        
    
        res.json(sendUsers);
       
    }
    catch (err){
        console.error(err);
        res.status(500).json({error:true, message: "Internal Server Error"});
    }
});


// editing the user
router.patch("/editUser", async(req,res)=>{
    try{
        console.log('Full request body:', req.body);

        const {id, department, username, user, level, ...otherFields} = req.body;

        // Check if ID is in otherFields
        const actualId = id || otherFields.id;

        console.log('Extracted values:', {
            id: actualId,
            department,
            username,
            user,
            level,
            otherFields
        });

        // Validate and convert ID to ObjectId if needed
        if (!actualId) {
            return res.status(400).json({error: true, message: "User ID is required"});
        }

        let userId;
        try {
            // Handle both string IDs and ObjectIds
            userId = mongoose.Types.ObjectId.isValid(actualId) ? new mongoose.Types.ObjectId(actualId) : actualId;
        } catch (error) {
            return res.status(400).json({error: true, message: "Invalid user ID format"});
        }

        console.log('Converted ID:', userId);

        // Find the current user to get existing values
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({error: true, message: "User not found"});
        }

        // Initialize hierarchy fields with current values
        let manager_id = currentUser.manager_id || '';
        let director_id = currentUser.director_id || '';
        let chief_id = currentUser.chief_id || '';

        // If department is being updated, recalculate hierarchy
        if (department && department !== currentUser.department) {
            console.log('Department being changed from', currentUser.department, 'to', department);

            const hierarchy = await getHierarchyForDepartment(department);
            manager_id = hierarchy.manager_id;
            director_id = hierarchy.director_id;
            chief_id = hierarchy.chief_id;
        }

        // Handle username updates (support both 'username' and 'user' fields)
        const usernameUpdate = {};
        if (username) {
            usernameUpdate.user = username;
            usernameUpdate.username = username;
        } else if (user) {
            usernameUpdate.user = user;
            usernameUpdate.username = user;
        }

        // Handle level changes and role updates
        let rolesUpdate = {};
        if (level && level !== currentUser.level) {
            let roles = ["user"];
            if (level === "chief") roles = ["chief", "user"];
            else if (level === "director") roles = ["director", "user"];
            else if (level === "manager") roles = ["manager", "user"];
            rolesUpdate.roles = roles;
            rolesUpdate.is_managerial = level !== "professional";
        }

        // Build update data
        const updatedData = {
            ...otherFields,
            ...usernameUpdate,
            ...rolesUpdate,
            ...(department && { department }), // Include department if provided
            ...(level && { level }), // Include level if provided
            manager_id,
            director_id,
            chief_id
        };

        // Remove undefined fields, but keep empty strings for hierarchy fields
        Object.keys(updatedData).forEach(key => {
            if (updatedData[key] === undefined) {
                delete updatedData[key];
            }
            // Keep empty strings for hierarchy fields as they indicate no hierarchy
            if (updatedData[key] === '' && !['manager_id', 'director_id', 'chief_id'].includes(key)) {
                delete updatedData[key];
            }
        });

        console.log('Final update data:', updatedData);
        console.log('Updating user with ID:', userId);

        const updatedUser = await User.findByIdAndUpdate(userId, updatedData, {
            new: true,
            runValidators: true
        }).select('-password'); // Don't return password field

        console.log('User updated successfully:', updatedUser ? `${updatedUser.first_name} ${updatedUser.last_name} (${updatedUser.employee_id})` : 'UPDATE FAILED');

        if (!updatedUser) {
            return res.status(500).json({error: true, message: "Failed to update user"});
        }

        res.status(200).json({error: false, message: "User Edited Successfully", data: updatedUser });
    }
    catch (error){
        console.error("Error updating user: ", error);

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({error: true, message: `User with this ${duplicateField} already exists`});
        } else {
            res.status(500).json({error: true, message: "Internal Server Error", details: error.message});
        }
    }
})



router.delete("/deleteUser", async(req,res)=>{
    try{
        const userId = req.body.id;
        const deletedUser = await User.findByIdAndDelete(userId)
        res.json({message: "User Deleted Successfuly", user: deletedUser})

    }
    catch (error){
        console.error("Error: ", error);
        res.status(500)
    }
})












// ===== CANDIDATE ENDPOINTS =====
// IMPORTANT: These must come BEFORE /:id route to avoid conflicts

// Get all candidates
router.get("/getCandidate", async(req, res) => {
    try {
        // Import the Candidate model
        const Candidate = (await import('../../models/rms/Candidate.js')).default;

        // Fetch all candidates
        const candidates = await Candidate.find({})
            .sort({ department: 1, first_name: 1 });

        // Format response to match expected structure
        const formattedCandidates = candidates.map(candidate => ({
            _id: candidate._id,
            employee_id: candidate.employee_id,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            department: candidate.department,
            position: candidate.position,
            performance_appraisal_score: candidate.performance_appraisal_score,
            manager_id: candidate.manager_id,
            director_id: candidate.director_id,
            chief_id: candidate.chief_id,
            registered_By: candidate.registered_By,
            Created_At: candidate.Created_At,
            Updated_At: candidate.Updated_At,
            Updated_By: candidate.Updated_By
        }));

        res.json({
            error: false,
            message: "Candidates fetched successfully",
            data: formattedCandidates
        });

    } catch (error) {
        console.error("Error fetching candidates:", error);
        res.status(500).json({
            error: true,
            message: "Failed to fetch candidates",
            details: error.message
        });
    }
});

// Edit candidate
router.patch("/editCandidate/", async(req, res) => {
    try {
        const { id, ...updateData } = req.body;

        if (!id) {
            return res.status(400).json({
                error: true,
                message: "Candidate ID is required"
            });
        }

        // Import the Candidate model
        const Candidate = (await import('../../models/rms/Candidate.js')).default;

        // Get current candidate to check if department changed
        const currentCandidate = await Candidate.findById(id);
        if (!currentCandidate) {
            return res.status(404).json({
                error: true,
                message: "Candidate not found"
            });
        }

        // Validate performance score if provided
        if (updateData.performance_appraisal_score !== undefined) {
            const score = parseFloat(updateData.performance_appraisal_score);
            if (isNaN(score) || score < 0 || score > 100) {
                return res.status(400).json({
                    error: true,
                    message: "Performance appraisal score must be between 0 and 100"
                });
            }
            updateData.performance_appraisal_score = score;
        }

        // Check if department changed and update hierarchy
        if (updateData.department && updateData.department !== currentCandidate.department) {
            console.log('🔄 DEPARTMENT CHANGE DETECTED:');
            console.log('   From:', currentCandidate.department);
            console.log('   To:', updateData.department);

            try {
                // Get new hierarchy using the same function as signUp
                console.log('📞 Calling getHierarchyForDepartment for:', updateData.department);
                const hierarchy = await getHierarchyForDepartment(updateData.department);

                console.log('✅ Hierarchy lookup result:', hierarchy);

                // Only update if we got valid hierarchy data
                if (hierarchy) {
                    updateData.manager_id = hierarchy.manager_id || '';
                    updateData.director_id = hierarchy.director_id || '';
                    updateData.chief_id = hierarchy.chief_id || '';

                    console.log('🏢 Updated hierarchy assigned:', {
                        manager_id: updateData.manager_id,
                        director_id: updateData.director_id,
                        chief_id: updateData.chief_id
                    });
                } else {
                    console.log('❌ No hierarchy returned from getHierarchyForDepartment');
                }
            } catch (error) {
                console.error('❌ Error getting hierarchy for department change:', error);
            }
        }

        // Add update metadata
        updateData.Updated_At = new Date();
        updateData.Updated_By = updateData.Updated_By || 'Admin';

        const updatedCandidate = await Candidate.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true
        });

        if (!updatedCandidate) {
            return res.status(404).json({
                error: true,
                message: "Candidate not found"
            });
        }

        res.json({
            error: false,
            message: "Candidate updated successfully",
            data: updatedCandidate
        });

    } catch (error) {
        console.error("Error updating candidate:", error);

        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyPattern)[0];
            res.status(400).json({
                error: true,
                message: `Candidate with this ${duplicateField} already exists`
            });
        } else {
            res.status(500).json({
                error: true,
                message: "Failed to update candidate",
                details: error.message
            });
        }
    }
});

// Delete candidate
router.delete("/deleteCandidate/:id", async(req, res) => {
    try {
        const candidateId = req.params.id;

        if (!candidateId) {
            return res.status(400).json({
                error: true,
                message: "Candidate ID is required"
            });
        }

        // Import the Candidate model
        const Candidate = (await import('../../models/rms/Candidate.js')).default;

        const deletedCandidate = await Candidate.findByIdAndDelete(candidateId);

        if (!deletedCandidate) {
            return res.status(404).json({
                error: true,
                message: "Candidate not found"
            });
        }

        res.json({
            error: false,
            message: "Candidate deleted successfully",
            data: deletedCandidate
        });

    } catch (error) {
        console.error("Error deleting candidate:", error);
        res.status(500).json({
            error: true,
            message: "Failed to delete candidate",
            details: error.message
        });
    }
});

router.get("/:id", async(req,res)=>{
    try{
        const userId = req.params.id;
        const user = await User.findById(userId);
        res.json(user)

    }
    catch (err){
        console.error(err);
        res.status(500).json({error: true, message: "Internal Server Error"});
    }
})



// router.delete("/:id", async(req,res)=>{
//     try{
//         console.log("In delete routekkkk")
//         const userId = req.params.id;
//         const deletedUser = await User.findByIdAndDelete(userId)
//         res.json({message: "User Deleted Successfuly", user: deletedUser})

//     }
//     catch (error){
//         console.error("Error: ", error);
//         res.status(500)
//     }
// })





router.post("/login", async(req,res)=>{
    try{
        const {error} = loginBodyValidation(req.body);
        console.log("error",error)
        if(error)
            return res.status(400).json({error:true, message:error.details[0].message});
        
        const user = await User.findOne({email: req.body.email});
        if(!user)
            return res.status(401).json({error:true, message: "Invalid email"});

        const verifiedPassword = await bcrypt.compare(
            req.body.password,
            user.password
        );

        if(!verifiedPassword)
            return res.status(401).json({error:true, message: "Inavlid password"});
          
        //generate access and refresh token  
        const {accessToken, refreshToken} = await generateTokens(user);

        res.status(200).json({  error: false, accessToken, refreshToken, message: "Logged in Successfully" });


    }
    catch (err){
        console.log(err);
        res.status(500).json({error:true, message: "Internal Server Error"});
    }
});




export default router;

