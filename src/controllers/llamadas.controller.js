const db = require('../db');

// Crear una nueva llamada al mesero
const createLlamada = (req, res) => {
  const userId = req.user.id_user || req.user.id;
  
  // Verificar que el usuario tenga una mesa activa
  const checkMesaQuery = `
    SELECT u.mesa_id_activa, m.establecimiento_id 
    FROM usuarios u
    INNER JOIN mesas m ON u.mesa_id_activa = m.id_mesa
    WHERE u.id_user = ?
  `;
  
  db.query(checkMesaQuery, [userId], (err, results) => {
    if (err) {
      console.error('Error al verificar mesa:', err);
      return res.status(500).json({ error: 'Error al verificar mesa' });
    }
    
    if (!results[0] || !results[0].mesa_id_activa) {
      return res.status(400).json({ error: 'No tienes una mesa activa' });
    }
    
    const mesaId = results[0].mesa_id_activa;
    const establecimientoId = results[0].establecimiento_id;
    
    // Crear la nueva llamada
    // Nota: El cooldown de 1 minuto es manejado por la app móvil
    const insertQuery = `
      INSERT INTO llamadas (usuario_id, establecimiento_id, mesa_id, status)
      VALUES (?, ?, ?, 'pendiente')
    `;
    
    db.query(insertQuery, [userId, establecimientoId, mesaId], (err, result) => {
      if (err) {
        console.error('Error al crear llamada:', err);
        return res.status(500).json({ error: 'Error al crear llamada' });
      }
      
      // Obtener la llamada creada con información completa
      const getLlamadaQuery = `
        SELECT 
          l.id_llamada,
          l.usuario_id,
          l.establecimiento_id,
          l.mesa_id,
          l.status,
          l.creada_en,
          u.nombre AS usuario_nombre,
          m.numero_mesa
        FROM llamadas l
        INNER JOIN usuarios u ON l.usuario_id = u.id_user
        INNER JOIN mesas m ON l.mesa_id = m.id_mesa
        WHERE l.id_llamada = ?
      `;
      
      db.query(getLlamadaQuery, [result.insertId], (err, llamadaResult) => {
        if (err) {
          console.error('Error al obtener llamada creada:', err);
          return res.status(500).json({ error: 'Llamada creada pero error al obtener datos' });
        }
        
        // Emitir evento de socket
        const io = req.app.get('io');
        if (io && llamadaResult[0]) {
          console.log('🔔 Backend: Emitiendo llamada_created a establecimiento:', establecimientoId);
          console.log('📋 Datos de llamada:', llamadaResult[0]);
          io.to(`establecimiento:${establecimientoId}`).emit('llamada_created', llamadaResult[0]);
          console.log('✅ Evento llamada_created emitido');
        } else {
          console.warn('⚠️ No se pudo emitir evento socket:', { io: !!io, data: !!llamadaResult[0] });
        }
        
        res.status(201).json({
          success: true,
          mensaje: 'Llamada al mesero enviada',
          llamada: llamadaResult[0]
        });
      });
    });
  });
};

// Obtener llamadas pendientes de un establecimiento
const getLlamadasPendientes = (req, res) => {
  const { establecimientoId } = req.params;
  
  const query = `
    SELECT 
      l.id_llamada,
      l.usuario_id,
      l.establecimiento_id,
      l.mesa_id,
      l.status,
      l.creada_en,
      u.nombre AS usuario_nombre,
      m.numero_mesa
    FROM llamadas l
    INNER JOIN usuarios u ON l.usuario_id = u.id_user
    INNER JOIN mesas m ON l.mesa_id = m.id_mesa
    WHERE l.establecimiento_id = ? AND l.status = 'pendiente'
    ORDER BY l.creada_en ASC
  `;
  
  db.query(query, [establecimientoId], (err, results) => {
    if (err) {
      console.error('Error al obtener llamadas pendientes:', err);
      return res.status(500).json({ error: 'Error al obtener llamadas pendientes' });
    }
    res.json({ success: true, llamadas: results });
  });
};

// Atender llamada (eliminar de la base de datos)
const marcarLlamadaAtendida = (req, res) => {
  const { id } = req.params;
  
  // Primero obtener el establecimiento_id ANTES de eliminar
  const getLlamadaQuery = 'SELECT establecimiento_id FROM llamadas WHERE id_llamada = ?';
  db.query(getLlamadaQuery, [id], (err, llamadaResult) => {
    if (err) {
      console.error('Error al obtener llamada:', err);
      return res.status(500).json({ error: 'Error al procesar llamada' });
    }
    
    if (!llamadaResult[0]) {
      return res.status(404).json({ error: 'Llamada no encontrada' });
    }
    
    const establecimientoId = llamadaResult[0].establecimiento_id;
    
    // Ahora eliminar la llamada
    const deleteQuery = 'DELETE FROM llamadas WHERE id_llamada = ?';
    db.query(deleteQuery, [id], (err, result) => {
      if (err) {
        console.error('Error al eliminar llamada:', err);
        return res.status(500).json({ error: 'Error al atender llamada' });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Llamada no encontrada' });
      }
      
      // Emitir evento de socket
      const io = req.app.get('io');
      if (io) {
        console.log('🗑️ Backend: Emitiendo llamada_atendida a establecimiento:', establecimientoId);
        io.to(`establecimiento:${establecimientoId}`).emit('llamada_atendida', { id_llamada: id });
        console.log('✅ Evento llamada_atendida emitido');
      }
      
      res.json({
        success: true,
        mensaje: 'Llamada atendida'
      });
    });
  });
};

// Cancelar llamada (por el cliente)
const cancelarLlamada = (req, res) => {
  const userId = req.user.id_user || req.user.id;
  const { id } = req.params;
  
  // Verificar que la llamada pertenece al usuario
  const query = 'UPDATE llamadas SET status = ? WHERE id_llamada = ? AND usuario_id = ? AND status = ?';
  
  db.query(query, ['cancelada', id, userId, 'pendiente'], (err, result) => {
    if (err) {
      console.error('Error al cancelar llamada:', err);
      return res.status(500).json({ error: 'Error al cancelar llamada' });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Llamada no encontrada o ya fue atendida' });
    }
    
    // Obtener información de la llamada para emitir socket
    const getLlamadaQuery = 'SELECT establecimiento_id FROM llamadas WHERE id_llamada = ?';
    db.query(getLlamadaQuery, [id], (err, llamadaResult) => {
      if (!err && llamadaResult[0]) {
        const io = req.app.get('io');
        if (io) {
          io.to(`establecimiento:${llamadaResult[0].establecimiento_id}`).emit('llamada_cancelada', { id_llamada: id });
        }
      }
    });
    
    res.json({
      success: true,
      mensaje: 'Llamada cancelada'
    });
  });
};

module.exports = {
  createLlamada,
  getLlamadasPendientes,
  marcarLlamadaAtendida,
  cancelarLlamada
};

