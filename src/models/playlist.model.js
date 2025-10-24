class Playlist {
  constructor(id, nombre, descripcion, usuarioId, esPublica, canciones = []) {
    this.id = id;
    this.nombre = nombre;
    this.descripcion = descripcion;
    this.usuarioId = usuarioId;
    this.esPublica = esPublica;
    this.canciones = canciones; // Array de IDs de canciones
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Método para convertir a objeto plano
  toJSON() {
    return {
      id: this.id,
      nombre: this.nombre,
      descripcion: this.descripcion,
      usuarioId: this.usuarioId,
      esPublica: this.esPublica,
      canciones: this.canciones,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Método para agregar canción a la playlist
  agregarCancion(cancionId) {
    if (!this.canciones.includes(cancionId)) {
      this.canciones.push(cancionId);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  // Método para remover canción de la playlist
  removerCancion(cancionId) {
    const index = this.canciones.indexOf(cancionId);
    if (index > -1) {
      this.canciones.splice(index, 1);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  // Método para obtener duración total de la playlist
  obtenerDuracionTotal(canciones) {
    let duracionTotal = 0;
    this.canciones.forEach(cancionId => {
      const cancion = canciones.find(c => c.id === cancionId);
      if (cancion && cancion.duracion) {
        const [minutes, seconds] = cancion.duracion.split(':').map(Number);
        duracionTotal += minutes * 60 + seconds;
      }
    });
    return this.formatDuration(duracionTotal);
  }

  // Método para formatear duración en segundos a mm:ss
  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

module.exports = Playlist;
