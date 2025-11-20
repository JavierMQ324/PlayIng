const db = require('../db');

class MusicaColaController {
  // 🗑️ Función auxiliar para limpiar canciones antiguas (mantener máximo 200)
  static cleanupOldSongs(callback) {
    console.log('🧹 Checking if cleanup is needed...');
    
    // Verificar cuántas canciones hay en total
    db.query(
      'SELECT COUNT(*) as total FROM canciones',
      [],
      (err, result) => {
        if (err) {
          console.error('Error counting songs:', err);
          return callback(err);
        }
        
        const totalCanciones = result[0].total;
        console.log(`📊 Total songs in database: ${totalCanciones}`);
        
        if (totalCanciones <= 200) {
          console.log('✅ No cleanup needed (under 200 songs)');
          return callback(null);
        }
        
        const songsToDelete = totalCanciones - 150; // Dejar espacio para 50 más
        console.log(`🗑️ Need to delete ${songsToDelete} old songs`);
        
        // Eliminar canciones que NO estén en:
        // 1. La cola actual
        // 2. El historial reciente (últimos 100)
        db.query(
          `DELETE FROM canciones 
           WHERE id_cancion NOT IN (
             SELECT DISTINCT cancion_id FROM cola_cancion
           )
           AND id_cancion NOT IN (
             SELECT cancion_id FROM (
               SELECT DISTINCT cancion_id 
               FROM historial_reproduccion 
               ORDER BY reproducida_en DESC 
               LIMIT 100
             ) AS recent_history
           )
           ORDER BY id_cancion ASC
           LIMIT ?`,
          [songsToDelete],
          (err, result) => {
            if (err) {
              console.error('Error deleting old songs:', err);
              return callback(err);
            }
            
            console.log(`✅ Deleted ${result.affectedRows} old songs`);
            callback(null);
          }
        );
      }
    );
  }

  // ✅ Función auxiliar para renumerar las posiciones de la cola
  static reorderQueuePositions(establecimientoId, callback) {
    console.log(`Reordering queue positions for establecimiento: ${establecimientoId}`);
    
    // Obtener todas las canciones de la cola ordenadas por posición
    db.query(
      'SELECT id FROM cola_cancion WHERE establecimiento_id = ? ORDER BY posicion ASC',
      [establecimientoId],
      (err, items) => {
        if (err) {
          console.error('Error getting queue items for reordering:', err);
          return callback(err);
        }

        if (items.length === 0) {
          return callback(null);
        }

        // Actualizar cada item con su nueva posición
        let completed = 0;
        items.forEach((item, index) => {
          const newPosition = index + 1; // Posiciones empiezan desde 1
          
          db.query(
            'UPDATE cola_cancion SET posicion = ? WHERE id = ?',
            [newPosition, item.id],
            (err) => {
              if (err) {
                console.error('Error updating position:', err);
              }
              
              completed++;
              if (completed === items.length) {
                console.log(`Queue positions reordered successfully (${items.length} items)`);
                callback(null);
              }
            }
          );
        });
      }
    );
  }

  // Agregar canción a la cola
  static addToQueue(req, res) {
    const { spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url, establecimientoId, usuarioId } = req.body;

    if (!spotify_id || !titulo || !artista || !establecimientoId || !usuarioId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Verificar el rol del usuario
    db.query(
      'SELECT roll FROM usuarios WHERE id_user = ?',
      [usuarioId],
      (err, userResult) => {
        if (err) {
          console.error('Error checking user role:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to add song to queue'
          });
        }

        if (userResult.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado'
          });
        }

        const userRole = userResult[0].roll;
        console.log(`User role: ${userRole}`);

        // Si el usuario es cliente, verificar filtros y límites
        if (userRole === 'cliente') {
          console.log('Checking filters and limits for cliente user...');
          
          // Verificar si la canción, artista o género están bloqueados
          const checkFilterQuery = `
            SELECT tipo, valor, nombre_display 
            FROM filtros 
            WHERE establecimiento_id = ? 
            AND (
              (tipo = 'cancion' AND valor = ?) OR
              (tipo = 'artista' AND valor = ?) OR
              (tipo = 'genero' AND valor = ?)
            )
            LIMIT 1
          `;

          db.query(
            checkFilterQuery,
            [establecimientoId, spotify_id, artista, genero || ''],
            (err, filtros) => {
              if (err) {
                console.error('Error checking filters:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to check filters'
                });
              }

              if (filtros.length > 0) {
                const filtro = filtros[0];
                console.log(`Song blocked by ${filtro.tipo}: ${filtro.nombre_display}`);
                
                return res.status(403).json({
                  success: false,
                  error: 'Esta canción está bloqueada',
                  blocked: true,
                  reason: {
                    tipo: filtro.tipo,
                    valor: filtro.valor,
                    nombre: filtro.nombre_display
                  }
                });
              }

              // No hay filtros, verificar límites de configuración
              console.log('No filters found, checking configuration limits');
              checkConfigurationLimits();
            }
          );
        } else {
          // Es admin, puede agregar sin restricciones
          console.log('Admin user, skipping filter and limit checks');
          proceedToAddSong();
        }

        function checkConfigurationLimits() {
          // Obtener configuración del establecimiento
          db.query(
            'SELECT limite_reproduccion_cancion, limite_peticiones_usuario_hora FROM establecimientos WHERE id_establecimiento = ?',
            [establecimientoId],
            (err, configResult) => {
              if (err) {
                console.error('Error getting configuration:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to check limits'
                });
              }

              if (configResult.length === 0) {
                return res.status(404).json({
                  success: false,
                  error: 'Establecimiento no encontrado'
                });
              }

              const { limite_reproduccion_cancion, limite_peticiones_usuario_hora } = configResult[0];
              console.log(`Config - Song limit: ${limite_reproduccion_cancion}, User limit: ${limite_peticiones_usuario_hora}`);

              // Verificar límite de reproducción de canción
              if (limite_reproduccion_cancion && limite_reproduccion_cancion !== 'sin_limite') {
                const horasAtras = limite_reproduccion_cancion === '1_hora' ? 1 : 2;
                
                // Primero verificar si la canción ya está en la cola actual
                db.query(
                  `SELECT COUNT(*) as count FROM cola_cancion cc
                   INNER JOIN canciones c ON cc.cancion_id = c.id_cancion
                   WHERE c.spotify_id = ? 
                   AND cc.establecimiento_id = ?
                   AND cc.status IN ('pending', 'playing')`,
                  [spotify_id, establecimientoId],
                  (err, queueResult) => {
                    if (err) {
                      console.error('Error checking song in queue:', err);
                      return res.status(500).json({
                        success: false,
                        error: 'Failed to check song limits'
                      });
                    }

                    if (queueResult[0].count > 0) {
                      return res.status(429).json({
                        success: false,
                        error: 'Esta canción ya está en la cola de reproducción',
                        limitType: 'song_in_queue'
                      });
                    }

                    // Ahora verificar el historial
                    db.query(
                      `SELECT COUNT(*) as count FROM historial_reproduccion hr
                       INNER JOIN canciones c ON hr.cancion_id = c.id_cancion
                       WHERE c.spotify_id = ? 
                       AND hr.establecimiento_id = ?
                       AND hr.reproducida_en >= DATE_SUB(NOW(), INTERVAL ? HOUR)`,
                      [spotify_id, establecimientoId, horasAtras],
                      (err, historyResult) => {
                        if (err) {
                          console.error('Error checking song play history:', err);
                          return res.status(500).json({
                            success: false,
                            error: 'Failed to check song limits'
                          });
                        }

                        if (historyResult[0].count > 0) {
                          const mensaje = limite_reproduccion_cancion === '1_hora' 
                            ? 'Esta canción ya fue reproducida en la última hora'
                            : 'Esta canción ya fue reproducida en las últimas 2 horas';
                          
                          return res.status(429).json({
                            success: false,
                            error: mensaje,
                            limitType: 'song_play_limit'
                          });
                        }

                        // Verificar límite de peticiones por usuario
                        checkUserRequestLimit(limite_peticiones_usuario_hora);
                      }
                    );
                  }
                );
              } else {
                // Sin límite de reproducción, verificar solo límite de usuario
                checkUserRequestLimit(limite_peticiones_usuario_hora);
              }
            }
          );
        }

        function checkUserRequestLimit(limite_peticiones_usuario_hora) {
          if (!limite_peticiones_usuario_hora || limite_peticiones_usuario_hora === 0) {
            // Sin límite de peticiones por usuario
            console.log('No user request limit, proceeding to add song');
            proceedToAddSong();
            return;
          }

          // Contar cuántas canciones ha agregado el usuario en la última hora
          db.query(
            `SELECT COUNT(*) as count FROM cola_cancion
             WHERE anadido_por = ?
             AND establecimiento_id = ?
             AND agregada_en >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
            [usuarioId, establecimientoId],
            (err, userRequestResult) => {
              if (err) {
                console.error('Error checking user request history:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to check user limits'
                });
              }

              const userRequestCount = userRequestResult[0].count;
              console.log(`User has requested ${userRequestCount} songs in the last hour (limit: ${limite_peticiones_usuario_hora})`);

              if (userRequestCount >= limite_peticiones_usuario_hora) {
                return res.status(429).json({
                  success: false,
                  error: `Has alcanzado el límite de ${limite_peticiones_usuario_hora} canciones por hora`,
                  limitType: 'user_request_limit',
                  currentCount: userRequestCount,
                  limit: limite_peticiones_usuario_hora
                });
              }

              // Todas las verificaciones pasaron, agregar la canción
              console.log('All limits passed, proceeding to add song');
              proceedToAddSong();
            }
          );
        }

        function proceedToAddSong() {
          // Primero, verificar si la canción ya existe en la tabla canciones
          db.query(
            'SELECT id_cancion FROM canciones WHERE spotify_id = ?',
            [spotify_id],
            (err, existingCancion) => {
              if (err) {
                console.error('Error checking existing song:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song to queue'
                });
              }

              let cancionId;

        const insertToQueue = (cancionId, retrying = false) => {
          // Obtener la posición actual máxima en la cola para este establecimiento
          db.query(
            'SELECT MAX(posicion) as max_pos FROM cola_cancion WHERE establecimiento_id = ?',
            [establecimientoId],
            (err, maxPosition) => {
              if (err) {
                console.error('Error getting max position:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song to queue'
                });
              }

              const nextPosition = (maxPosition[0].max_pos || 0) + 1;

              // Insertar en la cola de canciones
              db.query(
                `INSERT INTO cola_cancion (cancion_id, anadido_por, establecimiento_id, posicion, status) 
                 VALUES (?, ?, ?, ?, 'pending')`,
                [cancionId, usuarioId, establecimientoId, nextPosition],
                (err, result) => {
                  if (err) {
                    if (err.code === 'ER_NO_REFERENCED_ROW_2' && !retrying) {
                      console.warn('Song reference missing while inserting to queue. Recreating song and retrying...');
                      return recreateSongAndRetry();
                    }
                    console.error('Error inserting to queue:', err);
                    return res.status(500).json({
                      success: false,
                      error: 'Failed to add song to queue'
                    });
                  }

                  console.log(`Song added to queue at position ${nextPosition}`);

                  // 📡 Emitir evento de actualización de cola
                  const socketService = req.app.get('socketService');
                  if (socketService) {
                    socketService.emitQueueUpdate(establecimientoId);
                  }

                  res.json({
                    success: true,
                    message: 'Song added to queue successfully',
                    position: nextPosition,
                    queueId: result.insertId
                  });
                }
              );
            }
          );
        };

        const insertSongRecord = (onSuccess, skipCleanup = false) => {
          db.query(
            `INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [spotify_id, titulo, artista, album || '', duracion || 0, imagen_url || null, genero || null, preview_url || null],
            (err, result) => {
              if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                  console.warn('Song already existed while recreating, fetching ID...');
                  return db.query(
                    'SELECT id_cancion FROM canciones WHERE spotify_id = ?',
                    [spotify_id],
                    (dupErr, rows) => {
                      if (dupErr || rows.length === 0) {
                        console.error('Error fetching song after duplicate entry:', dupErr);
                        return res.status(500).json({
                          success: false,
                          error: 'Failed to add song to queue'
                        });
                      }
                      return onSuccess(rows[0].id_cancion);
                    }
                  );
                }
                console.error('Error inserting new song:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song to queue'
                });
              }

              const proceed = () => onSuccess(result.insertId);

              if (skipCleanup) {
                return proceed();
              }

              MusicaColaController.cleanupOldSongs((cleanupErr) => {
                if (cleanupErr) {
                  console.error('Error during cleanup (non-critical):', cleanupErr);
                }
                proceed();
              });
            }
          );
        };

        const recreateSongAndRetry = () => {
          insertSongRecord((newCancionId) => insertToQueue(newCancionId, true), true);
        };

        if (existingCancion.length > 0) {
          cancionId = existingCancion[0].id_cancion;
          console.log('Song already exists in database with id:', cancionId);
          insertToQueue(cancionId);
        } else {
          insertSongRecord((newCancionId) => insertToQueue(newCancionId));
        }
            }
          );
        }
      }
    );
  }

  // Obtener la cola de canciones
  static getQueue(req, res) {
    const { establecimientoId } = req.query;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId is required'
      });
    }

    db.query(
      `SELECT 
        cc.id,
        cc.cancion_id,
        cc.anadido_por,
        cc.posicion,
        cc.status,
        cc.agregada_en,
        c.spotify_id,
        c.titulo,
        c.artista,
        c.album,
        c.duracion,
        c.imagen_url,
        c.genero,
        c.preview_url,
        CASE 
          WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
          ELSE NULL 
        END as usuario_nombre
       FROM cola_cancion cc
       INNER JOIN canciones c ON cc.cancion_id = c.id_cancion
       INNER JOIN usuarios u ON cc.anadido_por = u.id_user
       WHERE cc.establecimiento_id = ? AND cc.status IN ('pending', 'playing')
       ORDER BY cc.posicion ASC`,
      [establecimientoId],
      (err, queue) => {
        if (err) {
          console.error('Error getting queue:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to get queue'
          });
        }

        res.json({
          success: true,
          queue: queue.map(item => ({
            id: item.id,
            cancion_id: item.cancion_id,
            anadido_por: item.anadido_por,
            posicion: item.posicion,
            status: item.status,
            agregada_en: item.agregada_en,
            spotify_id: item.spotify_id,
            titulo: item.titulo,
            artista: item.artista,
            album: item.album,
            duracion: item.duracion,
            imagen_url: item.imagen_url,
            genero: item.genero,
            preview_url: item.preview_url,
            usuario_nombre: item.usuario_nombre
          }))
        });
      }
    );
  }

  // Eliminar canción de la cola
  static removeFromQueue(req, res) {
    const { colaId } = req.params;

    if (!colaId) {
      return res.status(400).json({
        success: false,
        error: 'colaId is required'
      });
    }

    console.log(`Removing song from queue: ${colaId}`);

    // Primero obtener el establecimiento_id antes de eliminar
    db.query(
      'SELECT establecimiento_id FROM cola_cancion WHERE id = ?',
      [colaId],
      (err, items) => {
        if (err) {
          console.error('Error getting queue item:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to remove song from queue'
          });
        }

        if (items.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Queue item not found'
          });
        }

        const establecimientoId = items[0].establecimiento_id;

        // Eliminar la canción
        db.query('DELETE FROM cola_cancion WHERE id = ?', [colaId], (err, result) => {
          if (err) {
            console.error('Error removing song from queue:', err);
            return res.status(500).json({
              success: false,
              error: 'Failed to remove song from queue'
            });
          }

          // ✅ Renumerar las posiciones después de eliminar
          MusicaColaController.reorderQueuePositions(establecimientoId, (err) => {
            if (err) {
              console.error('Error reordering positions after removal:', err);
            }

            // 📡 Emitir evento de actualización de cola
            const socketService = req.app.get('socketService');
            if (socketService) {
              socketService.emitQueueUpdate(establecimientoId);
            }

            res.json({
              success: true,
              message: 'Song removed from queue successfully'
            });
          });
        });
      }
    );
  }

  // Actualizar estado de canción en la cola
  static updateQueueStatus(req, res) {
    const { colaId } = req.params;
    const { status } = req.body;

    if (!colaId || !status) {
      return res.status(400).json({
        success: false,
        error: 'colaId and status are required'
      });
    }

    console.log(`Updating queue item ${colaId} status to ${status}`);

    db.query(
      'UPDATE cola_cancion SET status = ? WHERE id = ?',
      [status, colaId],
      (err, result) => {
        if (err) {
          console.error('Error updating queue status:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to update queue status'
          });
        }

        res.json({
          success: true,
          message: 'Queue status updated successfully'
        });
      }
    );
  }

  // Marcar canción actual como playing y mover la(s) anterior(es) al historial
  static setCurrentPlaying(req, res) {
    const { colaId, establecimientoId } = req.body;

    if (!colaId || !establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'colaId and establecimientoId are required'
      });
    }

    const socketService = req.app.get('socketService');

    // Primero, obtener todas las canciones con status "playing" en este establecimiento
    db.query(
      'SELECT id, cancion_id, anadido_por FROM cola_cancion WHERE establecimiento_id = ? AND status = ?',
      [establecimientoId, 'playing'],
      (err, playingItems) => {
        if (err) {
          console.error('Error getting playing items:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to set current playing'
          });
        }

        // Función para mover un item al historial
        const moveItemToHistory = (item, callback) => {
          db.query(
            `INSERT INTO historial_reproduccion (cancion_id, establecimiento_id, usuario_id, completada) 
             VALUES (?, ?, ?, 1)`,
            [item.cancion_id, establecimientoId, item.anadido_por],
            (err, result) => {
              if (err) {
                console.error('Error inserting to history:', err);
                return callback(err);
              }

              db.query(
                'DELETE FROM cola_cancion WHERE id = ?',
                [item.id],
                (err, result) => {
                  if (err) {
                    console.error('Error deleting from queue:', err);
                    return callback(err);
                  }
                  // 📡 Emitir eventos de actualización de historial Y cola
                  if (socketService) {
                    socketService.emitHistoryUpdate(establecimientoId);
                    socketService.emitQueueUpdate(establecimientoId);
                  }
                  
                  callback(null);
                }
              );
            }
          );
        };

        // Mover todas las canciones "playing" al historial
        let completedMoves = 0;
        const totalMoves = playingItems.length;

        if (totalMoves === 0) {
          // No hay canciones playing, solo actualizar la nueva
          updateNewPlaying();
        } else {
          playingItems.forEach((item, index) => {
            moveItemToHistory(item, (err) => {
              if (err) {
                console.error('Error moving item to history:', err);
              }
              
              completedMoves++;
              
              if (completedMoves === totalMoves) {
                // Todas las canciones anteriores movidas, ahora actualizar la nueva
                updateNewPlaying();
              }
            });
          });
        }

        function updateNewPlaying() {
          // Actualizar la nueva canción a "playing"
          db.query(
            'UPDATE cola_cancion SET status = ? WHERE id = ?',
            ['playing', colaId],
            (err, result) => {
              if (err) {
                console.error('Error updating new playing status:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to set current playing'
                });
              }

              res.json({
                success: true,
                message: 'Current playing set successfully'
              });

              MusicaColaController.reorderQueuePositions(establecimientoId, (err) => {
                if (err) {
                  console.error('Error reordering positions after setting playing:', err);
                }

                db.query(
                  `SELECT 
                    cc.id,
                    cc.cancion_id,
                    cc.anadido_por,
                    cc.posicion,
                    cc.status,
                    cc.agregada_en,
                    c.spotify_id,
                    c.titulo,
                    c.artista,
                    c.album,
                    c.duracion,
                    c.imagen_url,
                    c.genero,
                    c.preview_url,
                    CASE 
                      WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
                      ELSE NULL 
                    END as usuario_nombre,
                    (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'like') as likes_count,
                    (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'skip') as skips_count
                   FROM cola_cancion cc
                   INNER JOIN canciones c ON cc.cancion_id = c.id_cancion
                   INNER JOIN usuarios u ON cc.anadido_por = u.id_user
                   WHERE cc.id = ?`,
                  [colaId],
                  (err, trackInfo) => {
                    if (!err && trackInfo && trackInfo.length > 0 && socketService) {
                      const track = trackInfo[0];
                      socketService.emitPlaybackUpdate(establecimientoId, {
                        currentTrack: {
                          id: track.id,
                          cola_id: track.id,
                          cancion_id: track.cancion_id,
                          spotify_id: track.spotify_id,
                          titulo: track.titulo,
                          artista: track.artista,
                          album: track.album,
                          duracion: track.duracion,
                          imagen_url: track.imagen_url,
                          genero: track.genero,
                          preview_url: track.preview_url,
                          usuario_nombre: track.usuario_nombre,
                          likes_count: track.likes_count || 0,
                          skips_count: track.skips_count || 0
                        },
                        isPlaying: true,
                        position: 0
                      });
                      socketService.emitTrackStarted(establecimientoId, {
                        cola_id: track.id,
                        titulo: track.titulo,
                        artista: track.artista,
                        album: track.album,
                        imagen_url: track.imagen_url,
                        duracion: track.duracion,
                        likes_count: track.likes_count || 0,
                        skips_count: track.skips_count || 0
                      });
                      socketService.emitQueueUpdate(establecimientoId);
                    }
                  }
                );
              });
            }
          );
        }
      }
    );
  }

  // Mover canción de la cola al historial (cuando termina de reproducirse)
  static moveToHistory(req, res) {
    const { colaId } = req.params;

    if (!colaId) {
      return res.status(400).json({
        success: false,
        error: 'colaId is required'
      });
    }

    console.log(`Moving queue item ${colaId} to history`);

    // Primero obtener la información de la cola
    db.query(
      'SELECT cancion_id, anadido_por, establecimiento_id FROM cola_cancion WHERE id = ?',
      [colaId],
      (err, queueItems) => {
        if (err) {
          console.error('Error getting queue item:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to move to history'
          });
        }

        if (queueItems.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Queue item not found'
          });
        }

        const queueItem = queueItems[0];

        // Insertar en historial
        db.query(
          `INSERT INTO historial_reproduccion (cancion_id, establecimiento_id, usuario_id, completada) 
           VALUES (?, ?, ?, 1)`,
          [queueItem.cancion_id, queueItem.establecimiento_id, queueItem.anadido_por],
          (err, result) => {
            if (err) {
              console.error('Error inserting to history:', err);
              return res.status(500).json({
                success: false,
                error: 'Failed to move to history'
              });
            }

            // Eliminar de la cola
            db.query(
              'DELETE FROM cola_cancion WHERE id = ?',
              [colaId],
              (err, result) => {
                if (err) {
                  console.error('Error deleting from queue:', err);
                  return res.status(500).json({
                    success: false,
                    error: 'Failed to move to history'
                  });
                }

                // ✅ Renumerar las posiciones después de mover al historial
                MusicaColaController.reorderQueuePositions(queueItem.establecimiento_id, (err) => {
                  if (err) {
                    console.error('Error reordering positions after moving to history:', err);
                  }

                  // 📡 Emitir eventos de actualización de historial Y cola
                  const socketService = req.app.get('socketService');
                  if (socketService) {
                    socketService.emitHistoryUpdate(queueItem.establecimiento_id);
                    socketService.emitQueueUpdate(queueItem.establecimiento_id);
                  }

                  console.log(`Queue item ${colaId} moved to history successfully`);
                  res.json({
                    success: true,
                    message: 'Moved to history successfully'
                  });
                });
              }
            );
          }
        );
      }
    );
  }

  // Obtener historial de reproducción
  static getHistory(req, res) {
    const { establecimientoId, limit = 50 } = req.query;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId is required'
      });
    }

    db.query(
      `SELECT 
        hr.id_historial,
        hr.cancion_id,
        hr.usuario_id,
        hr.reproducida_en,
        hr.completada,
        c.spotify_id,
        c.titulo,
        c.artista,
        c.album,
        c.duracion,
        c.imagen_url,
        c.genero,
        c.preview_url,
        CASE 
          WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
          ELSE NULL 
        END as usuario_nombre
       FROM historial_reproduccion hr
       INNER JOIN canciones c ON hr.cancion_id = c.id_cancion
       INNER JOIN usuarios u ON hr.usuario_id = u.id_user
       WHERE hr.establecimiento_id = ?
       ORDER BY hr.reproducida_en DESC
       LIMIT ?`,
      [establecimientoId, parseInt(limit)],
      (err, history) => {
        if (err) {
          console.error('Error getting history:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to get history'
          });
        }

        res.json({
          success: true,
          history: history.map(item => ({
            id_historial: item.id_historial,
            cancion_id: item.cancion_id,
            usuario_id: item.usuario_id,
            reproducida_en: item.reproducida_en,
            completada: item.completada,
            spotify_id: item.spotify_id,
            titulo: item.titulo,
            artista: item.artista,
            album: item.album,
            duracion: item.duracion,
            imagen_url: item.imagen_url,
            genero: item.genero,
            preview_url: item.preview_url,
            usuario_nombre: item.usuario_nombre
          }))
        });
      }
    );
  }

  // ✅ NUEVO: Agregar canción y reproducir inmediatamente (al principio de la cola)
  static addToQueueAndPlayNow(req, res) {
    const { spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url, establecimientoId, usuarioId } = req.body;

    if (!spotify_id || !titulo || !artista || !establecimientoId || !usuarioId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Primero, verificar si la canción ya existe en la tabla canciones
    db.query(
      'SELECT id_cancion FROM canciones WHERE spotify_id = ?',
      [spotify_id],
      (err, existingCancion) => {
        if (err) {
          console.error('Error checking existing song:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to add song to queue'
          });
        }

        let cancionId;

        const insertToQueueAndPlay = (cancionId, retrying = false) => {
          // Primero, mover todas las canciones "playing" al historial
          db.query(
            'SELECT id, cancion_id, anadido_por FROM cola_cancion WHERE establecimiento_id = ? AND status = ?',
            [establecimientoId, 'playing'],
            (err, playingItems) => {
              if (err) {
                console.error('Error getting playing items:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song'
                });
              }

              // Función para mover items al historial
              const moveItemsToHistory = (callback) => {
                if (playingItems.length === 0) {
                  return callback();
                }

                let completed = 0;
                playingItems.forEach(item => {
                  db.query(
                    'INSERT INTO historial_reproduccion (cancion_id, establecimiento_id, usuario_id, completada) VALUES (?, ?, ?, 1)',
                    [item.cancion_id, establecimientoId, item.anadido_por],
                    (err) => {
                      if (err) console.error('Error inserting to history:', err);
                      
                      db.query('DELETE FROM cola_cancion WHERE id = ?', [item.id], (err) => {
                        if (err) console.error('Error deleting from queue:', err);
                        completed++;
                        if (completed === playingItems.length) {
                          callback();
                        }
                      });
                    }
                  );
                });
              };

              moveItemsToHistory(() => {
                // Incrementar la posición de todas las canciones pending
                db.query(
                  'UPDATE cola_cancion SET posicion = posicion + 1 WHERE establecimiento_id = ? AND status = ?',
                  [establecimientoId, 'pending'],
                  (err) => {
                    if (err) {
                      console.error('Error updating positions:', err);
                      return res.status(500).json({
                        success: false,
                        error: 'Failed to add song'
                      });
                    }

                    // Insertar la nueva canción en posición 1 con status "playing"
                    db.query(
                      'INSERT INTO cola_cancion (cancion_id, anadido_por, establecimiento_id, posicion, status) VALUES (?, ?, ?, 1, ?)',
                      [cancionId, usuarioId, establecimientoId, 'playing'],
                      (err, result) => {
                        if (err) {
                          if (err.code === 'ER_NO_REFERENCED_ROW_2' && !retrying) {
                            console.warn('Song reference missing while inserting (play now). Recreating song and retrying...');
                            return recreateSongAndRetry();
                          }
                          console.error('Error inserting to queue:', err);
                          return res.status(500).json({
                            success: false,
                            error: 'Failed to add song'
                          });
                        }

                        const queueId = result.insertId;

                        // ✅ Renumerar las posiciones después de insertar
                        MusicaColaController.reorderQueuePositions(establecimientoId, (err) => {
                          if (err) {
                            console.error('Error reordering positions after adding to queue:', err);
                          }

                          // 📡 Emitir eventos de actualización CON toda la información
                          const socketService = req.app.get('socketService');
                          if (socketService) {
                            // Obtener información completa de la canción que se acaba de agregar
                            db.query(
                              `SELECT 
                                cc.id,
                                cc.cancion_id,
                                cc.anadido_por,
                                cc.posicion,
                                cc.status,
                                cc.agregada_en,
                                c.spotify_id,
                                c.titulo,
                                c.artista,
                                c.album,
                                c.duracion,
                                c.imagen_url,
                                c.genero,
                                c.preview_url,
                                CASE 
                                  WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
                                  ELSE NULL 
                                END as usuario_nombre,
                                (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'like') as likes_count,
                                (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'skip') as skips_count
                               FROM cola_cancion cc
                               INNER JOIN canciones c ON cc.cancion_id = c.id_cancion
                               INNER JOIN usuarios u ON cc.anadido_por = u.id_user
                               WHERE cc.id = ?`,
                              [queueId],
                              (err, trackInfo) => {
                                if (!err && trackInfo && trackInfo.length > 0) {
                                  const track = trackInfo[0];
                                  
                                  // Emitir playback_update con toda la info
                                  socketService.emitPlaybackUpdate(establecimientoId, {
                                    currentTrack: {
                                      id: track.id,
                                      cola_id: track.id,
                                      cancion_id: track.cancion_id,
                                      spotify_id: track.spotify_id,
                                      titulo: track.titulo,
                                      artista: track.artista,
                                      album: track.album,
                                      duracion: track.duracion,
                                      imagen_url: track.imagen_url,
                                      genero: track.genero,
                                      preview_url: track.preview_url,
                                      usuario_nombre: track.usuario_nombre,
                                      likes_count: track.likes_count || 0,
                                      skips_count: track.skips_count || 0
                                    },
                                    isPlaying: true,
                                    position: 0
                                  });
                                  
                                  // Emitir track_started
                                  socketService.emitTrackStarted(establecimientoId, {
                                    cola_id: track.id,
                                    titulo: track.titulo,
                                    artista: track.artista,
                                    album: track.album,
                                    imagen_url: track.imagen_url,
                                    duracion: track.duracion,
                                    likes_count: track.likes_count || 0,
                                    skips_count: track.skips_count || 0
                                  });
                                }
                                
                                socketService.emitQueueUpdate(establecimientoId);
                                socketService.emitHistoryUpdate(establecimientoId);
                              }
                            );
                          }

                          res.json({
                            success: true,
                            message: 'Song added and playing',
                            position: 1,
                            queueId: queueId
                          });
                        });
                      }
                    );
                  }
                );
              });
            }
          );
        };

        const insertSongRecord = (onSuccess, skipCleanup = false) => {
          db.query(
            'INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [spotify_id, titulo, artista, album || '', duracion || 0, imagen_url || null, genero || null, preview_url || null],
            (err, result) => {
              if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                  return db.query(
                    'SELECT id_cancion FROM canciones WHERE spotify_id = ?',
                    [spotify_id],
                    (dupErr, rows) => {
                      if (dupErr || rows.length === 0) {
                        console.error('Error fetching song after duplicate entry:', dupErr);
                        return res.status(500).json({
                          success: false,
                          error: 'Failed to add song'
                        });
                      }
                      return onSuccess(rows[0].id_cancion);
                    }
                  );
                }
                console.error('Error inserting new song:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song'
                });
              }

              const proceed = () => onSuccess(result.insertId);

              if (skipCleanup) {
                return proceed();
              }

              MusicaColaController.cleanupOldSongs((cleanupErr) => {
                if (cleanupErr) {
                  console.error('Error during cleanup (non-critical):', cleanupErr);
                }
                proceed();
              });
            }
          );
        };

        const recreateSongAndRetry = () => {
          insertSongRecord((newCancionId) => insertToQueueAndPlay(newCancionId, true), true);
        };

        if (existingCancion.length > 0) {
          cancionId = existingCancion[0].id_cancion;
          console.log('Song already exists in database with id:', cancionId);
          insertToQueueAndPlay(cancionId);
        } else {
          insertSongRecord((newCancionId) => insertToQueueAndPlay(newCancionId));
        }
      }
    );
  }

  // ✅ NUEVO: Reemplazar toda la cola con las canciones de un género
  static async replaceQueueWithGenre(req, res) {
    const { establecimientoId, usuarioId, tracks, genreName, randomize = true } = req.body;

    if (!establecimientoId || !usuarioId || !Array.isArray(tracks)) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId, usuarioId y tracks son obligatorios'
      });
    }

    if (tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay canciones disponibles para reproducir'
      });
    }

    const executeQuery = (sql, params = []) => new Promise((resolve, reject) => {
      db.query(sql, params, (err, result) => {
        if (err) {
          return reject(err);
        }
        resolve(result);
      });
    });

    try {
      const sanitizedTracks = tracks
        .map(track => ({
          spotify_id: track.spotify_id,
          titulo: track.titulo,
          artista: track.artista,
          album: track.album || '',
          duracion: track.duracion || 0,
          imagen_url: track.imagen_url || null,
          genero: track.genero || genreName || null,
          preview_url: track.preview_url || null
        }))
        .filter(track => track.spotify_id && track.titulo && track.artista);

      if (sanitizedTracks.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No se encontraron canciones válidas para el género seleccionado'
        });
      }

      const orderedTracks = randomize
        ? sanitizedTracks
            .map(track => ({ ...track, _order: Math.random() }))
            .sort((a, b) => a._order - b._order)
            .map(({ _order, ...track }) => track)
        : sanitizedTracks;

      const socketService = req.app.get('socketService');

      // Registrar la canción que estaba sonando (si existe) como interrumpida en el historial
      const playingItems = await executeQuery(
        'SELECT id, cancion_id, anadido_por FROM cola_cancion WHERE establecimiento_id = ? AND status = "playing"',
        [establecimientoId]
      );

      if (playingItems.length > 0) {
        for (const item of playingItems) {
          try {
            await executeQuery(
              `INSERT INTO historial_reproduccion (cancion_id, establecimiento_id, usuario_id, completada) 
               VALUES (?, ?, ?, 0)`,
              [item.cancion_id, establecimientoId, item.anadido_por]
            );
          } catch (historyErr) {
            console.error('Error registrando canción interrumpida en historial:', historyErr);
          }
        }
      }

      // Limpiar votos y cola actuales
      await executeQuery(
        `DELETE v FROM votos v
         INNER JOIN cola_cancion cc ON v.cola_cancion_id = cc.id
         WHERE cc.establecimiento_id = ?`,
        [establecimientoId]
      );
      await executeQuery('DELETE FROM cola_cancion WHERE establecimiento_id = ?', [establecimientoId]);

      const insertedItems = [];
      let position = 1;

      for (const track of orderedTracks) {
        const existingSong = await executeQuery('SELECT id_cancion FROM canciones WHERE spotify_id = ?', [track.spotify_id]);
        let cancionId;

        if (existingSong.length > 0) {
          cancionId = existingSong[0].id_cancion;
        } else {
          const insertedSong = await executeQuery(
            `INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              track.spotify_id,
              track.titulo,
              track.artista,
              track.album || '',
              track.duracion || 0,
              track.imagen_url || null,
              track.genero || null,
              track.preview_url || null
            ]
          );
          cancionId = insertedSong.insertId;
        }

        const status = position === 1 ? 'playing' : 'pending';
        const insertedQueue = await executeQuery(
          `INSERT INTO cola_cancion (cancion_id, anadido_por, establecimiento_id, posicion, status) 
           VALUES (?, ?, ?, ?, ?)`,
          [cancionId, usuarioId, establecimientoId, position, status]
        );

        insertedItems.push({
          queueId: insertedQueue.insertId,
          position,
          status
        });

        position++;
      }

      await new Promise((resolve, reject) => {
        MusicaColaController.reorderQueuePositions(establecimientoId, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      let playbackTrack = null;
      if (insertedItems.length > 0) {
        const currentPlayingQuery = await executeQuery(
          `SELECT 
            cc.id,
            cc.cancion_id,
            cc.anadido_por,
            cc.posicion,
            cc.status,
            cc.agregada_en,
            c.spotify_id,
            c.titulo,
            c.artista,
            c.album,
            c.duracion,
            c.imagen_url,
            c.genero,
            c.preview_url,
            CASE 
              WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
              ELSE NULL 
            END as usuario_nombre,
            (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'like') as likes_count,
            (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'skip') as skips_count
          FROM cola_cancion cc
          INNER JOIN canciones c ON cc.cancion_id = c.id_cancion
          INNER JOIN usuarios u ON cc.anadido_por = u.id_user
          WHERE cc.id = ?
          LIMIT 1`,
          [insertedItems[0].queueId]
        );

        if (currentPlayingQuery.length > 0) {
          playbackTrack = currentPlayingQuery[0];
        }
      }

      if (socketService) {
        socketService.emitQueueUpdate(establecimientoId);
        if (playbackTrack) {
          socketService.emitPlaybackUpdate(establecimientoId, {
            currentTrack: {
              id: playbackTrack.id,
              cola_id: playbackTrack.id,
              cancion_id: playbackTrack.cancion_id,
              spotify_id: playbackTrack.spotify_id,
              titulo: playbackTrack.titulo,
              artista: playbackTrack.artista,
              album: playbackTrack.album,
              duracion: playbackTrack.duracion,
              imagen_url: playbackTrack.imagen_url,
              genero: playbackTrack.genero,
              preview_url: playbackTrack.preview_url,
              usuario_nombre: playbackTrack.usuario_nombre,
              likes_count: playbackTrack.likes_count || 0,
              skips_count: playbackTrack.skips_count || 0
            },
            isPlaying: true,
            position: 0
          });
          socketService.emitTrackStarted(establecimientoId, {
            cola_id: playbackTrack.id,
            titulo: playbackTrack.titulo,
            artista: playbackTrack.artista,
            album: playbackTrack.album,
            imagen_url: playbackTrack.imagen_url,
            duracion: playbackTrack.duracion,
            likes_count: playbackTrack.likes_count || 0,
            skips_count: playbackTrack.skips_count || 0
          });
        }
      }

      MusicaColaController.cleanupOldSongs((cleanupErr) => {
        if (cleanupErr) {
          console.error('Error en cleanup (no crítico):', cleanupErr);
        }
      });

      return res.json({
        success: true,
        message: `Cola reemplazada con ${insertedItems.length} canciones`,
        total: insertedItems.length,
        playingQueueId: insertedItems[0]?.queueId || null,
        currentTrack: playbackTrack
          ? {
              cola_id: playbackTrack.id,
              spotify_id: playbackTrack.spotify_id,
              titulo: playbackTrack.titulo,
              artista: playbackTrack.artista,
              album: playbackTrack.album,
              duracion: playbackTrack.duracion,
              imagen_url: playbackTrack.imagen_url,
              genero: playbackTrack.genero,
              preview_url: playbackTrack.preview_url
            }
          : null
      });
    } catch (error) {
      console.error('Error reemplazando cola por género:', error);
      return res.status(500).json({
        success: false,
        error: 'Error al reemplazar la cola con las canciones del género'
      });
    }
  }

  // ✅ Reordenar cola - cambiar posición de una canción
  static reorderQueue(req, res) {
    const { cancionId, nuevaPosicion, establecimientoId } = req.body;

    if (!cancionId || nuevaPosicion === undefined || !establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'cancionId, nuevaPosicion and establecimientoId are required'
      });
    }

    console.log(`🔄 Reordering queue: moving song ${cancionId} to position ${nuevaPosicion}`);

    // Obtener toda la cola actual
    db.query(
      'SELECT id, posicion FROM cola_cancion WHERE establecimiento_id = ? AND status != "history" ORDER BY posicion ASC',
      [establecimientoId],
      (err, allSongs) => {
        if (err) {
          console.error('Error getting queue:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to reorder queue'
          });
        }

        if (allSongs.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Queue is empty'
          });
        }

        // Encontrar la canción que se va a mover
        const songToMoveIndex = allSongs.findIndex(s => s.id === cancionId);
        if (songToMoveIndex === -1) {
          return res.status(404).json({
            success: false,
            error: 'Song not found in queue'
          });
        }

        const songToMove = allSongs[songToMoveIndex];
        const posicionActual = songToMove.posicion;
        
        console.log(`📍 Moving from position ${posicionActual} to ${nuevaPosicion}`);
        console.log(`📋 Current queue has ${allSongs.length} songs`);

        // Validar que nuevaPosicion esté en el rango válido
        if (nuevaPosicion < 1 || nuevaPosicion > allSongs.length) {
          return res.status(400).json({
            success: false,
            error: `Invalid target position. Must be between 1 and ${allSongs.length}`
          });
        }

        // Remover la canción de su posición actual primero
        allSongs.splice(songToMoveIndex, 1);
        
        // Calcular el índice objetivo después de remover
        // nuevaPosicion es 1-based, necesitamos índice 0-based
        let targetIndex;
        
        if (posicionActual < nuevaPosicion) {
          // Moviendo hacia adelante: queremos que la canción quede en la posición nuevaPosicion
          // Después de remover, buscamos la canción que tiene posición nuevaPosicion
          // e insertamos DESPUÉS de ella, así cuando renumeremos nuestra canción quedará en nuevaPosicion
          const targetSongIndex = allSongs.findIndex(s => s.posicion === nuevaPosicion);
          if (targetSongIndex !== -1) {
            // Insertar después de la canción objetivo
            targetIndex = targetSongIndex + 1;
          } else {
            // Si no encontramos exactamente nuevaPosicion, buscar la primera >= nuevaPosicion
            const nextIndex = allSongs.findIndex(s => s.posicion >= nuevaPosicion);
            targetIndex = nextIndex !== -1 ? nextIndex : allSongs.length;
          }
        } else {
          // Moviendo hacia atrás: queremos insertar antes de la posición nuevaPosicion
          const targetSongIndex = allSongs.findIndex(s => s.posicion === nuevaPosicion);
          if (targetSongIndex !== -1) {
            // Insertar antes de la canción objetivo
            targetIndex = targetSongIndex;
          } else {
            // Si no encontramos, buscar la primera canción con posición >= nuevaPosicion
            const nextSongIndex = allSongs.findIndex(s => s.posicion >= nuevaPosicion);
            targetIndex = nextSongIndex !== -1 ? nextSongIndex : allSongs.length;
          }
        }

        // Asegurar que el índice esté en el rango válido
        targetIndex = Math.max(0, Math.min(targetIndex, allSongs.length));
        
        console.log(`🎯 Target index in array: ${targetIndex} (after removal, moving from ${posicionActual} to ${nuevaPosicion})`);
        
        // Insertar en la nueva posición
        allSongs.splice(targetIndex, 0, songToMove);

        console.log(`✅ New order (by song ID): [${allSongs.map(s => s.id).join(', ')}]`);

        if (allSongs.length === 0) {
          return res.json({
            success: true,
            message: 'Queue reordered successfully'
          });
        }

        // Construir una sola query con CASE WHEN para actualizar todas las posiciones de una vez
        // Esto reduce el número de conexiones necesarias de N queries a 1 sola query
        let caseStatements = [];
        let params = [];
        
        allSongs.forEach((song, index) => {
          const newPosition = index + 1;
          caseStatements.push(`WHEN ? THEN ?`);
          params.push(song.id, newPosition);
        });
        
        const ids = allSongs.map(s => s.id);
        const placeholders = ids.map(() => '?').join(',');
        const query = `
          UPDATE cola_cancion 
          SET posicion = CASE id 
            ${caseStatements.join(' ')}
            ELSE posicion
          END
          WHERE id IN (${placeholders})
        `;
        
        params.push(...ids);
        
        db.query(query, params, (err) => {
          if (err) {
            console.error('Error updating positions:', err);
            return res.status(500).json({
              success: false,
              error: 'Failed to reorder queue'
            });
          }
          
          console.log(`✅ Queue reordered successfully! Updated ${allSongs.length} songs`);
          
          // 📡 Emitir evento de socket para notificar a todos los clientes
          const socketService = req.app.get('socketService');
          if (socketService) {
            console.log(`📡 Emitiendo queue_update para establecimiento ${establecimientoId}`);
            socketService.emitQueueUpdate(establecimientoId);
          }
          
          res.json({
            success: true,
            message: 'Queue reordered successfully'
          });
        });
      }
    );
  }

  // ✅ Mezclar aleatoriamente la cola (excepto la canción en reproducción)
  static shuffleQueue(req, res) {
    const { establecimientoId } = req.body;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId is required'
      });
    }

    db.query(
      'SELECT id, status FROM cola_cancion WHERE establecimiento_id = ? AND status IN ("pending", "playing") ORDER BY posicion ASC',
      [establecimientoId],
      (err, songs) => {
        if (err) {
          console.error('Error fetching queue for shuffling:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to shuffle queue'
          });
        }

        if (!songs || songs.length === 0) {
          return res.json({
            success: true,
            message: 'Queue is empty'
          });
        }

        const hasPlaying = songs.some(song => song.status === 'playing');
        const pendingSongs = songs.filter(song => song.status === 'pending');

        if (pendingSongs.length <= 1) {
          return res.json({
            success: true,
            message: 'Not enough songs to shuffle',
            total: pendingSongs.length
          });
        }

        const shuffled = pendingSongs
          .map(song => ({ ...song, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ sort, ...rest }) => rest);

        let nextPosition = hasPlaying ? 2 : 1;
        const caseStatements = [];
        const params = [];
        const ids = [];

        shuffled.forEach(song => {
          caseStatements.push('WHEN ? THEN ?');
          params.push(song.id, nextPosition++);
          ids.push(song.id);
        });

        const placeholders = ids.map(() => '?').join(',');
        const query = `
          UPDATE cola_cancion
          SET posicion = CASE id
            ${caseStatements.join(' ')}
            ELSE posicion
          END
          WHERE id IN (${placeholders})
        `;

        db.query(query, [...params, ...ids], (updateErr) => {
          if (updateErr) {
            console.error('Error updating positions during shuffle:', updateErr);
            return res.status(500).json({
              success: false,
              error: 'Failed to shuffle queue'
            });
          }

          const socketService = req.app.get('socketService');
          if (socketService) {
            socketService.emitQueueUpdate(establecimientoId);
          }

          res.json({
            success: true,
            message: 'Queue shuffled successfully',
            total: pendingSongs.length
          });
        });
      }
    );
  }

  // ✅ Limpiar la cola (manteniendo la canción en reproducción)
  static clearQueue(req, res) {
    const { establecimientoId } = req.body;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId is required'
      });
    }

    db.query(
      'SELECT id FROM cola_cancion WHERE establecimiento_id = ? AND status = "pending"',
      [establecimientoId],
      (err, songs) => {
        if (err) {
          console.error('Error fetching queue for clearing:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to clear queue'
          });
        }

        if (!songs || songs.length === 0) {
          return res.json({
            success: true,
            message: 'No pending songs to clear',
            removed: 0
          });
        }

        const ids = songs.map(song => song.id);
        const placeholders = ids.map(() => '?').join(',');

        const deleteVotes = (callback) => {
          db.query(
            `DELETE FROM votos WHERE cola_cancion_id IN (${placeholders})`,
            ids,
            (voteErr) => {
              if (voteErr) {
                console.error('Error deleting votes while clearing queue:', voteErr);
                return callback(voteErr);
              }
              callback(null);
            }
          );
        };

        const deleteSongs = () => {
          db.query(
            `DELETE FROM cola_cancion WHERE id IN (${placeholders})`,
            ids,
            (deleteErr) => {
              if (deleteErr) {
                console.error('Error deleting songs while clearing queue:', deleteErr);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to clear queue'
                });
              }

              MusicaColaController.reorderQueuePositions(establecimientoId, (reorderErr) => {
                if (reorderErr) {
                  console.error('Error reordering queue after clearing:', reorderErr);
                }

                const socketService = req.app.get('socketService');
                if (socketService) {
                  socketService.emitQueueUpdate(establecimientoId);
                }

                res.json({
                  success: true,
                  message: 'Queue cleared successfully',
                  removed: ids.length
                });
              });
            }
          );
        };

        deleteVotes((voteErr) => {
          if (voteErr) {
            return res.status(500).json({
              success: false,
              error: 'Failed to clear queue'
            });
          }
          deleteSongs();
        });
      }
    );
  }

  // ✅ Actualizar estado de reproducción (play/pause) y emitir evento
  static updatePlaybackState(req, res) {
    const { establecimientoId, isPlaying, position, duration, currentTrack } = req.body;

    if (!establecimientoId || isPlaying === undefined) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId and isPlaying are required'
      });
    }

    // Responder inmediatamente
    res.json({
      success: true,
      message: 'Playback state updated'
    });

    // Obtener información completa de la BD y emitir
    db.query(
      `SELECT 
        cc.id,
        cc.cancion_id,
        cc.anadido_por,
        cc.posicion,
        cc.status,
        cc.agregada_en,
        c.spotify_id,
        c.titulo,
        c.artista,
        c.album,
        c.duracion,
        c.imagen_url,
        c.genero,
        c.preview_url,
        CASE 
          WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
          ELSE NULL 
        END as usuario_nombre,
        (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'like') as likes_count,
        (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'skip') as skips_count
       FROM cola_cancion cc
       INNER JOIN canciones c ON cc.cancion_id = c.id_cancion
       INNER JOIN usuarios u ON cc.anadido_por = u.id_user
       WHERE cc.establecimiento_id = ? AND cc.status = 'playing'
       ORDER BY cc.posicion ASC
       LIMIT 1`,
      [establecimientoId],
      (err, results) => {
        if (err || !results || results.length === 0) {
          return;
        }

        const track = results[0];
        const socketService = req.app.get('socketService');
        if (socketService) {
          socketService.emitPlaybackUpdate(establecimientoId, {
            currentTrack: {
              id: track.id,
              cola_id: track.id,
              cancion_id: track.cancion_id,
              spotify_id: track.spotify_id,
              titulo: track.titulo,
              artista: track.artista,
              album: track.album,
              duracion: track.duracion,
              imagen_url: track.imagen_url,
              genero: track.genero,
              preview_url: track.preview_url,
              usuario_nombre: track.usuario_nombre,
              likes_count: track.likes_count || 0,
              skips_count: track.skips_count || 0
            },
            isPlaying,
            position: position || 0,
            duration: duration || 0
          });
        }
      }
    );
  }

  // ✅ Actualizar progreso de reproducción y emitir evento
  static updatePlaybackProgress(req, res) {
    const { establecimientoId, position, duration } = req.body;

    if (!establecimientoId || position === undefined || duration === undefined) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId, position and duration are required'
      });
    }

    // 📡 Emitir evento de progreso (esto se puede llamar periódicamente)
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.emitPlaybackProgress(establecimientoId, position, duration);
    }

    res.json({
      success: true,
      message: 'Playback progress updated'
    });
  }

  // ✅ NUEVO: Obtener la canción actualmente en reproducción
  static getCurrentPlaying(req, res) {
    const { establecimientoId } = req.query;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId is required'
      });
    }

    db.query(
      `SELECT 
        cc.id,
        cc.cancion_id,
        cc.anadido_por,
        cc.posicion,
        cc.status,
        cc.agregada_en,
        c.spotify_id,
        c.titulo,
        c.artista,
        c.album,
        c.duracion,
        c.imagen_url,
        c.genero,
        c.preview_url,
        CASE 
          WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
          ELSE 'Anónimo' 
        END as usuario_nombre,
        (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'like') as likes_count,
        (SELECT COUNT(*) FROM votos WHERE cola_cancion_id = cc.id AND type = 'skip') as skips_count
       FROM cola_cancion cc
       INNER JOIN canciones c ON cc.cancion_id = c.id_cancion
       INNER JOIN usuarios u ON cc.anadido_por = u.id_user
       WHERE cc.establecimiento_id = ? AND cc.status = 'playing'
       ORDER BY cc.posicion ASC
       LIMIT 1`,
      [establecimientoId],
      (err, results) => {
        if (err) {
          console.error('Error getting current playing:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to get current playing'
          });
        }

        if (results.length === 0) {
          return res.json({
            success: true,
            currentPlaying: null
          });
        }

        const item = results[0];
        res.json({
          success: true,
          currentPlaying: {
            id: item.id,
            cola_id: item.id, // Agregar cola_id para votos
            cancion_id: item.cancion_id,
            posicion: item.posicion,
            status: item.status,
            agregada_en: item.agregada_en,
            spotify_id: item.spotify_id,
            titulo: item.titulo,
            artista: item.artista,
            album: item.album,
            duracion: item.duracion,
            imagen_url: item.imagen_url,
            genero: item.genero,
            preview_url: item.preview_url,
            usuario_nombre: item.usuario_nombre,
            likes_count: item.likes_count || 0,
            skips_count: item.skips_count || 0
          }
        });
      }
    );
  }

  // ✅ NUEVO: Agregar canción justo después de la que está reproduciéndose (siguiente)
  static addToQueueNext(req, res) {
    const { spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url, establecimientoId, usuarioId } = req.body;

    if (!spotify_id || !titulo || !artista || !establecimientoId || !usuarioId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Verificar el rol del usuario
    db.query(
      'SELECT roll FROM usuarios WHERE id_user = ?',
      [usuarioId],
      (err, userResult) => {
        if (err) {
          console.error('Error checking user role:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to add song to queue'
          });
        }

        if (userResult.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Usuario no encontrado'
          });
        }

        const userRole = userResult[0].roll;

        // Si el usuario es cliente, verificar filtros
        if (userRole === 'cliente') {
          const checkFilterQuery = `
            SELECT tipo, valor, nombre_display 
            FROM filtros 
            WHERE establecimiento_id = ? 
            AND (
              (tipo = 'cancion' AND valor = ?) OR
              (tipo = 'artista' AND valor = ?) OR
              (tipo = 'genero' AND valor = ?)
            )
            LIMIT 1
          `;

          db.query(
            checkFilterQuery,
            [establecimientoId, spotify_id, artista, genero || ''],
            (err, filtros) => {
              if (err) {
                console.error('Error checking filters:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to check filters'
                });
              }

              if (filtros.length > 0) {
                const filtro = filtros[0];
                return res.status(403).json({
                  success: false,
                  error: 'Esta canción está bloqueada',
                  blocked: true,
                  reason: {
                    tipo: filtro.tipo,
                    valor: filtro.valor,
                    nombre: filtro.nombre_display
                  }
                });
              }

              proceedToAddSong();
            }
          );
        } else {
          proceedToAddSong();
        }

        function proceedToAddSong() {
          // Primero, verificar si la canción ya existe en la tabla canciones
          db.query(
            'SELECT id_cancion FROM canciones WHERE spotify_id = ?',
            [spotify_id],
            (err, existingCancion) => {
              if (err) {
                console.error('Error checking existing song:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song to queue'
                });
              }

              let cancionId;

              const insertToQueueNext = (cancionId, retrying = false) => {
                // Buscar la canción que está reproduciéndose
                db.query(
                  'SELECT posicion FROM cola_cancion WHERE establecimiento_id = ? AND status = ? ORDER BY posicion ASC LIMIT 1',
                  [establecimientoId, 'playing'],
                  (err, playingResult) => {
                    if (err) {
                      console.error('Error getting playing song:', err);
                      return res.status(500).json({
                        success: false,
                        error: 'Failed to add song to queue'
                      });
                    }

                    let targetPosition;

                    if (playingResult.length > 0) {
                      // Hay una canción reproduciéndose, agregar en posición siguiente (posicion + 1)
                      targetPosition = playingResult[0].posicion + 1;
                      
                      // Incrementar la posición de todas las canciones pending que están en o después de targetPosition
                      db.query(
                        'UPDATE cola_cancion SET posicion = posicion + 1 WHERE establecimiento_id = ? AND status = ? AND posicion >= ?',
                        [establecimientoId, 'pending', targetPosition],
                        (err) => {
                          if (err) {
                            console.error('Error updating positions:', err);
                            return res.status(500).json({
                              success: false,
                              error: 'Failed to add song to queue'
                            });
                          }

                          insertSongAtPosition(cancionId, targetPosition);
                        }
                      );
                    } else {
                      // No hay canción reproduciéndose, agregar en posición 1
                      targetPosition = 1;
                      
                      // Incrementar la posición de todas las canciones pending
                      db.query(
                        'UPDATE cola_cancion SET posicion = posicion + 1 WHERE establecimiento_id = ? AND status = ?',
                        [establecimientoId, 'pending'],
                        (err) => {
                          if (err) {
                            console.error('Error updating positions:', err);
                            return res.status(500).json({
                              success: false,
                              error: 'Failed to add song to queue'
                            });
                          }

                          insertSongAtPosition(cancionId, targetPosition);
                        }
                      );
                    }
                  }
                );
              };

              const insertSongAtPosition = (cancionId, position) => {
                // Insertar en la cola de canciones
                db.query(
                  `INSERT INTO cola_cancion (cancion_id, anadido_por, establecimiento_id, posicion, status) 
                   VALUES (?, ?, ?, ?, 'pending')`,
                  [cancionId, usuarioId, establecimientoId, position],
                  (err, result) => {
                    if (err) {
                      if (err.code === 'ER_NO_REFERENCED_ROW_2' && !retrying) {
                        console.warn('Song reference missing while inserting to queue. Recreating song and retrying...');
                        return recreateSongAndRetry();
                      }
                      console.error('Error inserting to queue:', err);
                      return res.status(500).json({
                        success: false,
                        error: 'Failed to add song to queue'
                      });
                    }

                    console.log(`Song added to queue at position ${position} (next)`);

                    // 📡 Emitir evento de actualización de cola
                    const socketService = req.app.get('socketService');
                    if (socketService) {
                      socketService.emitQueueUpdate(establecimientoId);
                    }

                    res.json({
                      success: true,
                      message: 'Song added to queue next successfully',
                      position: position,
                      queueId: result.insertId
                    });
                  }
                );
              };

              const recreateSongAndRetry = () => {
                db.query(
                  `INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [spotify_id, titulo, artista, album || '', duracion || 0, imagen_url || null, genero || null, preview_url || null],
                  (err, insertResult) => {
                    if (err) {
                      console.error('Error recreating song:', err);
                      return res.status(500).json({
                        success: false,
                        error: 'Failed to add song to queue'
                      });
                    }
                    cancionId = insertResult.insertId;
                    insertToQueueNext(cancionId, true);
                  }
                );
              };

              if (existingCancion.length > 0) {
                cancionId = existingCancion[0].id_cancion;
                insertToQueueNext(cancionId);
              } else {
                // Crear el registro de la canción
                db.query(
                  `INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [spotify_id, titulo, artista, album || '', duracion || 0, imagen_url || null, genero || null, preview_url || null],
                  (err, insertResult) => {
                    if (err) {
                      console.error('Error inserting song:', err);
                      return res.status(500).json({
                        success: false,
                        error: 'Failed to add song to queue'
                      });
                    }
                    cancionId = insertResult.insertId;
                    insertToQueueNext(cancionId);
                  }
                );
              }
            }
          );
        }
      }
    );
  }
}

module.exports = MusicaColaController;

