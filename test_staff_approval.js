import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Test function to verify staff approval endpoints
async function testStaffApprovalEndpoints() {
    console.log('🧪 Testing Staff Approval Endpoints...\n');

    // Test 1: Check if route is accessible (should return auth error)
    console.log('1. Testing route accessibility...');
    try {
        const response = await fetch(`${BASE_URL}/api/staff-approval/my-staff-approvals`);
        const data = await response.json();
        console.log('✅ Route accessible:', data.message);
    } catch (error) {
        console.log('❌ Route not accessible:', error.message);
    }

    // Test 2: Test approve-reject-staff endpoint
    console.log('\n2. Testing approve-reject-staff endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/api/staff-approval/approve-reject-staff`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                employee_id: 'TEST001',
                approval_status: 'approved'
            })
        });
        const data = await response.json();
        console.log('✅ Endpoint accessible:', data.message);
        console.log('Response status:', response.status);
    } catch (error) {
        console.log('❌ Endpoint error:', error.message);
    }

    // Test 3: Test with OPTIONS method (CORS preflight)
    console.log('\n3. Testing CORS preflight (OPTIONS)...');
    try {
        const response = await fetch(`${BASE_URL}/api/staff-approval/approve-reject-staff`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:3000',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type,x-access-token'
            }
        });
        console.log('✅ CORS preflight status:', response.status);
        console.log('CORS headers:', {
            'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
            'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
            'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers')
        });
    } catch (error) {
        console.log('❌ CORS preflight error:', error.message);
    }

    console.log('\n🔍 Test completed!');
}

// Run the test
testStaffApprovalEndpoints().catch(console.error);