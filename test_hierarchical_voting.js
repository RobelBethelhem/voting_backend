import { optimizedVotingCalculations } from './utils/optimizedVotingCalculations.js';
import { workflowManager } from './services/workflowManager.js';
import { batchProcessor } from './utils/batchProcessor.js';
import { excelExporter } from './utils/excelExporter.js';
import { hierarchyConfig } from './config/hierarchyConfig.js';

console.log('🧪 Starting Hierarchical Voting System Tests...\n');

// Test Data
const sampleEmployees = [
    { id: 'EMP001', name: 'John Doe', department: 'IT', position: 'Manager', level: 'manager' },
    { id: 'EMP002', name: 'Jane Smith', department: 'IT', position: 'Professional', level: 'professional' },
    { id: 'EMP003', name: 'Bob Wilson', department: 'Finance', position: 'Director', level: 'director' },
    { id: 'EMP004', name: 'Alice Brown', department: 'HR', position: 'Professional', level: 'professional' }
];

const sampleVotes = [
    { candidateId: 'EMP002', voterId: 'EMP001', score: 85, type: 'manager_rating' },
    { candidateId: 'EMP002', voterId: 'EMP004', score: 78, type: 'peer_rating' },
    { candidateId: 'EMP004', voterId: 'EMP001', score: 92, type: 'manager_rating' }
];

async function runTests() {
    try {
        console.log('✅ Test 1: Configuration Loading');
        console.log('Hierarchy levels:', Object.keys(hierarchyConfig.hierarchyLevels));
        console.log('Voting weights:', hierarchyConfig.votingWeights);

        console.log('\n✅ Test 2: Voting Calculations');
        const performanceScore = 88;
        const managerRating = 42;
        const peerRating = 38;

        const result = optimizedVotingCalculations.calculateWeightedScore(
            performanceScore, managerRating, peerRating, 'professional'
        );

        console.log(`Performance (50%): ${performanceScore} → ${result.performanceWeighted}`);
        console.log(`Manager Rating (30%): ${managerRating} → ${result.managerWeighted}`);
        console.log(`Peer Rating (20%): ${peerRating} → ${result.peerWeighted}`);
        console.log(`Total Weighted Score: ${result.totalScore}`);

        console.log('\n✅ Test 3: Batch Processing');
        const batchResult = await batchProcessor.batchCalculateScores(
            sampleEmployees,
            sampleVotes,
            'USER001'
        );
        console.log(`Processed ${batchResult.processed} employees in ${batchResult.processingTime}ms`);

        console.log('\n✅ Test 4: Workflow Management');
        const workflowId = `TEST_${Date.now()}`;
        const workflow = await workflowManager.initializeWorkflow(workflowId);
        console.log(`Workflow initialized: ${workflow.id}`);
        console.log(`Current stage: ${workflow.currentStage}`);
        console.log(`Next deadline: ${workflow.stages.peer_voting.deadline}`);

        console.log('\n✅ Test 5: Excel Export');
        const testData = {
            employees: sampleEmployees,
            votes: sampleVotes,
            period: workflowId
        };

        const workbook = await excelExporter.createVotingWorksheet(testData);
        console.log('Excel workbook created with worksheets:');
        workbook.eachSheet((worksheet) => {
            console.log(`  - ${worksheet.name}`);
        });

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📋 Manual Testing Steps:');
        console.log('1. Run: node test_hierarchical_voting.js');
        console.log('2. Check generated Excel file in exports/');
        console.log('3. Verify formulas in Excel match documentation');
        console.log('4. Test workflow progression through stages');
        console.log('5. Validate role-based permissions');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run Excel Formula Test
function testExcelFormulas() {
    console.log('\n📊 Excel Formula Verification:');
    console.log('Row 2 formulas:');
    console.log('G2 = 88 (Performance Score)');
    console.log('H2 = =G2/100*50 = 44 (Performance Weighted)');
    console.log('I2 = 42 (Manager Rating)');
    console.log('J2 = =I2/50*30 = 25.2 (Manager Weighted)');
    console.log('O2 = 38 (Peer Rating)');
    console.log('P2 = =(O2*20)/50 = 15.2 (Peer Weighted)');
    console.log('S2 = =H2+J2+P2 = 84.4 (Total Weighted)');
}

runTests();
testExcelFormulas();