const Cancion = require('../models/cancion.model');
const Playlist = require('../models/playlist.model');
const Genero = require('../models/genero.model');
const Artista = require('../models/artista.model');
const SpotifyService = require('../services/spotify.service');
const WebSocketService = require('../services/websocket.service');
const db = require('../db');

class MusicaController {
  // Obtener todas las canciones (híbrido: Spotify + BD local)
  async obtenerCanciones(req, res) {
    try {
      const { genero, artista, limit = 50, offset = 0 } = req.query;
      
      // Intentar obtener de Spotify primero
      try {
        const canciones = await SpotifyService.obtenerCanciones({ genero, artista, limit, offset });
        
        res.json({
          success: true,
          data: canciones,
          source: 'spotify',
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: canciones.length
          }
        });
        return;
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando base de datos local:', spotifyError.message);
      }
      
      // Fallback a base de datos local
      let query = 'SELECT * FROM canciones WHERE 1=1';
      const params = [];
      
      if (genero) {
        query += ' AND artista LIKE ?';
        params.push(`%${genero}%`);
      }
      
      if (artista) {
        query += ' AND artista LIKE ?';
        params.push(`%${artista}%`);
      }
      
      query += ' ORDER BY creada_en DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      
      const [canciones] = await db.promise().execute(query, params);
      
      res.json({
        success: true,
        data: canciones,
        source: 'local_database',
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: canciones.length
        }
      });
    } catch (error) {
      console.error('Error al obtener canciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Buscar canciones (híbrido)
  async buscarCanciones(req, res) {
    try {
      const { q, tipo = 'track', limit = 20 } = req.query;
      
      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'El parámetro de búsqueda es requerido'
        });
      }

      // Intentar Spotify primero
      try {
        const resultados = await SpotifyService.buscar(q, tipo, limit);
        
        res.json({
          success: true,
          data: resultados,
          query: q,
          source: 'spotify'
        });
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando base de datos local:', spotifyError.message);
        
        // Fallback a base de datos local
        const query = `
          SELECT * FROM canciones 
          WHERE titulo LIKE ? OR artista LIKE ? OR album LIKE ?
          ORDER BY creada_en DESC 
          LIMIT ?
        `;
        
        const searchTerm = `%${q}%`;
        const [canciones] = await db.promise().execute(query, [searchTerm, searchTerm, searchTerm, parseInt(limit)]);
        
        res.json({
          success: true,
          data: { tracks: canciones },
          query: q,
          source: 'local_database'
        });
      }
    } catch (error) {
      console.error('Error al buscar canciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener géneros musicales (híbrido)
  async obtenerGeneros(req, res) {
    try {
      // Intentar Spotify primero
      try {
        const generos = await SpotifyService.obtenerGeneros();
        
        res.json({
          success: true,
          data: generos,
          source: 'spotify'
        });
        return;
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando géneros por defecto:', spotifyError.message);
      }
      
      // Fallback a géneros por defecto
      const generos = [
        'hip-hop', 'rap', 'dance', 'rock', 'pop', 'house', 
        'reggaeton', 'regional', 'electronic', 'jazz', 
        'classical', 'country', 'blues', 'folk', 'alternative'
      ];
      
      res.json({
        success: true,
        data: generos.map(genero => ({ nombre: genero })),
        source: 'default'
      });
    } catch (error) {
      console.error('Error al obtener géneros:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener canciones por género (híbrido)
  async obtenerCancionesPorGenero(req, res) {
    try {
      const { genero } = req.params;
      const { limit = 20, offset = 0 } = req.query;
      
      // Intentar Spotify primero
      try {
        const canciones = await SpotifyService.obtenerCancionesPorGenero(genero, limit, offset);
        
        res.json({
          success: true,
          data: canciones,
          genero: genero,
          source: 'spotify',
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: canciones.length
          }
        });
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando base de datos local:', spotifyError.message);
        
        // Fallback a base de datos local
        const query = `
          SELECT * FROM canciones 
          WHERE artista LIKE ? OR titulo LIKE ?
          ORDER BY creada_en DESC 
          LIMIT ? OFFSET ?
        `;
        
        const searchTerm = `%${genero}%`;
        const [canciones] = await db.promise().execute(query, [searchTerm, searchTerm, parseInt(limit), parseInt(offset)]);
        
        res.json({
          success: true,
          data: canciones,
          genero: genero,
          source: 'local_database',
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: canciones.length
          }
        });
      }
    } catch (error) {
      console.error('Error al obtener canciones por género:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener artistas (híbrido)
  async obtenerArtistas(req, res) {
    try {
      const { genero, limit = 20, offset = 0 } = req.query;
      
      // Intentar Spotify primero
      try {
        const artistas = await SpotifyService.obtenerArtistas({ genero, limit, offset });
        
        res.json({
          success: true,
          data: artistas,
          source: 'spotify',
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: artistas.length
          }
        });
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando base de datos local:', spotifyError.message);
        
        // Fallback a base de datos local
        let query = `
          SELECT DISTINCT artista, COUNT(*) as total_canciones
          FROM canciones 
          WHERE artista IS NOT NULL AND artista != ''
        `;
        const params = [];
        
        if (genero) {
          query += ' AND artista LIKE ?';
          params.push(`%${genero}%`);
        }
        
        query += ' GROUP BY artista ORDER BY total_canciones DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [artistas] = await db.promise().execute(query, params);
        
        res.json({
          success: true,
          data: artistas,
          source: 'local_database',
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: artistas.length
          }
        });
      }
    } catch (error) {
      console.error('Error al obtener artistas:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener detalles de un artista (híbrido)
  async obtenerDetallesArtista(req, res) {
    try {
      const { id } = req.params;
      
      // Intentar Spotify primero
      try {
        const artista = await SpotifyService.obtenerDetallesArtista(id);
        
        res.json({
          success: true,
          data: artista,
          source: 'spotify'
        });
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando base de datos local:', spotifyError.message);
        
        // Fallback a base de datos local
        const query = `
          SELECT artista, COUNT(*) as total_canciones, 
                 GROUP_CONCAT(DISTINCT album) as albumes
          FROM canciones 
          WHERE artista LIKE ?
          GROUP BY artista
        `;
        
        const [artista] = await db.promise().execute(query, [`%${id}%`]);
        
        if (artista.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Artista no encontrado'
          });
        }
        
        res.json({
          success: true,
          data: artista[0],
          source: 'local_database'
        });
      }
    } catch (error) {
      console.error('Error al obtener detalles del artista:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener playlists del usuario (Spotify)
  async obtenerPlaylists(req, res) {
    try {
      const { usuarioId } = req.params;
      const { esPublica } = req.query;
      
      const playlists = await SpotifyService.obtenerPlaylistsUsuario(usuarioId, esPublica);
      
      res.json({
        success: true,
        data: playlists,
        source: 'spotify'
      });
    } catch (error) {
      console.error('Error al obtener playlists:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Crear playlist (Spotify)
  async crearPlaylist(req, res) {
    try {
      const { nombre, descripcion, esPublica = false, canciones = [] } = req.body;
      const { usuarioId } = req.params;
      
      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'El nombre de la playlist es requerido'
        });
      }

      const playlist = new Playlist(null, nombre, descripcion, usuarioId, esPublica, canciones);
      
      const playlistCreada = await SpotifyService.crearPlaylist(usuarioId, {
        name: nombre,
        description: descripcion,
        public: esPublica
      });
      
      // Notificar a través de WebSocket
      WebSocketService.broadcast('playlist_created', {
        playlist: playlistCreada,
        usuarioId: usuarioId
      });
      
      res.status(201).json({
        success: true,
        data: playlistCreada,
        message: 'Playlist creada exitosamente',
        source: 'spotify'
      });
    } catch (error) {
      console.error('Error al crear playlist:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Agregar canción a playlist (Spotify)
  async agregarCancionAPlaylist(req, res) {
    try {
      const { playlistId, cancionId } = req.params;
      
      const resultado = await SpotifyService.agregarCancionAPlaylist(playlistId, cancionId);
      
      // Notificar a través de WebSocket
      WebSocketService.broadcast('song_added_to_playlist', {
        playlistId: playlistId,
        cancionId: cancionId
      });
      
      res.json({
        success: true,
        data: resultado,
        message: 'Canción agregada a la playlist exitosamente',
        source: 'spotify'
      });
    } catch (error) {
      console.error('Error al agregar canción a playlist:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Remover canción de playlist (Spotify)
  async removerCancionDePlaylist(req, res) {
    try {
      const { playlistId, cancionId } = req.params;
      
      const resultado = await SpotifyService.removerCancionDePlaylist(playlistId, cancionId);
      
      // Notificar a través de WebSocket
      WebSocketService.broadcast('song_removed_from_playlist', {
        playlistId: playlistId,
        cancionId: cancionId
      });
      
      res.json({
        success: true,
        data: resultado,
        message: 'Canción removida de la playlist exitosamente',
        source: 'spotify'
      });
    } catch (error) {
      console.error('Error al remover canción de playlist:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener recomendaciones (híbrido)
  async obtenerRecomendaciones(req, res) {
    try {
      const { generos, artistas, canciones, limit = 20 } = req.query;
      
      // Intentar Spotify primero
      try {
        const recomendaciones = await SpotifyService.obtenerRecomendaciones({
          seed_genres: generos?.split(','),
          seed_artists: artistas?.split(','),
          seed_tracks: canciones?.split(','),
          limit: parseInt(limit)
        });
        
        res.json({
          success: true,
          data: recomendaciones,
          source: 'spotify'
        });
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando base de datos local:', spotifyError.message);
        
        // Fallback a base de datos local
        let query = 'SELECT * FROM canciones WHERE 1=1';
        const params = [];
        
        if (generos) {
          const generosArray = generos.split(',');
          const generosConditions = generosArray.map(() => 'artista LIKE ?').join(' OR ');
          query += ` AND (${generosConditions})`;
          generosArray.forEach(genero => params.push(`%${genero}%`));
        }
        
        query += ' ORDER BY RAND() LIMIT ?';
        params.push(parseInt(limit));
        
        const [recomendaciones] = await db.promise().execute(query, params);
        
        res.json({
          success: true,
          data: recomendaciones,
          source: 'local_database'
        });
      }
    } catch (error) {
      console.error('Error al obtener recomendaciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener canciones populares (híbrido)
  async obtenerCancionesPopulares(req, res) {
    try {
      const { limit = 20, offset = 0 } = req.query;
      
      // Intentar Spotify primero
      try {
        const canciones = await SpotifyService.obtenerCancionesPopulares(limit, offset);
        
        res.json({
          success: true,
          data: canciones,
          source: 'spotify',
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: canciones.length
          }
        });
      } catch (spotifyError) {
        console.log('Spotify no disponible, usando base de datos local:', spotifyError.message);
        
        // Fallback a base de datos local
        const query = `
          SELECT * FROM canciones 
          ORDER BY creada_en DESC 
          LIMIT ? OFFSET ?
        `;
        
        const [canciones] = await db.promise().execute(query, [parseInt(limit), parseInt(offset)]);
        
        res.json({
          success: true,
          data: canciones,
          source: 'local_database',
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: canciones.length
          }
        });
      }
    } catch (error) {
      console.error('Error al obtener canciones populares:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Funciones adicionales para la base de datos local
  
  // Agregar canción a la base de datos
  async agregarCancion(req, res) {
    try {
      const { spotify_id, titulo, artista, album, duracion } = req.body;
      
      if (!spotify_id || !titulo || !artista) {
        return res.status(400).json({
          success: false,
          message: 'spotify_id, titulo y artista son requeridos'
        });
      }
      
      const query = `
        INSERT INTO canciones (spotify_id, titulo, artista, album, duracion)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const [result] = await db.promise().execute(query, [spotify_id, titulo, artista, album || null, duracion || 0]);
      
      res.status(201).json({
        success: true,
        data: { id: result.insertId },
        message: 'Canción agregada exitosamente',
        source: 'local_database'
      });
    } catch (error) {
      console.error('Error al agregar canción:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Obtener cola de canciones
  async obtenerColaCanciones(req, res) {
    try {
      const query = `
        SELECT cc.*, c.titulo, c.artista, c.album, c.duracion, u.nombre as usuario_nombre
        FROM cola_cancion cc
        JOIN canciones c ON cc.cancion_id = c.id_cancion
        JOIN usuarios u ON cc.anadido_por = u.id_user
        ORDER BY cc.posicion ASC
      `;
      
      const [cola] = await db.promise().execute(query);
      
      res.json({
        success: true,
        data: cola,
        source: 'local_database'
      });
    } catch (error) {
      console.error('Error al obtener cola de canciones:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }

  // Agregar canción a la cola
  async agregarCancionACola(req, res) {
    try {
      const { cancion_id, usuario_id } = req.body;
      
      if (!cancion_id || !usuario_id) {
        return res.status(400).json({
          success: false,
          message: 'cancion_id y usuario_id son requeridos'
        });
      }
      
      // Obtener la siguiente posición
      const [maxPos] = await db.promise().execute('SELECT MAX(posicion) as max_pos FROM cola_cancion');
      const nextPos = (maxPos[0].max_pos || 0) + 1;
      
      const query = `
        INSERT INTO cola_cancion (cancion_id, anadido_por, posicion, status)
        VALUES (?, ?, ?, 'pending')
      `;
      
      const [result] = await db.promise().execute(query, [cancion_id, usuario_id, nextPos]);
      
      // Notificar a través de WebSocket
      WebSocketService.broadcast('song_added_to_queue', {
        cancion_id: cancion_id,
        usuario_id: usuario_id,
        posicion: nextPos
      });
      
      res.status(201).json({
        success: true,
        data: { id: result.insertId, posicion: nextPos },
        message: 'Canción agregada a la cola exitosamente',
        source: 'local_database'
      });
    } catch (error) {
      console.error('Error al agregar canción a la cola:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  }
}

module.exports = new MusicaController();
