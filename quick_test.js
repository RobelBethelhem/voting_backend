import fetch from 'node-fetch';

async function quickTest() {
    try {
        console.log('🧪 Quick login test...');

        // Test 1: Simple login test with correct email and 1234 password
        const response = await fetch('http://localhost:5000/api/temp-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'chief@bank.com',
                password: '1234'
            })
        });

        const data = await response.json();
        console.log('Response status:', response.status);
        console.log('Response:', data);

        if (response.ok) {
            console.log('✅ Login successful!');
            console.log('User details:');
            console.log('  Employee ID:', data.data?.employee_id);
            console.log('  Level:', data.data?.level);
            console.log('  Department:', data.data?.department);
            console.log('  Performance Score:', data.data?.performance_appraisal_score);
        } else {
            console.log('❌ Login failed:', data.message);
        }

    } catch (error) {
        console.log('❌ Connection error:', error.message);
        console.log('');
        console.log('🔧 Troubleshooting:');
        console.log('1. Make sure backend server is running: cd voting_backend && node app.js');
        console.log('2. Server should be running on http://localhost:5000');
        console.log('3. Check if MongoDB is running');
    }
}

quickTest();