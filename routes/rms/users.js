import { Router } from "express";
import auth from "../../middleware/rms/auth.js";
import roleCheck from "../../middleware/rms/roleCheck.js";
import User from "../../models/rms/User.js";
import HierarchicalVote from "../../models/rms/HierarchicalVote.js";
import bcrypt from "bcrypt";
import { validationResult } from "express-validator";
import { VotingCalculator } from "../../utils/votingCalculations.js";
import * as XLSX from 'xlsx';
import multer from "multer";
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.get("/home", auth, roleCheck(["admin"]),(req,res)=>{
    res.status(200).json({message: "User Authenticated"});
});

// Get candidates with performance scores (Users with status: false)
router.get('/get_candidates_with_performance', auth, roleCheck(["admin"]), async(req,res,next)=>{
    console.log("I am in the get_candidates_with_performance")

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

    // Get users with status: false (candidates) who have performance scores
    var dataa = await User.find({ status: false, roles: { $in: ['user'] } });

    var newObj = dataa.map(item => {
        var { _id, __v, password, ...rest } = item._doc;
        const hasScriptProperty = Object.values(rest).some(propValue =>
            typeof propValue === 'string' &&
            (propValue.includes('script') || propValue.includes('iframe') ||
             propValue.includes('<') || propValue.includes('>') || propValue.includes('alert'))
        );
        if (!hasScriptProperty) {
            return {
                ...template,
                id: _id.toString(),
                ...rest,
                registered_By: rest.registered_By || 'SYSTEM',
                Created_At: rest.Created_At || item.createdAt,
                Updated_At: rest.Updated_At || item.updatedAt
            };
        }
        return null;
    }).filter(Boolean);

    const sendUsers = {};
    const meta = {};
    sendUsers.data = newObj;
    meta.totalRowCount = dataa.length;
    sendUsers.meta = meta;

    res.json(sendUsers);
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
        const existingUser = await User.findOne({ employee_id });
        if (existingUser) {
            return res.status(400).json({ error: true, message: "Employee ID already exists" });
        }

        // Create password hash
        const hashedPassword = await bcrypt.hash('1234', 10);

        // Create candidate user
        const candidateData = {
            employee_id,
            user: `${first_name.toLowerCase()}.${last_name.toLowerCase()}`,
            first_name,
            last_name,
            email: `${first_name.toLowerCase()}.${last_name.toLowerCase()}@zemenbank.com`,
            department,
            function: department,
            position,
            performance_appraisal_score: score,
            roles: ['user'],
            status: false, // This makes them a candidate
            is_managerial: false,
            password: hashedPassword,
            registered_By: `${user.first_name} ${user.last_name}`,
            Created_At: new Date()
        };

        const newCandidate = new User(candidateData);
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

        const updatedCandidate = await User.findByIdAndUpdate(id, updateData, { new: true });

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

        const deletedCandidate = await User.findByIdAndDelete(id);

        if (!deletedCandidate) {
            return res.status(404).json({ error: true, message: "Candidate not found" });
        }

        // Also delete any related hierarchical vote records
        await HierarchicalVote.deleteMany({ candidate_employee_id: deletedCandidate.employee_id });

        res.status(200).json({
            error: false,
            message: 'Candidate deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting candidate:', error);
        res.status(500).json({ error: true, message: 'Error deleting candidate', details: error.message });
    }
});

// Excel upload for candidates with performance scores
router.post('/candidate_excel_upload', auth, roleCheck(["admin"]), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(400).json({ error: true, message: "Requester not found" });
        }

        // Read the file
        const fileBuffer = fs.readFileSync(req.file.path);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Validate Excel format
        const requiredHeaders = ['employee_id', 'first_name', 'last_name', 'department', 'position', 'performance_appraisal_score'];
        const headers = Object.keys(jsonData[0] || {});
        const isValidFormat = requiredHeaders.every(header => headers.includes(header));

        if (!isValidFormat) {
            return res.status(400).json({
                message: 'Invalid Excel format. Required columns: employee_id, first_name, last_name, department, position, performance_appraisal_score'
            });
        }

        // Validate and process candidates
        const hashedPassword = await bcrypt.hash('1234', 10);
        const candidatesWithValidation = [];

        for (const candidateData of jsonData) {
            // Validate performance score
            const score = parseFloat(candidateData.performance_appraisal_score);
            if (isNaN(score) || score < 0 || score > 100) {
                return res.status(400).json({
                    message: `Invalid performance score for ${candidateData.employee_id}: must be between 0 and 100`
                });
            }

            candidatesWithValidation.push({
                ...candidateData,
                user: `${candidateData.first_name.toLowerCase()}.${candidateData.last_name.toLowerCase()}`,
                email: `${candidateData.first_name.toLowerCase()}.${candidateData.last_name.toLowerCase()}@zemenbank.com`,
                function: candidateData.department,
                performance_appraisal_score: score,
                roles: ['user'],
                status: false,
                is_managerial: false,
                password: hashedPassword,
                registered_By: `${user.first_name} ${user.last_name}`,
                Created_At: new Date()
            });
        }

        // Save candidates to database
        const savedCandidates = await User.insertMany(candidatesWithValidation, { ordered: false });

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        res.status(200).json({
            message: 'Excel file imported successfully',
            savedCandidates: savedCandidates.length,
        });

    } catch (error) {
        // Delete the temporary file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        console.error('Error processing Excel file:', error);
        res.status(500).json({ message: 'Error processing Excel file', error: error.message });
    }
});

export default router;