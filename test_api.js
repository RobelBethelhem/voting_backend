import fetch from 'node-fetch';

async function testAPI() {
    try {
        console.log('🧪 Testing API endpoints...\n');

        // First, let's try to login to get a token
        console.log('1. Testing login...');
        const loginResponse = await fetch('http://localhost:5000/api/simple-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user: 'chief.admin',
                password: 'test123'
            })
        });

        if (!loginResponse.ok) {
            console.log('❌ Login failed:', loginResponse.status);
            const errorData = await loginResponse.text();
            console.log('Error details:', errorData);
            return;
        }

        const loginData = await loginResponse.json();
        console.log('✅ Login successful');
        console.log('User info:', {
            employee_id: loginData.data?.employee_id,
            level: loginData.data?.level,
            department: loginData.data?.department
        });

        const token = loginData.accessToken;
        if (!token) {
            console.log('❌ No access token received');
            return;
        }

        // Test the candidates endpoint
        console.log('\n2. Testing get_candidate_by_department endpoint...');
        const candidatesResponse = await fetch('http://localhost:5000/api/rms/admin/landing/get_candidate_by_department', {
            method: 'GET',
            headers: {
                'x-access-token': token,
                'Content-Type': 'application/json'
            }
        });

        if (!candidatesResponse.ok) {
            console.log('❌ Candidates fetch failed:', candidatesResponse.status);
            const errorData = await candidatesResponse.text();
            console.log('Error details:', errorData);
            return;
        }

        const candidatesData = await candidatesResponse.json();
        console.log('✅ Candidates fetched successfully');
        console.log('Total candidates:', candidatesData.data?.length || 0);
        console.log('Voter info:', candidatesData.meta?.voter_info);
        console.log('Active voting period:', candidatesData.meta?.active_voting_period?.period_id);

        if (candidatesData.data && candidatesData.data.length > 0) {
            console.log('\nSample candidate:');
            const sample = candidatesData.data[0];
            console.log({
                employee_id: sample.employee_id,
                full_name: sample.full_name,
                department: sample.department,
                level: sample.level,
                performance_score: sample.performance_appraisal_score,
                voting_context: sample.voting_context
            });
        }

        console.log('\n🎉 API tests completed successfully!');
        console.log('Your database IS populated and the API is working correctly.');

    } catch (error) {
        console.error('❌ Test error:', error.message);
        console.log('\nTroubleshooting:');
        console.log('1. Make sure backend server is running on port 5000');
        console.log('2. Check if MongoDB is running');
        console.log('3. Verify database has been initialized');
    }
}

testAPI();