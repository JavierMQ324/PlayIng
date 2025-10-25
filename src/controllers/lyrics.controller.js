const axios = require('axios');

class LyricsController {
  // Parsear formato LRC a array de objetos con timestamps
  static parseLRC(lrcContent) {
    const lines = lrcContent.split('\n');
    const syncedLyrics = [];
    
    // Regex para capturar timestamp [mm:ss.xx] y texto
    const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    
    for (const line of lines) {
      const match = line.match(lrcRegex);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const centiseconds = parseInt(match[3]);
        
        // Convertir a segundos totales
        const totalSeconds = minutes * 60 + seconds + (centiseconds / 100);
        const text = match[4].trim();
        
        if (text) { // Solo agregar líneas con texto
          syncedLyrics.push({
            time: totalSeconds,
            text: text
          });
        }
      }
    }
    
    return syncedLyrics;
  }

  // Buscar y obtener letras desde LRCLIB (API gratuita)
  static async getLyricsFromLRCLIB(track, artist, album = null, duration = null) {
    try {
      console.log(`🔍 Buscando en LRCLIB: "${track}" by "${artist}"`);
      
      const params = {
        track_name: track,
        artist_name: artist
      };
      
      if (album) params.album_name = album;
      if (duration) params.duration = Math.round(duration);
      
      const response = await axios.get('https://lrclib.net/api/get', { params });
      
      if (response.data && response.data.syncedLyrics) {
        console.log('✅ Letras sincronizadas encontradas en LRCLIB');
        return {
          synced: true,
          lyrics: LyricsController.parseLRC(response.data.syncedLyrics)
        };
      } else if (response.data && response.data.plainLyrics) {
        console.log('⚠️ Solo letras simples encontradas en LRCLIB');
        return {
          synced: false,
          lyrics: response.data.plainLyrics.split('\n').filter(line => line.trim())
        };
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('❌ No se encontraron letras en LRCLIB');
      } else {
        console.error('Error en LRCLIB:', error.message);
      }
      return null;
    }
  }

  // Buscar letras desde Genius (fallback sin sincronización)
  static async getLyricsFromGenius(track, artist) {
    try {
      const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;
      
      if (!GENIUS_ACCESS_TOKEN) {
        return null;
      }
      
      console.log(`🔍 Buscando en Genius: "${track}" by "${artist}"`);
      
      // Buscar la canción
      const searchResponse = await axios.get('https://api.genius.com/search', {
        params: { q: `${track} ${artist}` },
        headers: { 'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}` }
      });
      
      if (searchResponse.data.response.hits.length === 0) {
        return null;
      }
      
      const song = searchResponse.data.response.hits[0].result;
      
      // Genius API no devuelve las letras directamente
      // Solo podemos proporcionar el URL
      console.log('⚠️ Genius encontrado pero no tiene letras sincronizadas');
      
      return {
        synced: false,
        lyrics: ['Las letras están disponibles en:', song.url],
        url: song.url
      };
      
    } catch (error) {
      console.error('Error en Genius:', error.message);
      return null;
    }
  }

  // Endpoint principal para obtener letras
  static async getLyrics(req, res) {
    try {
      const { track, artist, album, duration } = req.query;

      if (!track || !artist) {
        return res.status(400).json({
          success: false,
          error: 'Track and artist parameters are required'
        });
      }

      console.log(`\n📝 Buscando letras para: "${track}" by "${artist}"`);

      // 1. Intentar LRCLIB primero (gratis, con sincronización)
      let result = await LyricsController.getLyricsFromLRCLIB(track, artist, album, duration);
      
      if (result) {
        return res.json({
          success: true,
          source: 'lrclib',
          synced: result.synced,
          lyrics: result.lyrics
        });
      }

      // 2. Fallback a Genius (solo si está configurado)
      result = await LyricsController.getLyricsFromGenius(track, artist);
      
      if (result) {
        return res.json({
          success: true,
          source: 'genius',
          synced: result.synced,
          lyrics: result.lyrics,
          url: result.url
        });
      }

      // 3. No se encontraron letras
      console.log('❌ No se encontraron letras en ninguna fuente');
      
      return res.status(404).json({
        success: false,
        error: 'Lyrics not found',
        message: 'No se encontraron letras para esta canción'
      });

    } catch (error) {
      console.error('Error general al buscar letras:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get lyrics'
      });
    }
  }

  // Buscar múltiples resultados en LRCLIB
  static async searchLyrics(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }

      console.log(`🔍 Buscando múltiples resultados: "${q}"`);

      const response = await axios.get('https://lrclib.net/api/search', {
        params: { q }
      });

      if (response.data && response.data.length > 0) {
        return res.json({
          success: true,
          results: response.data.map(item => ({
            id: item.id,
            track: item.trackName,
            artist: item.artistName,
            album: item.albumName,
            duration: item.duration,
            has_synced: !!item.syncedLyrics,
            has_plain: !!item.plainLyrics
          }))
        });
      }

      return res.status(404).json({
        success: false,
        error: 'No results found'
      });

    } catch (error) {
      console.error('Error searching lyrics:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to search lyrics'
      });
    }
  }

  // Obtener letras por ID de LRCLIB
  static async getLyricsById(req, res) {
    try {
      const { id } = req.params;

      console.log(`📝 Obteniendo letras por ID: ${id}`);

      const response = await axios.get(`https://lrclib.net/api/get/${id}`);

      if (response.data) {
        const result = {
          success: true,
          track: response.data.trackName,
          artist: response.data.artistName,
          album: response.data.albumName,
          duration: response.data.duration
        };

        if (response.data.syncedLyrics) {
          result.synced = true;
          result.lyrics = LyricsController.parseLRC(response.data.syncedLyrics);
        } else if (response.data.plainLyrics) {
          result.synced = false;
          result.lyrics = response.data.plainLyrics.split('\n').filter(line => line.trim());
        }

        return res.json(result);
      }

      return res.status(404).json({
        success: false,
        error: 'Lyrics not found'
      });

    } catch (error) {
      console.error('Error getting lyrics by ID:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to get lyrics'
      });
    }
  }
}

module.exports = LyricsController;

