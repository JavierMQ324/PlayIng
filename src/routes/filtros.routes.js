const express = require('express');
const router = express.Router();
const FiltrosController = require('../controllers/filtros.controller');

// Obtener filtros de un establecimiento
router.get('/', FiltrosController.getFiltros);

// Agregar un filtro (bloquear género, artista o canción)
router.post('/', FiltrosController.addFiltro);

// Eliminar un filtro
router.delete('/:filtroId', FiltrosController.deleteFiltro);

// Verificar si una canción está bloqueada
router.post('/check', FiltrosController.checkIfBlocked);

// Verificar múltiples canciones
router.post('/check-multiple', FiltrosController.checkMultipleSongs);

module.exports = router;





