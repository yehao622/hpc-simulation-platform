// api-gateway/src/routes/authRoutes.ts - FIXED VERSION
import { Router } from 'express';

const router = Router();

// Import controllers with error handling
let authController: any;
let authMiddleware: any;

try {
    authController = require('../controllers/authController');
    authMiddleware = require('../middleware/authMiddleware');
    console.log('✅ Auth controller and middleware loaded successfully');
} catch (error: any) {
    console.error('💥 Failed to load auth dependencies:', error.message);
    
    // Create fallback handlers
    authController = {
        register: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Authentication controller not available'
            });
        },
        login: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable', 
                message: 'Authentication controller not available'
            });
        },
        getProfile: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Authentication controller not available'
            });
        },
        refreshToken: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Authentication controller not available'
            });
        }
    };
    
    authMiddleware = {
        authenticateToken: (req: any, res: any, next: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Authentication middleware not available'
            });
        },
        authRateLimit: (req: any, res: any, next: any) => {
            next(); // Pass through for now
        }
    };
}

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    { email, username, password, firstName, lastName, organization? }
 */
router.post('/register', authMiddleware.authRateLimit, authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user and get JWT token
 * @access  Public
 * @body    { email, password }
 */
router.post('/login', authMiddleware.authRateLimit, authController.login);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Get current user profile
 * @access  Private
 * @headers Authorization: Bearer <token>
 */
router.get('/profile', authMiddleware.authenticateToken, authController.getProfile);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 * @headers Authorization: Bearer <token>
 */
router.post('/refresh', authMiddleware.authenticateToken, authController.refreshToken);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 * @note    For stateless JWT, logout is handled client-side
 */
router.post('/logout', authMiddleware.authenticateToken, (req, res) => {
    console.log('🚪 User logged out:', (req as any).user?.email);
    res.status(200).json({
        message: 'Logout successful',
        note: 'Please remove the token from client storage'
    });
});

// Test route to verify mounting
router.get('/test', (req, res) => {
    res.json({
        message: 'Auth routes are working!',
        timestamp: new Date().toISOString(),
        availableRoutes: [
            'POST /register',
            'POST /login', 
            'GET /profile',
            'POST /refresh',
            'POST /logout'
        ]
    });
});

console.log('📦 Auth routes module loaded');

// Export using both CommonJS and ES module style for compatibility
module.exports = router;
module.exports.default = router;
export default router;