const { jwtVerify, createRemoteJWKSet } = require('jose-cjs');

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.NEXT_PUBLIC_Client_URL}/api/auth/jwks`)
);

async function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).send({ message: "No token provided" });
        }

        const token = authHeader.split(' ')[1];
        const { payload } = await jwtVerify(token, JWKS);

        req.user = payload; // contains id, email, role
        next();
    } catch (error) {
        console.error("Token verification failed:", error.message);
        return res.status(401).send({ message: "Invalid or expired token" });
    }
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).send({ message: "Insufficient permissions" });
        }
        next();
    };
}

module.exports = { verifyToken, requireRole };