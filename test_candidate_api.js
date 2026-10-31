import fetch from 'node-fetch';

async function testCandidateAPI() {
    console.log('🧪 Testing candidate API for professional user...');

    try {
        // Step 1: Login as professional
        console.log('1. Logging in as ops.analyst@bank.com...');
        const loginResponse = await fetch('http://localhost:5000/api/final-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'ops.analyst@bank.com',
                password: '1234'
            })
        });

        if (!loginResponse.ok) {
            console.log('❌ Login failed:', loginResponse.status);
            return;
        }

        const loginData = await loginResponse.json();
        console.log('✅ Login success:');
        console.log('   Employee ID:', loginData.data?.employee_id);
        console.log('   Level:', loginData.data?.level);
        console.log('   Department:', loginData.data?.department);
        console.log('   Token:', loginData.accessToken ? 'Generated' : 'Missing');

        // Step 2: Fetch candidates
        console.log('\n2. Fetching candidates...');
        const candidateResponse = await fetch('http://localhost:5000/api/rms/admin/landing/get_candidate_by_department', {
            headers: {
                'x-access-token': loginData.accessToken,
                'Content-Type': 'application/json'
            }
        });

        console.log('   Response status:', candidateResponse.status);

        if (candidateResponse.ok) {
            const candidateData = await candidateResponse.json();
            console.log('✅ API call successful');
            console.log('   Total candidates:', candidateData.data?.length || 0);
            console.log('   Voter info:', candidateData.meta?.voter_info);

            if (candidateData.data && candidateData.data.length > 0) {
                console.log('   Candidates available for voting:');
                candidateData.data.forEach(c => {
                    console.log(`     ${c.employee_id}: ${c.full_name} (${c.level}, ${c.department}, Score: ${c.performance_appraisal_score})`);
                });
            } else {
                console.log('❌ No candidates returned');
                console.log('   Response meta:', JSON.stringify(candidateData.meta, null, 4));
            }
        } else {
            const errorData = await candidateResponse.text();
            console.log('❌ API call failed');
            console.log('   Error:', errorData);
        }

    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

testCandidateAPI();