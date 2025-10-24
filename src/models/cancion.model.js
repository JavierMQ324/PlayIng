class Cancion {
  constructor(id, nombre, artista, duracion, album, year, spotifyId, previewUrl, imageUrl, genre) {
    this.id = id;
    this.nombre = nombre;
    this.artista = artista;
    this.duracion = duracion;
    this.album = album;
    this.year = year;
    this.spotifyId = spotifyId;
    this.previewUrl = previewUrl;
    this.imageUrl = imageUrl;
    this.genre = genre;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Método para convertir a objeto plano
  toJSON() {
    return {
      id: this.id,
      nombre: this.nombre,
      artista: this.artista,
      duracion: this.duracion,
      album: this.album,
      year: this.year,
      spotifyId: this.spotifyId,
      previewUrl: this.previewUrl,
      imageUrl: this.imageUrl,
      genre: this.genre,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Método para crear desde datos de Spotify
  static fromSpotifyData(spotifyTrack) {
    return new Cancion(
      null, // id se asignará por la base de datos
      spotifyTrack.name,
      spotifyTrack.artists.map(artist => artist.name).join(', '),
      this.formatDuration(spotifyTrack.duration_ms),
      spotifyTrack.album.name,
      new Date(spotifyTrack.album.release_date).getFullYear(),
      spotifyTrack.id,
      spotifyTrack.preview_url,
      spotifyTrack.album.images[0]?.url || null,
      spotifyTrack.genres?.[0] || 'Unknown'
    );
  }

  // Método para formatear duración de milisegundos a mm:ss
  static formatDuration(durationMs) {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

module.exports = Cancion;
