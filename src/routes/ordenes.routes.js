const express = require('express');
const router = express.Router();
const ordenesController = require('../controllers/ordenes.controller');
const { verifyToken } = require('../controllers/usuarios.controller');

// Todas las rutas requieren autenticación
router.use(verifyToken);

// GET /api/ordenes/usuarios-activos/:establecimientoId - Obtener usuarios activos del establecimiento
// Esta ruta debe ir primero para evitar conflicto con la ruta dinámica
router.get('/usuarios-activos/:establecimientoId', ordenesController.getUsuariosActivos);

// GET /api/ordenes/estado-usuarios/:establecimientoId - Obtener estado de órdenes por usuario
router.get('/estado-usuarios/:establecimientoId', ordenesController.getEstadoOrdenesUsuarios);

// GET /api/ordenes/:establecimientoId - Obtener todas las órdenes de un establecimiento
router.get('/:establecimientoId', ordenesController.getOrdenes);

// POST /api/ordenes - Crear una nueva orden
router.post('/', ordenesController.createOrden);

// PUT /api/ordenes/:id/status - Actualizar el estado de una orden
router.put('/:id/status', ordenesController.updateOrdenStatus);

// PUT /api/ordenes/:id/tiempo - Actualizar el tiempo estimado de una orden
router.put('/:id/tiempo', ordenesController.updateOrdenTiempo);

// DELETE /api/ordenes - Eliminar múltiples órdenes
router.delete('/', ordenesController.deleteOrdenes);

module.exports = router;

