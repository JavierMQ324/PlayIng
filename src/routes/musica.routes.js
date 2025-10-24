const express = require('express');
const router = express.Router();
const MusicaController = require('../controllers/musica.controller');
const MusicaColaController = require('../controllers/musica-cola.controller');

// Búsqueda
router.get('/search', MusicaController.searchTracks);
router.get('/genres', MusicaController.searchGenres);
router.get('/genres/:genre/tracks', MusicaController.getTracksByGenre);

// Cola de canciones
router.post('/queue', MusicaColaController.addToQueue);
router.post('/queue/play-now', MusicaColaController.addToQueueAndPlayNow); // ✅ NUEVO: Reproducir inmediatamente
router.get('/queue', MusicaColaController.getQueue);
router.get('/queue/current-playing', MusicaColaController.getCurrentPlaying);
router.delete('/queue/:colaId', MusicaColaController.removeFromQueue);
router.patch('/queue/:colaId/status', MusicaColaController.updateQueueStatus);
router.patch('/queue/reorder', MusicaColaController.reorderQueue); // ✅ NUEVO: Reordenar cola
router.post('/queue/set-playing', MusicaColaController.setCurrentPlaying);
router.post('/queue/:colaId/move-to-history', MusicaColaController.moveToHistory);

// Historial
router.get('/history', MusicaColaController.getHistory);

module.exports = router;
