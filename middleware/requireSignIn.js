import jwt from "jsonwebtoken";
import UsedToken from "../models/rms/UsedToken.js";

// Signing in, checking and refreshing a token don't need one
const OPEN_PATHS = ["/temp-login", "/verify-token", "/refreshToken"];

// On the server every API request needs a valid access token (x-access-token). Several admin
// routes have no check of their own, so without this anyone on the network could call them.
// This only checks the token; the routes still do their own role checks and set req.user.
const requireSignIn = async (req, res, next) => {
    if (req.method === "OPTIONS" || OPEN_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
        return next();
    }

    const token = req.header("x-access-token");
    if (!token) {
        return res.status(401).json({ error: true, message: "Please sign in" });
    }
    try {
        jwt.verify(token, process.env.ACCESS_TOKEN_PRIVATE_KEY);
        if (await UsedToken.exists({ token })) throw new Error("used token");
    } catch {
        return res.status(401).json({ error: true, message: "Your session has expired. Please sign in again." });
    }
    next();
};

export default requireSignIn;
