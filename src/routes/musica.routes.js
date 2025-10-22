const express = require('express');
const router = express.Router();
const MusicaController = require('../controllers/musica.controller');

// Búsqueda
router.get('/search', MusicaController.searchTracks);
router.get('/genres', MusicaController.searchGenres);
router.get('/genres/:genre/tracks', MusicaController.getTracksByGenre);

// Cola
router.get('/queue/:establecimientoId', MusicaController.getQueue);
router.post('/queue', MusicaController.addToQueue);
router.put('/queue/:id/position', MusicaController.updateQueuePosition);
router.put('/queue/:id/status', MusicaController.updateQueueStatus);
router.delete('/queue/:id', MusicaController.removeFromQueue);
router.get('/playing/:establecimientoId', MusicaController.getCurrentPlaying);
router.post('/play-next', MusicaController.playNext);

// Historial
router.get('/history/:establecimientoId', MusicaController.getHistory);

// Configuración
router.get('/config/:establecimientoId', MusicaController.getConfig);
router.put('/config/:establecimientoId', MusicaController.updateConfig);

// Filtros
router.get('/filters/:establecimientoId', MusicaController.getFilters);
router.post('/filters', MusicaController.addFilter);
router.delete('/filters/:id', MusicaController.removeFilter);

// Validación
router.get('/validate/:userId/:establecimientoId', MusicaController.validateUserLimitsEndpoint);

module.exports = router;
