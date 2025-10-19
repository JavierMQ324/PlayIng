const express = require('express');
const router = express.Router();
const SpotifyController = require('../controllers/spotify.controller');

// Middleware para verificar autenticación (opcional, dependiendo de tu sistema de auth)
const authenticateUser = (req, res, next) => {
  // Aquí puedes agregar lógica de autenticación si es necesario
  // Por ahora, asumimos que el userId viene en los parámetros
  next();
};

// Rutas de Spotify
router.get('/auth', authenticateUser, SpotifyController.initiateAuth);
router.post('/callback', authenticateUser, SpotifyController.handleCallback);
router.get('/credentials/:userId', authenticateUser, SpotifyController.getCredentials);
router.get('/debug/:userId', authenticateUser, SpotifyController.debugCredentials);
router.post('/refresh/:userId', authenticateUser, SpotifyController.refreshAccessToken);
router.get('/search/:userId', authenticateUser, SpotifyController.searchTracks);
router.get('/playback/:userId', authenticateUser, SpotifyController.getCurrentPlayback);
router.delete('/disconnect/:userId', authenticateUser, SpotifyController.disconnect);

module.exports = router;
