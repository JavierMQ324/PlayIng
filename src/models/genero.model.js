class Genero {
  constructor(id, nombre, descripcion, color, spotifyId) {
    this.id = id;
    this.nombre = nombre;
    this.descripcion = descripcion;
    this.color = color;
    this.spotifyId = spotifyId;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Método para convertir a objeto plano
  toJSON() {
    return {
      id: this.id,
      nombre: this.nombre,
      descripcion: this.descripcion,
      color: this.color,
      spotifyId: this.spotifyId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Método para crear desde datos de Spotify
  static fromSpotifyData(spotifyGenre) {
    return new Genero(
      null, // id se asignará por la base de datos
      spotifyGenre,
      `Género musical: ${spotifyGenre}`,
      this.getColorForGenre(spotifyGenre),
      null
    );
  }

  // Método para asignar colores a géneros
  static getColorForGenre(genreName) {
    const colorMap = {
      'hip-hop': '#FF6B6B',
      'rap': '#FF6B6B',
      'dance': '#4ECDC4',
      'rock': '#45B7D1',
      'pop': '#96CEB4',
      'house': '#FFEAA7',
      'reggaeton': '#DDA0DD',
      'regional': '#98D8C8',
      'electronic': '#F7DC6F',
      'jazz': '#BB8FCE',
      'classical': '#85C1E9',
      'country': '#F8C471',
      'blues': '#82E0AA',
      'folk': '#F9E79F',
      'alternative': '#D7BDE2'
    };

    const lowerGenre = genreName.toLowerCase();
    for (const [key, color] of Object.entries(colorMap)) {
      if (lowerGenre.includes(key)) {
        return color;
      }
    }
    return '#95A5A6'; // Color por defecto
  }
}

module.exports = Genero;
