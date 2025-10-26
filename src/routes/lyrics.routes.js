const express = require('express');
const router = express.Router();
const LyricsController = require('../controllers/lyrics.controller');

// Obtener letras por título y artista (endpoint principal) - NO requiere auth (info pública)
router.get('/', LyricsController.getLyrics);

// Buscar múltiples resultados - NO requiere auth (info pública)
router.get('/search', LyricsController.searchLyrics);

// Obtener letras por ID de LRCLIB - NO requiere auth (info pública)
router.get('/:id', LyricsController.getLyricsById);

module.exports = router;

