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
      o.creada_en,
      o.actualizado_en,
      u.id_user AS usuario_id,
      u.nombre AS usuario_nombre,
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
      u.nombre,
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
        o.creada_en,
        o.actualizado_en,
        u.id_user AS usuario_id,
        u.nombre AS usuario_nombre,
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

    // Emitir evento de socket
    const io = req.app.get('io');
    if (io) {
      const establecimientoId = req.body.establecimientoId;
      if (establecimientoId) {
        io.to(`establecimiento:${establecimientoId}`).emit('orden_updated', { id, status });
      }
    }

    res.json({ 
      success: true, 
      mensaje: 'Estado de orden actualizado'
    });
  });
};

// Actualizar el tiempo estimado de una orden
// Cuando se actualiza manualmente (botones +/-), también actualiza la fecha de creación
const updateOrdenTiempo = (req, res) => {
  const { id } = req.params;
  const { tiempo_estimado } = req.body;

  if (tiempo_estimado === undefined || tiempo_estimado < 0) {
    return res.status(400).json({ error: 'Tiempo estimado inválido' });
  }

  // Actualizar el tiempo y la fecha de creación a "ahora" para reiniciar el cálculo
  const query = 'UPDATE ordenes SET tiempo_estimado = ?, creada_en = NOW() WHERE id_orden = ?';

  db.query(query, [tiempo_estimado, id], (err, result) => {
    if (err) {
      console.error('Error al actualizar tiempo de orden:', err);
      return res.status(500).json({ error: 'Error al actualizar tiempo de orden' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }

    // Emitir evento de socket
    const io = req.app.get('io');
    if (io) {
      const establecimientoId = req.body.establecimientoId;
      if (establecimientoId) {
        io.to(`establecimiento:${establecimientoId}`).emit('orden_updated', { id, tiempo_estimado });
      }
    }

    res.json({ 
      success: true, 
      mensaje: 'Tiempo de orden actualizado'
    });
  });
};

// Eliminar órdenes
const deleteOrdenes = (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs de órdenes requeridos' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const query = `DELETE FROM ordenes WHERE id_orden IN (${placeholders})`;

  db.query(query, ids, (err, result) => {
    if (err) {
      console.error('Error al eliminar órdenes:', err);
      return res.status(500).json({ error: 'Error al eliminar órdenes' });
    }

    // Emitir evento de socket
    const io = req.app.get('io');
    if (io) {
      const establecimientoId = req.body.establecimientoId;
      if (establecimientoId) {
        io.to(`establecimiento:${establecimientoId}`).emit('ordenes_deleted', { ids });
      }
    }

    res.json({ 
      success: true, 
      mensaje: `${result.affectedRows} orden(es) eliminada(s)`,
      deletedCount: result.affectedRows
    });
  });
};

// Obtener el estado de las órdenes por usuario
const getEstadoOrdenesUsuarios = (req, res) => {
  const { establecimientoId } = req.params;
  
  const query = `
    SELECT 
      u.id_user,
      u.nombre,
      m.numero_mesa,
      COUNT(o.id_orden) as total_ordenes,
      COALESCE(SUM(CASE WHEN o.status IN ('pendiente', 'en_preparacion') THEN 1 ELSE 0 END), 0) as ordenes_pendientes,
      COALESCE(SUM(CASE WHEN o.status IN ('entregada', 'pagada') THEN 1 ELSE 0 END), 0) as ordenes_entregadas
    FROM usuarios u
    INNER JOIN mesas m ON u.mesa_id_activa = m.id_mesa
    LEFT JOIN ordenes o ON u.id_user = o.usuario_id
    WHERE m.establecimiento_id = ? AND u.roll = 'cliente'
    GROUP BY u.id_user, u.nombre, m.numero_mesa
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

module.exports = {
  getOrdenes,
  getUsuariosActivos,
  createOrden,
  updateOrdenStatus,
  updateOrdenTiempo,
  deleteOrdenes,
  getEstadoOrdenesUsuarios
};

