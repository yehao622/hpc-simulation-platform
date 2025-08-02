// api-gateway/src/routes/simulationRoutes.ts - FIXED VERSION
import { Router } from 'express';

const router = Router();

// Import dependencies with error handling
let simulationController: any;
let authMiddleware: any;

try {
    simulationController = require('../controllers/simulationController');
    authMiddleware = require('../middleware/authMiddleware');
    console.log('✅ Simulation controller and middleware loaded successfully');
} catch (error: any) {
    console.error('💥 Failed to load simulation dependencies:', error.message);
    
    // Create fallback handlers
    simulationController = {
        createSimulation: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Simulation controller not available'
            });
        },
        getSimulations: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Simulation controller not available'
            });
        },
        getSimulationById: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Simulation controller not available'
            });
        },
        cancelSimulation: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Simulation controller not available'
            });
        },
        getTopologyTemplates: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Simulation controller not available'
            });
        },
        getWorkloadPatterns: (req: any, res: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Simulation controller not available'
            });
        }
    };
    
    authMiddleware = {
        authenticateToken: (req: any, res: any, next: any) => {
            res.status(503).json({
                error: 'Service temporarily unavailable',
                message: 'Authentication middleware not available'
            });
        }
    };
}

// All simulation routes require authentication
router.use(authMiddleware.authenticateToken);

/**
 * @route   GET /api/v1/simulations/templates/topologies
 * @desc    Get available topology templates
 * @access  Private
 */
router.get('/templates/topologies', simulationController.getTopologyTemplates);

/**
 * @route   GET /api/v1/simulations/templates/workloads
 * @desc    Get available workload patterns
 * @access  Private
 */
router.get('/templates/workloads', simulationController.getWorkloadPatterns);

/**
 * @route   POST /api/v1/simulations
 * @desc    Create a new simulation job
 * @access  Private
 * @body    { name, description?, topologyId, workloadId, simulationTime?, ... }
 */
router.post('/', simulationController.createSimulation);

/**
 * @route   GET /api/v1/simulations
 * @desc    Get simulation jobs for authenticated user
 * @access  Private
 * @query   { page?, limit?, status?, sortBy?, sortOrder? }
 */
router.get('/', simulationController.getSimulations);

/**
 * @route   GET /api/v1/simulations/:id
 * @desc    Get specific simulation job details
 * @access  Private
 * @params  id - simulation job UUID
 */
router.get('/:id', simulationController.getSimulationById);

/**
 * @route   DELETE /api/v1/simulations/:id
 * @desc    Cancel a simulation job
 * @access  Private
 * @params  id - simulation job UUID
 */
router.delete('/:id', simulationController.cancelSimulation);

// Test route to verify mounting
router.get('/test', (req, res) => {
    res.json({
        message: 'Simulation routes are working!',
        timestamp: new Date().toISOString(),
        user: (req as any).user || 'No user authenticated',
        availableRoutes: [
            'GET /templates/topologies',
            'GET /templates/workloads',
            'POST /',
            'GET /',
            'GET /:id',
            'DELETE /:id'
        ]
    });
});

console.log('📦 Simulation routes module loaded');

// Export using both CommonJS and ES module style for compatibility
module.exports = router;
module.exports.default = router;
export default router;