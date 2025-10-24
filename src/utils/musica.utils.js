// Utilidades para el módulo de música

/**
 * Formatear duración de milisegundos a mm:ss
 * @param {number} durationMs - Duración en milisegundos
 * @returns {string} - Duración formateada
 */
function formatDuration(durationMs) {
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formatear duración de segundos a mm:ss
 * @param {number} seconds - Duración en segundos
 * @returns {string} - Duración formateada
 */
function formatDurationFromSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Obtener color para un género musical
 * @param {string} genre - Nombre del género
 * @returns {string} - Color hexadecimal
 */
function getColorForGenre(genre) {
  const colorMap = {
    'hip-hop': '#FF6B6B',
    'rap': '#FF6B6B',
    'dance': '#4ECDC4',
    'rock': '#45B7D1',
    'pop': '#96CEB4',
    'house': '#FFEAA7',
    'reggaeton': '#DDA0DD',
    'regional': '#98D8C8',
    'electronic': '#F7DC6F',
    'jazz': '#BB8FCE',
    'classical': '#85C1E9',
    'country': '#F8C471',
    'blues': '#82E0AA',
    'folk': '#F9E79F',
    'alternative': '#D7BDE2'
  };

  const lowerGenre = genre.toLowerCase();
  for (const [key, color] of Object.entries(colorMap)) {
    if (lowerGenre.includes(key)) {
      return color;
    }
  }
  return '#95A5A6'; // Color por defecto
}

/**
 * Obtener nivel de popularidad basado en seguidores
 * @param {number} followers - Número de seguidores
 * @returns {string} - Nivel de popularidad
 */
function getPopularityLevel(followers) {
  if (followers >= 1000000) return 'Muy Popular';
  if (followers >= 100000) return 'Popular';
  if (followers >= 10000) return 'Conocido';
  if (followers >= 1000) return 'Emergente';
  return 'Independiente';
}

/**
 * Validar parámetros de paginación
 * @param {object} params - Parámetros a validar
 * @returns {object} - Parámetros validados
 */
function validatePaginationParams(params) {
  const { limit, offset } = params;
  
  const validatedLimit = limit && !isNaN(limit) && limit > 0 && limit <= 100 
    ? parseInt(limit) 
    : 20;
  
  const validatedOffset = offset && !isNaN(offset) && offset >= 0 
    ? parseInt(offset) 
    : 0;
  
  return {
    limit: validatedLimit,
    offset: validatedOffset
  };
}

/**
 * Crear respuesta estándar de la API
 * @param {boolean} success - Si la operación fue exitosa
 * @param {any} data - Datos a retornar
 * @param {string} message - Mensaje descriptivo
 * @param {object} pagination - Información de paginación (opcional)
 * @returns {object} - Respuesta formateada
 */
function createApiResponse(success, data, message, pagination = null) {
  const response = {
    success,
    data,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (pagination) {
    response.pagination = pagination;
  }
  
  return response;
}

/**
 * Sanitizar string para búsqueda
 * @param {string} str - String a sanitizar
 * @returns {string} - String sanitizado
 */
function sanitizeSearchString(str) {
  return str
    .trim()
    .replace(/[^\w\s]/gi, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ') // Reemplazar múltiples espacios con uno
    .toLowerCase();
}

/**
 * Generar ID único para cliente WebSocket
 * @returns {string} - ID único
 */
function generateClientId() {
  return 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

/**
 * Validar formato de ID de Spotify
 * @param {string} id - ID a validar
 * @returns {boolean} - Si el ID es válido
 */
function isValidSpotifyId(id) {
  return /^[a-zA-Z0-9]{22}$/.test(id);
}

/**
 * Extraer ID de Spotify de una URI
 * @param {string} uri - URI de Spotify (ej: spotify:track:4iV5W9uYEdYUVa79Axb7Rh)
 * @returns {string|null} - ID extraído o null si no es válido
 */
function extractSpotifyId(uri) {
  const match = uri.match(/spotify:(track|artist|album|playlist):([a-zA-Z0-9]{22})/);
  return match ? match[2] : null;
}

/**
 * Crear URI de Spotify
 * @param {string} type - Tipo (track, artist, album, playlist)
 * @param {string} id - ID de Spotify
 * @returns {string} - URI de Spotify
 */
function createSpotifyUri(type, id) {
  return `spotify:${type}:${id}`;
}

/**
 * Calcular duración total de una lista de canciones
 * @param {Array} canciones - Array de canciones con duración
 * @returns {string} - Duración total formateada
 */
function calculateTotalDuration(canciones) {
  let totalSeconds = 0;
  
  canciones.forEach(cancion => {
    if (cancion.duracion) {
      const [minutes, seconds] = cancion.duracion.split(':').map(Number);
      totalSeconds += minutes * 60 + seconds;
    }
  });
  
  return formatDurationFromSeconds(totalSeconds);
}

/**
 * Agrupar canciones por artista
 * @param {Array} canciones - Array de canciones
 * @returns {object} - Canciones agrupadas por artista
 */
function groupSongsByArtist(canciones) {
  return canciones.reduce((groups, cancion) => {
    const artista = cancion.artista;
    if (!groups[artista]) {
      groups[artista] = [];
    }
    groups[artista].push(cancion);
    return groups;
  }, {});
}

/**
 * Agrupar canciones por álbum
 * @param {Array} canciones - Array de canciones
 * @returns {object} - Canciones agrupadas por álbum
 */
function groupSongsByAlbum(canciones) {
  return canciones.reduce((groups, cancion) => {
    const album = cancion.album;
    if (!groups[album]) {
      groups[album] = [];
    }
    groups[album].push(cancion);
    return groups;
  }, {});
}

module.exports = {
  formatDuration,
  formatDurationFromSeconds,
  getColorForGenre,
  getPopularityLevel,
  validatePaginationParams,
  createApiResponse,
  sanitizeSearchString,
  generateClientId,
  isValidSpotifyId,
  extractSpotifyId,
  createSpotifyUri,
  calculateTotalDuration,
  groupSongsByArtist,
  groupSongsByAlbum
};
