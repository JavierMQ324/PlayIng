const express = require('express');
const musicaController = require('../controllers/musica.controller');
const musicaMiddleware = require('../middleware/musica.middleware');
const router = express.Router();

// Aplicar middleware de logging a todas las rutas
router.use(musicaMiddleware.logRequest);

// Rutas para canciones
router.get('/canciones', musicaMiddleware.validatePagination, musicaController.obtenerCanciones);
router.get('/canciones/buscar', musicaMiddleware.validateSearch, musicaController.buscarCanciones);
router.get('/canciones/populares', musicaMiddleware.validatePagination, musicaController.obtenerCancionesPopulares);
router.get('/canciones/genero/:genero', musicaMiddleware.validatePagination, musicaController.obtenerCancionesPorGenero);
router.post('/canciones', musicaController.agregarCancion);

// Rutas para cola de música
router.get('/cola', musicaController.obtenerColaCanciones);
router.post('/cola', musicaController.agregarCancionACola);

// Rutas para géneros
router.get('/generos', musicaController.obtenerGeneros);

// Rutas para artistas
router.get('/artistas', musicaMiddleware.validatePagination, musicaController.obtenerArtistas);
router.get('/artistas/:id', musicaController.obtenerDetallesArtista);

// Rutas para playlists
router.get('/usuarios/:usuarioId/playlists', musicaMiddleware.requireAuth, musicaController.obtenerPlaylists);
router.post('/usuarios/:usuarioId/playlists', musicaMiddleware.requireAuth, musicaMiddleware.validatePlaylistData, musicaController.crearPlaylist);
router.post('/playlists/:playlistId/canciones/:cancionId', musicaMiddleware.validateSpotifyId, musicaController.agregarCancionAPlaylist);
router.delete('/playlists/:playlistId/canciones/:cancionId', musicaMiddleware.validateSpotifyId, musicaController.removerCancionDePlaylist);

// Rutas para recomendaciones
router.get('/recomendaciones', musicaMiddleware.validateRecommendations, musicaController.obtenerRecomendaciones);

// Ruta de salud para el módulo de música
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Módulo de música funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    mode: 'hybrid_spotify_local'
  });
});

// Middleware de manejo de errores específico para música
router.use(musicaMiddleware.handleMusicErrors);

module.exports = router;
