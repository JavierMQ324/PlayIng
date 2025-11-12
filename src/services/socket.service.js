// Socket.IO service para gestionar eventos en tiempo real
class SocketService {
  constructor(io) {
    this.io = io;
  }

  /**
   * Emitir actualización de reproducción actual a todos los clientes de un establecimiento
   * @param {number} establecimientoId - ID del establecimiento
   * @param {object} playbackData - Datos de reproducción actual
   */
  emitPlaybackUpdate(establecimientoId, playbackData) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('playback_update', {
      establecimientoId,
      timestamp: new Date().toISOString(),
      ...playbackData
    });
  }

  /**
   * Emitir actualización de la cola de reproducción
   * @param {number} establecimientoId - ID del establecimiento
   */
  emitQueueUpdate(establecimientoId) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('queue_update', {
      establecimientoId,
      timestamp: new Date().toISOString()
    });
  }

  emitHistoryUpdate(establecimientoId) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('history_update', {
      establecimientoId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emitir cambio de estado de reproducción (play/pause)
   * @param {number} establecimientoId - ID del establecimiento
   * @param {boolean} isPlaying - Estado de reproducción
   * @param {number} position - Posición actual en ms
   */
  emitPlaybackStateChange(establecimientoId, isPlaying, position = 0) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('playback_state_change', {
      establecimientoId,
      isPlaying,
      position,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emitir progreso de reproducción
   * @param {number} establecimientoId - ID del establecimiento
   * @param {number} position - Posición actual en ms
   * @param {number} duration - Duración total en ms
   */
  emitPlaybackProgress(establecimientoId, position, duration) {
    const room = `establecimiento:${establecimientoId}`;
    
    // Emitir progreso (se puede hacer menos frecuentemente si es necesario)
    this.io.to(room).emit('playback_progress', {
      establecimientoId,
      position,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Notificar que una nueva canción empezó a reproducirse
   * @param {number} establecimientoId - ID del establecimiento
   * @param {object} track - Información de la canción
   */
  emitTrackStarted(establecimientoId, track) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('track_started', {
      establecimientoId,
      track,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Notificar que una canción terminó
   * @param {number} establecimientoId - ID del establecimiento
   * @param {object} track - Información de la canción
   */
  emitTrackEnded(establecimientoId, track) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('track_ended', {
      establecimientoId,
      track,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emitir actualización de votos (likes y skips)
   * @param {number} establecimientoId - ID del establecimiento
   * @param {number} colaCancionId - ID de la canción en cola
   * @param {object} votes - {likes, skips}
   */
  emitVotesUpdate(establecimientoId, colaCancionId, votes) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('votes_update', {
      establecimientoId,
      colaCancionId,
      likes: votes.likes,
      skips: votes.skips,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emitir skip automático de una canción
   * @param {number} establecimientoId - ID del establecimiento
   * @param {number} colaCancionId - ID de la canción en cola que fue skipeada
   */
  emitSkipTrack(establecimientoId, colaCancionId) {
    const room = `establecimiento:${establecimientoId}`;
    
    this.io.to(room).emit('track_skipped', {
      establecimientoId,
      colaCancionId,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = SocketService;

