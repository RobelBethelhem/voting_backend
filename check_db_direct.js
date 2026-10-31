import mongoose from 'mongoose';

async function checkDatabase() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect('mongodb://localhost:27017/voting_system');
        console.log('✅ Connected successfully');

        // List all collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`\n📁 Collections found: ${collections.length}`);
        collections.forEach(col => console.log(`  - ${col.name}`));

        // Check if users collection exists and has data
        const db = mongoose.connection.db;

        if (collections.find(c => c.name === 'users')) {
            const userCount = await db.collection('users').countDocuments();
            console.log(`\n👥 Users collection: ${userCount} documents`);

            if (userCount > 0) {
                const sampleUser = await db.collection('users').findOne({});
                console.log('Sample user fields:', Object.keys(sampleUser));
                console.log('Sample user data:', {
                    employee_id: sampleUser.employee_id,
                    user: sampleUser.user,
                    level: sampleUser.level,
                    department: sampleUser.department
                });
            }
        }

        if (collections.find(c => c.name === 'performanceappraisals')) {
            const perfCount = await db.collection('performanceappraisals').countDocuments();
            console.log(`\n📊 PerformanceAppraisals collection: ${perfCount} documents`);
        }

        if (collections.find(c => c.name === 'votingperiods')) {
            const periodCount = await db.collection('votingperiods').countDocuments();
            console.log(`\n🗳️ VotingPeriods collection: ${periodCount} documents`);
        }

        // Check what database we're actually connected to
        const dbName = mongoose.connection.db.databaseName;
        console.log(`\n🎯 Currently connected to database: ${dbName}`);

        // List all databases
        const adminDb = mongoose.connection.db.admin();
        const databases = await adminDb.listDatabases();
        console.log('\n💾 Available databases:');
        databases.databases.forEach(db => {
            console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024).toFixed(2)} KB)`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n📝 Disconnected from MongoDB');
    }
}

checkDatabase();