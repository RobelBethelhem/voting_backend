import { Router } from "express";
import auth from "../../middleware/rms/auth.js";
import roleCheck from "../../middleware/rms/roleCheck.js";
import ManagerialRating from "../../models/rms/ManagerialRating.js";
import EvaluationCriteria from "../../models/rms/EvaluationCriteria.js";
import RatingMatrix from "../../models/rms/RatingMatrix.js";
import User from "../../models/rms/user.js";
import Manager from "../../models/rms/Manager.js";
import Director from "../../models/rms/Director.js";
import Chief from "../../models/rms/Chief.js";
import Department from "../../models/rms/Department.js";
import Candidate from "../../models/rms/Candidate.js"
import { currentFiscalYearFilter } from "../../utils/fiscalYear.js";
import { currentVotingWindow } from "../../utils/votingPeriod.js";
import ReRatingRequest from "../../models/rms/ReRatingRequest.js";

const router = Router();

// Get managers under the logged-in director
router.get('/managers-under-director', auth, roleCheck(['director', 'chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        let directorId = null;
        let foundDirector = null;

        // Find director in appropriate model
        const userModels = [
            { model: Chief, name: 'Chief' },
            { model: Director, name: 'Director' }
        ];

        for (const { model, name } of userModels) {
            try {
                foundDirector = await model.findById(userInfo._id);
                if (foundDirector) {
                    directorId = foundDirector.employee_id;
                    console.log(`✅ ${name} found:`, directorId);
                    break;
                }
            } catch (error) {
                console.log(`⚠️ Error searching ${name} model:`, error.message);
            }
        }

        if (!directorId) {
            return res.status(404).json({
                error: true,
                message: "Director not found"
            });
        }

        // Get managers under this director
        const managers = await Manager.find({
            director_id: directorId,
            status: true,
            performance_appraisal_score: { $gte: 90.5 }
        }).select('employee_id first_name last_name position performance_appraisal_score').lean();

        console.log(`Found ${managers.length} managers under director ${directorId}`);

        // For each manager, find their department
        const formattedManagers = [];
        for (const manager of managers) {
            // Find department where manager_id matches this manager's employee_id
            const department = await Department.findOne({
                manager_id: manager.employee_id,
                is_active: true
            }).select('department_name').lean();

            console.log(`Looking for department with manager_id: ${manager.employee_id}, found:`, department);

            formattedManagers.push({
                id: manager._id.toString(),
                employee_id: manager.employee_id,
                first_name: manager.first_name,
                last_name: manager.last_name,
                department: department?.department_name || 'Not Assigned',
                position: manager.position,
                performance_appraisal_score: manager.performance_appraisal_score || 0
            });
        }

        console.log('Formatted managers with departments:', formattedManagers);

        res.status(200).json({
            error: false,
            data: formattedManagers,
            meta: {
                totalRowCount: formattedManagers.length,
                directorId: directorId,
                message: `Managers under director ${foundDirector.first_name} ${foundDirector.last_name}`
            }
        });

    } catch (error) {
        console.error("Error fetching managers:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

// Get departments under director's managers
router.get('/departments-under-director', auth, roleCheck(['director', 'chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        let directorId = null;
        let foundDirector = null;

        // Find director
        const userModels = [
            { model: Chief, name: 'Chief' },
            { model: Director, name: 'Director' }
        ];

        for (const { model, name } of userModels) {
            try {
                foundDirector = await model.findById(userInfo._id);
                if (foundDirector) {
                    directorId = foundDirector.employee_id;
                    break;
                }
            } catch (error) {
                console.log(`⚠️ Error searching ${name} model:`, error.message);
            }
        }

        if (!directorId) {
            return res.status(404).json({
                error: true,
                message: "Director not found"
            });
        }

        // Get managers under this director
        const managers = await Manager.find({
            director_id: directorId,
            status: true
        }).select('employee_id department').lean();

        const managerIds = managers.map(m => m.employee_id);

        // Get departments that have staff managed by these managers
        const departments = await User.aggregate([
            {
                $match: {
                    manager_id: { $in: managerIds },
                    status: true
                }
            },
            {
                $group: {
                    _id: "$department",
                    staffCount: { $sum: 1 },
                    manager_id: { $first: "$manager_id" }
                }
            },
            {
                $lookup: {
                    from: "managers",
                    localField: "manager_id",
                    foreignField: "employee_id",
                    as: "manager_info"
                }
            },
            {
                $project: {
                    department: "$_id",
                    staffCount: 1,
                    manager_info: { $arrayElemAt: ["$manager_info", 0] }
                }
            }
        ]);

        console.log(`Found ${departments.length} departments under director ${directorId}`);

        res.status(200).json({
            error: false,
            data: departments,
            meta: {
                totalRowCount: departments.length,
                directorId: directorId,
                managerCount: managerIds.length
            }
        });

    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

// Get staff in specific department
router.get('/staff-in-department/:department', auth, roleCheck(['director', 'chief']), async (req, res) => {
    try {
        const { department } = req.params;
        const userInfo = req.user;
        let directorId = null;

        // Find director
        const userModels = [
            { model: Chief, name: 'Chief' },
            { model: Director, name: 'Director' }
        ];

        for (const { model, name } of userModels) {
            try {
                const foundDirector = await model.findById(userInfo._id);
                if (foundDirector) {
                    directorId = foundDirector.employee_id;
                    break;
                }
            } catch (error) {
                console.log(`⚠️ Error searching ${name} model:`, error.message);
            }
        }

        if (!directorId) {
            return res.status(404).json({
                error: true,
                message: "Director not found"
            });
        }

        // Get managers under this director
        const managers = await Manager.find({
            director_id: directorId,
            status: true
        }).select('employee_id').lean();

        const managerIds = managers.map(m => m.employee_id);

        // Get staff in the specific department managed by these managers
        const staff = await Candidate.find({
            department: department,
            manager_id: { $in: managerIds },
            status: true
        }).select('employee_id first_name last_name department position performance_appraisal_score manager_id').lean();

        console.log(`Found ${staff.length} staff in department ${department}`);

        const formattedStaff = staff.map(person => ({
            id: person._id.toString(),
            employee_id: person.employee_id,
            first_name: person.first_name,
            last_name: person.last_name,
            department: person.department,
            position: person.position,
            performance_appraisal_score: person.performance_appraisal_score || 0,
            manager_id: person.manager_id
        }));

        res.status(200).json({
            error: false,
            data: formattedStaff,
            meta: {
                totalRowCount: formattedStaff.length,
                department: department,
                directorId: directorId
            }
        });

    } catch (error) {
        console.error("Error fetching staff:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

// Submit managerial rating
router.post('/submit-managerial-rating', auth, roleCheck(['director', 'chief']), async (req, res) => {
    try {
        const { employee, evaluations, totalScore, ratingCategory } = req.body;
        const userInfo = req.user;
        let raterInfo = null;

        // Find rater (director/chief)
        const userModels = [
            { model: Chief, name: 'Chief', role: 'chief' },
            { model: Director, name: 'Director', role: 'director' }
        ];

        for (const { model, name, role } of userModels) {
            try {
                raterInfo = await model.findById(userInfo._id);
                if (raterInfo) {
                    raterInfo.role = role;
                    break;
                }
            } catch (error) {
                console.log(`⚠️ Error searching ${name} model:`, error.message);
            }
        }

        if (!raterInfo) {
            return res.status(404).json({
                error: true,
                message: "Rater not found"
            });
        }

        // Ratings are accepted only during the current fiscal year's voting period, except
        // that a re-rating approved by the Deputy Chief Human Capital lets the chief's
        // directors rate again after it
        const window = await currentVotingWindow();
        if (!window.open) {
            const reRating = raterInfo.role === 'director' && raterInfo.chief_id
                ? await ReRatingRequest.findOpenForChief(raterInfo.chief_id)
                : null;
            if (reRating?.status !== 're_rating') {
                return res.status(403).json({ error: true, message: window.message, voting_window: window });
            }
        }

        // Find ratee information
        let rateeInfo = null;
        let rateeRole = null;
        let rateeDepartment = null;

        if (ratingCategory === 'managerial_staff') {
            rateeInfo = await Manager.findOne({ employee_id: employee.employee_id });
            rateeRole = 'manager';

            // For managers, find their department using the Department model
            if (rateeInfo) {
                const department = await Department.findOne({
                    manager_id: rateeInfo.employee_id,
                    is_active: true
                }).select('department_name').lean();
                rateeDepartment = department?.department_name || 'Not Assigned';
            }
        } else {
            rateeInfo = await User.findOne({ employee_id: employee.employee_id });
            rateeRole = 'user';
            rateeDepartment = rateeInfo?.department || 'Not Assigned';
        }

        if (!rateeInfo) {
            return res.status(404).json({
                error: true,
                message: "Employee to be rated not found"
            });
        }

        // Find rater's department
        let raterDepartment = null;
        if (raterInfo.role === 'director') {
            // For directors, find any department they oversee through their managers
            const managerUnderDirector = await Manager.findOne({
                director_id: raterInfo.employee_id,
                status: true
            }).lean();

            if (managerUnderDirector) {
                const department = await Department.findOne({
                    manager_id: managerUnderDirector.employee_id,
                    is_active: true
                }).select('department_name').lean();
                raterDepartment = department?.department_name || 'Director Office';
            } else {
                raterDepartment = 'Director Office';
            }
        } else {
            raterDepartment = raterInfo.department || 'Not Assigned';
        }

        // Check for duplicate rating in the current fiscal year
        const existingRating = await ManagerialRating.findOne({
            rater_emp_id: raterInfo.employee_id,
            ratee_emp_id: employee.employee_id,
            rating_category: ratingCategory,
            ...(await currentFiscalYearFilter())
        });

        if (existingRating) {
            return res.status(400).json({
                error: true,
                message: "You have already rated this employee in this category"
            });
        }

        // Get evaluation criteria for validation
        const criteria = await EvaluationCriteria.find({
            category: ratingCategory,
            is_active: true
        });

        // Calculate scores
        const maxRating = await RatingMatrix.find({ category: ratingCategory, is_active: true }).sort({ rating_number: -1 }).limit(1);
        const maxRatingValue = maxRating.length > 0 ? maxRating[0].rating_number : 10;

        const totalPossibleWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
        const maxPossibleScore = totalPossibleWeight; // Assuming max rating gives full weight
        const percentageScore = (totalScore / maxPossibleScore) * 100;

        // Format criteria ratings
        const criteriaRatings = evaluations.map(evaluation => {
            const criteriaObj = criteria.find(c => c._id.toString() === evaluation.criteriaId);
            return {
                criteria_id: evaluation.criteriaId,
                criteria_name: criteriaObj.criteria_name,
                weight: criteriaObj.weight,
                rating: evaluation.rating,
                rating_description: `${evaluation.rating}/${maxRatingValue}`
            };
        });

        // Create managerial rating record
        const ratingData = {
            rater_first_name: raterInfo.first_name,
            rater_last_name: raterInfo.last_name,
            rater_emp_id: raterInfo.employee_id,
            rater_position: raterInfo.position,
            rater_department: raterDepartment,
            rater_role: raterInfo.role,

            ratee_first_name: rateeInfo.first_name,
            ratee_last_name: rateeInfo.last_name,
            ratee_emp_id: rateeInfo.employee_id,
            ratee_position: rateeInfo.position,
            ratee_department: rateeDepartment,
            ratee_role: rateeRole,

            rating_category: ratingCategory,
            criteria_ratings: criteriaRatings,
            total_weighted_score: totalScore,
            max_possible_score: maxPossibleScore,
            percentage_score: percentageScore
        };

        console.log("Rater department lookup result:", raterDepartment);
        console.log("Ratee department lookup result:", rateeDepartment);
        console.log("Saving managerial rating:", ratingData);

        const newRating = new ManagerialRating(ratingData);
        await newRating.save();

        res.status(201).json({
            error: false,
            message: `Rating submitted successfully for ${rateeInfo.first_name} ${rateeInfo.last_name}`,
            data: {
                rating_id: newRating._id,
                total_score: totalScore,
                percentage_score: percentageScore.toFixed(2)
            }
        });

    } catch (error) {
        console.error("Error submitting rating:", error);
        res.status(500).json({
            error: true,
            message: "Failed to submit rating",
            details: error.message
        });
    }
});

// Get my submitted managerial ratings
router.get('/my-managerial-ratings', auth, roleCheck(['director', 'chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        const { category, page = 1, limit = 10 } = req.query;

        let raterInfo = null;
        const userModels = [
            { model: Chief, name: 'Chief' },
            { model: Director, name: 'Director' }
        ];

        for (const { model, name } of userModels) {
            try {
                raterInfo = await model.findById(userInfo._id);
                if (raterInfo) break;
            } catch (error) {
                console.log(`⚠️ Error searching ${name} model:`, error.message);
            }
        }

        if (!raterInfo) {
            return res.status(404).json({
                error: true,
                message: "Director not found"
            });
        }

        let query = { rater_emp_id: raterInfo.employee_id, ...(await currentFiscalYearFilter()) };
        if (category) {
            query.rating_category = category;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [ratings, totalCount] = await Promise.all([
            ManagerialRating.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            ManagerialRating.countDocuments(query)
        ]);

        res.status(200).json({
            error: false,
            data: ratings,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalCount,
                total_pages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch (error) {
        console.error("Error fetching ratings:", error);
        res.status(500).json({
            error: true,
            message: "Failed to fetch ratings"
        });
    }
});

// Get all staff under chief (for quota selection)
router.get('/staff-under-chief', auth, roleCheck(['chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        let chiefInfo = null;

        // Find chief
        try {
            chiefInfo = await Chief.findById(userInfo._id);
            if (!chiefInfo) {
                return res.status(404).json({
                    error: true,
                    message: "Chief not found"
                });
            }
        } catch (error) {
            return res.status(404).json({
                error: true,
                message: "Chief not found"
            });
        }

        // Get directors under this chief
        const directors = await Director.find({
            chief_id: chiefInfo.employee_id,
            status: true
        }).select('employee_id').lean();

        const directorIds = directors.map(d => d.employee_id);

        // Get managers under these directors
        const managers = await Manager.find({
            director_id: { $in: directorIds },
            status: true
        }).select('employee_id first_name last_name position performance_appraisal_score').lean();

        const managerIds = managers.map(m => m.employee_id);

        // Get all staff under these managers (including the managers themselves)
        const staff = await User.find({
            $or: [
                { manager_id: { $in: managerIds }, status: true },
                { employee_id: { $in: managerIds }, status: true }
            ]
        }).select('employee_id first_name last_name position department level performance_appraisal_score').lean();

        // Combine managers and staff
        const allStaff = [
            ...managers.map(m => ({
                ...m,
                level: 'manager',
                department: 'Management'
            })),
            ...staff
        ];

        console.log(`Found ${allStaff.length} total staff under chief ${chiefInfo.employee_id}`);

        res.status(200).json({
            error: false,
            data: allStaff,
            meta: {
                totalRowCount: allStaff.length,
                chiefId: chiefInfo.employee_id,
                directorCount: directorIds.length,
                managerCount: managerIds.length
            }
        });

    } catch (error) {
        console.error("Error fetching staff under chief:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

// Get department ratings under chief
router.get('/department-ratings-under-chief', auth, roleCheck(['chief']), async (req, res) => {
    try {
        const userInfo = req.user;
        let chiefInfo = null;

        // Find chief
        try {
            chiefInfo = await Chief.findById(userInfo._id);
            if (!chiefInfo) {
                return res.status(404).json({
                    error: true,
                    message: "Chief not found"
                });
            }
        } catch (error) {
            return res.status(404).json({
                error: true,
                message: "Chief not found"
            });
        }

        // Get directors under this chief
        const directors = await Director.find({
            chief_id: chiefInfo.employee_id,
            status: true
        }).select('employee_id').lean();

        const directorIds = directors.map(d => d.employee_id);

        // Get managers under these directors
        const managers = await Manager.find({
            director_id: { $in: directorIds },
            status: true
        }).lean();

        const managerIds = managers.map(m => m.employee_id);

        // Get departments
        const departments = await Department.find({
            manager_id: { $in: managerIds },
            is_active: true
        }).lean();

        const departmentReviews = [];

        for (const department of departments) {
            // Find manager for this department
            const manager = managers.find(m => m.employee_id === department.manager_id);

            // Find staff in this department
            const staff = await User.find({
                department: department.department_name,
                manager_id: department.manager_id,
                status: true
            }).lean();

            // Get ratings for manager and staff (simplified for now)
            const managerWithRating = manager ? {
                ...manager,
                rating_status: Math.random() > 0.5 ? 'Completed' : 'Pending' // Random for skeleton
            } : null;

            const staffWithRatings = staff.map(s => ({
                ...s,
                rating_status: Math.random() > 0.5 ? 'Completed' : 'Pending' // Random for skeleton
            }));

            departmentReviews.push({
                department_name: department.department_name,
                manager: managerWithRating,
                staff: staffWithRatings
            });
        }

        console.log(`Found ${departmentReviews.length} departments under chief ${chiefInfo.employee_id}`);

        res.status(200).json({
            error: false,
            data: departmentReviews,
            meta: {
                totalDepartments: departmentReviews.length,
                chiefId: chiefInfo.employee_id
            }
        });

    } catch (error) {
        console.error("Error fetching department ratings:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

// Get director rating for a specific employee (for managerial positions)
router.get('/director-rating/:employeeId', auth, async (req, res) => {
    try {
        const { employeeId } = req.params;

        console.log(`📊 Getting director rating for employee: ${employeeId}`);

        // Find director rating for this employee where rating_category is 'managerial_staff'
        const directorRating = await ManagerialRating.findOne({
            ratee_emp_id: employeeId,
            rating_category: 'managerial_staff',
            status: { $in: ['submitted', 'approved'] },
            ...(await currentFiscalYearFilter())
        }).sort({ created_at: -1 }); // Get latest rating

        if (!directorRating) {
            console.log(`❌ No director rating found for employee: ${employeeId}`);
            return res.status(404).json({
                success: false,
                message: 'No director rating found for this employee'
            });
        }

        // Convert total_weighted_score to 50-point scale for manager scoring
        const directorRatingOutOf50 = directorRating.max_possible_score > 0
            ? (directorRating.total_weighted_score / directorRating.max_possible_score) * 50
            : 0;

        console.log(`✅ Director rating found:`, {
            employee: employeeId,
            percentage_score: directorRating.percentage_score,
            total_weighted_score: directorRating.total_weighted_score,
            max_possible_score: directorRating.max_possible_score,
            director_rating_out_of_50: directorRatingOutOf50
        });

        res.status(200).json({
            success: true,
            message: 'Director rating retrieved successfully',
            data: {
                employee_id: employeeId,
                percentage_score: directorRatingOutOf50, // Director rating converted to 50-point scale
                total_weighted_score: directorRating.total_weighted_score,
                max_possible_score: directorRating.max_possible_score,
                director_rating_out_of_50: directorRatingOutOf50,
                rater_name: `${directorRating.rater_first_name} ${directorRating.rater_last_name}`,
                rater_role: directorRating.rater_role,
                rating_category: directorRating.rating_category,
                status: directorRating.status,
                timestamp: directorRating.timestamp
            }
        });

    } catch (error) {
        console.error('❌ Error getting director rating:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get director rating',
            error: error.message
        });
    }
});

// Get manager rating for a specific employee (for non-managerial positions)
router.get('/manager-rating/:employeeId', auth, async (req, res) => {
    try {
        const { employeeId } = req.params;

        console.log(`📊 Getting manager rating for employee: ${employeeId}`);

        // Find manager rating for this employee where rating_category is 'non_managerial_staff'
        const managerRating = await ManagerialRating.findOne({
            ratee_emp_id: employeeId,
            rating_category: 'non_managerial_staff',
            status: { $in: ['submitted', 'approved'] },
            ...(await currentFiscalYearFilter())
        }).sort({ created_at: -1 }); // Get latest rating

        if (!managerRating) {
            console.log(`❌ No manager rating found for employee: ${employeeId}`);
            return res.status(404).json({
                success: false,
                message: 'No manager rating found for this employee'
            });
        }

        // Convert total_weighted_score to 30-point scale for non-managerial scoring
        const managerRatingOutOf30 = managerRating.max_possible_score > 0
            ? (managerRating.total_weighted_score / managerRating.max_possible_score) * 30
            : 0;

        console.log(`✅ Manager rating found:`, {
            employee: employeeId,
            percentage_score: managerRating.percentage_score,
            total_weighted_score: managerRating.total_weighted_score,
            max_possible_score: managerRating.max_possible_score,
            manager_rating_out_of_30: managerRatingOutOf30
        });

        res.status(200).json({
            success: true,
            message: 'Manager rating retrieved successfully',
            data: {
                employee_id: employeeId,
                percentage_score: managerRatingOutOf30, // Manager rating converted to 30-point scale
                total_weighted_score: managerRating.total_weighted_score,
                max_possible_score: managerRating.max_possible_score,
                manager_rating_out_of_30: managerRatingOutOf30,
                rater_name: `${managerRating.rater_first_name} ${managerRating.rater_last_name}`,
                rater_role: managerRating.rater_role,
                rating_category: managerRating.rating_category,
                status: managerRating.status,
                timestamp: managerRating.timestamp
            }
        });

    } catch (error) {
        console.error('❌ Error getting manager rating:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
});

export default router;