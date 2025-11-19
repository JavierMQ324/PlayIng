const express = require('express');
const router = express.Router();
const MusicaController = require('../controllers/musica.controller');
const MusicaColaController = require('../controllers/musica-cola.controller');
const VotosController = require('../controllers/votos.controller');
const { verifyToken } = require('../controllers/usuarios.controller');

// Búsqueda
router.get('/search', MusicaController.searchTracks);
router.get('/genres', MusicaController.searchGenres);
router.get('/genres/:genre/tracks', MusicaController.getTracksByGenre);
router.get('/artists/:artistId/tracks', MusicaController.getTracksByArtist);

// Cola de canciones
router.post('/queue', MusicaColaController.addToQueue);
router.post('/queue/play-now', MusicaColaController.addToQueueAndPlayNow); 
router.post('/queue/shuffle', MusicaColaController.shuffleQueue);
router.post('/queue/clear', MusicaColaController.clearQueue);
router.post('/queue/replace-with-genre', MusicaColaController.replaceQueueWithGenre);
router.get('/queue', MusicaColaController.getQueue);
router.get('/queue/current-playing', MusicaColaController.getCurrentPlaying);
router.delete('/queue/:colaId', MusicaColaController.removeFromQueue);
router.patch('/queue/:colaId/status', MusicaColaController.updateQueueStatus);
router.patch('/queue/reorder', MusicaColaController.reorderQueue); 
router.post('/queue/set-playing', MusicaColaController.setCurrentPlaying);
router.post('/queue/:colaId/move-to-history', MusicaColaController.moveToHistory);

// Actualización de estado de reproducción (para sincronización en tiempo real)
router.post('/playback/state', MusicaColaController.updatePlaybackState);
router.post('/playback/progress', MusicaColaController.updatePlaybackProgress);

// Votos (likes y skips) - Requieren autenticación
router.post('/vote', verifyToken, VotosController.vote);
router.get('/votes/:colaCancionId', VotosController.getVotes);
router.get('/votes/:colaCancionId/user', verifyToken, VotosController.getUserVote);

// Historial
router.get('/history', MusicaColaController.getHistory);

module.exports = router;
