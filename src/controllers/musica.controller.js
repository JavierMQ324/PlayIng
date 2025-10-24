const axios = require('axios');
const db = require('../db');
const SpotifyEstablecimientoController = require('./spotify-establecimiento.controller');

class MusicaController {
  // Buscar canciones y artistas en Spotify API
  static async searchTracks(req, res) {
    try {
      const { q, establecimientoId } = req.query;
      
      if (!q) {
        return res.status(400).json({ 
          success: false, 
          error: 'Query parameter is required' 
        });
      }

      console.log(`Searching tracks and artists for query: "${q}", establecimiento: ${establecimientoId}`);

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
          q, 
          `"${q}"`, 
          `${q} track`, 
          `${q} song` 
        ];

        let allTracks = [];
        let allArtists = [];
        let searchSuccessful = false;
        let artistsCollected = false;

        for (const query of searchQueries) {
          try {
            console.log(`Trying search query: "${query}"`);
            const searchType = !artistsCollected ? 'track,artist' : 'track';
            
            // Búsqueda combinada de canciones y artistas
            const response = await axios.get('https://api.spotify.com/v1/search', {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              },
              params: {
                q: query,
                type: searchType,
                limit: 50,
                market: 'US'
              }
            });

            // Procesar canciones
            const foundTracks = response.data.tracks.items.map(track => ({
              spotify_id: track.id,
              titulo: track.name,
              artista: track.artists[0]?.name || 'Unknown',
              album: track.album.name,
              duracion: Math.floor(track.duration_ms / 1000),
              imagen_url: track.album.images[0]?.url || null,
              genero: null,
              preview_url: track.preview_url
            }));

            // Procesar artistas solo en la primera búsqueda
            if (!artistsCollected && response.data.artists) {
              const foundArtists = response.data.artists.items.map(artist => ({
                spotify_id: artist.id,
                nombre: artist.name,
                imagen_url: artist.images[0]?.url || null,
                genres: artist.genres || [],
                followers: artist.followers?.total || 0,
                popularity: artist.popularity || 0
              }));

              // Ordenar por popularidad (más popular primero) y tomar solo los 10 mejores
              allArtists = foundArtists
                .sort((a, b) => b.popularity - a.popularity)
                .slice(0, 6);
              
              artistsCollected = true;
              console.log(`Collected ${allArtists.length} most relevant artists (sorted by popularity)`);
            }

            // Combinar tracks únicos
            const existingTrackIds = new Set(allTracks.map(t => t.spotify_id));
            const newTracks = foundTracks.filter(track => !existingTrackIds.has(track.spotify_id));
            allTracks = [...allTracks, ...newTracks];

            console.log(`Found ${newTracks.length} new tracks with query "${query}"`);
            console.log(`Total: ${allTracks.length} tracks, ${allArtists.length} artists`);

            if (allTracks.length >= 50) {
              searchSuccessful = true;
              break;
            }

          } catch (queryError) {
            console.log(`Search query "${query}" failed:`, queryError.response?.data?.error?.message || queryError.message);
            continue;
          }
        }

        if (searchSuccessful && (allTracks.length > 0 || allArtists.length > 0)) {
          console.log(`Successfully found ${allTracks.length} tracks and ${allArtists.length} artists for query: "${q}"`);
          
          res.json({ 
            success: true, 
            tracks: allTracks,
            artists: allArtists,
            total: allTracks.length,
            totalArtists: allArtists.length,
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

  // Buscar canciones de un artista específico
  static async getTracksByArtist(req, res) {
    try {
      const { artistId } = req.params;
      const { establecimientoId } = req.query;

      console.log(`Getting tracks for artist: ${artistId}, establecimiento: ${establecimientoId}`);

      // Obtener access token válido del establecimiento
      const accessToken = await SpotifyEstablecimientoController.getValidAccessToken(establecimientoId);
      if (!accessToken) {
        return res.status(401).json({
          success: false,
          error: 'No valid Spotify access token available. Please connect your Spotify account.'
        });
      }

      try {
        // Obtener top tracks del artista
        const topTracksResponse = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/top-tracks`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            market: 'US'
          }
        });

        // Obtener álbumes del artista (incrementado a 50 para tener más variedad)
        const albumsResponse = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/albums`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            include_groups: 'album,single',
            market: 'US',
            limit: 50
          }
        });

        // Procesar top tracks
        let allTracks = topTracksResponse.data.tracks.map(track => ({
          spotify_id: track.id,
          titulo: track.name,
          artista: track.artists[0]?.name || 'Unknown',
          album: track.album.name,
          duracion: Math.floor(track.duration_ms / 1000),
          imagen_url: track.album.images[0]?.url || null,
          genero: null,
          preview_url: track.preview_url
        }));

        // Obtener canciones de los álbumes para tener más variedad
        const trackIds = new Set(allTracks.map(t => t.spotify_id));
        
        // Procesar más álbumes para alcanzar 100 canciones
        for (const album of albumsResponse.data.items.slice(0, 30)) {
          try {
            const albumTracksResponse = await axios.get(`https://api.spotify.com/v1/albums/${album.id}/tracks`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              },
              params: {
                market: 'US',
                limit: 50
              }
            });

            const albumTracks = albumTracksResponse.data.items.map(track => ({
              spotify_id: track.id,
              titulo: track.name,
              artista: track.artists[0]?.name || 'Unknown',
              album: album.name,
              duracion: Math.floor(track.duration_ms / 1000),
              imagen_url: album.images[0]?.url || null,
              genero: null,
              preview_url: track.preview_url
            }));

            // Agregar tracks que no estén duplicados
            const newTracks = albumTracks.filter(track => !trackIds.has(track.spotify_id));
            newTracks.forEach(track => trackIds.add(track.spotify_id));
            allTracks = [...allTracks, ...newTracks];

            if (allTracks.length >= 100) break;
          } catch (albumError) {
            console.log(`Error fetching album ${album.id}:`, albumError.message);
            continue;
          }
        }

        console.log(`Successfully found ${allTracks.length} tracks for artist: ${artistId}`);
        
        res.json({
          success: true,
          tracks: allTracks,
          total: allTracks.length
        });

      } catch (spotifyError) {
        console.error('Spotify search failed:', spotifyError.message);
        
        res.status(403).json({
          success: false,
          error: 'Unable to search Spotify. Please check your Spotify account permissions.',
          details: 'Make sure you are registered as a test user in the Spotify Developer Dashboard for this app.',
          instructions: 'Go to Spotify Developer Dashboard > Your App > Users and Access > Add your email as a test user'
        });
      }

    } catch (error) {
      console.error('Error getting tracks by artist:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get tracks by artist' 
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