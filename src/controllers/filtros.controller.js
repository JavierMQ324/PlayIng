const db = require('../db');

class FiltrosController {
  // Agregar un filtro (bloquear género, artista o canción)
  static addFiltro(req, res) {
    const { establecimientoId, tipo, valor, nombreDisplay, usuarioId, imagenUrl } = req.body;

    if (!establecimientoId || !tipo || !valor || !usuarioId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: establecimientoId, tipo, valor, usuarioId'
      });
    }

    // Validar tipo
    const tiposValidos = ['genero', 'artista', 'cancion'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tipo. Must be: genero, artista, or cancion'
      });
    }

    console.log(`Adding filtro: tipo=${tipo}, valor=${valor}, establecimiento=${establecimientoId}`);

    // Insertar el filtro
    db.query(
      `INSERT INTO filtros (establecimiento_id, tipo, valor, nombre_display, imagen_url, creado_por) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [establecimientoId, tipo, valor, nombreDisplay || valor, imagenUrl || null, usuarioId],
      (err, result) => {
        if (err) {
          // Si el error es por clave duplicada, significa que el filtro ya existe
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
              success: false,
              error: 'Este filtro ya existe'
            });
          }
          
          console.error('Error adding filtro:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to add filtro'
          });
        }

        console.log(`Filtro added successfully with id: ${result.insertId}`);
        res.json({
          success: true,
          message: 'Filtro added successfully',
          filtroId: result.insertId
        });
      }
    );
  }

  // Obtener todos los filtros de un establecimiento
  static getFiltros(req, res) {
    const { establecimientoId } = req.query;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId is required'
      });
    }

    console.log(`Getting filtros for establecimiento: ${establecimientoId}`);

    db.query(
      `SELECT 
        f.id_filtro,
        f.establecimiento_id,
        f.tipo,
        f.valor,
        f.nombre_display,
        f.imagen_url,
        f.creado_por,
        f.creada_en,
        u.nombre as creado_por_nombre
       FROM filtros f
       INNER JOIN usuarios u ON f.creado_por = u.id_user
       WHERE f.establecimiento_id = ?
       ORDER BY f.creada_en DESC`,
      [establecimientoId],
      (err, filtros) => {
        if (err) {
          console.error('Error getting filtros:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to get filtros'
          });
        }

        res.json({
          success: true,
          filtros: filtros.map(f => ({
            id_filtro: f.id_filtro,
            establecimiento_id: f.establecimiento_id,
            tipo: f.tipo,
            valor: f.valor,
            nombre_display: f.nombre_display,
            imagen_url: f.imagen_url,
            creado_por: f.creado_por,
            creado_por_nombre: f.creado_por_nombre,
            creada_en: f.creada_en
          }))
        });
      }
    );
  }

  // Eliminar un filtro
  static deleteFiltro(req, res) {
    const { filtroId } = req.params;

    if (!filtroId) {
      return res.status(400).json({
        success: false,
        error: 'filtroId is required'
      });
    }

    console.log(`Deleting filtro: ${filtroId}`);

    db.query(
      'DELETE FROM filtros WHERE id_filtro = ?',
      [filtroId],
      (err, result) => {
        if (err) {
          console.error('Error deleting filtro:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to delete filtro'
          });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            error: 'Filtro not found'
          });
        }

        console.log(`Filtro deleted successfully`);
        res.json({
          success: true,
          message: 'Filtro deleted successfully'
        });
      }
    );
  }

  // Verificar si una canción está bloqueada
  static checkIfBlocked(req, res) {
    const { establecimientoId, spotifyId, artista, genero } = req.body;

    if (!establecimientoId || !spotifyId || !artista) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: establecimientoId, spotifyId, artista'
      });
    }

    console.log(`Checking if song is blocked: spotify_id=${spotifyId}, artista=${artista}, genero=${genero}`);

    // Buscar filtros que coincidan con la canción, artista o género
    const query = `
      SELECT tipo, valor, nombre_display 
      FROM filtros 
      WHERE establecimiento_id = ? 
      AND (
        (tipo = 'cancion' AND valor = ?) OR
        (tipo = 'artista' AND valor = ?) OR
        (tipo = 'genero' AND valor = ?)
      )
      LIMIT 1
    `;

    db.query(
      query,
      [establecimientoId, spotifyId, artista, genero || ''],
      (err, filtros) => {
        if (err) {
          console.error('Error checking if blocked:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to check if blocked'
          });
        }

        if (filtros.length > 0) {
          const filtro = filtros[0];
          console.log(`Song is blocked by ${filtro.tipo}: ${filtro.nombre_display}`);
          
          return res.json({
            success: true,
            isBlocked: true,
            reason: {
              tipo: filtro.tipo,
              valor: filtro.valor,
              nombre: filtro.nombre_display
            }
          });
        }

        console.log(`Song is not blocked`);
        res.json({
          success: true,
          isBlocked: false
        });
      }
    );
  }

  // Verificar múltiples canciones a la vez
  static checkMultipleSongs(req, res) {
    const { establecimientoId, canciones } = req.body;

    if (!establecimientoId || !Array.isArray(canciones) || canciones.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: establecimientoId, canciones (array)'
      });
    }

    console.log(`Checking ${canciones.length} songs for blocks`);

    // Obtener todos los filtros del establecimiento
    db.query(
      'SELECT tipo, valor FROM filtros WHERE establecimiento_id = ?',
      [establecimientoId],
      (err, filtros) => {
        if (err) {
          console.error('Error getting filtros:', err);
          return res.status(500).json({
            success: false,
            error: 'Failed to check songs'
          });
        }

        // Crear sets para búsqueda rápida
        const cancionesBloqueadas = new Set(
          filtros.filter(f => f.tipo === 'cancion').map(f => f.valor)
        );
        const artistasBloqueados = new Set(
          filtros.filter(f => f.tipo === 'artista').map(f => f.valor)
        );
        const generosBloqueados = new Set(
          filtros.filter(f => f.tipo === 'genero').map(f => f.valor)
        );

        // Verificar cada canción
        const resultados = canciones.map(cancion => {
          const { spotifyId, artista, genero } = cancion;
          
          if (cancionesBloqueadas.has(spotifyId)) {
            return { ...cancion, isBlocked: true, blockedBy: 'cancion' };
          }
          if (artistasBloqueados.has(artista)) {
            return { ...cancion, isBlocked: true, blockedBy: 'artista' };
          }
          if (genero && generosBloqueados.has(genero)) {
            return { ...cancion, isBlocked: true, blockedBy: 'genero' };
          }
          
          return { ...cancion, isBlocked: false };
        });

        res.json({
          success: true,
          resultados
        });
      }
    );
  }
}

module.exports = FiltrosController;

