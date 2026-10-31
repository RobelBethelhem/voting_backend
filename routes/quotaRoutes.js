import express from 'express';
import QuotaAllocation from '../models/rms/QuotaAllocation.js';
import Chief from '../models/rms/Chief.js';
import auth from '../middleware/rms/auth.js';
import { currentFiscalYearFilter, fiscalYearFilter, withFiscalYear } from '../utils/fiscalYear.js';
import { currentYearChief } from '../services/fiscalYearOrgService.js';

const router = express.Router();

// Middleware to check admin role (same as other routes)
const isAdmin = (req, res, next) => {
    // For now, allow all requests to proceed
    // In production, this should check JWT token and user role
    req.user = req.user || { employee_id: 'ADMIN001', roles: ['admin'] };
    next();
};

// ===== QUOTA ALLOCATION ENDPOINTS =====

// Get all quota allocations with search and pagination
router.get('/allocations', isAdmin, withFiscalYear, async (req, res) => {
    try {
        const { search = '', page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const fiscalYear = fiscalYearFilter(req.fiscalYear);

        let aggregationPipeline;

        if (search.trim()) {
            // Use aggregation pipeline for searching across populated fields
            aggregationPipeline = [
                { $match: { is_active: true, ...fiscalYear } },
                {
                    $lookup: {
                        from: 'chiefs',
                        localField: 'chief_id',
                        foreignField: '_id',
                        as: 'chief_info'
                    }
                },
                { $unwind: '$chief_info' },
                {
                    $match: {
                        $or: [
                            { description: { $regex: search.trim(), $options: 'i' } },
                            { 'chief_info.first_name': { $regex: search.trim(), $options: 'i' } },
                            { 'chief_info.last_name': { $regex: search.trim(), $options: 'i' } },
                            { 'chief_info.employee_id': { $regex: search.trim(), $options: 'i' } }
                        ]
                    }
                },
                { $sort: { created_at: -1 } },
                { $skip: skip },
                { $limit: parseInt(limit) }
            ];
        }

        let allocations, totalCount;

        if (search.trim()) {
            // Use aggregation for search
            const searchResults = await QuotaAllocation.aggregate(aggregationPipeline);

            // Get total count for search results (without skip/limit)
            const countPipeline = [
                { $match: { is_active: true, ...fiscalYear } },
                {
                    $lookup: {
                        from: 'chiefs',
                        localField: 'chief_id',
                        foreignField: '_id',
                        as: 'chief_info'
                    }
                },
                { $unwind: '$chief_info' },
                {
                    $match: {
                        $or: [
                            { description: { $regex: search.trim(), $options: 'i' } },
                            { 'chief_info.first_name': { $regex: search.trim(), $options: 'i' } },
                            { 'chief_info.last_name': { $regex: search.trim(), $options: 'i' } },
                            { 'chief_info.employee_id': { $regex: search.trim(), $options: 'i' } }
                        ]
                    }
                },
                { $count: 'total' }
            ];

            const countResult = await QuotaAllocation.aggregate(countPipeline);
            totalCount = countResult.length > 0 ? countResult[0].total : 0;

            // Map aggregation results to include chief_id as populated object
            allocations = searchResults.map(result => ({
                ...result,
                chief_id: result.chief_info
            }));
        } else {
            // Use regular find for non-search queries
            const query = { is_active: true, ...fiscalYear };
            const [regularAllocations, regularCount] = await Promise.all([
                QuotaAllocation.find(query)
                    .populate('chief_id', 'first_name last_name employee_id department email')
                    .sort({ created_at: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                QuotaAllocation.countDocuments(query)
            ]);
            allocations = regularAllocations;
            totalCount = regularCount;
        }

        const [summary] = await Promise.all([
            QuotaAllocation.getUtilizationSummary(fiscalYear)
        ]);

        const utilizationSummary = summary.length > 0 ? summary[0] : {
            total_quotas: 0,
            total_limit: 0,
            current_staff: 0,
            avg_utilization: 0
        };

        res.json({
            success: true,
            data: allocations,
            fiscal_year: req.fiscalYear,
            pagination: {
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total: totalCount,
                total_pages: Math.ceil(totalCount / parseInt(limit))
            },
            summary: utilizationSummary
        });

    } catch (error) {
        console.error('Error fetching quota allocations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quota allocations',
            error: error.message
        });
    }
});

// Get registered chiefs for dropdown
router.get('/chiefs', isAdmin, async (req, res) => {
    try {
        const chiefs = await Chief.find({ status: true })
            .select('first_name last_name employee_id department email')
            .sort({ first_name: 1, last_name: 1 });

        res.json({
            success: true,
            data: chiefs,
            total: chiefs.length
        });

    } catch (error) {
        console.error('Error fetching chiefs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chiefs',
            error: error.message
        });
    }
});

// Create new quota allocation
router.post('/allocations', isAdmin, async (req, res) => {
    try {
        const { chief_id, quota_limit, description } = req.body;

        // Validation
        if (!chief_id || !quota_limit) {
            return res.status(400).json({
                success: false,
                message: 'Chief ID and quota limit are required'
            });
        }

        // Validate quota_limit is a positive integer
        const quotaLimitNum = parseInt(quota_limit);
        if (!Number.isInteger(quotaLimitNum) || quotaLimitNum <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Quota limit must be a positive integer'
            });
        }

        // Check if chief exists
        const chief = await Chief.findById(chief_id);
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: 'Chief not found'
            });
        }

        // Check if allocation already exists for this chief in the current fiscal year
        const existingAllocation = await QuotaAllocation.findOne({
            chief_id,
            is_active: true,
            ...(await currentFiscalYearFilter())
        });

        if (existingAllocation) {
            return res.status(400).json({
                success: false,
                message: 'Quota allocation already exists for this chief in the current fiscal year'
            });
        }

        const newAllocation = new QuotaAllocation({
            chief_id,
            quota_limit: quotaLimitNum,
            description: description ? description.trim() : '',
            created_by: req.user?.employee_id || 'Admin'
        });

        await newAllocation.save();

        // Populate chief details for response
        await newAllocation.populate('chief_id', 'first_name last_name employee_id department email');

        res.status(201).json({
            success: true,
            message: 'Quota allocation created successfully',
            data: newAllocation
        });

    } catch (error) {
        console.error('Error creating quota allocation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create quota allocation',
            error: error.message
        });
    }
});

// Get quota allocation by ID
router.get('/allocations/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const allocation = await QuotaAllocation.findById(id)
            .populate('chief_id', 'first_name last_name employee_id department email');

        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'Quota allocation not found'
            });
        }

        res.json({
            success: true,
            data: allocation
        });

    } catch (error) {
        console.error('Error fetching quota allocation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quota allocation',
            error: error.message
        });
    }
});

// Update quota allocation
router.put('/allocations/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { chief_id, quota_limit, description } = req.body;

        const allocation = await QuotaAllocation.findById(id);
        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'Quota allocation not found'
            });
        }

        // Validate quota_limit if provided
        if (quota_limit !== undefined) {
            const quotaLimitNum = parseInt(quota_limit);
            if (!Number.isInteger(quotaLimitNum) || quotaLimitNum <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Quota limit must be a positive integer'
                });
            }

            // Check if new limit is less than current allocation
            if (quotaLimitNum < allocation.current_allocation) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot set quota limit (${quotaLimitNum}) below current allocation (${allocation.current_allocation})`
                });
            }

            allocation.quota_limit = quotaLimitNum;
        }

        // Validate chief_id if provided
        if (chief_id && chief_id !== allocation.chief_id.toString()) {
            const chief = await Chief.findById(chief_id);
            if (!chief) {
                return res.status(404).json({
                    success: false,
                    message: 'Chief not found'
                });
            }

            // Check for duplicate allocation with new chief in the same fiscal year
            const duplicateCheck = await QuotaAllocation.findOne({
                chief_id,
                is_active: true,
                fiscal_year: allocation.fiscal_year ?? null,
                _id: { $ne: allocation._id }
            });

            if (duplicateCheck) {
                return res.status(400).json({
                    success: false,
                    message: 'Quota allocation already exists for this chief'
                });
            }

            allocation.chief_id = chief_id;
        }

        // Update other fields
        if (description !== undefined) allocation.description = description.trim();
        allocation.updated_by = req.user?.employee_id || 'Admin';

        await allocation.save();

        // Populate chief details for response
        await allocation.populate('chief_id', 'first_name last_name employee_id department email');

        res.json({
            success: true,
            message: 'Quota allocation updated successfully',
            data: allocation
        });

    } catch (error) {
        console.error('Error updating quota allocation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update quota allocation',
            error: error.message
        });
    }
});

// Delete quota allocation (soft delete)
router.delete('/allocations/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const allocation = await QuotaAllocation.findById(id);
        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'Quota allocation not found'
            });
        }

        // Check if there are currently allocated staff
        if (allocation.current_allocation > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete quota allocation. ${allocation.current_allocation} staff members are currently allocated. Please deallocate staff first.`
            });
        }

        allocation.is_active = false;
        allocation.status = 'inactive';
        allocation.updated_by = req.user?.employee_id || 'Admin';
        await allocation.save();

        res.json({
            success: true,
            message: 'Quota allocation deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting quota allocation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete quota allocation',
            error: error.message
        });
    }
});

// Allocate staff to quota (increase current_allocation)
router.post('/allocations/:id/allocate', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { count = 1 } = req.body;

        const allocation = await QuotaAllocation.findById(id);
        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'Quota allocation not found'
            });
        }

        const staffCount = parseInt(count);
        if (!Number.isInteger(staffCount) || staffCount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Count must be a positive integer'
            });
        }

        if (!allocation.canAllocate(staffCount)) {
            return res.status(400).json({
                success: false,
                message: `Cannot allocate ${staffCount} staff. Available slots: ${allocation.available_slots}`
            });
        }

        await allocation.allocateStaff(staffCount);
        await allocation.populate('chief_id', 'first_name last_name employee_id department email');

        res.json({
            success: true,
            message: `Successfully allocated ${staffCount} staff member(s)`,
            data: allocation
        });

    } catch (error) {
        console.error('Error allocating staff:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to allocate staff',
            error: error.message
        });
    }
});

// Deallocate staff from quota (decrease current_allocation)
router.post('/allocations/:id/deallocate', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { count = 1 } = req.body;

        const allocation = await QuotaAllocation.findById(id);
        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'Quota allocation not found'
            });
        }

        const staffCount = parseInt(count);
        if (!Number.isInteger(staffCount) || staffCount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Count must be a positive integer'
            });
        }

        if (staffCount > allocation.current_allocation) {
            return res.status(400).json({
                success: false,
                message: `Cannot deallocate ${staffCount} staff. Current allocation: ${allocation.current_allocation}`
            });
        }

        await allocation.deallocateStaff(staffCount);
        await allocation.populate('chief_id', 'first_name last_name employee_id department email');

        res.json({
            success: true,
            message: `Successfully deallocated ${staffCount} staff member(s)`,
            data: allocation
        });

    } catch (error) {
        console.error('Error deallocating staff:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to deallocate staff',
            error: error.message
        });
    }
});

// Get quota allocations by chief ID
router.get('/chief/:chiefId/allocations', isAdmin, async (req, res) => {
    try {
        const { chiefId } = req.params;

        const allocations = await QuotaAllocation.findByChief(chiefId, await currentFiscalYearFilter())
            .populate('chief_id', 'first_name last_name employee_id department email')
            .sort({ department: 1 });

        res.json({
            success: true,
            data: allocations,
            total: allocations.length
        });

    } catch (error) {
        console.error('Error fetching chief allocations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chief allocations',
            error: error.message
        });
    }
});

// Department-related routes removed since department field no longer exists

// Get utilization summary and statistics
router.get('/statistics', isAdmin, async (req, res) => {
    try {
        const fiscalYear = await currentFiscalYearFilter();
        const [summary, statusStats] = await Promise.all([
            QuotaAllocation.getUtilizationSummary(fiscalYear),
            QuotaAllocation.aggregate([
                { $match: { is_active: true, ...fiscalYear } },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        const utilizationSummary = summary.length > 0 ? summary[0] : {
            total_quotas: 0,
            total_limit: 0,
            current_staff: 0,
            avg_utilization: 0
        };

        res.json({
            success: true,
            data: {
                overall: utilizationSummary,
                by_status: statusStats
            }
        });

    } catch (error) {
        console.error('Error fetching quota statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quota statistics',
            error: error.message
        });
    }
});

// Get quota allocation for a specific chief (by chief MongoDB _id or employee_id)
router.get('/chief/:chiefId', async (req, res) => {
    try {
        const { chiefId } = req.params;
        console.log('Looking for quota allocation for chief:', chiefId);

        let allocation = null;
        const fiscalYear = await currentFiscalYearFilter();

        // First try to find by chief_id (MongoDB ObjectId)
        if (chiefId.match(/^[0-9a-fA-F]{24}$/)) {
            allocation = await QuotaAllocation.findOne({
                chief_id: chiefId,
                is_active: true,
                ...fiscalYear
            }).populate('chief_id', 'first_name last_name employee_id department email');
        }

        // If not found, try to find by chief employee_id
        if (!allocation) {
            // Find the chief by employee_id first
            const Chief = (await import('../models/rms/Chief.js')).default;
            const chief = await Chief.findOne({ employee_id: chiefId });

            if (chief) {
                console.log('Found chief by employee_id:', chief.employee_id, 'MongoDB ID:', chief._id);
                allocation = await QuotaAllocation.findOne({
                    chief_id: chief._id,
                    is_active: true,
                    ...fiscalYear
                }).populate('chief_id', 'first_name last_name employee_id department email');
            }
        }

        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'No quota allocation found for this chief'
            });
        }

        console.log('Found quota allocation:', {
            quota_limit: allocation.quota_limit,
            current_allocation: allocation.current_allocation,
            chief_employee_id: allocation.chief_id.employee_id
        });

        res.json({
            success: true,
            data: allocation
        });

    } catch (error) {
        console.error('Error fetching chief quota:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chief quota',
            error: error.message
        });
    }
});

// Get quota allocation for the current authenticated chief user
router.get('/my-quota', auth, async (req, res) => {
    try {
        // This assumes the user is authenticated and req.user contains the user info
        if (!req.user || !req.user._id) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        console.log('Getting quota for authenticated user:', req.user._id);

        // Import Chief model
        const Chief = (await import('../models/rms/Chief.js')).default;

        // Find the chief record for the authenticated user (this fiscal year's record)
        const chief = await currentYearChief(await Chief.findById(req.user._id));
        if (!chief) {
            return res.status(404).json({
                success: false,
                message: 'Chief record not found for authenticated user'
            });
        }

        console.log('Found chief:', chief.employee_id);

        // Find quota allocation for this chief in the current fiscal year
        const allocation = await QuotaAllocation.findOne({
            chief_id: chief._id,
            is_active: true,
            ...(await currentFiscalYearFilter())
        }).populate('chief_id', 'first_name last_name employee_id department email');

        if (!allocation) {
            return res.status(404).json({
                success: false,
                message: 'No quota allocation found for this chief'
            });
        }

        console.log('Found quota allocation:', {
            quota_limit: allocation.quota_limit,
            current_allocation: allocation.current_allocation,
            chief_employee_id: allocation.chief_id.employee_id
        });

        res.json({
            success: true,
            data: allocation
        });

    } catch (error) {
        console.error('Error fetching my quota:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quota',
            error: error.message
        });
    }
});

// Approve or reject staff for quota allocation
router.post('/approve-staff', async (req, res) => {
    try {
        const { employee_id, approval_status, comments } = req.body;

        // For now, just return success (skeleton implementation)
        // Later this will interact with a staff approval tracking system

        console.log('Staff approval request:', {
            employee_id,
            approval_status,
            comments
        });

        res.json({
            success: true,
            message: `Staff ${approval_status} successfully`,
            data: {
                employee_id,
                approval_status,
                comments,
                processed_at: new Date()
            }
        });

    } catch (error) {
        console.error('Error processing staff approval:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process staff approval',
            error: error.message
        });
    }
});

export default router;