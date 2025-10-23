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
}

module.exports = MusicaController;