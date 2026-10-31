import express from 'express';
import EvaluationCriteria from '../models/rms/EvaluationCriteria.js';
import RatingMatrix from '../models/rms/RatingMatrix.js';

const router = express.Router();

// Middleware to check admin role (same as adminRoutes.js)
const isAdmin = (req, res, next) => {
    // For now, allow all requests to proceed
    // In production, this should check JWT token and user role
    req.user = req.user || { employee_id: 'ADMIN001', roles: ['admin'] };
    next();
};

// ===== EVALUATION CRITERIA ENDPOINTS =====

// Get all criteria by category with search
router.get('/criteria/:category', isAdmin, async (req, res) => {
    try {
        const { category } = req.params;
        const { search = '', page = 1, limit = 10 } = req.query;

        const validCategories = ['managerial_staff', 'non_managerial_staff', 'peer'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category'
            });
        }

        let query = { category, is_active: true };

        // Add search functionality with regex for more flexible matching
        if (search.trim()) {
            query.$or = [
                { criteria_name: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [criteria, totalCount, totalWeight] = await Promise.all([
            EvaluationCriteria.find(query)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            EvaluationCriteria.countDocuments(query),
            EvaluationCriteria.aggregate([
                { $match: { category, is_active: true } },
                { $group: { _id: null, total: { $sum: '$weight' } } }
            ])
        ]);

        const currentTotalWeight = totalWeight.length > 0 ? totalWeight[0].total : 0;

        res.json({
            success: true,
            data: criteria,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalCount,
                total_pages: Math.ceil(totalCount / parseInt(limit))
            },
            summary: {
                total_weight: currentTotalWeight,
                remaining_weight: 50 - currentTotalWeight,
                criteria_count: totalCount
            }
        });

    } catch (error) {
        console.error('Error fetching criteria:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch criteria',
            error: error.message
        });
    }
});

// Create new criteria
router.post('/criteria', isAdmin, async (req, res) => {
    try {
        const { criteria_name, weight, category, description } = req.body;

        // Validation
        if (!criteria_name || !weight || !category) {
            return res.status(400).json({
                success: false,
                message: 'criteria_name, weight, and category are required'
            });
        }

        // Check if criteria already exists
        const existingCriteria = await EvaluationCriteria.findOne({
            criteria_name: { $regex: new RegExp(`^${criteria_name}$`, 'i') },
            category,
            is_active: true
        });

        if (existingCriteria) {
            return res.status(400).json({
                success: false,
                message: 'Criteria with this name already exists in this category'
            });
        }

        // Check total weight doesn't exceed 50
        const currentTotalWeight = await EvaluationCriteria.aggregate([
            { $match: { category, is_active: true } },
            { $group: { _id: null, total: { $sum: '$weight' } } }
        ]);

        const currentWeight = currentTotalWeight.length > 0 ? currentTotalWeight[0].total : 0;

        if (currentWeight + parseInt(weight) > 50) {
            return res.status(400).json({
                success: false,
                message: `Adding this weight would exceed the maximum of 50. Current total: ${currentWeight}, Available: ${50 - currentWeight}`
            });
        }

        const newCriteria = new EvaluationCriteria({
            criteria_name,
            weight: parseInt(weight),
            category,
            description,
            created_by: req.user?.employee_id || 'Admin'
        });

        await newCriteria.save();

        res.status(201).json({
            success: true,
            message: 'Criteria created successfully',
            data: newCriteria
        });

    } catch (error) {
        console.error('Error creating criteria:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create criteria',
            error: error.message
        });
    }
});

// Update criteria
router.put('/criteria/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { criteria_name, weight, description } = req.body;

        const criteria = await EvaluationCriteria.findById(id);
        if (!criteria) {
            return res.status(404).json({
                success: false,
                message: 'Criteria not found'
            });
        }

        // Check weight constraint if weight is being updated
        if (weight && parseInt(weight) !== criteria.weight) {
            const currentTotalWeight = await EvaluationCriteria.aggregate([
                { $match: { category: criteria.category, is_active: true, _id: { $ne: criteria._id } } },
                { $group: { _id: null, total: { $sum: '$weight' } } }
            ]);

            const currentWeight = currentTotalWeight.length > 0 ? currentTotalWeight[0].total : 0;

            if (currentWeight + parseInt(weight) > 50) {
                return res.status(400).json({
                    success: false,
                    message: `Updating this weight would exceed the maximum of 50. Current total (excluding this): ${currentWeight}, Available: ${50 - currentWeight}`
                });
            }
        }

        // Update fields
        if (criteria_name) criteria.criteria_name = criteria_name;
        if (weight) criteria.weight = parseInt(weight);
        if (description !== undefined) criteria.description = description;
        criteria.updated_by = req.user?.employee_id || 'Admin';

        await criteria.save();

        res.json({
            success: true,
            message: 'Criteria updated successfully',
            data: criteria
        });

    } catch (error) {
        console.error('Error updating criteria:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update criteria',
            error: error.message
        });
    }
});

// Delete criteria
router.delete('/criteria/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const criteria = await EvaluationCriteria.findById(id);
        if (!criteria) {
            return res.status(404).json({
                success: false,
                message: 'Criteria not found'
            });
        }

        criteria.is_active = false;
        criteria.updated_by = req.user?.employee_id || 'Admin';
        await criteria.save();

        res.json({
            success: true,
            message: 'Criteria deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting criteria:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete criteria',
            error: error.message
        });
    }
});

// ===== RATING MATRIX ENDPOINTS =====

// Get all rating matrices by category with search
router.get('/rating-matrix/:category', isAdmin, async (req, res) => {
    try {
        const { category } = req.params;
        const { search = '', page = 1, limit = 10 } = req.query;

        const validCategories = ['managerial_staff', 'non_managerial_staff', 'peer'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid category'
            });
        }

        let query = { category, is_active: true };

        // Add search functionality with regex for more flexible matching
        if (search.trim()) {
            query.$or = [
                { matrix_name: { $regex: search.trim(), $options: 'i' } },
                { description: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [matrices, totalCount] = await Promise.all([
            RatingMatrix.find(query)
                .sort({ rating_number: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            RatingMatrix.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: matrices,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalCount,
                total_pages: Math.ceil(totalCount / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching rating matrices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch rating matrices',
            error: error.message
        });
    }
});

// Create new rating matrix
router.post('/rating-matrix', isAdmin, async (req, res) => {
    try {
        const { rating_number, matrix_name, description, category } = req.body;

        // Validation
        if (!rating_number || !matrix_name || !description || !category) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if rating number already exists in this category
        const existingMatrix = await RatingMatrix.findOne({
            rating_number: parseInt(rating_number),
            category,
            is_active: true
        });

        if (existingMatrix) {
            return res.status(400).json({
                success: false,
                message: 'Rating number already exists in this category'
            });
        }

        const newMatrix = new RatingMatrix({
            rating_number: parseInt(rating_number),
            matrix_name,
            description,
            category,
            created_by: req.user?.employee_id || 'Admin'
        });

        await newMatrix.save();

        res.status(201).json({
            success: true,
            message: 'Rating matrix created successfully',
            data: newMatrix
        });

    } catch (error) {
        console.error('Error creating rating matrix:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create rating matrix',
            error: error.message
        });
    }
});

// Update rating matrix
router.put('/rating-matrix/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating_number, matrix_name, description } = req.body;

        const matrix = await RatingMatrix.findById(id);
        if (!matrix) {
            return res.status(404).json({
                success: false,
                message: 'Rating matrix not found'
            });
        }

        // Check if new rating number conflicts (if being updated)
        if (rating_number && parseInt(rating_number) !== matrix.rating_number) {
            const existingMatrix = await RatingMatrix.findOne({
                rating_number: parseInt(rating_number),
                category: matrix.category,
                is_active: true,
                _id: { $ne: matrix._id }
            });

            if (existingMatrix) {
                return res.status(400).json({
                    success: false,
                    message: 'Rating number already exists in this category'
                });
            }
        }

        // Update fields
        if (rating_number) matrix.rating_number = parseInt(rating_number);
        if (matrix_name) matrix.matrix_name = matrix_name;
        if (description) matrix.description = description;
        matrix.updated_by = req.user?.employee_id || 'Admin';

        await matrix.save();

        res.json({
            success: true,
            message: 'Rating matrix updated successfully',
            data: matrix
        });

    } catch (error) {
        console.error('Error updating rating matrix:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update rating matrix',
            error: error.message
        });
    }
});

// Delete rating matrix
router.delete('/rating-matrix/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const matrix = await RatingMatrix.findById(id);
        if (!matrix) {
            return res.status(404).json({
                success: false,
                message: 'Rating matrix not found'
            });
        }

        matrix.is_active = false;
        matrix.updated_by = req.user?.employee_id || 'Admin';
        await matrix.save();

        res.json({
            success: true,
            message: 'Rating matrix deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting rating matrix:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete rating matrix',
            error: error.message
        });
    }
});

// Initialize default rating matrices for a category
router.post('/rating-matrix/initialize/:category', isAdmin, async (req, res) => {
    try {
        const { category } = req.params;

        const defaultMatrices = [
            { rating_number: 1, matrix_name: 'Unsatisfactory', description: 'Performance does not meet basic requirements' },
            { rating_number: 2, matrix_name: 'Meets Requirements', description: 'Performance meets the expected standards' },
            { rating_number: 3, matrix_name: 'Exceeds Requirements', description: 'Performance consistently exceeds expectations' },
            { rating_number: 4, matrix_name: 'Exceptional', description: 'Performance is outstanding and serves as a benchmark' }
        ];

        const existingActiveCount = await RatingMatrix.countDocuments({ category, is_active: true });
        if (existingActiveCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Rating matrices already exist for this category'
            });
        }

        // Check for existing inactive records and reactivate them if they match, otherwise create new ones
        const matrices = [];

        for (const matrixData of defaultMatrices) {
            // Check if an inactive record with the same rating_number and category exists
            const existingMatrix = await RatingMatrix.findOne({
                rating_number: matrixData.rating_number,
                category,
                is_active: false
            });

            if (existingMatrix) {
                // Reactivate and update the existing record
                existingMatrix.matrix_name = matrixData.matrix_name;
                existingMatrix.description = matrixData.description;
                existingMatrix.is_active = true;
                existingMatrix.updated_by = req.user?.employee_id || 'Admin';
                await existingMatrix.save();
                matrices.push(existingMatrix);
            } else {
                // Create a new record
                const newMatrix = new RatingMatrix({
                    ...matrixData,
                    category,
                    created_by: req.user?.employee_id || 'Admin'
                });
                await newMatrix.save();
                matrices.push(newMatrix);
            }
        }

        res.json({
            success: true,
            message: 'Default rating matrices initialized successfully',
            data: matrices
        });

    } catch (error) {
        console.error('Error initializing rating matrices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize rating matrices',
            error: error.message
        });
    }
});

export default router;