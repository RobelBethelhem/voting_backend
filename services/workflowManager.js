// Workflow management system for hierarchical voting process

import HierarchyConfig from '../config/hierarchyConfig.js';
import HierarchicalVote from '../models/rms/HierarchicalVote.js';
import VotingPeriod from '../models/rms/VotingPeriod.js';
import User from '../models/rms/user.js';

export class WorkflowManager {
    constructor() {
        this.config = HierarchyConfig;
        this.activeWorkflows = new Map();
        this.completedStages = new Map();
    }

    /**
     * Initialize a new voting workflow
     */
    async initializeWorkflow(votingPeriodId, options = {}) {
        const votingPeriod = await VotingPeriod.findOne({ period_id: votingPeriodId });
        if (!votingPeriod) {
            throw new Error('Voting period not found');
        }

        const workflow = {
            id: `WF_${Date.now()}`,
            votingPeriodId,
            currentStage: 1,
            stages: this.config.approvalWorkflow.stages,
            startDate: new Date(),
            estimatedEndDate: this.calculateEndDate(this.config.approvalWorkflow.stages),
            status: 'active',
            notifications: [],
            history: [],
            statistics: {
                totalCandidates: 0,
                completedVotes: 0,
                pendingApprovals: 0
            }
        };

        this.activeWorkflows.set(votingPeriodId, workflow);

        // Log workflow initialization
        await this.logWorkflowEvent(votingPeriodId, 'initialized', {
            initiatedBy: options.initiatedBy || 'system'
        });

        return workflow;
    }

    /**
     * Advance workflow to next stage
     */
    async advanceStage(votingPeriodId) {
        const workflow = this.activeWorkflows.get(votingPeriodId);
        if (!workflow) {
            throw new Error('Workflow not found');
        }

        const currentStage = workflow.stages[workflow.currentStage - 1];
        const nextStageIndex = workflow.currentStage;

        // Validate current stage completion
        const stageCompletion = await this.validateStageCompletion(votingPeriodId, currentStage);
        if (!stageCompletion.isComplete) {
            return {
                success: false,
                message: `Current stage not complete: ${stageCompletion.reason}`,
                details: stageCompletion
            };
        }

        // Move to next stage
        if (nextStageIndex < workflow.stages.length) {
            workflow.currentStage = nextStageIndex + 1;
            const nextStage = workflow.stages[nextStageIndex];

            // Send notifications for next stage
            await this.sendStageNotifications(votingPeriodId, nextStage);

            // Log stage advancement
            await this.logWorkflowEvent(votingPeriodId, 'stage_advanced', {
                fromStage: currentStage.name,
                toStage: nextStage.name
            });

            return {
                success: true,
                currentStage: nextStage,
                message: `Advanced to ${nextStage.name}`
            };
        } else {
            // Workflow completed
            workflow.status = 'completed';
            workflow.completedDate = new Date();

            await this.finalizeWorkflow(votingPeriodId);

            return {
                success: true,
                completed: true,
                message: 'Workflow completed successfully'
            };
        }
    }

    /**
     * Validate if current stage is complete
     */
    async validateStageCompletion(votingPeriodId, stage) {
        const stats = await this.getStageStatistics(votingPeriodId, stage.name);

        switch (stage.name) {
            case 'Peer Voting':
                const minParticipation = this.config.validationRules.minimumPeerVotingPercentage;
                if (stats.participationRate < minParticipation) {
                    return {
                        isComplete: false,
                        reason: `Participation rate ${stats.participationRate}% is below minimum ${minParticipation}%`,
                        stats
                    };
                }
                break;

            case 'Manager Rating':
                if (stats.pendingRatings > 0) {
                    return {
                        isComplete: false,
                        reason: `${stats.pendingRatings} manager ratings pending`,
                        stats
                    };
                }
                break;

            case 'Director Rating':
                if (stats.pendingRatings > 0) {
                    return {
                        isComplete: false,
                        reason: `${stats.pendingRatings} director ratings pending`,
                        stats
                    };
                }
                break;

            case 'Chief Approval':
                if (stats.pendingApprovals > 0) {
                    return {
                        isComplete: false,
                        reason: `${stats.pendingApprovals} chief approvals pending`,
                        stats
                    };
                }
                break;
        }

        return {
            isComplete: true,
            stats
        };
    }

    /**
     * Get statistics for a specific stage
     */
    async getStageStatistics(votingPeriodId, stageName) {
        const votingRecords = await HierarchicalVote.find({ voting_period_id: votingPeriodId });

        switch (stageName) {
            case 'Peer Voting':
                const totalEligibleVoters = votingRecords.reduce((sum, record) =>
                    sum + record.total_eligible_peer_voters, 0
                );
                const totalVotesReceived = votingRecords.reduce((sum, record) =>
                    sum + record.total_peer_votes_received, 0
                );

                return {
                    totalEligibleVoters,
                    totalVotesReceived,
                    participationRate: totalEligibleVoters > 0 ?
                        (totalVotesReceived / totalEligibleVoters * 100).toFixed(2) : 0,
                    candidatesWithVotes: votingRecords.filter(r => r.total_peer_votes_received > 0).length,
                    totalCandidates: votingRecords.length
                };

            case 'Manager Rating':
                const pendingManagerRatings = votingRecords.filter(record =>
                    !record.is_managerial_position &&
                    (!record.manager_rating_score || record.manager_rating_score === 0)
                ).length;

                return {
                    pendingRatings: pendingManagerRatings,
                    completedRatings: votingRecords.filter(r =>
                        r.manager_rating_score && r.manager_rating_score > 0
                    ).length,
                    totalRequired: votingRecords.filter(r => !r.is_managerial_position).length
                };

            case 'Director Rating':
                const pendingDirectorRatings = votingRecords.filter(record =>
                    record.is_managerial_position &&
                    (!record.manager_rating_score || record.manager_rating_score === 0) &&
                    (!record.director_rating_score || record.director_rating_score === 0)
                ).length;

                return {
                    pendingRatings: pendingDirectorRatings,
                    completedRatings: votingRecords.filter(r =>
                        r.is_managerial_position &&
                        (r.director_rating_score > 0 || r.manager_rating_score > 0)
                    ).length,
                    totalRequired: votingRecords.filter(r => r.is_managerial_position).length
                };

            case 'Chief Approval':
                const pendingApprovals = votingRecords.filter(record =>
                    record.chief_approval_status === 'pending'
                ).length;

                return {
                    pendingApprovals,
                    approved: votingRecords.filter(r => r.chief_approval_status === 'approved').length,
                    rejected: votingRecords.filter(r => r.chief_approval_status === 'rejected').length,
                    totalCandidates: votingRecords.length
                };

            default:
                return {};
        }
    }

    /**
     * Send notifications for a workflow stage
     */
    async sendStageNotifications(votingPeriodId, stage) {
        const participants = await this.getStageParticipants(stage.participants);

        for (const participant of participants) {
            const notification = {
                userId: participant.employee_id,
                type: 'stage_notification',
                stage: stage.name,
                message: `You have pending actions for ${stage.name}`,
                deadline: this.calculateStageDeadline(stage.duration),
                sent: new Date()
            };

            // Store notification
            const workflow = this.activeWorkflows.get(votingPeriodId);
            workflow.notifications.push(notification);

            // Send actual notification (email, SMS, in-app)
            await this.sendNotification(participant, notification);
        }

        // Schedule reminders
        for (const reminderDays of stage.reminders) {
            await this.scheduleReminder(votingPeriodId, stage, reminderDays);
        }
    }

    /**
     * Get participants for a stage based on roles
     */
    async getStageParticipants(participantRoles) {
        const participants = [];

        for (const role of participantRoles) {
            const roleKey = role.toLowerCase();
            const users = await User.find({
                roles: { $in: [roleKey] },
                is_active: true
            });
            participants.push(...users);
        }

        return participants;
    }

    /**
     * Send notification to user
     */
    async sendNotification(user, notification) {
        // Implementation would depend on notification service
        // This is a placeholder for actual notification logic

        if (this.config.notifications.emailEnabled && user.email) {
            // Send email
            console.log(`Email sent to ${user.email}: ${notification.message}`);
        }

        if (this.config.notifications.smsEnabled && user.phone) {
            // Send SMS
            console.log(`SMS sent to ${user.phone}: ${notification.message}`);
        }

        if (this.config.notifications.inAppEnabled) {
            // Send in-app notification
            console.log(`In-app notification for ${user.employee_id}: ${notification.message}`);
        }
    }

    /**
     * Schedule reminder for a stage
     */
    async scheduleReminder(votingPeriodId, stage, daysBeforeDeadline) {
        const reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + stage.duration - daysBeforeDeadline);

        // In production, this would use a job scheduler like node-cron or bull
        setTimeout(async () => {
            await this.sendStageReminder(votingPeriodId, stage);
        }, reminderDate.getTime() - Date.now());
    }

    /**
     * Send stage reminder
     */
    async sendStageReminder(votingPeriodId, stage) {
        const stats = await this.getStageStatistics(votingPeriodId, stage.name);
        const participants = await this.getStageParticipants(stage.participants);

        // Filter participants who haven't completed their actions
        const pendingParticipants = await this.getPendingParticipants(votingPeriodId, stage);

        for (const participant of pendingParticipants) {
            const reminder = {
                userId: participant.employee_id,
                type: 'reminder',
                stage: stage.name,
                message: `Reminder: Please complete your ${stage.name} actions`,
                stats,
                sent: new Date()
            };

            await this.sendNotification(participant, reminder);
        }
    }

    /**
     * Get participants with pending actions
     */
    async getPendingParticipants(votingPeriodId, stage) {
        const pendingUsers = [];

        switch (stage.name) {
            case 'Peer Voting':
                // Get users who haven't voted
                const allProfessionals = await User.find({
                    roles: { $in: ['professional', 'user'] },
                    is_active: true
                });

                for (const professional of allProfessionals) {
                    const hasVoted = await HierarchicalVote.findOne({
                        voting_period_id: votingPeriodId,
                        'peer_votes.voter_employee_id': professional.employee_id
                    });

                    if (!hasVoted) {
                        pendingUsers.push(professional);
                    }
                }
                break;

            case 'Manager Rating':
                // Get managers with pending ratings
                const managers = await User.find({
                    roles: { $in: ['manager'] },
                    is_active: true
                });

                for (const manager of managers) {
                    const pendingRatings = await HierarchicalVote.find({
                        voting_period_id: votingPeriodId,
                        manager_id: manager.employee_id,
                        manager_rating_score: { $in: [null, 0] }
                    });

                    if (pendingRatings.length > 0) {
                        pendingUsers.push(manager);
                    }
                }
                break;

            case 'Director Rating':
                // Get directors with pending ratings
                const directors = await User.find({
                    roles: { $in: ['director'] },
                    is_active: true
                });

                for (const director of directors) {
                    const pendingRatings = await HierarchicalVote.find({
                        voting_period_id: votingPeriodId,
                        director_id: director.employee_id,
                        director_rating_score: { $in: [null, 0] },
                        manager_rating_score: { $in: [null, 0] }
                    });

                    if (pendingRatings.length > 0) {
                        pendingUsers.push(director);
                    }
                }
                break;

            case 'Chief Approval':
                // Get chiefs with pending approvals
                const chiefs = await User.find({
                    roles: { $in: ['chief'] },
                    is_active: true
                });

                for (const chief of chiefs) {
                    const pendingApprovals = await HierarchicalVote.find({
                        voting_period_id: votingPeriodId,
                        chief_approval_status: 'pending'
                    });

                    if (pendingApprovals.length > 0) {
                        pendingUsers.push(chief);
                    }
                }
                break;
        }

        return pendingUsers;
    }

    /**
     * Finalize workflow
     */
    async finalizeWorkflow(votingPeriodId) {
        // Calculate final results
        const results = await this.calculateFinalResults(votingPeriodId);

        // Update voting period status
        await VotingPeriod.findOneAndUpdate(
            { period_id: votingPeriodId },
            {
                status: 'completed',
                completed_date: new Date(),
                final_results: results
            }
        );

        // Archive workflow
        this.completedStages.set(votingPeriodId, this.activeWorkflows.get(votingPeriodId));
        this.activeWorkflows.delete(votingPeriodId);

        // Send completion notifications
        await this.sendCompletionNotifications(votingPeriodId, results);

        // Log completion
        await this.logWorkflowEvent(votingPeriodId, 'completed', { results });

        return results;
    }

    /**
     * Calculate final voting results
     */
    async calculateFinalResults(votingPeriodId) {
        const votingRecords = await HierarchicalVote.find({
            voting_period_id: votingPeriodId,
            chief_approval_status: 'approved'
        });

        // Group by department
        const departmentResults = new Map();

        votingRecords.forEach(record => {
            const dept = record.candidate_department;
            if (!departmentResults.has(dept)) {
                departmentResults.set(dept, []);
            }
            departmentResults.get(dept).push(record);
        });

        // Find winners
        const winners = [];
        departmentResults.forEach((candidates, department) => {
            const winner = candidates.reduce((best, current) => {
                const currentScore = current.is_managerial_position ?
                    current.total_rating_result :
                    current.total_weighted_result;

                const bestScore = best.is_managerial_position ?
                    best.total_rating_result :
                    best.total_weighted_result;

                return currentScore > bestScore ? current : best;
            });

            winners.push({
                department,
                winner: {
                    employee_id: winner.candidate_employee_id,
                    name: `${winner.candidate_first_name} ${winner.candidate_last_name}`,
                    position: winner.candidate_position,
                    score: winner.is_managerial_position ?
                        winner.total_rating_result :
                        winner.total_weighted_result
                }
            });
        });

        return {
            totalCandidates: votingRecords.length,
            departmentWinners: winners,
            timestamp: new Date()
        };
    }

    /**
     * Send completion notifications
     */
    async sendCompletionNotifications(votingPeriodId, results) {
        // Notify all participants about completion
        const allUsers = await User.find({ is_active: true });

        for (const user of allUsers) {
            const notification = {
                userId: user.employee_id,
                type: 'workflow_completed',
                message: 'Voting period has been completed. Results are now available.',
                results: results.departmentWinners.find(w =>
                    w.department === user.department
                ),
                sent: new Date()
            };

            await this.sendNotification(user, notification);
        }
    }

    /**
     * Log workflow event
     */
    async logWorkflowEvent(votingPeriodId, eventType, details = {}) {
        const workflow = this.activeWorkflows.get(votingPeriodId) ||
                        this.completedStages.get(votingPeriodId);

        if (workflow) {
            workflow.history.push({
                eventType,
                timestamp: new Date(),
                details
            });
        }

        // Also log to database if needed
        console.log(`Workflow Event: ${eventType}`, {
            votingPeriodId,
            details,
            timestamp: new Date()
        });
    }

    /**
     * Calculate estimated end date for workflow
     */
    calculateEndDate(stages) {
        const totalDays = stages.reduce((sum, stage) => sum + stage.duration, 0);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + totalDays);
        return endDate;
    }

    /**
     * Calculate stage deadline
     */
    calculateStageDeadline(duration) {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + duration);
        return deadline;
    }

    /**
     * Get workflow status
     */
    getWorkflowStatus(votingPeriodId) {
        const workflow = this.activeWorkflows.get(votingPeriodId);
        if (!workflow) {
            return { exists: false };
        }

        return {
            exists: true,
            ...workflow,
            currentStageName: workflow.stages[workflow.currentStage - 1].name
        };
    }

    /**
     * Cancel workflow
     */
    async cancelWorkflow(votingPeriodId, reason) {
        const workflow = this.activeWorkflows.get(votingPeriodId);
        if (!workflow) {
            throw new Error('Workflow not found');
        }

        workflow.status = 'cancelled';
        workflow.cancelledDate = new Date();
        workflow.cancellationReason = reason;

        // Update voting period
        await VotingPeriod.findOneAndUpdate(
            { period_id: votingPeriodId },
            {
                status: 'cancelled',
                cancelled_date: new Date(),
                cancellation_reason: reason
            }
        );

        // Move to completed
        this.completedStages.set(votingPeriodId, workflow);
        this.activeWorkflows.delete(votingPeriodId);

        // Log cancellation
        await this.logWorkflowEvent(votingPeriodId, 'cancelled', { reason });

        return { success: true, message: 'Workflow cancelled' };
    }
}

// Create and export singleton instance
const workflowManager = new WorkflowManager();
export default workflowManager;