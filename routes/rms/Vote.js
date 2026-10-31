import {Router} from "express";
import User from "../../models/rms/User.js";
import Vote from "../../models/rms/Vote.js"
import mongoose from 'mongoose';
import auth from "../../middleware/rms/auth.js";
import roleCheck from "../../middleware/rms/roleCheck.js";
import Candidate from "../../models/rms/Candidate.js";
import EvaluationCriteria from "../../models/rms/EvaluationCriteria.js";
import { currentFiscalYearFilter } from "../../utils/fiscalYear.js";
import { currentVotingWindow } from "../../utils/votingPeriod.js";



const router = Router();



router.post("/vote_candidate", auth, roleCheck(["admin","user"]), async(req,res,next)=>{
    try{

        const user = await User.findById(req.user._id).lean();
        if (!user) {
            return res.status(400).json({ error: true, message: "Requester not found" });
        }

        // Peer votes are accepted only during the current fiscal year's voting period
        const window = await currentVotingWindow();
        if (!window.open) {
            return res.status(403).json({ error: true, message: window.message, voting_window: window });
        }

        const {first_name, last_name, employee_id, position, department} = user
      
        const { employee, evaluations, totalScore } = req.body;

        console.log("Received evaluations:", evaluations);

        // Get the dynamic evaluation criteria to create mapping
        const criteria = await EvaluationCriteria.find({ category: 'peer', is_active: true });
        console.log("Available criteria:", criteria.map(c => ({ id: c._id, name: c.criteria_name })));

        // Keep every rated criterion so the statistics page can show all of them
        const criteria_ratings = [];
        for (const evaluation of evaluations) {
            const criteria_obj = criteria.find(c => c._id.toString() === evaluation.criteriaId);
            if (criteria_obj) {
                criteria_ratings.push({
                    criteria_id: criteria_obj._id,
                    criteria_name: criteria_obj.criteria_name,
                    weight: criteria_obj.weight,
                    rating: evaluation.rating
                });
            } else {
                console.warn(`Unknown or inactive peer criteria: ${evaluation.criteriaId}`);
            }
        }
        const candidate_info = await Candidate.findOne({employee_id: employee.employee_id})
        if(!candidate_info) return res.status(400).json({ error: true, message: "Candidate not found" });

        // One vote per voter in the current fiscal year
        const fiscalYear = await currentFiscalYearFilter();
        const isDuplicate = await Vote.findOne({ voter_emp_id: employee_id, ...fiscalYear }) 

        if(isDuplicate) return res.status(400).json({ error: true, message: "You Already Vote"});
        
       
        let Accrue_Weight = 0;
        const voted = await Vote.find({ candidate_emp_id: employee.employee_id, ...fiscalYear })
        .sort({ $natural: -1 })
        .lean();


        console.log("votedvotedvoted", voted)
       
    

      
        if (!voted || voted.length === 0) {
            Accrue_Weight = totalScore;
        }
        else{
            Accrue_Weight = voted[0].Accrue_Weight + totalScore;
        }
       
     

        
        const saveVoter_ToDB = {
            voter_first_name: first_name,
            voter_last_name: last_name,
            voter_emp_id: employee_id,
            voter_position: position,
            voter_department: department,
            candidate_first_name: employee.first_name,
            candidate_last_name: employee.last_name,
            candidate_emp_id: employee.employee_id,
            candidate_position: candidate_info.position,
            candidate_department: candidate_info.department,
            criteria_ratings: criteria_ratings,
            Total_Weight: totalScore,
            Accrue_Weight: Accrue_Weight
        };

        console.log("Final vote data to save:", saveVoter_ToDB);
        
        
        const saveDB = new Vote(saveVoter_ToDB);
        await saveDB.save();
        

        const updatedData = {
            status: true,
        }
        const updatedUser = await User.findByIdAndUpdate(req.user._id,updatedData,{
            new: true
        })



        res.status(201).json({ error: false, message: "Your Vote Successfully Registered" });


    }
    catch(e){
      console.log("Error",e)
      res.status(400).json({ error: false, message: "Could Not Do the Operation " });
    }
  })

// API endpoint to get eligible voters by department from User model
router.get("/eligible-voters/:department", auth, async (req, res) => {
    try {
        const { department } = req.params;

        console.log(`📊 Getting eligible voters for department: ${department}`);

        // Get all non-managerial users in the department (eligible for peer voting)
        const eligibleVoters = await User.find({
            department: department,
            level: { $nin: ['manager', 'director', 'chief'] }, // Exclude managerial levels
            roles: { $nin: ['manager', 'director', 'chief'] } // Exclude managerial roles,
        }).select('employee_id first_name last_name position level roles');

        console.log(`✅ Found ${eligibleVoters.length} eligible voters in ${department}`);

        res.status(200).json({
            success: true,
            message: 'Eligible voters retrieved successfully',
            data: {
                department: department,
                total_eligible_voters: eligibleVoters.length,
                eligible_voters: eligibleVoters
            }
        });

    } catch (error) {
        console.error('❌ Error getting eligible voters:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
});

// API endpoint to get actual voting statistics by department
router.get("/voting-stats/:department", auth, async (req, res) => {
    try {
        const { department } = req.params;

        console.log(`📊 Getting voting statistics for department: ${department}`);

        // Votes of the current fiscal year
        const fiscalYear = await currentFiscalYearFilter();

        // Get total number of actual voters (who voted) in this department
        const actualVoters = await Vote.distinct('voter_emp_id', {
            voter_department: department,
            ...fiscalYear
        });

        // Get all votes in this department with candidate and voter info
        const departmentVotes = await Vote.find({
            voter_department: department,
            ...fiscalYear
        }).select('voter_emp_id candidate_emp_id candidate_first_name candidate_last_name Total_Weight Accrue_Weight TimeStamp');

        // Group votes by candidate
        const candidateVotingData = {};
        for (const vote of departmentVotes) {
            const candidateId = vote.candidate_emp_id;
            const candidateName = `${vote.candidate_first_name} ${vote.candidate_last_name}`;

            if (!candidateVotingData[candidateId]) {
                candidateVotingData[candidateId] = {
                    candidate_id: candidateId,
                    candidate_name: candidateName,
                    votes_received: 0,
                    total_weight_sum: 0,
                    accrue_weight_sum: 0,
                    voters: []
                };
            }

            candidateVotingData[candidateId].votes_received++;
            candidateVotingData[candidateId].total_weight_sum += vote.Total_Weight || 0;
            candidateVotingData[candidateId].accrue_weight_sum += vote.Accrue_Weight || 0;
            candidateVotingData[candidateId].voters.push(vote.voter_emp_id);
        }

        console.log(`✅ Found ${actualVoters.length} actual voters and ${Object.keys(candidateVotingData).length} candidates in ${department}`);

        res.status(200).json({
            success: true,
            message: 'Voting statistics retrieved successfully',
            data: {
                department: department,
                total_actual_voters: actualVoters.length,
                actual_voters: actualVoters,
                candidate_voting_data: candidateVotingData
            }
        });

    } catch (error) {
        console.error('❌ Error getting voting statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
});

// API endpoint to get peer rating data for a specific candidate
router.get("/peer-rating/:candidateId/:department", auth, async (req, res) => {
    try {
        const { candidateId, department } = req.params;

        console.log(`📊 Getting peer rating for candidate: ${candidateId} in department: ${department}`);

        // Get all votes for this specific candidate in this department, current fiscal year
        const candidateVotes = await Vote.find({
            candidate_emp_id: candidateId,
            voter_department: department,
            ...(await currentFiscalYearFilter())
        }).select('voter_emp_id Total_Weight Accrue_Weight TimeStamp');

        // Calculate statistics
        const votesCount = candidateVotes.length;
        const totalWeightSum = candidateVotes.reduce((sum, vote) => sum + (vote.Total_Weight || 0), 0);
        const accrueWeightSum = candidateVotes.reduce((sum, vote) => sum + (vote.Accrue_Weight || 0), 0);

        // Average peer rating using Total_Weight (as corrected by user)
        // Example: (46.25 + 50) / 2 = 48.125 out of 50
        const averagePeerRating = votesCount > 0 ? totalWeightSum / votesCount : 0;

        // Convert to 20% scale: (average_rating * 20) / 50
        // Example: (48.125 * 20) / 50 = 19.25
        const peerRatingOutOf20 = (averagePeerRating * 20) / 50;

        console.log(`✅ Peer rating calculated for ${candidateId}:`, {
            votes_count: votesCount,
            total_weight_sum: totalWeightSum,
            average_peer_rating: averagePeerRating,
            peer_rating_out_of_20: peerRatingOutOf20,
            calculation: `(${totalWeightSum} ÷ ${votesCount}) × 20 ÷ 50 = ${peerRatingOutOf20.toFixed(2)}`
        });

        res.status(200).json({
            success: true,
            message: 'Peer rating retrieved successfully',
            data: {
                candidate_id: candidateId,
                department: department,
                votes_received: votesCount,
                total_weight_sum: totalWeightSum,
                accrue_weight_sum: accrueWeightSum,
                average_peer_rating: averagePeerRating,
                peer_rating_out_of_20: peerRatingOutOf20,
                voters: candidateVotes.map(v => v.voter_emp_id)
            }
        });

    } catch (error) {
        console.error('❌ Error getting peer rating:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
});

  export default router;


