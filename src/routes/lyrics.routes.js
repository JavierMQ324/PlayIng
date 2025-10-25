const express = require('express');
const router = express.Router();
const LyricsController = require('../controllers/lyrics.controller');
const { verifyToken } = require('../controllers/usuarios.controller');

// Obtener letras por título y artista (endpoint principal)
router.get('/', verifyToken, LyricsController.getLyrics);

// Buscar múltiples resultados
router.get('/search', verifyToken, LyricsController.searchLyrics);

// Obtener letras por ID de LRCLIB
router.get('/:id', verifyToken, LyricsController.getLyricsById);

module.exports = router;

