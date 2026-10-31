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
        const requiredHeaders = ['employee_id', 'first_name', 'last_name', 'department', 'position', 'performance_appraisal_score'];
        const headers = Object.keys(jsonData[0]);
        const isValidFormat = requiredHeaders.every(header => headers.includes(header));

        if (!isValidFormat) {
            return res.status(400).json({ message: 'Invalid Excel format. Required columns: employee_id, first_name, last_name, department, position, performance_appraisal_score' });
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

// Register new candidate
router.post('/register_candidate', auth, roleCheck(["admin"]), async(req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(400).json({ error: true, message: "Requester not found" });
        }

        const {
            employee_id,
            first_name,
            last_name,
            department,
            position,
            performance_appraisal_score
        } = req.body;

        // Validate required fields
        if (!employee_id || !first_name || !last_name || !department || !position || !performance_appraisal_score) {
            return res.status(400).json({ error: true, message: "All fields including performance appraisal score are required" });
        }

        // Validate performance score
        const score = parseFloat(performance_appraisal_score);
        if (isNaN(score) || score < 0 || score > 100) {
            return res.status(400).json({ error: true, message: "Performance appraisal score must be between 0 and 100" });
        }

        // Check if employee_id already exists
        const existingCandidate = await Candidate.findOne({ employee_id });
        if (existingCandidate) {
            return res.status(400).json({ error: true, message: "Employee ID already exists" });
        }

        // Create candidate
        const candidateData = {
            employee_id,
            first_name,
            last_name,
            department,
            position,
            performance_appraisal_score: score,
            registered_By: `${user.first_name} ${user.last_name}`,
            Created_At: new Date()
        };

        const newCandidate = new Candidate(candidateData);
        await newCandidate.save();

        res.status(200).json({
            error: false,
            message: 'Candidate registered successfully',
            candidate: {
                id: newCandidate._id,
                employee_id,
                first_name,
                last_name,
                department,
                position,
                performance_appraisal_score: score
            }
        });

    } catch (error) {
        console.error('Error registering candidate:', error);
        res.status(500).json({ error: true, message: 'Error registering candidate', details: error.message });
    }
});

// Update candidate
router.patch('/update_candidate', auth, roleCheck(["admin"]), async(req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(400).json({ error: true, message: "Requester not found" });
        }

        const { id, ...updateData } = req.body;

        if (!id) {
            return res.status(400).json({ error: true, message: "Candidate ID is required" });
        }

        // Validate performance score if provided
        if (updateData.performance_appraisal_score !== undefined) {
            const score = parseFloat(updateData.performance_appraisal_score);
            if (isNaN(score) || score < 0 || score > 100) {
                return res.status(400).json({ error: true, message: "Performance appraisal score must be between 0 and 100" });
            }
            updateData.performance_appraisal_score = score;
        }

        // Add update metadata
        updateData.Updated_At = new Date();
        updateData.Updated_By = `${user.first_name} ${user.last_name}`;

        const updatedCandidate = await Candidate.findByIdAndUpdate(id, updateData, { new: true });

        if (!updatedCandidate) {
            return res.status(404).json({ error: true, message: "Candidate not found" });
        }

        res.status(200).json({
            error: false,
            message: 'Candidate updated successfully',
            candidate: updatedCandidate
        });

    } catch (error) {
        console.error('Error updating candidate:', error);
        res.status(500).json({ error: true, message: 'Error updating candidate', details: error.message });
    }
});

// Delete candidate
router.delete('/delete_candidate', auth, roleCheck(["admin"]), async(req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ error: true, message: "Candidate ID is required" });
        }

        const deletedCandidate = await Candidate.findByIdAndDelete(id);

        if (!deletedCandidate) {
            return res.status(404).json({ error: true, message: "Candidate not found" });
        }

        res.status(200).json({
            error: false,
            message: 'Candidate deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting candidate:', error);
        res.status(500).json({ error: true, message: 'Error deleting candidate', details: error.message });
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

