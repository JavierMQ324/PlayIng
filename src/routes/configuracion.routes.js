const express = require('express');
const router = express.Router();
const ConfiguracionController = require('../controllers/configuracion.controller');
const { verifyToken } = require('../controllers/usuarios.controller');

// Aplicar middleware de autenticación
router.use(verifyToken);

// Obtener configuración de límites
router.get('/', ConfiguracionController.getConfiguracion);

// Actualizar configuración de límites
router.put('/', ConfiguracionController.updateConfiguracion);

module.exports = router;






