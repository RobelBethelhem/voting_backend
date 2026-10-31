const roleCheck = (roles) => {
    return (req, res, next) => {
      console.log('RoleCheck - Required roles:', roles);
      console.log('RoleCheck - User info:', {
        employee_id: req.user?.employee_id,
        level: req.user?.level,
        roles: req.user?.roles
      });

      // If no user, fail
      if (!req.user) {
        return res.status(403).json({ error: true, message: "No user information" });
      }

      const rolesLength = roles.length;
      let matchFound = false; // Flag to track if a match is found

      for (let i = 0; i < rolesLength; i++) {
        const cus_roles = [roles[i]];

        // Handle cases where roles might be undefined or not an array
        const userRoles = req.user.roles || [];

        // Also check by level if roles are not available
        const userLevel = req.user.level;

        if (Array.isArray(userRoles) && userRoles.includes(...cus_roles)) {
          matchFound = true;
          break; // Exit the loop if a match is found
        }

        // Fallback: check by level for hierarchical voting
        if (userLevel && cus_roles.includes(userLevel)) {
          matchFound = true;
          break;
        }

        // Special case: if checking for 'user' and this is a professional
        if (cus_roles.includes('user') && userLevel === 'professional') {
          matchFound = true;
          break;
        }
      }

      console.log('RoleCheck - Match found:', matchFound);

      if (matchFound) {
        next(); // Call next middleware if a match is found
      } else {
        res.status(403).json({
          error: true,
          message: `Access denied. Required: ${roles.join(', ')}, User level: ${req.user.level}`
        });
      }
    };
  };
  
  export default roleCheck;