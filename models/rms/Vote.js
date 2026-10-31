import mongoose from "mongoose";
import { fiscalYearPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

const voteSchema =  new Schema({
    voter_first_name: { 
        type: String,
        required: true,
        trim: true,
    },
    voter_last_name: { 
        type: String,
        required: true,
        trim: true,
    },
    voter_emp_id: { 
        type: String,
        required: true,
        trim: true,
    },
    voter_position:{
        type: String,
        required: true,
     
        trim: true,
    },
    voter_department:{
        type: String,
        required: true,
       
        trim: true,
    },

    candidate_first_name: { 
        type: String,
        required: true,
        trim: true,
    },
    candidate_last_name: { 
        type: String,
        required: true,
        trim: true,
    },
    candidate_emp_id: { 
        type: String,
        required: true,
        trim: true,
    },

    candidate_position:{
        type: String,
        required: true,
      
        trim: true,
    },
    candidate_department:{
        type: String,
        required: true,
       
        trim: true,
    },

    // Every peer criterion the voter rated, whatever the admin named it
    criteria_ratings: [{
        criteria_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'EvaluationCriteria',
            required: true
        },
        criteria_name: {
            type: String,
            required: true
        },
        weight: {
            type: Number,
            required: true
        },
        rating: {
            type: Number,
            required: true
        }
    }],

    // Fixed KPI fields used by votes saved before criteria_ratings existed
    Dedication: {
        type: Number,
    },
    Quality_of_Work: {
        type: Number,
    },
    Collaboration_Or_Team_Work: {
        type: Number,
    },
    Independence: {
        type: Number,
    },
    Customer_Service: {
        type: Number,
    },
    Time_Mgt: {
        type: Number,
    },
    Proper_Office_Attire_and_Dress_Code:{
        type: Number,
    },

    Flexibility:{
        type: Number,
    },

    Total_Weight:{
        type: Number,
        required: true,
    },

    Accrue_Weight:{
        type: Number,
        required: true,
    },
    TimeStamp:{
        type: Date,
        default: Date.now
    }
    });

    // One vote per voter in each fiscal year
    voteSchema.plugin(fiscalYearPlugin);
    voteSchema.index({ voter_emp_id: 1, fiscal_year: 1 }, { unique: true });

    const Vote = mongoose.model('Vote', voteSchema);
    export default Vote;

    