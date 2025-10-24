class Artista {
  constructor(id, nombre, descripcion, imagen, spotifyId, generos = [], seguidores = 0) {
    this.id = id;
    this.nombre = nombre;
    this.descripcion = descripcion;
    this.imagen = imagen;
    this.spotifyId = spotifyId;
    this.generos = generos; // Array de géneros
    this.seguidores = seguidores;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Método para convertir a objeto plano
  toJSON() {
    return {
      id: this.id,
      nombre: this.nombre,
      descripcion: this.descripcion,
      imagen: this.imagen,
      spotifyId: this.spotifyId,
      generos: this.generos,
      seguidores: this.seguidores,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Método para crear desde datos de Spotify
  static fromSpotifyData(spotifyArtist) {
    return new Artista(
      null, // id se asignará por la base de datos
      spotifyArtist.name,
      spotifyArtist.description || `Artista: ${spotifyArtist.name}`,
      spotifyArtist.images?.[0]?.url || null,
      spotifyArtist.id,
      spotifyArtist.genres || [],
      spotifyArtist.followers?.total || 0
    );
  }

  // Método para agregar género
  agregarGenero(genero) {
    if (!this.generos.includes(genero)) {
      this.generos.push(genero);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  // Método para remover género
  removerGenero(genero) {
    const index = this.generos.indexOf(genero);
    if (index > -1) {
      this.generos.splice(index, 1);
      this.updatedAt = new Date();
      return true;
    }
    return false;
  }

  // Método para obtener popularidad basada en seguidores
  obtenerPopularidad() {
    if (this.seguidores >= 1000000) return 'Muy Popular';
    if (this.seguidores >= 100000) return 'Popular';
    if (this.seguidores >= 10000) return 'Conocido';
    if (this.seguidores >= 1000) return 'Emergente';
    return 'Independiente';
  }
}

module.exports = Artista;
