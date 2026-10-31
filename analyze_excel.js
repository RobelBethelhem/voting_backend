import xlsx from 'xlsx';
import fs from 'fs';

// Analyze the Excel file structure
try {
    const workbook = xlsx.readFile('C:/Users/MSIGE79/Downloads/Under Chief Credit.xlsx');

    console.log('=== EXCEL FILE ANALYSIS ===');
    console.log('Sheet Names:', workbook.SheetNames);

    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n=== SHEET: ${sheetName} ===`);
        const worksheet = workbook.Sheets[sheetName];

        // Get the range of the worksheet
        const range = xlsx.utils.decode_range(worksheet['!ref']);
        console.log('Range:', worksheet['!ref']);

        // Extract all cell data including formulas
        const jsonData = xlsx.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            defval: ''
        });

        console.log('Data:');
        jsonData.forEach((row, rowIndex) => {
            if (row.some(cell => cell !== '')) {
                console.log(`Row ${rowIndex + 1}:`, row);
            }
        });

        // Look for formulas
        console.log('\n=== FORMULAS ===');
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = xlsx.utils.encode_cell({ r: R, c: C });
                const cell = worksheet[cellAddress];
                if (cell && cell.f) {
                    console.log(`${cellAddress}: ${cell.f} = ${cell.v}`);
                }
            }
        }
    });

} catch (error) {
    console.error('Error reading Excel file:', error.message);
}