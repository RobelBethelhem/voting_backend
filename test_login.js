import fetch from 'node-fetch';

async function testLogins() {
    console.log('🧪 Testing login endpoints...\n');

    const loginTests = [
        {
            name: "Chief with email + test123",
            endpoint: "http://localhost:5000/api/temp-login",
            body: {
                email: "chief@bank.com",
                password: "test123"
            }
        },
        {
            name: "Director with email + 1234 (testing)",
            endpoint: "http://localhost:5000/api/temp-login",
            body: {
                email: "director.it@bank.com",
                password: "1234"
            }
        },
        {
            name: "Manager with username + test123",
            endpoint: "http://localhost:5000/api/temp-login",
            body: {
                user: "mgr.it.dev",
                password: "test123"
            }
        },
        {
            name: "Professional with simple-login",
            endpoint: "http://localhost:5000/api/simple-login",
            body: {
                user: "dev.senior",
                password: "test123"
            }
        }
    ];

    for (const test of loginTests) {
        console.log(`🔐 Testing: ${test.name}`);

        try {
            const response = await fetch(test.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(test.body)
            });

            const data = await response.json();

            if (response.ok) {
                console.log(`   ✅ SUCCESS`);
                console.log(`   User: ${data.data?.employee_id} (${data.data?.level})`);
                console.log(`   Department: ${data.data?.department}`);
                console.log(`   Performance Score: ${data.data?.performance_appraisal_score}`);
            } else {
                console.log(`   ❌ FAILED: ${data.message}`);
            }
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
        }
        console.log('');
    }

    console.log('📋 Available Test Accounts:');
    console.log('📧 Email Login (with temp-login):');
    console.log('   chief@bank.com / test123 or 1234');
    console.log('   director.it@bank.com / test123 or 1234');
    console.log('   manager.dev@bank.com / test123 or 1234');
    console.log('');
    console.log('👤 Username Login (with temp-login or simple-login):');
    console.log('   chief.admin / test123');
    console.log('   dir.it / test123');
    console.log('   mgr.it.dev / test123');
    console.log('   dev.senior / test123');
}

testLogins();