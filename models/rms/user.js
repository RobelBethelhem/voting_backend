

import mongoose from "mongoose";
import { fiscalYearScopedPlugin } from "../../utils/fiscalYear.js";
const Schema = mongoose.Schema;

const userSchema =  new Schema({
    first_name: { 
        type: String,
        required: true,
        trim: true,
    },
    last_name: { 
        type: String,
        required: true,
        trim: true,
    },
    
    employee_id: { 
        type: String,
        required: true,
        trim: true,
    },

    user: {
        type: String,
        required: true,
        trim: true,
    },
    username: {
        type: String,
        trim: true,
    },

    position: { 
        type: String,
        required: true,
        trim: true,
    },
    department: { 
        type: String,
        required: true,
        trim: true,
    },
    
    email: { 
        type: String,
        required: true,
    },
    password: { 
        type: String,
        required: true,
        default: "$2b$10$FPGWuVHDUTNQ7gyiDa5mzubgI4CFvrud0P7pA1ku2lGh9Br3MXYQa"
    },
   
    roles: {
        type: [String],
        enum: ["user","admin","manager","director","chief"],
        default: ["user"],
    },
    level: {
        type: String,
        enum: ["professional", "manager", "director", "chief"],
        required: true,
        default: "professional"
    },
    job_grade: {
        type: String,
        trim: true,
    },
    function: {
        type: String,
        trim: true,
    },
    manager_id: {
        type: String,
        trim: true,
    },
    director_id: {
        type: String,
        trim: true,
    },
    chief_id: {
        type: String,
        trim: true,
    },
    performance_appraisal_score: {
        type: Number,
        default: 0
    },
    is_managerial: {
        type: Boolean,
        default: false
    },
    status:{
        type: Boolean,
        default: true
    }
    });

    // Each fiscal year keeps its own copy (imported fresh or copied from the year before);
    // queries see the current year's unless they name a fiscal_year (utils/fiscalYear.js)
    // Admin accounts are shared by every fiscal year
    userSchema.plugin(fiscalYearScopedPlugin, { shared: { roles: 'admin' } });
    userSchema.index({ user: 1, fiscal_year: 1 }, { unique: true });
    userSchema.index({ email: 1, fiscal_year: 1 }, { unique: true });

   // const User = mongoose.model("User",userSchema);

    const User = mongoose.models.User || mongoose.model('User', userSchema);
    export default User;

    