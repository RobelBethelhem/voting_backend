# 🔐 Login Guide for Hierarchical Voting System

## ✅ Working Login Credentials

### 📧 **Option 1: Email + Password (temp-login)**
```json
POST http://localhost:5000/api/temp-login
{
  "email": "chief@bank.com",
  "password": "1234"
}
```

### 👤 **Option 2: Username + Password (temp-login)**
```json
POST http://localhost:5000/api/temp-login
{
  "user": "chief.admin",
  "password": "1234"
}
```

### 🎯 **Option 3: Username + Password (simple-login)**
```json
POST http://localhost:5000/api/simple-login
{
  "user": "chief.admin",
  "password": "test123"
}
```

## 📋 All Available Test Accounts

| Employee ID | Username    | Email                   | Level        | Password    |
|-------------|-------------|-------------------------|--------------|-------------|
| CHF001      | chief.admin | chief@bank.com         | chief        | 1234/test123|
| DIR001      | dir.it      | director.it@bank.com   | director     | 1234/test123|
| DIR002      | dir.finance | director.finance@bank.com| director   | 1234/test123|
| DIR003      | dir.hr      | director.hr@bank.com   | director     | 1234/test123|
| MGR001      | mgr.it.dev  | manager.dev@bank.com   | manager      | 1234/test123|
| MGR002      | mgr.it.ops  | manager.ops@bank.com   | manager      | 1234/test123|
| MGR003      | mgr.finance | manager.finance@bank.com| manager     | 1234/test123|
| MGR004      | mgr.hr      | manager.hr@bank.com    | manager      | 1234/test123|
| PRO001      | dev.senior  | senior.dev@bank.com    | professional | 1234/test123|
| PRO002      | dev.junior  | junior.dev@bank.com    | professional | 1234/test123|
| PRO003      | ops.analyst | ops.analyst@bank.com   | professional | 1234/test123|
| PRO004      | finance.analyst| finance.analyst@bank.com| professional| 1234/test123|
| PRO005      | hr.specialist| hr.specialist@bank.com | professional | 1234/test123|

## 🔧 Troubleshooting

### If you get "Invalid Password" error:
- Use password `1234` (for temp-login)
- Use password `test123` (for simple-login)
- Both endpoints support both passwords

### If you get "User not found" error:
- Check that you're using the correct email from the table above
- For username login, use the `user` field, not `email`
- Make sure backend server is running on port 5000

### Frontend Login Examples:

**For Chief:**
```javascript
// Email login
fetch('/api/temp-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'chief@bank.com',
    password: '1234'
  })
})

// Username login
fetch('/api/temp-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user: 'chief.admin',
    password: '1234'
  })
})
```

## ✨ Expected Response Format:
```json
{
  "error": false,
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here",
  "data": {
    "employee_id": "CHF001",
    "user": "chief.admin",
    "level": "chief",
    "department": "Executive",
    "performance_appraisal_score": 95
  },
  "message": "Logged in Successfully"
}
```

## 🎯 Quick Test Commands:
```bash
# Test Chief login
curl -X POST http://localhost:5000/api/temp-login \
  -H "Content-Type: application/json" \
  -d '{"user":"chief.admin","password":"1234"}'

# Test Manager login
curl -X POST http://localhost:5000/api/temp-login \
  -H "Content-Type: application/json" \
  -d '{"user":"mgr.it.dev","password":"1234"}'
```