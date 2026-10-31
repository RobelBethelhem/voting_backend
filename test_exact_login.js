import fetch from 'node-fetch';

async function testExactLogin() {
    console.log('🧪 Testing exact login with available users...\n');

    const testCases = [
        { email: 'ops.analyst@bank.com', password: '1234' },
        { email: 'chief@bank.com', password: '1234' },
        { email: 'senior.dev@bank.com', password: '1234' },
    ];

    for (const testCase of testCases) {
        console.log(`Testing: ${testCase.email} / ${testCase.password}`);

        try {
            const response = await fetch('http://localhost:5000/api/temp-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testCase)
            });

            const data = await response.json();

            if (response.ok) {
                console.log(`✅ SUCCESS!`);
                console.log(`   Employee: ${data.data?.employee_id} (${data.data?.level})`);
                console.log(`   Department: ${data.data?.department}`);
                console.log(`   Performance: ${data.data?.performance_appraisal_score}`);

                // Test getting candidates for this user
                console.log('   Testing candidate fetch...');
                const candidateResponse = await fetch('http://localhost:5000/api/rms/admin/landing/get_candidate_by_department', {
                    headers: {
                        'x-access-token': data.accessToken
                    }
                });

                if (candidateResponse.ok) {
                    const candidateData = await candidateResponse.json();
                    console.log(`   Candidates available: ${candidateData.data?.length || 0}`);
                    if (candidateData.data && candidateData.data.length > 0) {
                        console.log(`   Sample candidate: ${candidateData.data[0].employee_id} (${candidateData.data[0].level})`);
                    }
                } else {
                    console.log(`   Candidate fetch failed: ${candidateResponse.status}`);
                }
            } else {
                console.log(`❌ FAILED: ${data.message}`);
            }
        } catch (error) {
            console.log(`❌ ERROR: ${error.message}`);
        }
        console.log('');
    }
}

testExactLogin();