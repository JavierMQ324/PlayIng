const db = require('../db');

class VotosController {
  // Votar (like o skip) en una canción
  static vote(req, res) {
    const { colaCancionId, type } = req.body; // type: 'like' o 'skip'
    const usuarioId = req.user?.id;

    console.log('🗳️ Voto recibido:', { colaCancionId, type, usuarioId, user: req.user });

    if (!usuarioId) {
      console.error('❌ Usuario no autenticado');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!colaCancionId || !type) {
      console.error('❌ Datos faltantes:', { colaCancionId, type });
      return res.status(400).json({ error: 'colaCancionId y type son requeridos' });
    }

    if (!['like', 'skip'].includes(type)) {
      console.error('❌ Tipo de voto inválido:', type);
      return res.status(400).json({ error: 'type debe ser "like" o "skip"' });
    }

    console.log('✅ Validaciones pasadas, procesando voto...');

    // Verificar si ya votó
    db.query(
      'SELECT * FROM votos WHERE cola_cancion_id = ? AND usuario_id = ? AND type = ?',
      [colaCancionId, usuarioId, type],
      (err, existingVote) => {
        if (err) {
          console.error('❌ Error al verificar voto existente:', err);
          return res.status(500).json({ error: 'Error al procesar el voto' });
        }

        const voteAction = existingVote.length > 0 ? 'remove' : 'add';

        if (voteAction === 'remove') {
          // Si ya votó, eliminar el voto (toggle)
          db.query(
            'DELETE FROM votos WHERE id_voto = ?',
            [existingVote[0].id_voto],
            (deleteErr) => {
              if (deleteErr) {
                console.error('❌ Error al eliminar voto:', deleteErr);
                return res.status(500).json({ error: 'Error al procesar el voto' });
              }
              console.log(`🗑️ Usuario ${usuarioId} removió su voto ${type} de cola_cancion ${colaCancionId}`);
              VotosController.getVoteCountsAndRespond(colaCancionId, false, req, res);
            }
          );
        } else {
          // Si no ha votado, agregar el voto
          db.query(
            'INSERT INTO votos (cola_cancion_id, usuario_id, type) VALUES (?, ?, ?)',
            [colaCancionId, usuarioId, type],
            (insertErr) => {
              if (insertErr) {
                console.error('❌ Error al insertar voto:', insertErr);
                return res.status(500).json({ error: 'Error al procesar el voto' });
              }
              console.log(`✅ Usuario ${usuarioId} votó ${type} en cola_cancion ${colaCancionId}`);
              VotosController.getVoteCountsAndRespond(colaCancionId, true, req, res);
            }
          );
        }
      }
    );
  }

  // Función auxiliar para obtener contadores y responder
  static getVoteCountsAndRespond(colaCancionId, voted, req, res) {
    // Obtener contadores actualizados
    db.query(
      'SELECT COUNT(*) as count FROM votos WHERE cola_cancion_id = ? AND type = "like"',
      [colaCancionId],
      (err, likesResult) => {
        if (err) {
          console.error('❌ Error al obtener likes:', err);
          return res.status(500).json({ error: 'Error al obtener votos' });
        }

        db.query(
          'SELECT COUNT(*) as count FROM votos WHERE cola_cancion_id = ? AND type = "skip"',
          [colaCancionId],
          (err, skipsResult) => {
            if (err) {
              console.error('❌ Error al obtener skips:', err);
              return res.status(500).json({ error: 'Error al obtener votos' });
            }

            const likes = likesResult[0].count;
            const skips = skipsResult[0].count;

            // Obtener el establecimiento_id de la canción en cola
            db.query(
              'SELECT establecimiento_id, status FROM cola_cancion WHERE id = ?',
              [colaCancionId],
              (err, colaInfo) => {
                if (err) {
                  console.error('❌ Error al obtener info de cola:', err);
                  return res.status(500).json({ error: 'Error al procesar el voto' });
                }

                if (colaInfo.length === 0) {
                  return res.status(404).json({ error: 'Canción no encontrada en la cola' });
                }

                const establecimientoId = colaInfo[0].establecimiento_id;
                const currentStatus = colaInfo[0].status;

                // Emitir evento de actualización de votos
                const socketService = req.app.get('socketService');
                if (socketService) {
                  console.log(`📡 Emitiendo actualización de votos: establecimiento=${establecimientoId}, cola=${colaCancionId}, likes=${likes}, skips=${skips}`);
                  socketService.emitVotesUpdate(establecimientoId, colaCancionId, { likes, skips });
                } else {
                  console.warn('⚠️ socketService no disponible, no se puede emitir actualización de votos');
                }

                // Verificar si hay que skipear automáticamente
                if (currentStatus === 'playing') {
                  // Obtener número total de usuarios activos en el establecimiento
                  db.query(
                    `SELECT COUNT(DISTINCT u.id_user) as count 
                     FROM usuarios u 
                     INNER JOIN mesas m ON u.mesa_id_activa = m.id_mesa 
                     WHERE m.establecimiento_id = ?`,
                    [establecimientoId],
                    (err, activeUsersResult) => {
                      if (err) {
                        console.error('❌ Error al obtener usuarios activos:', err);
                        // Continuar sin skip automático
                        return res.json({
                          success: true,
                          voted: voted,
                          likes,
                          skips,
                          autoSkipped: false
                        });
                      }

                      const totalUsers = activeUsersResult[0].count || 1;
                      const skipThreshold = Math.ceil(totalUsers / 2); // Mayoría simple

                      console.log(`📊 Votos skip: ${skips}/${skipThreshold} (${totalUsers} usuarios activos)`);

                      // Permitir skip incluso con 1 usuario (para testing y UX)
                      if (skips >= skipThreshold) {
                        console.log(`⏭️ Skip automático activado para cola_cancion ${colaCancionId}`);
                        console.log(`📡 Emitiendo evento skip_now al layout para que ejecute nextTrack()`);
                        
                        // Solo emitir evento para que el layout ejecute su función nextTrack()
                        if (socketService) {
                          socketService.emitSkipTrack(establecimientoId, colaCancionId);
                        }
                        
                        return res.json({
                          success: true,
                          voted: voted,
                          likes,
                          skips,
                          autoSkipped: true,
                          message: 'La mayoría votó skip - saltando canción'
                        });
                      } else {
                        console.log(`📊 Respuesta enviada: likes=${likes}, skips=${skips}, voted=${voted}`);
                        res.json({
                          success: true,
                          voted: voted,
                          likes,
                          skips,
                          autoSkipped: false
                        });
                      }
                    }
                  );
                } else {
                  console.log(`📊 Respuesta enviada (no playing): likes=${likes}, skips=${skips}, voted=${voted}`);
                  res.json({
                    success: true,
                    voted: voted,
                    likes,
                    skips,
                    autoSkipped: false
                  });
                }
              }
            );
          }
        );
      }
    );
  }

  // Obtener votos de una canción
  static getVotes(req, res) {
    const { colaCancionId } = req.params;

    db.query(
      'SELECT COUNT(*) as count FROM votos WHERE cola_cancion_id = ? AND type = "like"',
      [colaCancionId],
      (err, likesResult) => {
        if (err) {
          console.error('❌ Error al obtener likes:', err);
          return res.status(500).json({ error: 'Error al obtener votos' });
        }

        db.query(
          'SELECT COUNT(*) as count FROM votos WHERE cola_cancion_id = ? AND type = "skip"',
          [colaCancionId],
          (err, skipsResult) => {
            if (err) {
              console.error('❌ Error al obtener skips:', err);
              return res.status(500).json({ error: 'Error al obtener votos' });
            }

            res.json({
              likes: likesResult[0].count,
              skips: skipsResult[0].count
            });
          }
        );
      }
    );
  }

  // Obtener el estado de voto del usuario actual
  static getUserVote(req, res) {
    const { colaCancionId } = req.params;
    const usuarioId = req.user?.id;

    if (!usuarioId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    db.query(
      'SELECT type FROM votos WHERE cola_cancion_id = ? AND usuario_id = ?',
      [colaCancionId, usuarioId],
      (err, votes) => {
        if (err) {
          console.error('❌ Error al obtener estado de voto del usuario:', err);
          return res.status(500).json({ error: 'Error al obtener estado de voto' });
        }

        const userVotes = {
          hasLiked: votes.some(v => v.type === 'like'),
          hasSkipped: votes.some(v => v.type === 'skip')
        };

        res.json(userVotes);
      }
    );
  }
}

module.exports = VotosController;
