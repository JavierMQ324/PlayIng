const db = require('../db');

// Obtener todas las órdenes de un establecimiento
const getOrdenes = (req, res) => {
  const { establecimientoId } = req.params;
  
  const query = `
    SELECT 
      o.id_orden,
      o.numero_orden,
      o.status,
      o.total_monto,
      o.tiempo_estimado,
      o.tiempo_anadido,
      o.creada_en,
      o.actualizado_en,
      u.id_user AS usuario_id,
      CASE 
        WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
        ELSE 'Anónimo' 
      END AS usuario_nombre,
      m.id_mesa AS mesa_id,
      m.numero_mesa AS mesa_numero
    FROM ordenes o
    INNER JOIN usuarios u ON o.usuario_id = u.id_user
    INNER JOIN mesas m ON o.mesa_id = m.id_mesa
    WHERE m.establecimiento_id = ?
    ORDER BY 
      CASE o.status 
        WHEN 'en_preparacion' THEN 1
        WHEN 'pendiente' THEN 2
        WHEN 'entregada' THEN 3
        WHEN 'pagada' THEN 4
      END,
      o.creada_en DESC
  `;

  db.query(query, [establecimientoId], (err, results) => {
    if (err) {
      console.error('Error al obtener órdenes:', err);
      return res.status(500).json({ error: 'Error al obtener órdenes' });
    }
    res.json({ success: true, ordenes: results });
  });
};

// Obtener usuarios activos (con mesa asignada) de un establecimiento
const getUsuariosActivos = (req, res) => {
  const { establecimientoId } = req.params;
  
  const query = `
    SELECT 
      u.id_user,
      CASE 
        WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
        ELSE 'Anónimo' 
      END AS nombre,
      u.email,
      m.id_mesa,
      m.numero_mesa
    FROM usuarios u
    INNER JOIN mesas m ON u.mesa_id_activa = m.id_mesa
    WHERE m.establecimiento_id = ? AND u.roll = 'cliente'
    ORDER BY m.numero_mesa ASC
  `;

  db.query(query, [establecimientoId], (err, results) => {
    if (err) {
      console.error('Error al obtener usuarios activos:', err);
      return res.status(500).json({ error: 'Error al obtener usuarios activos' });
    }
    res.json({ success: true, usuarios: results });
  });
};

// Crear una nueva orden
const createOrden = (req, res) => {
  const { usuario_id, mesa_id, total_monto, tiempo_estimado, numero_orden } = req.body;

  // Validar campos requeridos
  if (!usuario_id || !mesa_id || total_monto === undefined || tiempo_estimado === undefined) {
    return res.status(400).json({ 
      error: 'Faltan campos requeridos',
      required: ['usuario_id', 'mesa_id', 'total_monto', 'tiempo_estimado']
    });
  }

  const query = `
    INSERT INTO ordenes (usuario_id, mesa_id, numero_orden, status, total_monto, tiempo_estimado)
    VALUES (?, ?, ?, 'en_preparacion', ?, ?)
  `;

  db.query(query, [usuario_id, mesa_id, numero_orden || null, total_monto, tiempo_estimado], (err, result) => {
    if (err) {
      console.error('Error al crear orden:', err);
      return res.status(500).json({ error: 'Error al crear orden' });
    }

    // Obtener la orden recién creada con información completa
    const getOrdenQuery = `
      SELECT 
        o.id_orden,
        o.numero_orden,
        o.status,
        o.total_monto,
        o.tiempo_estimado,
        o.tiempo_anadido,
        o.creada_en,
        o.actualizado_en,
        u.id_user AS usuario_id,
        CASE 
          WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
          ELSE NULL 
        END AS usuario_nombre,
        m.id_mesa AS mesa_id,
        m.numero_mesa AS mesa_numero
      FROM ordenes o
      INNER JOIN usuarios u ON o.usuario_id = u.id_user
      INNER JOIN mesas m ON o.mesa_id = m.id_mesa
      WHERE o.id_orden = ?
    `;

    db.query(getOrdenQuery, [result.insertId], (err, ordenResult) => {
      if (err) {
        console.error('Error al obtener orden creada:', err);
        return res.status(500).json({ error: 'Orden creada pero error al obtener datos' });
      }

      // Emitir evento de socket si está disponible
      const io = req.app.get('io');
      if (io && ordenResult[0]) {
        const establecimientoId = req.body.establecimientoId;
        if (establecimientoId) {
          io.to(`establecimiento:${establecimientoId}`).emit('orden_created', ordenResult[0]);
        }
      }

      res.status(201).json({ 
        success: true, 
        mensaje: 'Orden creada exitosamente',
        orden: ordenResult[0]
      });
    });
  });
};

// Actualizar el estado de una orden
const updateOrdenStatus = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pendiente', 'en_preparacion', 'entregada', 'pagada'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      error: 'Estado inválido',
      validStatuses 
    });
  }

  // Si se marca como entregada, poner tiempo en 0
  const updateQuery = status === 'entregada' 
    ? 'UPDATE ordenes SET status = ?, tiempo_estimado = 0 WHERE id_orden = ?'
    : 'UPDATE ordenes SET status = ? WHERE id_orden = ?';

  db.query(updateQuery, [status, id], (err, result) => {
    if (err) {
      console.error('Error al actualizar estado de orden:', err);
      return res.status(500).json({ error: 'Error al actualizar estado de orden' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // Obtener la orden con el usuario_id para el evento de socket
    const getOrdenQuery = 'SELECT usuario_id FROM ordenes WHERE id_orden = ?';
    db.query(getOrdenQuery, [id], (err, ordenResult) => {
      if (err) {
        console.error('Error al obtener usuario_id de la orden:', err);
      }

      // Emitir evento de socket con usuario_id
      const io = req.app.get('io');
      if (io && ordenResult && ordenResult[0]) {
        const establecimientoId = req.body.establecimientoId;
        if (establecimientoId) {
          io.to(`establecimiento:${establecimientoId}`).emit('orden_updated', { 
            id, 
            status,
            usuario_id: ordenResult[0].usuario_id 
          });
        }
      }

      res.json({ 
        success: true, 
        mensaje: 'Estado de orden actualizado'
      });
    });
  });
};

// Actualizar el tiempo añadido de una orden (ajuste +/-)
// NO actualiza creada_en para mantener la hora real de creación
const updateOrdenTiempo = (req, res) => {
  const { id } = req.params;
  const { ajuste } = req.body; // ajuste puede ser positivo o negativo

  if (ajuste === undefined) {
    return res.status(400).json({ error: 'Ajuste de tiempo requerido' });
  }

  // Solo actualizar tiempo_anadido, manteniendo creada_en y tiempo_estimado intactos
  const query = 'UPDATE ordenes SET tiempo_anadido = tiempo_anadido + ? WHERE id_orden = ?';

  db.query(query, [ajuste, id], (err, result) => {
    if (err) {
      console.error('Error al actualizar tiempo de orden:', err);
      return res.status(500).json({ error: 'Error al actualizar tiempo de orden' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // Obtener la orden actualizada con todos los datos para el evento de socket
    const getOrdenQuery = 'SELECT usuario_id, tiempo_anadido FROM ordenes WHERE id_orden = ?';
    db.query(getOrdenQuery, [id], (err, ordenResult) => {
      if (err) {
        console.error('Error al obtener datos de la orden:', err);
      }

      // Emitir evento de socket con los valores actualizados
      const io = req.app.get('io');
      if (io && ordenResult && ordenResult[0]) {
        const establecimientoId = req.body.establecimientoId;
        if (establecimientoId) {
          io.to(`establecimiento:${establecimientoId}`).emit('orden_updated', { 
            id, 
            tiempo_anadido: ordenResult[0].tiempo_anadido,
            usuario_id: ordenResult[0].usuario_id 
          });
        }
      }

      res.json({ 
        success: true, 
        mensaje: 'Tiempo de orden actualizado'
      });
    });
  });
};

// Eliminar órdenes
const deleteOrdenes = (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs de órdenes requeridos' });
  }

  // Primero obtener los usuario_id de las órdenes que se van a eliminar
  const placeholders = ids.map(() => '?').join(',');
  const getOrdenesQuery = `SELECT id_orden, usuario_id FROM ordenes WHERE id_orden IN (${placeholders})`;
  
  db.query(getOrdenesQuery, ids, (err, ordenesResult) => {
    if (err) {
      console.error('Error al obtener órdenes a eliminar:', err);
      return res.status(500).json({ error: 'Error al obtener órdenes a eliminar' });
    }

    // Crear un mapa de id_orden a usuario_id
    const ordenesUsuarios = ordenesResult.reduce((acc, orden) => {
      acc[orden.id_orden] = orden.usuario_id;
      return acc;
    }, {});

    // Ahora eliminar las órdenes
    const deleteQuery = `DELETE FROM ordenes WHERE id_orden IN (${placeholders})`;

    db.query(deleteQuery, ids, (err, result) => {
      if (err) {
        console.error('Error al eliminar órdenes:', err);
        return res.status(500).json({ error: 'Error al eliminar órdenes' });
      }

      // Emitir evento de socket con los usuario_id
      const io = req.app.get('io');
      if (io) {
        const establecimientoId = req.body.establecimientoId;
        if (establecimientoId) {
          io.to(`establecimiento:${establecimientoId}`).emit('ordenes_deleted', { 
            ids,
            usuarios: ordenesUsuarios // Mapa de id_orden -> usuario_id
          });
        }
      }

      res.json({ 
        success: true, 
        mensaje: `${result.affectedRows} orden(es) eliminada(s)`,
        deletedCount: result.affectedRows
      });
    });
  });
};

// Obtener el estado de las órdenes por usuario
const getEstadoOrdenesUsuarios = (req, res) => {
  const { establecimientoId } = req.params;
  
  const query = `
    SELECT 
      u.id_user,
      CASE 
        WHEN COALESCE(u.mostrar_nombre, 1) = 1 THEN u.nombre 
        ELSE 'Anónimo' 
      END AS nombre,
      m.numero_mesa,
      COUNT(o.id_orden) as total_ordenes,
      COALESCE(SUM(CASE WHEN o.status IN ('pendiente', 'en_preparacion') THEN 1 ELSE 0 END), 0) as ordenes_pendientes,
      COALESCE(SUM(CASE WHEN o.status IN ('entregada', 'pagada') THEN 1 ELSE 0 END), 0) as ordenes_entregadas
    FROM usuarios u
    INNER JOIN mesas m ON u.mesa_id_activa = m.id_mesa
    LEFT JOIN ordenes o ON u.id_user = o.usuario_id
    WHERE m.establecimiento_id = ? AND u.roll = 'cliente'
    GROUP BY u.id_user, u.mostrar_nombre, u.nombre, m.numero_mesa
    ORDER BY m.numero_mesa ASC
  `;

  db.query(query, [establecimientoId], (err, results) => {
    if (err) {
      console.error('Error al obtener estado de órdenes de usuarios:', err);
      return res.status(500).json({ error: 'Error al obtener estado de órdenes de usuarios' });
    }

    const usuarios = results.map(user => {
      let estado = 'Inactiva';
      
      const totalOrdenes = parseInt(user.total_ordenes) || 0;
      const ordenesEntregadas = parseInt(user.ordenes_entregadas) || 0;
      const ordenesPendientes = parseInt(user.ordenes_pendientes) || 0;
      
      if (totalOrdenes === 0) {
        estado = 'Inactiva';
      } else if (totalOrdenes > 0 && ordenesEntregadas === totalOrdenes) {
        estado = 'Entregada';
      } else {
        estado = 'En preparación';
      }

      return {
        id: user.id_user,
        nombre: user.nombre,
        mesa: parseInt(user.numero_mesa),
        estado: estado,
        total_ordenes: totalOrdenes,
        ordenes_pendientes: ordenesPendientes,
        ordenes_entregadas: ordenesEntregadas
      };
    });

    res.json({ success: true, usuarios });
  });
};

// Obtener las órdenes del usuario actual (cliente móvil)
const getOrdenesUsuario = (req, res) => {
  const userId = req.user.id_user || req.user.id; // Soportar ambos formatos
  
  const query = `
    SELECT 
      o.id_orden,
      o.numero_orden,
      o.status,
      o.total_monto,
      o.tiempo_estimado,
      o.tiempo_anadido,
      o.creada_en,
      o.actualizado_en,
      m.numero_mesa,
      e.nombre AS establecimiento_nombre
    FROM ordenes o
    INNER JOIN mesas m ON o.mesa_id = m.id_mesa
    INNER JOIN establecimientos e ON m.establecimiento_id = e.id_establecimiento
    WHERE o.usuario_id = ? 
    AND o.status IN ('pendiente', 'en_preparacion', 'entregada')
    ORDER BY 
      CASE o.status 
        WHEN 'en_preparacion' THEN 1
        WHEN 'pendiente' THEN 2
        WHEN 'entregada' THEN 3
      END,
      o.creada_en DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error al obtener órdenes del usuario:', err);
      return res.status(500).json({ error: 'Error al obtener órdenes del usuario' });
    }
    res.json({ success: true, ordenes: results });
  });
};

module.exports = {
  getOrdenes,
  getUsuariosActivos,
  createOrden,
  updateOrdenStatus,
  updateOrdenTiempo,
  deleteOrdenes,
  getEstadoOrdenesUsuarios,
  getOrdenesUsuario
};

