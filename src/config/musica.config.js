// Configuración específica para el módulo de música
const musicaConfig = {
  // Configuración de Spotify
  spotify: {
    baseURL: 'https://api.spotify.com/v1',
    authURL: 'https://accounts.spotify.com/api/token',
    scopes: [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-library-modify',
      'user-top-read',
      'user-read-recently-played'
    ]
  },

  // Configuración de WebSocket
  websocket: {
    path: '/ws',
    heartbeatInterval: 30000, // 30 segundos
    maxConnections: 1000,
    rooms: {
      default: 'general',
      music: 'musica',
      playlists: 'playlists'
    }
  },

  // Configuración de paginación
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
    defaultOffset: 0
  },

  // Configuración de caché
  cache: {
    ttl: 300000, // 5 minutos
    maxSize: 1000
  },

  // Configuración de recomendaciones
  recommendations: {
    maxSeeds: 5,
    defaultLimit: 20,
    maxLimit: 100
  },

  // Configuración de búsqueda
  search: {
    defaultLimit: 20,
    maxLimit: 50,
    types: ['track', 'artist', 'album', 'playlist']
  },

  // Configuración de géneros por defecto
  defaultGenres: [
    'hip-hop',
    'rap',
    'dance',
    'rock',
    'pop',
    'house',
    'reggaeton',
    'regional',
    'electronic',
    'jazz',
    'classical',
    'country',
    'blues',
    'folk',
    'alternative'
  ],

  // Configuración de respuestas
  responses: {
    success: {
      status: 'success',
      message: 'Operación exitosa'
    },
    error: {
      status: 'error',
      message: 'Error en la operación'
    }
  }
};

module.exports = musicaConfig;
