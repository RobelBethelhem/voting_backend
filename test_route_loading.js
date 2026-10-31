// Test script to check if StaffApproval routes are loading properly
import StaffApproval from "./routes/rms/StaffApproval.js";

console.log('🧪 Testing StaffApproval route loading...');

try {
    console.log('✅ StaffApproval routes imported successfully');
    console.log('Route stack:', StaffApproval.stack ? StaffApproval.stack.length : 'No stack property');

    // Try to see the routes
    if (StaffApproval.stack) {
        console.log('Available routes:');
        StaffApproval.stack.forEach((layer, index) => {
            console.log(`  ${index + 1}. ${layer.route ? layer.route.path : 'middleware'} (${layer.route ? Object.keys(layer.route.methods).join(',') : 'N/A'})`);
        });
    }
} catch (error) {
    console.log('❌ Error loading StaffApproval routes:', error.message);
    console.log('Stack trace:', error.stack);
}

console.log('🔍 Route loading test completed!');