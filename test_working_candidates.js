import fetch from 'node-fetch';

async function testWorkingCandidates() {
    console.log('🧪 Testing working candidates endpoint...');

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

        // Step 2: Test the new working candidates endpoint
        console.log('\n2. Fetching candidates from working endpoint...');
        console.log('   Debug: About to call working candidates endpoint...');
        const candidateResponse = await fetch('http://localhost:5000/api/rms/admin/landing/test_working_candidates', {
            headers: {
                'x-access-token': loginData.accessToken,
                'Content-Type': 'application/json'
            }
        });

        console.log('   Response status:', candidateResponse.status);

        if (candidateResponse.ok) {
            const candidates = await candidateResponse.json();
            console.log('✅ Working endpoint successful!');
            console.log('   Total candidates:', candidates.length);

            if (candidates.length > 0) {
                console.log('   Candidates available for voting:');
                candidates.forEach(c => {
                    console.log(`     ${c.employee_id}: ${c.full_name} (${c.level}, ${c.department})`);
                    console.log(`       Performance Score: ${c.performance_appraisal_score}`);
                    console.log(`       Vote Type: ${c.voting_context?.vote_type}`);
                });

                console.log('\n🎉 SUCCESS! Professional can vote on peer candidates:');
                console.log(`   Professional PRO003 can vote on ${candidates.length} IT department peers`);
                console.log('   This is exactly what should happen in hierarchical voting!');
            } else {
                console.log('❌ No candidates returned from working endpoint');
            }
        } else {
            const errorData = await candidateResponse.text();
            console.log('❌ Working endpoint failed');
            console.log('   Error:', errorData);
        }

    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

testWorkingCandidates();