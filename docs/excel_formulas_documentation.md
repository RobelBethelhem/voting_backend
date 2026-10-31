# Hierarchical Voting System - Excel Formula Documentation

## Column Structure and Formulas

### Employee Information (Columns A-F)
- **Column A**: Employee ID
- **Column B**: First Name
- **Column C**: Last Name
- **Column D**: Department
- **Column E**: Position
- **Column F**: Job Grade

### Performance Appraisal (Column G)
- **Column G**: Performance Appraisal Score (out of 100)

### Performance Weighted Score (Column H)
- **Formula**: `=G2/100*50`
- **Description**: Converts performance score to 50% weight
- **Applies to**: All employees

### Manager Rating (Column I)
- **Raw Score**: Out of 50
- **Usage**:
  - Non-managerial: 30% weight
  - Managerial: Combined with Director for 50% weight

### Manager Rating Weighted (Column J)
- **Non-Managerial Formula**: `=I2/50*30`
- **Managerial Formula**: `=I2` (becomes part of 50% combined)
- **Description**: Weighted manager rating score

### Peer Voting Eligibility (Column K)
- **Column K**: Total Eligible Peer Voters
- **Formula**: `=COUNTIF(D:D,D2)-1`
- **Description**: Count of employees in same department minus self

### Peer Voting Tracking (Columns L-M)
- **Column L**: Number of Peers Who Voted
- **Column M**: Voted By (actual count)

### Peer Voting Percentage (Column N)
- **Formula**: `=M2/K2*100`
- **Description**: Percentage of eligible peers who voted

### Average Peer Rating (Column O)
- **Formula**: `=AVERAGE(PeerVotes!Range)*50/40`
- **Description**: Average of all peer votes converted to 50 scale
- **Note**: Peer votes have 8 criteria (1-5 scale), max 40 points

### Peer Rating Weighted Score (Column P)
- **Formula**: `=(O2*20)/50`
- **Description**: 20% weight for peer rating
- **Applies to**: Non-managerial employees only

### Total Rating Result (Column Q)
- **Non-Managerial Formula**: `=H2+J2+P2`
- **Managerial Formula**: `=H2+I2`
- **Description**: Total score without participation adjustment

### Weighted Rating (Column R)
- **Formula**: `=(P2*N2)/100`
- **Description**: Peer rating adjusted by participation percentage
- **Applies to**: Non-managerial employees only

### Total Weighted Result (Column S)
- **Non-Managerial Formula**: `=R2+J2+H2`
- **Managerial Formula**: `=H2+I2`
- **Description**: Final score including participation weighting

### Chief Approval (Columns T-V)
- **Column T**: Approval Status (Pending/Approved/Rejected)
- **Column U**: Chief Comments
- **Column V**: Approval Date

## Scoring Weights Summary

### Non-Managerial Employees
1. **Performance Appraisal**: 50% (`=G/100*50`)
2. **Manager Rating**: 30% (`=I/50*30`)
3. **Peer Rating**: 20% (`=(O*20)/50`)
   - Adjusted by participation: `=(P*N)/100`

### Managerial Employees
1. **Performance Appraisal**: 50% (`=G/100*50`)
2. **Manager OR Director Rating**: 50% (`=I` or `=Director_Score`)
   - Note: Only one rating allowed (exclusive)

## Winner Selection Logic

### Department-Based Selection
```excel
=INDEX(A:A,MATCH(MAX(IF(D:D="Department_Name",S:S)),S:S,0))
```

### Non-Managerial Winners
- **With Manager**: Use Column S (Total Weighted Result)
- **Without Manager**: Use Column Q (Total Rating Result)

### Managerial Winners
- **Formula**: Use Column J (Total Score out of 100)
- **Selection**: `=MAX(IF(AND(D:D="Department",E:E="Manager"),J:J))`

## Peer Voting Criteria Formulas

### Individual Peer Vote Calculation
Each peer evaluates on 8 criteria (1-5 scale):
1. Dedication
2. Quality of Work
3. Collaboration/Team Work
4. Independence
5. Customer Service
6. Time Management
7. Office Attire/Dress Code
8. Flexibility

**Total Score Formula**: `=SUM(Criteria1:Criteria8)`
**Maximum Score**: 40 points
**Conversion to 50 scale**: `=TotalScore/40*50`

## Approval Workflow Formulas

### Status Tracking
```excel
=IF(T2="Approved","✓",IF(T2="Rejected","✗","⏳"))
```

### Completion Percentage
```excel
=COUNTIF(T:T,"Approved")/COUNTA(A:A)*100
```

## Batch Processing Formulas

### Department Winner Selection
```excel
=MAXIFS(S:S,D:D,DepartmentName,T:T,"Approved")
```

### Function-Based Winners
```excel
=INDEX(A:A,MATCH(1,(D:D=Department)*(F:F=Function)*(S:S=MAX(IF((D:D=Department)*(F:F=Function),S:S))),0))
```

## Validation Formulas

### Duplicate Vote Check
```excel
=COUNTIFS(VoterID:VoterID,CurrentVoterID,CandidateID:CandidateID,CurrentCandidateID)>1
```

### Eligibility Verification
```excel
=AND(D2=VoterDepartment,A2<>VoterID)
```

## Excel VBA Functions for Automation

### Auto-Calculate Weighted Scores
```vba
Function CalculateWeightedScore(Performance As Double, Manager As Double, Peer As Double, IsManagerial As Boolean) As Double
    If IsManagerial Then
        CalculateWeightedScore = (Performance / 100 * 50) + Manager
    Else
        Dim PerfWeight As Double: PerfWeight = Performance / 100 * 50
        Dim MgrWeight As Double: MgrWeight = Manager / 50 * 30
        Dim PeerWeight As Double: PeerWeight = (Peer * 20) / 50
        CalculateWeightedScore = PerfWeight + MgrWeight + PeerWeight
    End If
End Function
```

### Winner Selection Function
```vba
Function SelectDepartmentWinner(Department As String, ApprovalRange As Range, ScoreRange As Range) As String
    Dim MaxScore As Double: MaxScore = 0
    Dim WinnerRow As Long: WinnerRow = 0

    For i = 1 To ApprovalRange.Rows.Count
        If ApprovalRange.Cells(i, 1).Value = "Approved" And _
           Cells(i, 4).Value = Department Then
            If ScoreRange.Cells(i, 1).Value > MaxScore Then
                MaxScore = ScoreRange.Cells(i, 1).Value
                WinnerRow = i
            End If
        End If
    Next i

    If WinnerRow > 0 Then
        SelectDepartmentWinner = Cells(WinnerRow, 1).Value & " - " & Cells(WinnerRow, 2).Value
    Else
        SelectDepartmentWinner = "No approved winner"
    End If
End Function
```

## Notes and Best Practices

1. **Data Validation**: Always validate manager/director ratings are within 0-50 range
2. **Participation Tracking**: Monitor peer voting participation rates
3. **Audit Trail**: Maintain timestamp columns for all voting actions
4. **Conditional Formatting**: Use color coding for approval status
5. **Protection**: Lock formula cells to prevent accidental changes
6. **Backup**: Create versioned backups before chief approval process

## Error Handling Formulas

### Division by Zero Prevention
```excel
=IFERROR(M2/K2*100,0)
```

### Missing Data Handling
```excel
=IF(ISBLANK(I2),0,I2/50*30)
```

### Validation Messages
```excel
=IF(AND(G2>=0,G2<=100),"Valid","Invalid Score")
```