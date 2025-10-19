const axios = require('axios');
const db = require('../db');
const SpotifyEstablecimientoController = require('./spotify-establecimiento.controller');

class MusicaController {
  // Buscar canciones en Spotify API
  static async searchTracks(req, res) {
    try {
      const { q, establecimientoId } = req.query;
      
      if (!q) {
        return res.status(400).json({ 
          success: false, 
          error: 'Query parameter is required' 
        });
      }

      console.log(`Searching tracks for query: "${q}", establecimiento: ${establecimientoId}`);

      // Obtener access token válido del establecimiento
      const accessToken = await SpotifyEstablecimientoController.getValidAccessToken(establecimientoId);
      if (!accessToken) {
        return res.status(401).json({ 
          success: false, 
          error: 'No valid Spotify access token available. Please connect your Spotify account.'
        });
      }

      try {
        // Búsqueda en Spotify con múltiples intentos
        const searchQueries = [
          q, // Búsqueda exacta
          `"${q}"`, // Búsqueda entre comillas
          `${q} track`, // Búsqueda con palabra clave
          `${q} song` // Búsqueda alternativa
        ];

        let allTracks = [];
        let searchSuccessful = false;

        for (const query of searchQueries) {
          try {
            console.log(`Trying search query: "${query}"`);
            
            const response = await axios.get('https://api.spotify.com/v1/search', {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              },
              params: {
                q: query,
                type: 'track',
                limit: 50,
                market: 'US'
              }
            });

            const foundTracks = response.data.tracks.items.map(track => ({
              spotify_id: track.id,
              titulo: track.name,
              artista: track.artists[0]?.name || 'Unknown',
              album: track.album.name,
              duracion: Math.floor(track.duration_ms / 1000),
              imagen_url: track.album.images[0]?.url || null,
              genero: null, // Se puede obtener de track.album.genres si está disponible
              preview_url: track.preview_url
            }));

            // Combinar tracks únicos
            const existingIds = new Set(allTracks.map(t => t.spotify_id));
            const newTracks = foundTracks.filter(track => !existingIds.has(track.spotify_id));
            allTracks = [...allTracks, ...newTracks];

            console.log(`Found ${newTracks.length} new tracks with query "${query}", total: ${allTracks.length}`);

            if (allTracks.length >= 50) {
              searchSuccessful = true;
              break;
            }

          } catch (queryError) {
            console.log(`Search query "${query}" failed:`, queryError.response?.data?.error?.message || queryError.message);
            continue;
          }
        }

        if (searchSuccessful && allTracks.length > 0) {
          console.log(`Successfully found ${allTracks.length} tracks for query: "${q}"`);
          
          res.json({ 
            success: true, 
            tracks: allTracks,
            total: allTracks.length,
            query: q
          });
        } else {
          throw new Error('All search queries failed or returned no results');
        }

      } catch (spotifyError) {
        console.error('All Spotify searches failed:', spotifyError.message);
        
        res.status(403).json({
          success: false,
          error: 'Unable to search Spotify. Please check your Spotify account permissions.',
          details: 'Make sure you are registered as a test user in the Spotify Developer Dashboard for this app.',
          instructions: 'Go to Spotify Developer Dashboard > Your App > Users and Access > Add your email as a test user'
        });
      }

    } catch (error) {
      console.error('Error searching tracks:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to search tracks' 
      });
    }
  }

  // Obtener géneros disponibles
  static async searchGenres(req, res) {
    try {
      // Géneros populares de Spotify
      const genres = [
        'pop', 'rock', 'hip-hop', 'electronic', 'jazz', 'classical',
        'country', 'reggae', 'blues', 'folk', 'r&b', 'funk',
        'disco', 'punk', 'metal', 'indie', 'alternative', 'latin',
        'world', 'ambient', 'house', 'techno', 'dubstep', 'trap'
      ];

      res.json({ 
        success: true, 
        genres: genres 
      });

    } catch (error) {
      console.error('Error getting genres:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get genres' 
      });
    }
  }

  // Buscar canciones por género
  static async getTracksByGenre(req, res) {
    try {
      const { genre } = req.params;
      const { establecimientoId } = req.query;

      console.log(`Getting tracks for genre: ${genre}, establecimiento: ${establecimientoId}`);

      // Obtener access token válido del establecimiento
      const accessToken = await SpotifyEstablecimientoController.getValidAccessToken(establecimientoId);
      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error: 'No valid Spotify access token available. Please connect your Spotify account.'
        });
      }

      try {
        // Múltiples estrategias de búsqueda para obtener más resultados
        const searchQueries = [
          `genre:"${genre}"`,
          `tag:"${genre}"`,
          `${genre} hits`,
          `popular ${genre}`,
          `${genre} music`,
          `best ${genre}`,
          `top ${genre}`,
          genre
        ];

        let allTracks = [];
        let searchSuccessful = false;

        // Intentar cada estrategia de búsqueda
        for (const query of searchQueries) {
          try {
            console.log(`Trying search query: "${query}"`);
            
            const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              },
              params: {
                q: query,
                type: 'track',
                limit: 50, // Máximo por consulta
                market: 'US'
              }
            });

            const foundTracks = searchResponse.data.tracks.items.map(track => ({
              spotify_id: track.id,
              titulo: track.name,
              artista: track.artists[0]?.name || 'Unknown',
              album: track.album.name,
              duracion: Math.floor(track.duration_ms / 1000),
              imagen_url: track.album.images[0]?.url || null,
              genero: genre,
              preview_url: track.preview_url
            }));

            // Combinar tracks únicos (evitar duplicados)
            const existingIds = new Set(allTracks.map(t => t.spotify_id));
            const newTracks = foundTracks.filter(track => !existingIds.has(track.spotify_id));
            allTracks = [...allTracks, ...newTracks];

            console.log(`Found ${newTracks.length} new tracks with query "${query}", total: ${allTracks.length}`);

            // Si tenemos suficientes tracks, podemos parar
            if (allTracks.length >= 100) {
              searchSuccessful = true;
              break;
            }

          } catch (queryError) {
            console.log(`Search query "${query}" failed:`, queryError.response?.data?.error?.message || queryError.message);
            continue;
          }
        }

        if (searchSuccessful && allTracks.length > 0) {
          console.log(`Successfully found ${allTracks.length} tracks for genre: ${genre}`);
          
          res.json({
            success: true,
            tracks: allTracks,
            total: allTracks.length,
            genre: genre
          });
        } else {
          throw new Error('All search queries failed or returned no results');
        }

      } catch (spotifyError) {
        console.error('All Spotify searches failed:', spotifyError.message);
        
        res.status(403).json({
          success: false,
          error: 'Unable to search Spotify. Please check your Spotify account permissions.',
          details: 'Make sure you are registered as a test user in the Spotify Developer Dashboard for this app.',
          instructions: 'Go to Spotify Developer Dashboard > Your App > Users and Access > Add your email as a test user'
        });
      }

    } catch (error) {
      console.error('Error getting tracks by genre:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tracks by genre' 
      });
    }
  }


  // Agregar canción a la cola
  static async addToQueue(req, res) {
    try {
      const { track, userId, establecimientoId, playImmediately = false } = req.body;

      if (!track || !userId || !establecimientoId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: track, userId, establecimientoId'
        });
      }

      // Validar límites del usuario
      const canAdd = await MusicaController.validateUserLimits(userId, establecimientoId);
      if (!canAdd) {
        return res.status(429).json({
          success: false,
          error: 'User has reached the limit of songs per hour'
        });
      }

      // Verificar filtros de contenido
      const isFiltered = await MusicaController.checkContentFilters(track, establecimientoId);
      if (isFiltered) {
        return res.status(403).json({
          success: false,
          error: 'This song or genre is blocked by content filters'
        });
      }

      // Guardar o actualizar canción en la base de datos
      await MusicaController.saveOrUpdateTrack(track);

      let position;
      let status = 'pending';

      if (playImmediately) {
        // Si se debe reproducir inmediatamente, poner en posición 1
        // Primero marcar la canción actual (posición 1) como reproducida
        await MusicaController.markCurrentAsPlayed(establecimientoId);
        // Luego mover todas las demás canciones una posición hacia abajo
        await MusicaController.shiftQueuePositions(establecimientoId);
        position = 1;
        status = 'playing';
      } else {
        // Obtener siguiente posición en la cola (al final)
        position = await MusicaController.getNextQueuePosition(establecimientoId);
      }

      // Agregar a la cola
      db.query(
        `INSERT INTO cola_cancion (cancion_id, anadido_por, establecimiento_id, posicion, status, agregada_en)
         SELECT id_cancion, ?, ?, ?, ?, NOW()
         FROM canciones WHERE spotify_id = ?`,
        [userId, establecimientoId, position, status, track.spotify_id],
        (err, result) => {
          if (err) {
            console.error('Error adding to queue:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to add song to queue'
            });
          } else {
            res.json({
              success: true,
              message: playImmediately ? 'Song added to queue and started playing' : 'Song added to queue successfully',
              queueId: result.insertId,
              position: position,
              status: status
            });
          }
        }
      );

    } catch (error) {
      console.error('Error adding to queue:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add song to queue'
      });
    }
  }

  // Obtener cola de reproducción
  static async getQueue(req, res) {
    try {
      const { establecimientoId } = req.params;

      db.query(
        `SELECT cc.id, cc.posicion, cc.status, cc.agregada_en,
                c.spotify_id, c.titulo, c.artista, c.album, c.duracion, c.imagen_url, c.genero, c.preview_url,
                u.nombre as usuario_nombre
         FROM cola_cancion cc
         JOIN canciones c ON cc.cancion_id = c.id_cancion
         JOIN usuarios u ON cc.anadido_por = u.id_user
         WHERE cc.establecimiento_id = ? AND cc.posicion > 1
         ORDER BY cc.posicion ASC`,
        [establecimientoId],
        (err, results) => {
          if (err) {
            console.error('Error getting queue:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to get queue'
            });
          } else {
            res.json({
              success: true,
              queue: results
            });
          }
        }
      );

    } catch (error) {
      console.error('Error getting queue:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue'
      });
    }
  }

  // Eliminar canción de la cola
  static async removeFromQueue(req, res) {
    try {
      const { id } = req.params;

      db.query(
        'DELETE FROM cola_cancion WHERE id = ?',
        [id],
        (err, result) => {
          if (err) {
            console.error('Error removing from queue:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to remove song from queue'
            });
          } else {
            res.json({
              success: true,
              message: 'Song removed from queue successfully'
            });
          }
        }
      );

    } catch (error) {
      console.error('Error removing from queue:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove song from queue'
      });
    }
  }

  // Actualizar posición en la cola
  static async updateQueuePosition(req, res) {
    try {
      const { id } = req.params;
      const { newPosition } = req.body;

      db.query(
        'UPDATE cola_cancion SET posicion = ? WHERE id = ?',
        [newPosition, id],
        (err, result) => {
          if (err) {
            console.error('Error updating queue position:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to update queue position'
            });
          } else {
            res.json({
              success: true,
              message: 'Queue position updated successfully'
            });
          }
        }
      );

    } catch (error) {
      console.error('Error updating queue position:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update queue position'
      });
    }
  }

  // Obtener canción actualmente reproduciéndose
  static async getCurrentPlaying(req, res) {
    try {
      const { establecimientoId } = req.params;

      db.query(
        `SELECT cc.id, cc.posicion, cc.status, cc.agregada_en,
                c.spotify_id, c.titulo, c.artista, c.album, c.duracion, c.imagen_url, c.genero, c.preview_url,
                u.nombre as usuario_nombre
         FROM cola_cancion cc
         JOIN canciones c ON cc.cancion_id = c.id_cancion
         JOIN usuarios u ON cc.anadido_por = u.id_user
         WHERE cc.establecimiento_id = ? AND cc.posicion = 1
         ORDER BY cc.agregada_en DESC
         LIMIT 1`,
        [establecimientoId],
        (err, results) => {
          if (err) {
            console.error('Error getting current playing:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to get current playing'
            });
          } else {
            res.json({
              success: true,
              currentTrack: results[0] || null
            });
          }
        }
      );

    } catch (error) {
      console.error('Error getting current playing:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get current playing'
      });
    }
  }

  // Marcar canción como reproducida y pasar a la siguiente
  static async playNext(req, res) {
    try {
      const { queueId, establecimientoId, userId } = req.body;

      // Marcar canción actual como reproducida
      db.query(
        'UPDATE cola_cancion SET status = "played" WHERE id = ?',
        [queueId],
        (err, result) => {
          if (err) {
            console.error('Error marking as played:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to mark song as played'
            });
          } else {
            // Agregar al historial
            db.query(
              `INSERT INTO historial_reproduccion (cancion_id, establecimiento_id, usuario_id, reproducida_en, completada)
               SELECT cc.cancion_id, cc.establecimiento_id, cc.anadido_por, NOW(), 1
               FROM cola_cancion cc WHERE cc.id = ?`,
              [queueId],
              (histErr) => {
                if (histErr) {
                  console.error('Error adding to history:', histErr);
                }
              }
            );

            // Obtener siguiente canción
            db.query(
              `SELECT cc.id, cc.posicion, cc.status, cc.agregada_en,
                      c.spotify_id, c.titulo, c.artista, c.album, c.duracion, c.imagen_url, c.genero, c.preview_url,
                      u.nombre as usuario_nombre
               FROM cola_cancion cc
               JOIN canciones c ON cc.cancion_id = c.id_cancion
               JOIN usuarios u ON cc.anadido_por = u.id_user
               WHERE cc.establecimiento_id = ? AND cc.status = 'pending'
               ORDER BY cc.posicion ASC
               LIMIT 1`,
              [establecimientoId],
              (nextErr, nextResults) => {
                if (nextErr) {
                  console.error('Error getting next song:', nextErr);
                  res.status(500).json({
                    success: false,
                    error: 'Failed to get next song'
                  });
                } else {
                  // Marcar siguiente canción como playing
                  if (nextResults.length > 0) {
                    db.query(
                      'UPDATE cola_cancion SET status = "playing" WHERE id = ?',
                      [nextResults[0].id],
                      (playErr) => {
                        if (playErr) {
                          console.error('Error updating next song status:', playErr);
                        }
                      }
                    );
                  }

                  res.json({
                    success: true,
                    message: 'Song marked as played',
                    nextTrack: nextResults[0] || null
                  });
                }
              }
            );
          }
        }
      );

    } catch (error) {
      console.error('Error playing next:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to play next song'
      });
    }
  }

  // Obtener historial de reproducción
  static async getHistory(req, res) {
    try {
      const { establecimientoId } = req.params;
      const { limit = 20 } = req.query;

      db.query(
        `SELECT h.id_historial, h.reproducida_en, h.completada,
                c.spotify_id, c.titulo, c.artista, c.album, c.duracion, c.imagen_url, c.genero, c.preview_url,
                u.nombre as usuario_nombre
         FROM historial_reproduccion h
         JOIN canciones c ON h.cancion_id = c.id_cancion
         JOIN usuarios u ON h.usuario_id = u.id_user
         WHERE h.establecimiento_id = ?
         ORDER BY h.reproducida_en DESC
         LIMIT ?`,
        [establecimientoId, limit],
        (err, results) => {
          if (err) {
            console.error('Error getting history:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to get history'
            });
          } else {
            res.json({
              success: true,
              history: results
            });
          }
        }
      );

    } catch (error) {
      console.error('Error getting history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get history'
      });
    }
  }

  // Obtener configuración de música
  static async getConfig(req, res) {
    try {
      const { establecimientoId } = req.params;

      db.query(
        'SELECT * FROM configuracion_musica WHERE establecimiento_id = ?',
        [establecimientoId],
        (err, results) => {
          if (err) {
            console.error('Error getting config:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to get music configuration'
            });
          } else {
            res.json({
              success: true,
              config: results[0] || {
                limite_canciones_por_usuario_hora: 5,
                limite_reproducciones_cancion: null
              }
            });
          }
        }
      );

    } catch (error) {
      console.error('Error getting config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get music configuration'
      });
    }
  }

  // Actualizar configuración de música
  static async updateConfig(req, res) {
    try {
      const { establecimientoId } = req.params;
      const { limite_canciones_por_usuario_hora, limite_reproducciones_cancion } = req.body;

      db.query(
        `INSERT INTO configuracion_musica (establecimiento_id, limite_canciones_por_usuario_hora, limite_reproducciones_cancion)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
         limite_canciones_por_usuario_hora = VALUES(limite_canciones_por_usuario_hora),
         limite_reproducciones_cancion = VALUES(limite_reproducciones_cancion),
         actualizada_en = NOW()`,
        [establecimientoId, limite_canciones_por_usuario_hora, limite_reproducciones_cancion],
        (err, result) => {
          if (err) {
            console.error('Error updating config:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to update music configuration'
            });
          } else {
            res.json({
              success: true,
              message: 'Music configuration updated successfully'
            });
          }
        }
      );

    } catch (error) {
      console.error('Error updating config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update music configuration'
      });
    }
  }

  // Obtener filtros de contenido
  static async getFilters(req, res) {
    try {
      const { establecimientoId } = req.params;

      db.query(
        'SELECT * FROM filtros_contenido WHERE establecimiento_id = ? ORDER BY creada_en DESC',
        [establecimientoId],
        (err, results) => {
          if (err) {
            console.error('Error getting filters:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to get content filters'
            });
          } else {
            res.json({
              success: true,
              filters: results
            });
          }
        }
      );

    } catch (error) {
      console.error('Error getting filters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get content filters'
      });
    }
  }

  // Agregar filtro de contenido
  static async addFilter(req, res) {
    try {
      const { establecimientoId, tipo, spotify_id, genero, razon } = req.body;

      db.query(
        'INSERT INTO filtros_contenido (establecimiento_id, tipo, spotify_id, genero, razon) VALUES (?, ?, ?, ?, ?)',
        [establecimientoId, tipo, spotify_id, genero, razon],
        (err, result) => {
          if (err) {
            console.error('Error adding filter:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to add content filter'
            });
          } else {
            res.json({
              success: true,
              message: 'Content filter added successfully',
              filterId: result.insertId
            });
          }
        }
      );

    } catch (error) {
      console.error('Error adding filter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add content filter'
      });
    }
  }

  // Eliminar filtro de contenido
  static async removeFilter(req, res) {
    try {
      const { id } = req.params;

      db.query(
        'DELETE FROM filtros_contenido WHERE id_filtro = ?',
        [id],
        (err, result) => {
          if (err) {
            console.error('Error removing filter:', err);
            res.status(500).json({
              success: false,
              error: 'Failed to remove content filter'
            });
          } else {
            res.json({
              success: true,
              message: 'Content filter removed successfully'
            });
          }
        }
      );

    } catch (error) {
      console.error('Error removing filter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove content filter'
      });
    }
  }

  // Validar límites del usuario
  static async validateUserLimitsEndpoint(req, res) {
    try {
      const { userId, establecimientoId } = req.params;

      const canAdd = await MusicaController.validateUserLimits(userId, establecimientoId);

      res.json({
        success: true,
        canAdd: canAdd
      });

    } catch (error) {
      console.error('Error validating user limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate user limits'
      });
    }
  }

  // Helper: Validar límites del usuario
  static async validateUserLimits(userId, establecimientoId) {
    return new Promise((resolve) => {
      // Obtener configuración del establecimiento
      db.query(
        'SELECT limite_canciones_por_usuario_hora FROM configuracion_musica WHERE establecimiento_id = ?',
        [establecimientoId],
        (err, configResults) => {
          if (err) {
            console.error('Error getting config for limits:', err);
            resolve(true); // Permitir si hay error
            return;
          }

          const limit = configResults[0]?.limite_canciones_por_usuario_hora || 5;

          // Contar canciones agregadas en la última hora
          db.query(
            `SELECT COUNT(*) as count FROM cola_cancion 
             WHERE anadido_por = ? AND establecimiento_id = ? 
             AND agregada_en >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
            [userId, establecimientoId],
            (countErr, countResults) => {
              if (countErr) {
                console.error('Error counting user songs:', countErr);
                resolve(true); // Permitir si hay error
                return;
              }

              const currentCount = countResults[0].count;
              resolve(currentCount < limit);
            }
          );
        }
      );
    });
  }

  // Helper: Verificar filtros de contenido
  static async checkContentFilters(track, establecimientoId) {
    return new Promise((resolve) => {
      // Verificar si la canción está bloqueada
      db.query(
        'SELECT id_filtro FROM filtros_contenido WHERE establecimiento_id = ? AND tipo = "cancion" AND spotify_id = ?',
        [establecimientoId, track.spotify_id],
        (err, results) => {
          if (err) {
            console.error('Error checking song filters:', err);
            resolve(false); // No bloquear si hay error
            return;
          }

          if (results.length > 0) {
            resolve(true); // Canción bloqueada
            return;
          }

          // Verificar si el género está bloqueado
          if (track.genero) {
            db.query(
              'SELECT id_filtro FROM filtros_contenido WHERE establecimiento_id = ? AND tipo = "genero" AND genero = ?',
              [establecimientoId, track.genero],
              (genreErr, genreResults) => {
                if (genreErr) {
                  console.error('Error checking genre filters:', genreErr);
                  resolve(false); // No bloquear si hay error
                  return;
                }

                resolve(genreResults.length > 0); // Género bloqueado
              }
            );
          } else {
            resolve(false); // No hay género para verificar
          }
        }
      );
    });
  }

  // Helper: Guardar o actualizar canción
  static async saveOrUpdateTrack(track) {
    return new Promise((resolve, reject) => {
      db.query(
        `INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         titulo = VALUES(titulo),
         artista = VALUES(artista),
         album = VALUES(album),
         duracion = VALUES(duracion),
         imagen_url = VALUES(imagen_url),
         genero = VALUES(genero),
         preview_url = VALUES(preview_url)`,
        [track.spotify_id, track.titulo, track.artista, track.album, track.duracion, 
         track.imagen_url, track.genero, track.preview_url],
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    });
  }

  // Helper: Obtener siguiente posición en la cola
  static async getNextQueuePosition(establecimientoId) {
    return new Promise((resolve) => {
      db.query(
        'SELECT COALESCE(MAX(posicion), 0) + 1 as next_position FROM cola_cancion WHERE establecimiento_id = ?',
        [establecimientoId],
        (err, results) => {
          if (err) {
            console.error('Error getting next position:', err);
            resolve(1); // Posición por defecto
            return;
          }
          resolve(results[0].next_position);
        }
      );
    });
  }

  // Helper: Marcar la canción actual (posición 1) como reproducida
  static async markCurrentAsPlayed(establecimientoId) {
    return new Promise((resolve) => {
      db.query(
        'UPDATE cola_cancion SET status = "played" WHERE establecimiento_id = ? AND posicion = 1',
        [establecimientoId],
        (err, result) => {
          if (err) {
            console.error('Error marking current as played:', err);
            resolve(false);
            return;
          }
          console.log(`Marked ${result.affectedRows} current track as played`);
          resolve(true);
        }
      );
    });
  }

  // Helper: Desplazar posiciones de la cola para hacer espacio en la posición 1
  static async shiftQueuePositions(establecimientoId) {
    return new Promise((resolve) => {
      db.query(
        'UPDATE cola_cancion SET posicion = posicion + 1 WHERE establecimiento_id = ? AND status != "played"',
        [establecimientoId],
        (err, result) => {
          if (err) {
            console.error('Error shifting queue positions:', err);
            resolve(false);
            return;
          }
          console.log(`Shifted ${result.affectedRows} queue positions`);
          resolve(true);
        }
      );
    });
  }
}

module.exports = MusicaController;