import {Router} from "express";
import User from "../../models/rms/User.js";
import Candidate from "../../models/rms/Candidate.js"
import mongoose from 'mongoose';
import auth from "../../middleware/rms/auth.js";
import roleCheck from "../../middleware/rms/roleCheck.js";
import { validationResult } from "express-validator";
import * as XLSX from 'xlsx';
import multer from "multer";
import Game from "../../models/rms/Game.js";
import fs from 'fs';



const router = Router();
const upload = multer({ dest: 'uploads/' });
// Validation middleware
const validateExcelUpload = (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    next();
  };

  router.post('/candidate_excel_upload', auth, roleCheck(["admin"]), upload.single('file'), validateExcelUpload, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(400).json({ error: true, message: "Requester not found" });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Read the file
        const fileBuffer = fs.readFileSync(req.file.path);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Validate Excel format
        const requiredHeaders = ['employee_id', 'first_name', 'last_name', 'department', 'position'];
        const headers = Object.keys(jsonData[0]);
        const isValidFormat = requiredHeaders.every(header => headers.includes(header));

        if (!isValidFormat) {
            return res.status(400).json({ message: 'Invalid Excel format' });
        }

        // Add registered_By field to each candidate
        const candidatesWithRegisteredBy = jsonData.map(candidate => ({
            ...candidate,
            registered_By: `${user.first_name} ${user.last_name}`,
            Created_At: new Date()
        }));

        // Process and save data to MongoDB
        const savedCandidates = await Candidate.insertMany(candidatesWithRegisteredBy);

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        res.status(200).json({
            message: 'Excel file imported successfully',
            savedCandidates: savedCandidates.length,
        });
    } catch (e) {
        console.log("Error", e);
        res.status(500).json({ message: 'Error processing Excel file', error: e.message });
    }
});

router.post('/employee_excel_upload', auth, roleCheck(["admin"]), upload.single('file'), validateExcelUpload, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(400).json({ error: true, message: "Requester not found" });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Read the file
        const fileBuffer = fs.readFileSync(req.file.path);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const requiredHeaders = ['first_name', 'last_name', 'employee_id', 'user', 'email', 'position', 'department', 'roles'];
        const headers = Object.keys(jsonData[0]);
        const isValidFormat = requiredHeaders.every(header => headers.includes(header));

        if (!isValidFormat) {
            return res.status(400).json({ message: 'Invalid Excel format' });
        }

        const employeesWithRegisteredBy = jsonData.map(employee => ({
            ...employee,
            registered_By: `${user.first_name} ${user.last_name}`,
            Created_At: new Date()
        }));

        const savedEmployees = await User.insertMany(employeesWithRegisteredBy);

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        res.status(200).json({
            message: 'Excel file imported successfully',
            savedEmployees: savedEmployees.length,
        });
    } catch (e) {
        console.log("Error", e);
        res.status(500).json({ message: 'Error processing Excel file', error: e.message });
    }
});

router.post('/game_score', auth,roleCheck(["admin", "user"]), async(req,res)=>{
    try {
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(400).json({ error: true, message: "Requester not found" });
        }
        const {first_name,last_name,employee_id,department,position} = user;
        
        const saveToDB = {
            gamer_first_name: first_name,
            gamer_last_name: last_name,
            gamer_emp_id: employee_id,
            gamer_position: position,
            gamer_department: department,
            score: req.body.score
        }

       const DB = new Game(saveToDB);
       await DB.save()

    }
    catch(e){
        console.log("Error", e);
        res.status(500).json({ message: 'Error processing Excel file', error: e.message });
    }
   
} )


 export default router;

