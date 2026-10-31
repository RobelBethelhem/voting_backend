#!/usr/bin/env python3
import re

# Read the file
with open('/d/Voting/voting_backend/scripts/rebuild_database.js', 'r') as f:
    content = f.read()

# Find and replace the createPerformanceAppraisals function
old_function = '''// Create performance appraisals
const createPerformanceAppraisals = async () => {
    console.log("\\n📊 Creating performance appraisals...");

    const users = await User.find({ level: { $ne: "chief" } });
    const appraisals = users.map(user => ({
        employee_id: user.employee_id,
        appraisal_period: "Q4-2024",
        performance_score: user.performance_appraisal_score,
        manager_rating: user.level === "professional" ? Math.floor(Math.random() * 10) + 35 : Math.floor(Math.random() * 10) + 40,
        peer_rating: user.level === "professional" ? Math.floor(Math.random() * 10) + 30 : null,
        weighted_total: user.performance_appraisal_score,
        status: "completed",
        created_by: user.manager_id || user.director_id || "CHIEF001",
        created_at: new Date()
    }));

    await PerformanceAppraisal.insertMany(appraisals);
    console.log(`✅ Created ${appraisals.length} performance appraisals`);
};'''

new_function = '''// Create performance appraisals
const createPerformanceAppraisals = async () => {
    console.log("\\n📊 Creating performance appraisals...");

    const users = await User.find({ level: { $ne: "chief" } });
    const appraisals = users.map(user => {
        // Determine overall rating based on performance score
        let overall_rating = "Needs Improvement";
        if (user.performance_appraisal_score >= 85) overall_rating = "Excellent";
        else if (user.performance_appraisal_score >= 75) overall_rating = "Good";
        else if (user.performance_appraisal_score >= 65) overall_rating = "Satisfactory";

        return {
            employee_id: user.employee_id,
            appraisal_period: "Q4-2024",
            performance_score: user.performance_appraisal_score,
            goals_achieved: Math.floor(user.performance_appraisal_score * 0.9 + Math.random() * 10),
            competency_score: Math.floor(user.performance_appraisal_score * 0.85 + Math.random() * 15),
            overall_rating: overall_rating,
            created_by: user.manager_id || user.director_id || "CHIEF001",
            created_at: new Date()
        };
    });

    await PerformanceAppraisal.insertMany(appraisals);
    console.log(`✅ Created ${appraisals.length} performance appraisals`);
};'''

# Replace the content
content = content.replace(old_function, new_function)

# Write it back
with open('/d/Voting/voting_backend/scripts/rebuild_database.js', 'w') as f:
    f.write(content)

print("✅ Fixed the rebuild_database.js script")