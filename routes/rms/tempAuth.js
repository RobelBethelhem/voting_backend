import { Router } from "express";
import User from "../../models/rms/user.js";
import Manager from "../../models/rms/Manager.js";
import Director from "../../models/rms/Director.js";
import Chief from "../../models/rms/Chief.js";
import bcrypt from "bcrypt";
import generateTokens from "../../utils/rms/generateTokens.js";
import { verifyDomainCredentials } from "../../utils/rms/ldapAuth.js";

const router = Router();

// AUTH_MODE=ldap (the default, used on the server): staff sign in with their Zemen Bank domain
// account. AUTH_MODE=local (development): any account signs in with a test password.
export const isDomainLogin = () => (process.env.AUTH_MODE || "ldap").trim().toLowerCase() !== "local";

// Accepted by local mode only. Domain mode also refuses them, and the import defaults,
// for the local admin accounts that aren't in Active Directory.
const TEST_PASSWORDS = ['1234', 'test123', 'admin123'];
const DEFAULT_PASSWORDS = [...TEST_PASSWORDS, 'Test@123', 'default123', '@Test1234'];

// Define search order: Chief (highest) → Director → Manager → User (lowest)
const userModels = [
    { model: Chief, role: 'chief', modelName: 'Chief' },
    { model: Director, role: 'director', modelName: 'Director' },
    { model: Manager, role: 'manager', modelName: 'Manager' },
    { model: User, role: null, modelName: 'User' } // null means use existing role from user
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactly = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");

// First active account matching the filter, searching the models in priority order
async function findAccount(filter, models = userModels) {
    for (const { model, role, modelName } of models) {
        try {
            const foundUser = await model.findOne({ ...filter, status: true }).lean();
            if (foundUser) {
                // For User model, use the existing role from the user, otherwise use predefined role
                const userRole = modelName === 'User' && foundUser.roles && foundUser.roles.length > 0
                    ? foundUser.roles[0]
                    : role;
                return { foundUser, userRole, modelName };
            }
        } catch (error) {
            console.log(`⚠️ Error searching ${modelName} model:`, error.message);
        }
    }
    return null;
}

// Domain login. "first.last", "First.Last@zemenbank.com" and "Zemenbank\first.last" all bind
// to AD as Zemenbank\first.last. Accounts outside the bank's email domain aren't in AD: only those
// listed in LOCAL_ADMIN_EMAILS can sign in, with their own (bcrypt) password.
async function domainAccount(identifier, password) {
    const emailDomain = (process.env.EMAIL_DOMAIN || "zemenbank.com").toLowerCase();
    const ldapDomain = (process.env.LDAP_DOMAIN || "Zemenbank").toLowerCase();
    let name = identifier.toLowerCase();
    if (name.startsWith(`${ldapDomain}\\`)) name = name.slice(ldapDomain.length + 1);

    const at = name.lastIndexOf("@");
    if (at === -1 || name.slice(at + 1) === emailDomain) {
        const username = at === -1 ? name : name.slice(0, at);
        if (!/^[a-z0-9._-]+$/.test(username)) return null;
        const account = await findAccount({
            $or: [{ user: exactly(username) }, { email: exactly(`${username}@${emailDomain}`) }]
        });
        if (!account) return null;
        return (await verifyDomainCredentials(username, password)) ? account : null;
    }

    const localAdmins = (process.env.LOCAL_ADMIN_EMAILS || "")
        .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!localAdmins.includes(name) || DEFAULT_PASSWORDS.includes(password)) return null;
    const account = await findAccount(
        { email: exactly(name), roles: 'admin' },
        userModels.filter(({ modelName }) => modelName === 'User')
    );
    if (!account || !/^\$2[aby]\$/.test(account.foundUser.password || "")) return null;
    return (await bcrypt.compare(password, account.foundUser.password)) ? account : null;
}

// Development login: any active account with a test password (or its own password)
async function localAccount(searchTerm, password) {
    const account = await findAccount({
        $or: [
            { email: searchTerm },
            { user: searchTerm },
            { username: searchTerm }
        ]
    });

    if (!account) {
        console.log('❌ No user found in any model');
        // Show available users from all models for debugging
        for (const { model, modelName: name } of userModels) {
            try {
                const count = await model.countDocuments();
                console.log(`${name} model: ${count} users`);
                if (count > 0) {
                    const sample = await model.find({}, 'employee_id user email level').limit(2);
                    sample.forEach(u => {
                        console.log(`  ${name}: ${u.employee_id} | ${u.user || 'N/A'} | ${u.email}`);
                    });
                }
            } catch (e) {
                console.log(`Error querying ${name}:`, e.message);
            }
        }
        return { error: "User not found. Available: ops.analyst@bank.com, chief@bank.com, senior.dev@bank.com" };
    }

    const { foundUser } = account;
    // Enhanced password validation - handle both bcrypt hashes and simple passwords
    let isValidPassword = false;
    try {
        // Try bcrypt comparison first (for Manager/Director/Chief with hashed passwords)
        if (foundUser.password && foundUser.password.startsWith('$2b$')) {
            isValidPassword = await bcrypt.compare(password, foundUser.password);
        }
        // If bcrypt fails or no hashed password, try simple passwords
        if (!isValidPassword) {
            isValidPassword = TEST_PASSWORDS.includes(password) || foundUser.password === password;
        }
    } catch (bcryptError) {
        console.log('Bcrypt error:', bcryptError.message);
        // Fall back to simple password check
        isValidPassword = TEST_PASSWORDS.includes(password);
    }

    if (!isValidPassword) {
        return { error: "Invalid Password. Use '1234', 'test123', or 'admin123' for testing." };
    }
    return account;
}

router.post("/temp-login", async (req, res) => {
    try {
        const { email, password, user: username } = req.body;
        const searchTerm = String(email || username || '').trim();
        const domainLogin = isDomainLogin();

        console.log(`Login attempt (${domainLogin ? 'domain' : 'local'}): "${searchTerm}"`);

        if (!searchTerm || typeof password !== 'string' || password.length === 0) {
            return res.status(400).json({ error: true, message: "Enter your username and password" });
        }

        let account;
        if (domainLogin) {
            try {
                account = await domainAccount(searchTerm, password);
            } catch (ldapError) {
                console.error("Domain login error:", ldapError.message);
                return res.status(503).json({
                    error: true,
                    message: "Domain login is unavailable right now. Please try again later."
                });
            }
            if (!account) {
                return res.status(401).json({ error: true, message: "Invalid username or password" });
            }
        } else {
            account = await localAccount(searchTerm, password);
            if (account.error) {
                return res.status(401).json({ error: true, message: account.error });
            }
        }

        const { foundUser, userRole, modelName } = account;
        console.log(`✅ ${modelName} ${foundUser.employee_id} signed in as ${userRole}`);

        // Set roles array to contain only the specific role
        let rolesArray = [userRole];

        // Create modified user object with correct roles for JWT
        const userForToken = {
            ...foundUser,
            roles: rolesArray
        };

        // Generate tokens
        const { accessToken, refreshToken } = await generateTokens(userForToken);

        res.status(200).json({
            error: false,
            accessToken,
            refreshToken,
            data: {
                employee_id: foundUser.employee_id,
                user: foundUser.user,
                first_name: foundUser.first_name,
                last_name: foundUser.last_name,
                email: foundUser.email,
                role: userRole, // Primary detected role
                roles: rolesArray, // Hierarchical roles
                level: foundUser.level || userRole,
                department: foundUser.department,
                position: foundUser.position,
                is_managerial: userRole !== 'user',
                performance_appraisal_score: foundUser.performance_appraisal_score || 0,
                model: modelName // Which model the user was found in
            },
            userInfo: {
                employee_id: foundUser.employee_id,
                first_name: foundUser.first_name,
                last_name: foundUser.last_name,
                email: foundUser.email,
                role: userRole,
                roles: rolesArray,
                department: foundUser.department,
                position: foundUser.position,
                level: foundUser.level || userRole,
                model: modelName
            },
            message: `Logged in Successfully as ${userRole}`,
            foundInModel: modelName,
            loginType: domainLogin ? "domain-login" : "temp-login-enhanced"
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

export default router;
