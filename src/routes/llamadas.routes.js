const express = require('express');
const router = express.Router();
const llamadasController = require('../controllers/llamadas.controller');
const { verifyToken } = require('../controllers/usuarios.controller');

// Todas las rutas requieren autenticación
router.use(verifyToken);

// Crear una nueva llamada (cliente)
router.post('/', llamadasController.createLlamada);

// Obtener llamadas pendientes de un establecimiento (admin)
router.get('/:establecimientoId/pendientes', llamadasController.getLlamadasPendientes);

// Marcar llamada como atendida (admin)
router.put('/:id/atender', llamadasController.marcarLlamadaAtendida);

// Cancelar llamada (cliente)
router.put('/:id/cancelar', llamadasController.cancelarLlamada);

module.exports = router;

