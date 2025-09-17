import {Router} from "express";
import User from "../../models/rms/User.js";
import bcrypt from "bcrypt";
import {signUpBodyValidation , loginBodyValidation} from "../../utils/rms/validationSchema.js"
import generateTokens from "../../utils/rms/generateTokens.js";
import UsedToken from "../../models/rms/UsedToken.js";
import jwt from "jsonwebtoken";
import {getAllUsers,authentication} from "../../utils/rms/ldapconnect.js"

import mongoose from 'mongoose';


const router = Router();

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
        delete req.body.id;
        req.body.password = "@Test1234";
        req.body.roles = [req.body.roles]
        const {site_id} = req.body

        if (!mongoose.Types.ObjectId.isValid(site_id)) {
            return res.status(400).json({error: true, message: "Invalid site_id format"});
        }

        const site = await Site.findOne({_id: site_id})

        if(!site)
            return res.status(400).json({error: true, message: "Error finding Site with Given SiteID"})


       





        console.log("hhhhhhhhhhh", req.body);
        const {error} = signUpBodyValidation(req.body);
        if(error)
            return res.status(400).json({error:true, message:error.details[0].message});

        delete req.body.site_id;
        req.body.site_id = new mongoose.Types.ObjectId(site_id);
        
        const user = await User.findOne({email: req.body.email});
        if(user)
            return res.status(400).json({error:true, message:"User with given email already exist"});
          
        const salt = await bcrypt.genSalt(Number(process.env.SALT));
        const hashPassword = await bcrypt.hash(req.body.password, salt);

        // await new User(req.body).save();
        await new User({ ...req.body, password: hashPassword}).save();
        
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
                      const users = await authentication(userEmail, password);
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

    


router.get("/getUsers", async(req,res)=>{
    try{
       
        const sendUsers = {};
        const meta = {};
        const users = await User.find();
        
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
        const {id, name, email, roles} = req.body;
      
        const updatedData = {
            name: name,
            email: email,
            roles: roles
        }
        const updatedUser = await User.findByIdAndUpdate(id,updatedData,{
            new: true
        })

        res.status(200).json({error: false, message: "User Edited Successfully", data:updatedUser });
        //res.json(updatedUser);
    }
    catch (error){
        console.error("Error: ", error);
        res.status(500).json({error: true, message: "Internal Server Error"});
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

