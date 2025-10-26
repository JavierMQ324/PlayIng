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

    console.log(`Adding song to queue: ${titulo} by ${artista}`);

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

        const insertToQueue = (cancionId) => {
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

        if (existingCancion.length > 0) {
          cancionId = existingCancion[0].id_cancion;
          console.log('Song already exists in database with id:', cancionId);
          insertToQueue(cancionId);
        } else {
          // Insertar la canción en la tabla canciones
          db.query(
            `INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [spotify_id, titulo, artista, album || '', duracion || 0, imagen_url || null, genero || null, preview_url || null],
            (err, result) => {
              if (err) {
                console.error('Error inserting new song:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song to queue'
                });
              }

              cancionId = result.insertId;
              console.log('New song inserted with id:', cancionId);
              
              // 🧹 Limpiar canciones antiguas después de insertar una nueva
              MusicaColaController.cleanupOldSongs((cleanupErr) => {
                if (cleanupErr) {
                  console.error('Error during cleanup (non-critical):', cleanupErr);
                  // No retornamos error porque la canción ya se insertó correctamente
                }
                
                insertToQueue(cancionId);
              });
            }
          );
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

    console.log(`Getting queue for establecimiento: ${establecimientoId}`);

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
        u.nombre as usuario_nombre
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

    console.log(`Setting current playing: ${colaId} for establecimiento: ${establecimientoId}`);
    
    // Obtener socketService del app
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
                  console.log(`Moved item ${item.id} to history`);
                  
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

              // ✅ Renumerar las posiciones después de todos los cambios
              MusicaColaController.reorderQueuePositions(establecimientoId, (err) => {
                if (err) {
                  console.error('Error reordering positions after setting playing:', err);
                }

                console.log(`Set item ${colaId} as current playing`);
                
                // 📡 Obtener información de la canción y emitir evento de socket
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
                    u.nombre as usuario_nombre
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
                          cancion_id: track.cancion_id,
                          spotify_id: track.spotify_id,
                          titulo: track.titulo,
                          artista: track.artista,
                          album: track.album,
                          duracion: track.duracion,
                          imagen_url: track.imagen_url,
                          genero: track.genero,
                          preview_url: track.preview_url,
                          usuario_nombre: track.usuario_nombre
                        },
                        isPlaying: true,
                        position: 0
                      });
                      socketService.emitTrackStarted(establecimientoId, {
                        titulo: track.titulo,
                        artista: track.artista,
                        album: track.album,
                        imagen_url: track.imagen_url,
                        duracion: track.duracion
                      });
                      socketService.emitQueueUpdate(establecimientoId);
                    }
                    
                    res.json({
                      success: true,
                      message: 'Current playing set successfully'
                    });
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

    console.log(`Getting history for establecimiento: ${establecimientoId}`);

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
        u.nombre as usuario_nombre
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

    console.log(`Adding song to queue and playing now: ${titulo} by ${artista}`);

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

        const insertToQueueAndPlay = (cancionId) => {
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

                          // 📡 Emitir eventos de actualización
                          const socketService = req.app.get('socketService');
                          if (socketService) {
                            socketService.emitQueueUpdate(establecimientoId);
                            socketService.emitHistoryUpdate(establecimientoId);
                          }

                          console.log(`Song added to queue at position 1 and set as playing`);
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

        if (existingCancion.length > 0) {
          cancionId = existingCancion[0].id_cancion;
          console.log('Song already exists in database with id:', cancionId);
          insertToQueueAndPlay(cancionId);
        } else {
          // Insertar la canción en la tabla canciones
          db.query(
            'INSERT INTO canciones (spotify_id, titulo, artista, album, duracion, imagen_url, genero, preview_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [spotify_id, titulo, artista, album || '', duracion || 0, imagen_url || null, genero || null, preview_url || null],
            (err, result) => {
              if (err) {
                console.error('Error inserting new song:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to add song'
                });
              }

              cancionId = result.insertId;
              console.log('New song inserted with id:', cancionId);
              
              // 🧹 Limpiar canciones antiguas después de insertar una nueva
              MusicaColaController.cleanupOldSongs((cleanupErr) => {
                if (cleanupErr) {
                  console.error('Error during cleanup (non-critical):', cleanupErr);
                  // No retornamos error porque la canción ya se insertó correctamente
                }
                
                insertToQueueAndPlay(cancionId);
              });
            }
          );
        }
      }
    );
  }

  // ✅ Reordenar cola - cambiar posición de una canción
  static reorderQueue(req, res) {
    const { cancionId, nuevaPosicion, establecimientoId } = req.body;

    if (!cancionId || !nuevaPosicion || !establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'cancionId, nuevaPosicion and establecimientoId are required'
      });
    }

    console.log(`🔄 Reordering queue: moving song ${cancionId} to position ${nuevaPosicion}`);

    // Obtener toda la cola actual
    db.query(
      'SELECT id, posicion FROM cola_cancion WHERE establecimiento_id = ? ORDER BY posicion ASC',
      [establecimientoId],
      (err, allSongs) => {
        if (err) {
          console.error('Error getting queue:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to reorder queue'
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

        // Encontrar el índice donde queremos insertar (basado en la posición objetivo)
        const targetIndex = allSongs.findIndex(s => s.posicion === nuevaPosicion);
        
        if (targetIndex === -1) {
          console.error('Target position not found');
          return res.status(400).json({
            success: false,
            error: 'Invalid target position'
          });
        }

        console.log(`🎯 Target index in array: ${targetIndex}`);

        // Remover la canción de su posición actual
        allSongs.splice(songToMoveIndex, 1);
        
        // Insertar en la nueva posición
        allSongs.splice(targetIndex, 0, songToMove);

        console.log(`✅ New order (by song ID): [${allSongs.map(s => s.id).join(', ')}]`);

        // Actualizar todas las posiciones en la base de datos
        let completed = 0;
        const totalUpdates = allSongs.length;
        let hadError = false;

        allSongs.forEach((song, index) => {
          const newPosition = index + 1; // Las posiciones empiezan en 1
          
          db.query(
            'UPDATE cola_cancion SET posicion = ? WHERE id = ?',
            [newPosition, song.id],
            (err) => {
              if (err && !hadError) {
                hadError = true;
                console.error('Error updating position:', err);
                return res.status(500).json({
                  success: false,
                  error: 'Failed to reorder queue'
                });
              }
              
              completed++;
              
              if (completed === totalUpdates && !hadError) {
                console.log(`✅ Queue reordered successfully! Updated ${completed} songs`);
                
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
              }
            }
          );
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

    console.log(`Updating playback state for establecimiento ${establecimientoId}: isPlaying=${isPlaying}, position=${position}ms`);

    // 📡 Emitir evento completo de estado (incluye posición, duración y track)
    const socketService = req.app.get('socketService');
    if (socketService) {
      // Emitir actualización completa con toda la información
      socketService.emitPlaybackUpdate(establecimientoId, {
        currentTrack,
        isPlaying,
        position: position || 0,
        duration: duration || 0
      });
    }

    res.json({
      success: true,
      message: 'Playback state updated'
    });
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

    console.log(`Getting current playing for establecimiento: ${establecimientoId}`);

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
        u.nombre as usuario_nombre
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
            usuario_nombre: item.usuario_nombre
          }
        });
      }
    );
  }
}

module.exports = MusicaColaController;

