const axios = require('axios');
const Cancion = require('../models/cancion.model');
const Artista = require('../models/artista.model');
const Genero = require('../models/genero.model');

class SpotifyService {
  constructor() {
    this.baseURL = 'https://api.spotify.com/v1';
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Obtener token de acceso de Spotify
  async obtenerTokenAcceso() {
    try {
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const response = await axios.post('https://accounts.spotify.com/api/token', 
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('Error al obtener token de Spotify:', error);
      throw new Error('No se pudo obtener el token de acceso de Spotify');
    }
  }

  // Realizar petición autenticada a Spotify
  async hacerPeticion(endpoint, params = {}) {
    try {
      const token = await this.obtenerTokenAcceso();
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params
      });
      return response.data;
    } catch (error) {
      console.error('Error en petición a Spotify:', error);
      throw error;
    }
  }

  // Buscar en Spotify
  async buscar(query, type = 'track', limit = 20) {
    try {
      const data = await this.hacerPeticion('/search', {
        q: query,
        type: type,
        limit: limit
      });

      const resultados = {
        tracks: data.tracks?.items?.map(track => Cancion.fromSpotifyData(track)) || [],
        artists: data.artists?.items?.map(artist => Artista.fromSpotifyData(artist)) || [],
        albums: data.albums?.items || [],
        playlists: data.playlists?.items || []
      };

      return resultados;
    } catch (error) {
      console.error('Error al buscar en Spotify:', error);
      throw error;
    }
  }

  // Obtener canciones
  async obtenerCanciones({ genero, artista, limit = 50, offset = 0 } = {}) {
    try {
      let query = '';
      if (genero) query += `genre:${genero}`;
      if (artista) query += ` artist:${artista}`;
      
      const data = await this.hacerPeticion('/search', {
        q: query || 'year:2020-2024',
        type: 'track',
        limit: limit,
        offset: offset
      });

      return data.tracks.items.map(track => Cancion.fromSpotifyData(track));
    } catch (error) {
      console.error('Error al obtener canciones:', error);
      throw error;
    }
  }

  // Obtener géneros musicales
  async obtenerGeneros() {
    try {
      const data = await this.hacerPeticion('/recommendations/available-genre-seeds');
      return data.genres.map(genre => Genero.fromSpotifyData(genre));
    } catch (error) {
      console.error('Error al obtener géneros:', error);
      throw error;
    }
  }

  // Obtener canciones por género
  async obtenerCancionesPorGenero(genero, limit = 20, offset = 0) {
    try {
      const data = await this.hacerPeticion('/search', {
        q: `genre:${genero}`,
        type: 'track',
        limit: limit,
        offset: offset
      });

      return data.tracks.items.map(track => Cancion.fromSpotifyData(track));
    } catch (error) {
      console.error('Error al obtener canciones por género:', error);
      throw error;
    }
  }

  // Obtener artistas
  async obtenerArtistas({ genero, limit = 20, offset = 0 } = {}) {
    try {
      let query = '';
      if (genero) query = `genre:${genero}`;
      
      const data = await this.hacerPeticion('/search', {
        q: query || 'year:2020-2024',
        type: 'artist',
        limit: limit,
        offset: offset
      });

      return data.artists.items.map(artist => Artista.fromSpotifyData(artist));
    } catch (error) {
      console.error('Error al obtener artistas:', error);
      throw error;
    }
  }

  // Obtener detalles de un artista
  async obtenerDetallesArtista(artistaId) {
    try {
      const data = await this.hacerPeticion(`/artists/${artistaId}`);
      return Artista.fromSpotifyData(data);
    } catch (error) {
      console.error('Error al obtener detalles del artista:', error);
      throw error;
    }
  }

  // Obtener playlists del usuario
  async obtenerPlaylistsUsuario(usuarioId, esPublica = null) {
    try {
      const data = await this.hacerPeticion(`/users/${usuarioId}/playlists`);
      
      let playlists = data.items;
      if (esPublica !== null) {
        playlists = playlists.filter(playlist => playlist.public === esPublica);
      }

      return playlists.map(playlist => ({
        id: playlist.id,
        nombre: playlist.name,
        descripcion: playlist.description,
        esPublica: playlist.public,
        imagen: playlist.images[0]?.url || null,
        canciones: playlist.tracks.total,
        propietario: playlist.owner.display_name,
        createdAt: playlist.added_at
      }));
    } catch (error) {
      console.error('Error al obtener playlists del usuario:', error);
      throw error;
    }
  }

  // Crear playlist
  async crearPlaylist(usuarioId, playlistData) {
    try {
      const token = await this.obtenerTokenAcceso();
      const response = await axios.post(
        `${this.baseURL}/users/${usuarioId}/playlists`,
        playlistData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        id: response.data.id,
        nombre: response.data.name,
        descripcion: response.data.description,
        esPublica: response.data.public,
        imagen: response.data.images[0]?.url || null,
        canciones: 0,
        propietario: response.data.owner.display_name,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error al crear playlist:', error);
      throw error;
    }
  }

  // Agregar canción a playlist
  async agregarCancionAPlaylist(playlistId, cancionId) {
    try {
      const token = await this.obtenerTokenAcceso();
      const response = await axios.post(
        `${this.baseURL}/playlists/${playlistId}/tracks`,
        {
          uris: [`spotify:track:${cancionId}`]
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error al agregar canción a playlist:', error);
      throw error;
    }
  }

  // Remover canción de playlist
  async removerCancionDePlaylist(playlistId, cancionId) {
    try {
      const token = await this.obtenerTokenAcceso();
      const response = await axios.delete(
        `${this.baseURL}/playlists/${playlistId}/tracks`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: {
            tracks: [{ uri: `spotify:track:${cancionId}` }]
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error al remover canción de playlist:', error);
      throw error;
    }
  }

  // Obtener recomendaciones
  async obtenerRecomendaciones({ seed_genres, seed_artists, seed_tracks, limit = 20 }) {
    try {
      const params = {
        limit: limit
      };

      if (seed_genres && seed_genres.length > 0) {
        params.seed_genres = seed_genres.join(',');
      }
      if (seed_artists && seed_artists.length > 0) {
        params.seed_artists = seed_artists.join(',');
      }
      if (seed_tracks && seed_tracks.length > 0) {
        params.seed_tracks = seed_tracks.join(',');
      }

      const data = await this.hacerPeticion('/recommendations', params);
      return data.tracks.map(track => Cancion.fromSpotifyData(track));
    } catch (error) {
      console.error('Error al obtener recomendaciones:', error);
      throw error;
    }
  }

  // Obtener canciones populares
  async obtenerCancionesPopulares(limit = 20, offset = 0) {
    try {
      const data = await this.hacerPeticion('/search', {
        q: 'year:2020-2024',
        type: 'track',
        limit: limit,
        offset: offset
      });

      return data.tracks.items.map(track => Cancion.fromSpotifyData(track));
    } catch (error) {
      console.error('Error al obtener canciones populares:', error);
      throw error;
    }
  }

  // Obtener detalles de una canción
  async obtenerDetallesCancion(cancionId) {
    try {
      const data = await this.hacerPeticion(`/tracks/${cancionId}`);
      return Cancion.fromSpotifyData(data);
    } catch (error) {
      console.error('Error al obtener detalles de la canción:', error);
      throw error;
    }
  }

  // Obtener álbumes de un artista
  async obtenerAlbumesArtista(artistaId, limit = 20, offset = 0) {
    try {
      const data = await this.hacerPeticion(`/artists/${artistaId}/albums`, {
        limit: limit,
        offset: offset,
        include_groups: 'album,single'
      });

      return data.items.map(album => ({
        id: album.id,
        nombre: album.name,
        artista: album.artists[0].name,
        imagen: album.images[0]?.url || null,
        fechaLanzamiento: album.release_date,
        tipo: album.album_type,
        canciones: album.total_tracks
      }));
    } catch (error) {
      console.error('Error al obtener álbumes del artista:', error);
      throw error;
    }
  }
}

module.exports = new SpotifyService();
