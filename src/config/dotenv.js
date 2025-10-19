// Configuración de variables de entorno
module.exports = {
  // Database configuration
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'playing',

  // Server configuration
  PORT: process.env.PORT || 3000,
  SERVER_PUBLIC_URL: process.env.SERVER_PUBLIC_URL || 'http://localhost:3000',
  ADMIN_APP_URL: process.env.ADMIN_APP_URL || 'http://localhost:4200',
  MOBILE_APP_URL: process.env.MOBILE_APP_URL || 'exp://localhost:8081',

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '990138169107-7blqi2dlp5ov4t8d48at1d9vjll4nose.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'tu_google_client_secret_aqui',

  // Spotify OAuth
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || 'tu_spotify_client_id_aqui',
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || 'tu_spotify_client_secret_aqui',
  SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI || 'https://localhost:4200/callback/spotify',

  // JWT Secret
  JWT_SECRET: process.env.JWT_SECRET || 'tu_jwt_secret_muy_seguro_aqui'
};
