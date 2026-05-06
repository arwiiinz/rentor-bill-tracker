const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Access denied' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
};

const adminOrSpecial = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'special') {
        return res.status(403).json({ error: 'Admin or special only' });
    }
    next();
};

module.exports = { authMiddleware, adminOnly, adminOrSpecial };
