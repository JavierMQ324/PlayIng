const axios = require('axios');
const db = require('../db');

class SpotifyController {
  // Generar URL de autorización de Spotify
  static async initiateAuth(req, res) {
    try {
      const { userId } = req.query;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false, 
          error: 'User ID is required' 
        });
      }

      // Scopes necesarios para el reproductor
      const scopes = [
        'user-read-playback-state',
        'user-modify-playback-state',
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-read-currently-playing',
        'user-read-recently-played'
      ].join(' ');

      // Generar state para seguridad
      const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');

      const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://nononerous-rhiannon-disulfuric.ngrok-free.dev/callback/spotify';
      const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${process.env.SPOTIFY_CLIENT_ID}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${state}`;

      res.json({
        success: true,
        authUrl,
        state
      });
    } catch (error) {
      console.error('Error initiating Spotify auth:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to initiate Spotify authentication' 
      });
    }
  }

  // Manejar callback de OAuth
  static async handleCallback(req, res) {
    try {
      const { code, state } = req.body;

      if (!code || !state) {
        return res.status(400).json({ 
          success: false, 
          error: 'Code and state are required' 
        });
      }

      // Verificar state
      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      } catch (error) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid state parameter' 
        });
      }

      const { userId } = stateData;

      // Intercambiar código por tokens
      const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: process.env.SPOTIFY_REDIRECT_URI || 'https://nononerous-rhiannon-disulfuric.ngrok-free.dev/callback/spotify',
          client_id: process.env.SPOTIFY_CLIENT_ID,
          client_secret: process.env.SPOTIFY_CLIENT_SECRET
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
      const expiresAt = new Date(Date.now() + (expires_in * 1000));

      // Guardar o actualizar credenciales en la base de datos
      db.query(
        'SELECT id FROM spotify_credentials WHERE usuario_id = ?',
        [userId],
        (err, existingCredentials) => {
          if (err) {
            console.error('Error checking existing credentials:', err);
            return res.status(500).json({ 
              success: false, 
              error: 'Database error' 
            });
          }

          console.log('Existing credentials:', existingCredentials);

          // Verificar si existen credenciales
          const hasCredentials = existingCredentials && existingCredentials.length > 0;
          
          if (hasCredentials) {
            // Actualizar credenciales existentes
            db.query(
              `UPDATE spotify_credentials SET 
               access_token = ?, refresh_token = ?, expires_at = ?, scope = ?, actualizado_en = NOW()
               WHERE usuario_id = ?`,
              [access_token, refresh_token, expiresAt, scope, userId],
              (err) => {
                if (err) {
                  console.error('Error updating credentials:', err);
                  return res.status(500).json({ 
                    success: false, 
                    error: 'Database error' 
                  });
                }
                console.log('Credenciales actualizadas');
                res.json({ 
                  success: true, 
                  message: 'Spotify credentials updated successfully' 
                });
              }
            );
          } else {
            // Insertar nuevas credenciales
            db.query(
              `INSERT INTO spotify_credentials (usuario_id, access_token, refresh_token, expires_at, scope) 
               VALUES (?, ?, ?, ?, ?)`,
              [userId, access_token, refresh_token, expiresAt, scope],
              (err) => {
                if (err) {
                  console.error('Error inserting credentials:', err);
                  return res.status(500).json({ 
                    success: false, 
                    error: 'Database error' 
                  });
                }
                console.log('Nuevas credenciales insertadas');
                res.json({ 
                  success: true, 
                  message: 'Spotify credentials saved successfully' 
                });
              }
            );
          }
        }
      );

    } catch (error) {
      console.error('Error handling Spotify callback:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process Spotify callback' 
      });
    }
  }

  // Debug endpoint para verificar credenciales
  static async debugCredentials(req, res) {
    try {
      const { userId } = req.params;
      console.log('Debug: Checking credentials for user:', userId);

      db.query(
        'SELECT * FROM spotify_credentials WHERE usuario_id = ?',
        [userId],
        (err, credentials) => {
          if (err) {
            console.error('Debug: Database error:', err);
            return res.status(500).json({ 
              success: false, 
              error: 'Database error',
              details: err.message
            });
          }

          console.log('Debug: Credentials found:', credentials);

          if (!credentials || credentials.length === 0) {
            return res.json({ 
              success: false, 
              error: 'No credentials found',
              count: 0
            });
          }

          const cred = credentials[0];
          const now = new Date();
          const expiresAt = new Date(cred.expires_at);
          const isExpired = expiresAt <= now;

          res.json({
            success: true,
            count: credentials.length,
            credentials: {
              id: cred.id,
              usuario_id: cred.usuario_id,
              expires_at: cred.expires_at,
              isExpired: isExpired,
              timeUntilExpiry: expiresAt - now,
              scope: cred.scope
            }
          });
        }
      );

    } catch (error) {
      console.error('Debug: Error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Debug error',
        details: error.message
      });
    }
  }

  // Obtener credenciales del usuario
  static async getCredentials(req, res) {
    try {
      const { userId } = req.params;

      db.query(
        'SELECT * FROM spotify_credentials WHERE usuario_id = ?',
        [userId],
        (err, credentials) => {
          if (err) {
            console.error('Error getting credentials:', err);
            return res.status(500).json({ 
              success: false, 
              error: 'Database error' 
            });
          }

          console.log('Credentials result:', credentials);

          // Verificar si hay credenciales
          if (!credentials || credentials.length === 0) {
            return res.status(404).json({ 
              success: false, 
              error: 'No Spotify credentials found for this user' 
            });
          }

          const cred = credentials[0];
          const now = new Date();

          // Verificar si el token ha expirado
          if (new Date(cred.expires_at) <= now) {
            return res.status(401).json({ 
              success: false, 
              error: 'Access token expired',
              needsRefresh: true
            });
          }

          res.json({
            success: true,
            credentials: {
              accessToken: cred.access_token,
              refreshToken: cred.refresh_token,
              expiresAt: cred.expires_at,
              scope: cred.scope
            }
          });
        }
      );

    } catch (error) {
      console.error('Error getting Spotify credentials:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get Spotify credentials' 
      });
    }
  }

  // Refrescar token de acceso
  static async refreshAccessToken(req, res) {
    try {
      const { userId } = req.params;

      // Obtener refresh token
      db.query(
        'SELECT refresh_token FROM spotify_credentials WHERE usuario_id = ?',
        [userId],
        async (err, credentials) => {
          if (err) {
            console.error('Error getting refresh token:', err);
            return res.status(500).json({ 
              success: false, 
              error: 'Database error' 
            });
          }

          if (!credentials || credentials.length === 0) {
            return res.status(404).json({ 
              success: false, 
              error: 'No Spotify credentials found for this user' 
            });
          }

          const { refresh_token } = credentials[0];

          try {
            // Solicitar nuevo access token
            const tokenResponse = await axios.post('https://accounts.spotify.com/api/token',
              new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refresh_token,
                client_id: process.env.SPOTIFY_CLIENT_ID,
                client_secret: process.env.SPOTIFY_CLIENT_SECRET
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              }
            );

            const { access_token, expires_in } = tokenResponse.data;
            const expiresAt = new Date(Date.now() + (expires_in * 1000));

            // Actualizar en la base de datos
            db.query(
              `UPDATE spotify_credentials SET 
               access_token = ?, expires_at = ?, actualizado_en = NOW()
               WHERE usuario_id = ?`,
              [access_token, expiresAt, userId],
              (err) => {
                if (err) {
                  console.error('Error updating credentials:', err);
                  return res.status(500).json({ 
                    success: false, 
                    error: 'Database error' 
                  });
                }

                res.json({
                  success: true,
                  accessToken: access_token,
                  expiresAt: expiresAt
                });
              }
            );
          } catch (refreshError) {
            console.error('Error refreshing token:', refreshError);
            res.status(500).json({ 
              success: false, 
              error: 'Failed to refresh token' 
            });
          }
        }
      );

    } catch (error) {
      console.error('Error refreshing Spotify token:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to refresh Spotify token' 
      });
    }
  }

  // Buscar canciones en Spotify
  static async searchTracks(req, res) {
    try {
      const { userId } = req.params;
      const { q, limit = 20, offset = 0 } = req.query;

      if (!q) {
        return res.status(400).json({ 
          success: false, 
          error: 'Query parameter is required' 
        });
      }

      // Obtener access token
      const accessToken = await this.getValidAccessToken(userId);
      if (!accessToken) {
        return res.status(401).json({ 
          success: false, 
          error: 'No valid Spotify access token found' 
        });
      }

      // Buscar en Spotify
      const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          q: q,
          type: 'track',
          limit: limit,
          offset: offset
        }
      });

      res.json({
        success: true,
        tracks: searchResponse.data.tracks.items.map(track => ({
          id: track.id,
          name: track.name,
          artists: track.artists.map(artist => artist.name),
          album: track.album.name,
          duration: track.duration_ms,
          preview_url: track.preview_url,
          external_urls: track.external_urls,
          images: track.album.images
        }))
      });

    } catch (error) {
      console.error('Error searching tracks:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search tracks' 
      });
    }
  }

  // Obtener estado de reproducción actual
  static async getCurrentPlayback(req, res) {
    try {
      const { userId } = req.params;

      // Obtener access token
      const accessToken = await this.getValidAccessToken(userId);
      if (!accessToken) {
        return res.status(401).json({ 
          success: false, 
          error: 'No valid Spotify access token found' 
        });
      }

      // Obtener estado de reproducción
      const playbackResponse = await axios.get('https://api.spotify.com/v1/me/player', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (playbackResponse.status === 204) {
        return res.json({
          success: true,
          playback: null,
          message: 'No active playback'
        });
      }

      const playback = playbackResponse.data;
      res.json({
        success: true,
        playback: {
          isPlaying: playback.is_playing,
          progress: playback.progress_ms,
          device: playback.device,
          track: playback.item ? {
            id: playback.item.id,
            name: playback.item.name,
            artists: playback.item.artists.map(artist => artist.name),
            album: playback.item.album.name,
            duration: playback.item.duration_ms,
            images: playback.item.album.images
          } : null
        }
      });

    } catch (error) {
      console.error('Error getting current playback:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get current playback' 
      });
    }
  }

  // Helper: Obtener access token válido (refrescar si es necesario)
  static async getValidAccessToken(userId) {
    return new Promise((resolve, reject) => {
      db.query(
        'SELECT * FROM spotify_credentials WHERE usuario_id = ?',
        [userId],
        async (err, credentials) => {
          if (err) {
            console.error('Error getting credentials:', err);
            return resolve(null);
          }

          if (!credentials || credentials.length === 0) {
            return resolve(null);
          }

          const cred = credentials[0];
          const now = new Date();

          // Si el token no ha expirado, devolverlo
          if (new Date(cred.expires_at) > now) {
            return resolve(cred.access_token);
          }

          // Token expirado, intentar refrescar
          try {
            const tokenResponse = await axios.post('https://accounts.spotify.com/api/token',
              new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: cred.refresh_token,
                client_id: process.env.SPOTIFY_CLIENT_ID,
                client_secret: process.env.SPOTIFY_CLIENT_SECRET
              }),
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              }
            );

            const { access_token, expires_in } = tokenResponse.data;
            const expiresAt = new Date(Date.now() + (expires_in * 1000));

            // Actualizar en la base de datos
            db.query(
              `UPDATE spotify_credentials SET 
               access_token = ?, expires_at = ?, actualizado_en = NOW()
               WHERE usuario_id = ?`,
              [access_token, expiresAt, userId],
              (err) => {
                if (err) {
                  console.error('Error updating refreshed token:', err);
                  return resolve(null);
                }
                resolve(access_token);
              }
            );

          } catch (refreshError) {
            console.error('Error refreshing token:', refreshError);
            resolve(null);
          }
        }
      );
    });
  }

  // Desconectar Spotify
  static async disconnect(req, res) {
    try {
      const { userId } = req.params;

      db.query(
        'DELETE FROM spotify_credentials WHERE usuario_id = ?',
        [userId],
        (err) => {
          if (err) {
            console.error('Error deleting credentials:', err);
            return res.status(500).json({ 
              success: false, 
              error: 'Database error' 
            });
          }

          res.json({
            success: true,
            message: 'Spotify disconnected successfully'
          });
        }
      );

    } catch (error) {
      console.error('Error disconnecting Spotify:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to disconnect Spotify' 
      });
    }
  }
}

module.exports = SpotifyController;