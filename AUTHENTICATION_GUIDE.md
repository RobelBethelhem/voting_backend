# Unified Authentication System

This document explains the new unified authentication system that checks all user models and assigns appropriate roles.

## Overview

The new authentication system automatically detects user roles by searching across all user models (Chief, Director, Manager, User/Employee) and assigns appropriate JWT tokens with hierarchical permissions.

## Authentication Endpoints

### 1. Unified Login
**Endpoint:** `POST /api/unified-login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "your_password"
}
```

**OR**

```json
{
  "user": "username",
  "password": "your_password"
}
```

**Response:**
```json
{
  "error": false,
  "accessToken": "jwt_token_here",
  "data": {
    "employee_id": "EMP001",
    "role": "manager",
    "roles": ["manager", "user"],
    "level": "manager",
    "department": "IT",
    "model": "Manager"
  },
  "message": "Logged in successfully as manager",
  "foundInModel": "Manager"
}
```

### 2. Get Current User
**Endpoint:** `GET /api/me`

**Headers:** `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "error": false,
  "data": {
    "employee_id": "EMP001",
    "role": "manager",
    "roles": ["manager", "user"]
  }
}
```

## Role Hierarchy

The system assigns roles in the following hierarchy:

1. **Chief**: Highest level
   - Role: `chief`
   - Permissions: `['chief', 'admin', 'user']`
   - Can access all features

2. **Director**: Second level
   - Role: `director`
   - Permissions: `['director', 'manager', 'user']`
   - Can act as manager and user

3. **Manager**: Third level
   - Role: `manager`
   - Permissions: `['manager', 'user']`
   - Can act as user

4. **User/Employee**: Base level
   - Role: `user`
   - Permissions: `['user']`
   - Basic access only

## Model Search Order

The system searches for users in this order:
1. **Chief** model first (highest priority)
2. **Director** model second
3. **Manager** model third
4. **User** model last (lowest priority)

This ensures that if a user exists in multiple models, they get the highest available role.

## Using Role-Based Middleware

Import the middleware:
```javascript
import { verifyToken, requireAdmin, requireManager } from '../middleware/roleMiddleware.js';
```

### Available Middleware Functions:

- `verifyToken`: Validates JWT and extracts user info
- `requireAdmin`: Chief-level access only
- `requireChief`: Chief-level access only
- `requireDirector`: Director-level and above
- `requireManager`: Manager-level and above
- `requireUser`: Any authenticated user
- `requireManagerial`: Manager, Director, or Chief
- `requireSelfOrSuperior`: Own data or superior can access

### Example Usage:

```javascript
// Any authenticated user
router.get('/profile', verifyToken, requireUser, (req, res) => {
  // User info available in req.user
});

// Manager level and above
router.get('/team-data', verifyToken, requireManager, (req, res) => {
  // Only managers, directors, and chiefs can access
});

// Chief/Admin only
router.post('/system-config', verifyToken, requireAdmin, (req, res) => {
  // Only chiefs can access
});
```

## Test Endpoints

Use these endpoints to test role-based access:

- `GET /api/test/public` - No authentication required
- `GET /api/test/user` - User level and above
- `GET /api/test/manager` - Manager level and above
- `GET /api/test/director` - Director level and above
- `GET /api/test/chief` - Chief level only
- `GET /api/test/admin` - Admin (Chief) level only
- `GET /api/test/whoami` - Shows current user permissions

## Password Validation

The system supports both:
1. **bcrypt hashed passwords** (production)
2. **Simple passwords** (development): `1234`, `test123`, `admin123`

## JWT Token Structure

```json
{
  "_id": "user_mongodb_id",
  "employee_id": "EMP001",
  "email": "user@example.com",
  "role": "manager",
  "roles": ["manager", "user"],
  "level": "manager",
  "department": "IT",
  "model": "Manager"
}
```

## Migration from Old System

The new system is backward compatible. Your existing authentication will continue to work, but you can now use:

1. **New endpoint:** `/api/unified-login` instead of `/api/login`
2. **Enhanced roles:** Access to hierarchical permissions
3. **Better security:** Role-based access control

## Error Responses

### Authentication Errors:
- `401`: Invalid credentials or expired token
- `403`: Insufficient permissions for resource
- `400`: Missing required fields

### Example Error:
```json
{
  "error": true,
  "message": "Access denied. Required roles: manager, director, chief"
}
```

## Frontend Integration

Update your frontend to use the new login endpoint:

```javascript
// Login request
const response = await fetch('/api/unified-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const data = await response.json();

// Store token and user info
localStorage.setItem('accessToken', data.accessToken);
localStorage.setItem('userRole', data.data.role);
localStorage.setItem('userRoles', JSON.stringify(data.data.roles));
```

## Security Features

1. **Hierarchical Permissions**: Higher roles can access lower-level resources
2. **Model-based Detection**: Automatically detects user type from database
3. **JWT Security**: Secure token-based authentication
4. **Role Validation**: Server-side role verification
5. **Active User Check**: Only active users can login (`status: true`)

This system provides a robust, scalable authentication solution that grows with your organizational hierarchy!