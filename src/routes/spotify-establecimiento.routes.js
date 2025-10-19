const express = require('express');
const router = express.Router();
const SpotifyEstablecimientoController = require('../controllers/spotify-establecimiento.controller');

// Rutas para autenticación de Spotify por establecimiento
router.get('/auth', SpotifyEstablecimientoController.initiateAuth);
router.post('/callback', SpotifyEstablecimientoController.handleCallback);
router.get('/credentials/:establecimientoId', SpotifyEstablecimientoController.getCredentials);
router.post('/refresh/:establecimientoId', SpotifyEstablecimientoController.refreshAccessToken);
router.delete('/disconnect/:establecimientoId', SpotifyEstablecimientoController.disconnect);

module.exports = router;
