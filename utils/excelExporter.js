// Excel export utility with formula generation

import ExcelJS from 'exceljs';
import HierarchyConfig from '../config/hierarchyConfig.js';

export class ExcelExporter {
    constructor() {
        this.workbook = new ExcelJS.Workbook();
        this.worksheet = null;
    }

    /**
     * Create a new worksheet with voting data and formulas
     */
    async createVotingWorksheet(votingData, sheetName = 'Voting Results') {
        this.worksheet = this.workbook.addWorksheet(sheetName);

        // Setup headers
        this.setupHeaders();

        // Add data rows
        await this.addDataRows(votingData);

        // Apply formulas
        this.applyFormulas();

        // Format worksheet
        this.formatWorksheet();

        // Add validation rules
        this.addDataValidation();

        // Protect formulas
        this.protectFormulas();

        return this.worksheet;
    }

    /**
     * Setup worksheet headers based on configuration
     */
    setupHeaders() {
        const headers = [
            { key: 'employee_id', header: 'Employee ID', width: 12 },
            { key: 'first_name', header: 'First Name', width: 15 },
            { key: 'last_name', header: 'Last Name', width: 15 },
            { key: 'department', header: 'Department', width: 20 },
            { key: 'position', header: 'Position', width: 20 },
            { key: 'job_grade', header: 'Job Grade', width: 10 },
            { key: 'performance_appraisal_score', header: 'Performance Score (100)', width: 20 },
            { key: 'performance_weighted_score', header: 'Performance Weighted (50%)', width: 25 },
            { key: 'manager_rating_score', header: 'Manager Rating (50)', width: 18 },
            { key: 'manager_rating_weighted_score', header: 'Manager Weighted', width: 18 },
            { key: 'total_eligible_peer_voters', header: 'Eligible Voters', width: 15 },
            { key: 'peers_who_voted', header: 'Peers Voted', width: 12 },
            { key: 'voted_by_count', header: 'Voted By', width: 10 },
            { key: 'peer_voting_percentage', header: 'Voting %', width: 10 },
            { key: 'average_peer_rating', header: 'Avg Peer Rating', width: 15 },
            { key: 'peer_rating_weighted_score', header: 'Peer Weighted (20%)', width: 18 },
            { key: 'total_rating_result', header: 'Total Rating', width: 12 },
            { key: 'weighted_rating', header: 'Weighted Rating', width: 15 },
            { key: 'total_weighted_result', header: 'Total Weighted Result', width: 20 },
            { key: 'approval_status', header: 'Approval Status', width: 15 },
            { key: 'chief_comments', header: 'Chief Comments', width: 30 },
            { key: 'approval_date', header: 'Approval Date', width: 15 }
        ];

        this.worksheet.columns = headers;

        // Style header row
        const headerRow = this.worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2E75B5' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 25;
    }

    /**
     * Add data rows to worksheet
     */
    async addDataRows(votingData) {
        votingData.forEach((candidate, index) => {
            const rowIndex = index + 2; // Start from row 2 (after headers)
            const row = this.worksheet.addRow({
                employee_id: candidate.candidate_employee_id,
                first_name: candidate.candidate_first_name,
                last_name: candidate.candidate_last_name,
                department: candidate.candidate_department,
                position: candidate.candidate_position,
                job_grade: candidate.candidate_job_grade,
                performance_appraisal_score: candidate.performance_appraisal_score,
                manager_rating_score: candidate.manager_rating_score || 0,
                total_eligible_peer_voters: candidate.total_eligible_peer_voters,
                peers_who_voted: candidate.total_peer_votes_received,
                voted_by_count: candidate.total_peer_votes_received,
                average_peer_rating: candidate.average_peer_rating,
                approval_status: candidate.chief_approval_status,
                chief_comments: candidate.chief_comments || '',
                approval_date: candidate.chief_approval_date || ''
            });

            // Add formulas for calculated fields
            this.addRowFormulas(rowIndex, candidate.is_managerial_position);
        });
    }

    /**
     * Add formulas to a specific row
     */
    addRowFormulas(rowIndex, isManagerial = false) {
        const row = this.worksheet.getRow(rowIndex);

        // Performance Weighted Score (Column H) - Formula: =G/100*50
        row.getCell('H').value = { formula: `G${rowIndex}/100*50` };

        // Manager Rating Weighted Score (Column J)
        if (isManagerial) {
            // For managerial: direct value (50% component)
            row.getCell('J').value = { formula: `I${rowIndex}` };
        } else {
            // For non-managerial: =I/50*30
            row.getCell('J').value = { formula: `I${rowIndex}/50*30` };
        }

        // Peer Voting Percentage (Column N) - Formula: =M/K*100
        row.getCell('N').value = {
            formula: `IF(K${rowIndex}=0,0,M${rowIndex}/K${rowIndex}*100)`
        };

        // Peer Rating Weighted Score (Column P) - Formula: =(O*20)/50
        if (!isManagerial) {
            row.getCell('P').value = { formula: `(O${rowIndex}*20)/50` };
        } else {
            row.getCell('P').value = 0;
        }

        // Total Rating Result (Column Q)
        if (isManagerial) {
            // Managerial: Performance + Manager/Director Rating
            row.getCell('Q').value = { formula: `H${rowIndex}+I${rowIndex}` };
        } else {
            // Non-managerial: Performance + Manager + Peer
            row.getCell('Q').value = { formula: `H${rowIndex}+J${rowIndex}+P${rowIndex}` };
        }

        // Weighted Rating (Column R) - Formula: =(P*N)/100
        if (!isManagerial) {
            row.getCell('R').value = { formula: `(P${rowIndex}*N${rowIndex})/100` };
        } else {
            row.getCell('R').value = 0;
        }

        // Total Weighted Result (Column S)
        if (isManagerial) {
            // Managerial: Same as Total Rating Result
            row.getCell('S').value = { formula: `H${rowIndex}+I${rowIndex}` };
        } else {
            // Non-managerial: Weighted Rating + Manager + Performance
            row.getCell('S').value = { formula: `R${rowIndex}+J${rowIndex}+H${rowIndex}` };
        }
    }

    /**
     * Apply conditional formatting and styles
     */
    formatWorksheet() {
        // Apply borders to all cells with data
        const lastRow = this.worksheet.lastRow.number;
        const lastColumn = this.worksheet.lastColumn.letter;

        for (let i = 1; i <= lastRow; i++) {
            for (let j = 1; j <= this.worksheet.columnCount; j++) {
                const cell = this.worksheet.getRow(i).getCell(j);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
        }

        // Apply conditional formatting for approval status
        const statusColumn = this.worksheet.getColumn('T');
        statusColumn.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
            if (rowNumber > 1) {
                switch (cell.value) {
                    case 'approved':
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF70AD47' }
                        };
                        cell.font = { color: { argb: 'FFFFFFFF' } };
                        break;
                    case 'rejected':
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE06666' }
                        };
                        cell.font = { color: { argb: 'FFFFFFFF' } };
                        break;
                    case 'pending':
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFFC000' }
                        };
                        break;
                }
            }
        });

        // Format number columns
        const numberColumns = ['G', 'H', 'I', 'J', 'N', 'O', 'P', 'Q', 'R', 'S'];
        numberColumns.forEach(col => {
            this.worksheet.getColumn(col).numFmt = '0.00';
        });

        // Format percentage column
        this.worksheet.getColumn('N').numFmt = '0.00%';

        // Freeze the header row
        this.worksheet.views = [
            { state: 'frozen', xSplit: 0, ySplit: 1 }
        ];
    }

    /**
     * Add data validation rules
     */
    addDataValidation() {
        const lastRow = this.worksheet.lastRow.number;

        // Performance score validation (0-100)
        for (let i = 2; i <= lastRow; i++) {
            this.worksheet.getCell(`G${i}`).dataValidation = {
                type: 'whole',
                operator: 'between',
                formulae: [0, 100],
                showErrorMessage: true,
                errorTitle: 'Invalid Score',
                error: 'Performance score must be between 0 and 100'
            };
        }

        // Manager rating validation (0-50)
        for (let i = 2; i <= lastRow; i++) {
            this.worksheet.getCell(`I${i}`).dataValidation = {
                type: 'decimal',
                operator: 'between',
                formulae: [0, 50],
                showErrorMessage: true,
                errorTitle: 'Invalid Rating',
                error: 'Manager rating must be between 0 and 50'
            };
        }

        // Approval status validation
        for (let i = 2; i <= lastRow; i++) {
            this.worksheet.getCell(`T${i}`).dataValidation = {
                type: 'list',
                formulae: ['"pending,approved,rejected"'],
                showErrorMessage: true,
                errorTitle: 'Invalid Status',
                error: 'Status must be pending, approved, or rejected'
            };
        }
    }

    /**
     * Protect formula cells
     */
    protectFormulas() {
        const formulaColumns = ['H', 'J', 'N', 'P', 'Q', 'R', 'S'];
        const lastRow = this.worksheet.lastRow.number;

        formulaColumns.forEach(col => {
            for (let i = 2; i <= lastRow; i++) {
                const cell = this.worksheet.getCell(`${col}${i}`);
                cell.protection = { locked: true };
            }
        });

        // Enable worksheet protection
        this.worksheet.protect('VotingSystem2024', {
            selectLockedCells: true,
            selectUnlockedCells: true,
            formatCells: false,
            formatColumns: false,
            formatRows: false,
            insertColumns: false,
            insertRows: false,
            deleteColumns: false,
            deleteRows: false
        });
    }

    /**
     * Add summary sheet with department winners
     */
    async addSummarySheet(votingData) {
        const summarySheet = this.workbook.addWorksheet('Summary');

        // Calculate department winners
        const departmentWinners = this.calculateDepartmentWinners(votingData);

        // Setup summary headers
        summarySheet.columns = [
            { key: 'department', header: 'Department', width: 25 },
            { key: 'winner_id', header: 'Winner ID', width: 15 },
            { key: 'winner_name', header: 'Winner Name', width: 25 },
            { key: 'position', header: 'Position', width: 20 },
            { key: 'score', header: 'Final Score', width: 15 },
            { key: 'type', header: 'Employee Type', width: 15 }
        ];

        // Add winner data
        departmentWinners.forEach(winner => {
            summarySheet.addRow(winner);
        });

        // Format summary sheet
        const headerRow = summarySheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }
        };

        return summarySheet;
    }

    /**
     * Calculate department winners
     */
    calculateDepartmentWinners(votingData) {
        const departmentGroups = new Map();

        // Group by department
        votingData.forEach(candidate => {
            if (candidate.chief_approval_status === 'approved') {
                const dept = candidate.candidate_department;
                if (!departmentGroups.has(dept)) {
                    departmentGroups.set(dept, []);
                }
                departmentGroups.get(dept).push(candidate);
            }
        });

        // Find winner for each department
        const winners = [];
        departmentGroups.forEach((candidates, department) => {
            const winner = candidates.reduce((best, current) => {
                const currentScore = current.is_managerial_position ?
                    current.total_rating_result :
                    current.total_weighted_result;

                const bestScore = best.is_managerial_position ?
                    best.total_rating_result :
                    best.total_weighted_result;

                return currentScore > bestScore ? current : best;
            });

            winners.push({
                department,
                winner_id: winner.candidate_employee_id,
                winner_name: `${winner.candidate_first_name} ${winner.candidate_last_name}`,
                position: winner.candidate_position,
                score: winner.is_managerial_position ?
                    winner.total_rating_result :
                    winner.total_weighted_result,
                type: winner.is_managerial_position ? 'Managerial' : 'Non-Managerial'
            });
        });

        return winners;
    }

    /**
     * Add charts to worksheet
     */
    addCharts() {
        // Add a chart for department performance comparison
        const chart = this.workbook.addImage({
            base64: this.generateChartBase64(),
            extension: 'png'
        });

        this.worksheet.addImage(chart, {
            tl: { col: 25, row: 2 },
            br: { col: 35, row: 20 }
        });
    }

    /**
     * Generate base64 chart (placeholder - would need actual charting library)
     */
    generateChartBase64() {
        // This would typically use a charting library to generate actual charts
        return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }

    /**
     * Export workbook to buffer
     */
    async exportToBuffer() {
        return await this.workbook.xlsx.writeBuffer();
    }

    /**
     * Export workbook to file
     */
    async exportToFile(filePath) {
        await this.workbook.xlsx.writeFile(filePath);
    }

    /**
     * Add macro for automated winner selection
     */
    addWinnerSelectionMacro() {
        const vbaCode = `
Sub SelectDepartmentWinners()
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim dept As String
    Dim maxScore As Double
    Dim winnerRow As Long
    Dim i As Long

    Set ws = ThisWorkbook.Sheets("Voting Results")
    lastRow = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row

    ' Create dictionary to store department winners
    Dim deptWinners As Object
    Set deptWinners = CreateObject("Scripting.Dictionary")

    ' Find winner for each department
    For i = 2 To lastRow
        dept = ws.Cells(i, 4).Value ' Department column
        If ws.Cells(i, 20).Value = "approved" Then ' Approval status
            score = ws.Cells(i, 19).Value ' Total weighted result

            If Not deptWinners.Exists(dept) Or score > deptWinners(dept)("score") Then
                deptWinners(dept) = Array(i, score)
            End If
        End If
    Next i

    ' Highlight winners
    For Each key In deptWinners.Keys
        winnerRow = deptWinners(key)(0)
        ws.Rows(winnerRow).Interior.Color = RGB(146, 208, 80) ' Light green
    Next key
End Sub
        `;

        // Note: ExcelJS doesn't support VBA directly
        // This would need to be added manually or through a different library
        return vbaCode;
    }
}

// Create and export default instance
const excelExporter = new ExcelExporter();
export default excelExporter;