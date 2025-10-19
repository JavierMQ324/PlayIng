const axios = require('axios');
const db = require('../db');

class SpotifyEstablecimientoController {
  // Generar URL de autorización de Spotify para establecimiento
  static async initiateAuth(req, res) {
    try {
      const { establecimientoId } = req.query;
      
      if (!establecimientoId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Establecimiento ID is required' 
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
      const state = Buffer.from(JSON.stringify({ establecimientoId, timestamp: Date.now() })).toString('base64');

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

      const { establecimientoId } = stateData;

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
        'SELECT id FROM spotify_establecimiento WHERE establecimiento_id = ?',
        [establecimientoId],
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
              `UPDATE spotify_establecimiento SET 
               access_token = ?, refresh_token = ?, expires_at = ?, scope = ?, actualizado_en = NOW()
               WHERE establecimiento_id = ?`,
              [access_token, refresh_token, expiresAt, scope, establecimientoId],
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
              `INSERT INTO spotify_establecimiento (establecimiento_id, access_token, refresh_token, expires_at, scope) 
               VALUES (?, ?, ?, ?, ?)`,
              [establecimientoId, access_token, refresh_token, expiresAt, scope],
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

  // Obtener credenciales del establecimiento
  static async getCredentials(req, res) {
    try {
      const { establecimientoId } = req.params;

      db.query(
        'SELECT * FROM spotify_establecimiento WHERE establecimiento_id = ?',
        [establecimientoId],
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
              error: 'No Spotify credentials found for this establishment' 
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
      const { establecimientoId } = req.params;

      // Obtener refresh token
      db.query(
        'SELECT refresh_token FROM spotify_establecimiento WHERE establecimiento_id = ?',
        [establecimientoId],
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
              error: 'No Spotify credentials found for this establishment' 
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
              `UPDATE spotify_establecimiento SET 
               access_token = ?, expires_at = ?, actualizado_en = NOW()
               WHERE establecimiento_id = ?`,
              [access_token, expiresAt, establecimientoId],
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

  // Helper: Obtener access token válido (refrescar si es necesario)
  static async getValidAccessToken(establecimientoId) {
    return new Promise((resolve, reject) => {
      console.log(`Getting valid access token for establishment ${establecimientoId}`);
      db.query(
        'SELECT * FROM spotify_establecimiento WHERE establecimiento_id = ?',
        [establecimientoId],
        async (err, credentials) => {
          if (err) {
            console.error('Error getting credentials:', err);
            return resolve(null);
          }

          if (!credentials || credentials.length === 0) {
            console.log(`No credentials found for establishment ${establecimientoId}`);
            return resolve(null);
          }

          const cred = credentials[0];
          const now = new Date();
          const expiresAt = new Date(cred.expires_at);

          console.log(`Token expires at: ${expiresAt}`);
          console.log(`Current time: ${now}`);
          console.log(`Token expired? ${expiresAt <= now}`);

          // Si el token no ha expirado, devolverlo
          if (expiresAt > now) {
            console.log('Token is still valid, returning it');
            return resolve(cred.access_token);
          }

          // Token expirado, intentar refrescar
          console.log('Token expired, attempting refresh...');
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
            const newExpiresAt = new Date(Date.now() + (expires_in * 1000));

            console.log('Token refresh successful!');
            console.log(`New token expires at: ${newExpiresAt}`);

            // Actualizar en la base de datos
            db.query(
              `UPDATE spotify_establecimiento SET 
               access_token = ?, expires_at = ?, actualizado_en = NOW()
               WHERE establecimiento_id = ?`,
              [access_token, newExpiresAt, establecimientoId],
              (err) => {
                if (err) {
                  console.error('Error updating refreshed token:', err);
                  return resolve(null);
                }
                console.log('Token updated in database successfully');
                resolve(access_token);
              }
            );

          } catch (refreshError) {
            console.error('Error refreshing token:', refreshError.response?.data || refreshError.message);
            resolve(null);
          }
        }
      );
    });
  }

  // Desconectar Spotify
  static async disconnect(req, res) {
    try {
      const { establecimientoId } = req.params;

      db.query(
        'DELETE FROM spotify_establecimiento WHERE establecimiento_id = ?',
        [establecimientoId],
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

module.exports = SpotifyEstablecimientoController;
