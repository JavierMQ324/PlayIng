const express = require('express');
const router = express.Router();
const MusicaController = require('../controllers/musica.controller');

// Búsqueda
router.get('/search', MusicaController.searchTracks);
router.get('/genres', MusicaController.searchGenres);
router.get('/genres/:genre/tracks', MusicaController.getTracksByGenre);


module.exports = router;
