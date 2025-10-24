const musicaUtils = require('../utils/musica.utils');

/**
 * Middleware para validar parámetros de paginación
 */
const validatePagination = (req, res, next) => {
  const { limit, offset } = req.query;
  
  if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
    return res.status(400).json({
      success: false,
      message: 'El parámetro limit debe ser un número entre 1 y 100'
    });
  }
  
  if (offset && (isNaN(offset) || offset < 0)) {
    return res.status(400).json({
      success: false,
      message: 'El parámetro offset debe ser un número mayor o igual a 0'
    });
  }
  
  // Normalizar parámetros
  req.query.limit = limit ? parseInt(limit) : 20;
  req.query.offset = offset ? parseInt(offset) : 0;
  
  next();
};

/**
 * Middleware para validar parámetros de búsqueda
 */
const validateSearch = (req, res, next) => {
  const { q, tipo, limit } = req.query;
  
  if (!q || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'El parámetro de búsqueda (q) es requerido'
    });
  }
  
  if (q.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'El término de búsqueda debe tener al menos 2 caracteres'
    });
  }
  
  if (tipo && !['track', 'artist', 'album', 'playlist'].includes(tipo)) {
    return res.status(400).json({
      success: false,
      message: 'El tipo de búsqueda debe ser: track, artist, album o playlist'
    });
  }
  
  // Sanitizar término de búsqueda
  req.query.q = musicaUtils.sanitizeSearchString(q);
  
  next();
};

/**
 * Middleware para validar ID de Spotify
 */
const validateSpotifyId = (req, res, next) => {
  const { id, cancionId } = req.params;
  const spotifyId = id || cancionId;
  
  if (!musicaUtils.isValidSpotifyId(spotifyId)) {
    return res.status(400).json({
      success: false,
      message: 'ID de Spotify inválido'
    });
  }
  
  next();
};

/**
 * Middleware para validar datos de playlist
 */
const validatePlaylistData = (req, res, next) => {
  const { nombre, descripcion, esPublica } = req.body;
  
  if (!nombre || nombre.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'El nombre de la playlist es requerido'
    });
  }
  
  if (nombre.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'El nombre de la playlist no puede exceder 100 caracteres'
    });
  }
  
  if (descripcion && descripcion.length > 300) {
    return res.status(400).json({
      success: false,
      message: 'La descripción no puede exceder 300 caracteres'
    });
  }
  
  // Normalizar datos
  req.body.nombre = nombre.trim();
  req.body.descripcion = descripcion ? descripcion.trim() : '';
  req.body.esPublica = Boolean(esPublica);
  
  next();
};

/**
 * Middleware para validar parámetros de recomendaciones
 */
const validateRecommendations = (req, res, next) => {
  const { generos, artistas, canciones, limit } = req.query;
  
  if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
    return res.status(400).json({
      success: false,
      message: 'El parámetro limit debe ser un número entre 1 y 100'
    });
  }
  
  // Validar que al menos un seed esté presente
  if (!generos && !artistas && !canciones) {
    return res.status(400).json({
      success: false,
      message: 'Debe proporcionar al menos un parámetro: generos, artistas o canciones'
    });
  }
  
  // Validar formato de arrays
  if (generos && typeof generos === 'string') {
    req.query.generos = generos.split(',').map(g => g.trim()).filter(g => g.length > 0);
  }
  
  if (artistas && typeof artistas === 'string') {
    req.query.artistas = artistas.split(',').map(a => a.trim()).filter(a => a.length > 0);
  }
  
  if (canciones && typeof canciones === 'string') {
    req.query.canciones = canciones.split(',').map(c => c.trim()).filter(c => c.length > 0);
  }
  
  next();
};

/**
 * Middleware para validar usuario autenticado
 */
const requireAuth = (req, res, next) => {
  const { usuarioId } = req.params;
  
  if (!usuarioId) {
    return res.status(400).json({
      success: false,
      message: 'ID de usuario requerido'
    });
  }
  
  // Aquí podrías agregar validación adicional de autenticación
  // como verificar tokens JWT, sesiones, etc.
  
  next();
};

/**
 * Middleware para logging de requests
 */
const logRequest = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${method} ${url} - IP: ${ip}`);
  
  next();
};

/**
 * Middleware para manejo de errores específicos de música
 */
const handleMusicErrors = (err, req, res, next) => {
  console.error('Error en módulo de música:', err);
  
  // Error de Spotify API
  if (err.response && err.response.status === 401) {
    return res.status(401).json({
      success: false,
      message: 'Error de autenticación con Spotify API',
      error: 'SPOTIFY_AUTH_ERROR'
    });
  }
  
  if (err.response && err.response.status === 429) {
    return res.status(429).json({
      success: false,
      message: 'Límite de rate limit excedido para Spotify API',
      error: 'SPOTIFY_RATE_LIMIT'
    });
  }
  
  // Error de WebSocket
  if (err.code === 'WS_ERROR') {
    return res.status(500).json({
      success: false,
      message: 'Error en comunicación WebSocket',
      error: 'WEBSOCKET_ERROR'
    });
  }
  
  // Error genérico
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : 'INTERNAL_ERROR'
  });
};

module.exports = {
  validatePagination,
  validateSearch,
  validateSpotifyId,
  validatePlaylistData,
  validateRecommendations,
  requireAuth,
  logRequest,
  handleMusicErrors
};
