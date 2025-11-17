const db = require('../db');
const QRCode = require('qrcode');

let schemaEnsured = false;

function ensureSchema() {
  if (schemaEnsured) return;
  schemaEnsured = true;

  const createEstablecimientos = `
    CREATE TABLE IF NOT EXISTS establecimientos (
      id_establecimiento INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      url_menu VARCHAR(300) DEFAULT NULL,
      ubicacion VARCHAR(250) DEFAULT NULL,
      creada_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY admin_id (admin_id),
      CONSTRAINT establecimientos_admin_fk
        FOREIGN KEY (admin_id) REFERENCES usuarios(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  const addMesaForeign = `
    ALTER TABLE mesas
      ADD COLUMN establecimiento_id INT NULL,
      ADD KEY establecimiento_id (establecimiento_id);
  `;

  const addMesaConstraint = `
    ALTER TABLE mesas
      ADD CONSTRAINT mesas_establecimiento_fk
        FOREIGN KEY (establecimiento_id) REFERENCES establecimientos(id_establecimiento) ON DELETE SET NULL;
  `;

  const addUniqueMesaByEst = `
    ALTER TABLE mesas
      ADD UNIQUE KEY uniq_mesa_por_establecimiento (establecimiento_id, numero_mesa);
  `;

  const addMesaQrPng = `
    ALTER TABLE mesas
      ADD COLUMN qr_png LONGTEXT NULL;
  `;

  const dropLegacyUniqueNumeroMesa = `
    ALTER TABLE mesas DROP INDEX numero_mesa
  `;

  db.query(createEstablecimientos, () => {
    db.query(addMesaForeign, () => {
      db.query(addMesaConstraint, () => {});
      db.query(addUniqueMesaByEst, () => {});
      db.query(dropLegacyUniqueNumeroMesa, () => {});
      db.query(addMesaQrPng, () => {});
    });
  });
}

function requireAdmin(req, res) {
  if (req.user?.roll !== 'admin') {
    res.status(403).json({ error: 'Solo administradores' });
    return false;
  }
  return true;
}

// Crear o actualizar el establecimiento del admin
function upsertMyEstablecimiento(req, res) {
  ensureSchema();
  if (!requireAdmin(req, res)) return;
  const adminId = req.user.id;
  const { nombre, url_menu, ubicacion } = req.body;
  if (!nombre) {
    res.status(400).json({ error: 'nombre es requerido' });
    return;
  }

  const selectSql = 'SELECT * FROM establecimientos WHERE admin_id = ? LIMIT 1';
  db.query(selectSql, [adminId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (rows.length > 0) {
      const upd = 'UPDATE establecimientos SET nombre = ?, url_menu = ?, ubicacion = ? WHERE id_establecimiento = ?';
      db.query(upd, [nombre, url_menu || null, ubicacion || null, rows[0].id_establecimiento], (uErr) => {
        if (uErr) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true, establecimiento: { ...rows[0], nombre, url_menu, ubicacion } });
      });
    } else {
      const ins = 'INSERT INTO establecimientos (admin_id, nombre, url_menu, ubicacion) VALUES (?, ?, ?, ?)';
      db.query(ins, [adminId, nombre, url_menu || null, ubicacion || null], (iErr, result) => {
        if (iErr) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true, establecimiento: { id_establecimiento: result.insertId, admin_id: adminId, nombre, url_menu, ubicacion } });
      });
    }
  });
}

// Obtener el establecimiento del admin
function getMyEstablecimiento(req, res) {
  ensureSchema();
  if (!requireAdmin(req, res)) return;
  const adminId = req.user.id;
  const sql = 'SELECT * FROM establecimientos WHERE admin_id = ? LIMIT 1';
  db.query(sql, [adminId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, establecimiento: rows[0] || null });
  });
}

// Crear mesa en un establecimiento
function createMesa(req, res) {
  ensureSchema();
  if (!requireAdmin(req, res)) return;
  const { establecimiento_id, numero_mesa } = req.body;
  if (!establecimiento_id || !numero_mesa) return res.status(400).json({ error: 'establecimiento_id y numero_mesa requeridos' });

  const ins = 'INSERT INTO mesas (numero_mesa, qr_code, status, establecimiento_id) VALUES (?, ?, ?, ?)';
  const payload = { e: establecimiento_id, m: String(numero_mesa) };
  const qrPayload = JSON.stringify(payload);
  db.query(ins, [String(numero_mesa), qrPayload, 'libre', establecimiento_id], async (err, result) => {
    if (err) {
      console.error('Error creando mesa:', err);
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'duplicate_mesa', message: 'Ya existe una mesa con ese número en este establecimiento.' });
      }
      return res.status(500).json({ error: 'DB error', details: err?.sqlMessage || err?.message });
    }
    try {
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 300 });
      const upd = 'UPDATE mesas SET qr_png = ? WHERE id_mesa = ?';
      db.query(upd, [qrDataUrl, result.insertId], () => {
        const io = req.app.get('io');
        io.to(`establecimiento:${establecimiento_id}`).emit('establecimiento:mesas_actualizadas');
        res.json({ success: true, mesa: { id_mesa: result.insertId, numero_mesa: String(numero_mesa), qr_code: qrPayload, establecimiento_id }, qr_image: qrDataUrl, qr_payload: payload });
      });
    } catch (e) {
      res.json({ success: true, mesa: { id_mesa: result.insertId, numero_mesa: String(numero_mesa), qr_code: qrPayload, establecimiento_id }, qr_payload: payload });
    }
  });
}

// Listar mesas por establecimiento
function listMesas(req, res) {
  ensureSchema();
  const { id } = req.params;
  const sql = `
    SELECT m.id_mesa,
           m.numero_mesa,
           CASE WHEN EXISTS (
             SELECT 1 FROM usuarios u WHERE u.mesa_id_activa = m.id_mesa
           ) THEN 'ocupada' ELSE 'libre' END AS status,
           m.establecimiento_id,
           m.qr_png
    FROM mesas m
    WHERE m.establecimiento_id = ?
    ORDER BY CAST(m.numero_mesa AS UNSIGNED) ASC
  `;
  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const baseUrl = process.env.SERVER_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const mesas = rows.map(r => ({
      ...r,
      qr_url: `${baseUrl}/api/establecimientos/mesas/${r.id_mesa}/qr`
    }));
    res.json({ success: true, mesas });
  });
}

// Obtener PNG de QR para una mesa concreta
function getMesaQr(req, res) {
  ensureSchema();
  const { mesaId } = req.params;
  const sql = 'SELECT qr_code, qr_png FROM mesas WHERE id_mesa = ? LIMIT 1';
  db.query(sql, [mesaId], async (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!rows.length) return res.status(404).json({ error: 'Mesa no encontrada' });
    const existing = rows[0];
    if (existing.qr_png) {
      // Data URL -> binary
      const base64 = existing.qr_png.split(',')[1] || '';
      const buffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', 'image/png');
      return res.send(buffer);
    }
    const payload = existing.qr_code || '';
    try {
      const buffer = await QRCode.toBuffer(payload, { margin: 1, width: 512 });
      res.setHeader('Content-Type', 'image/png');
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: 'No se pudo generar el QR' });
    }
  });
}

// Vincular cliente a mesa por QR { e, m }
function linkByQr(req, res) {
  ensureSchema();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const { e, m } = req.body || {};
  if (!e || !m) return res.status(400).json({ error: 'Payload inválido' });
  const findMesa = 'SELECT id_mesa FROM mesas WHERE establecimiento_id = ? AND numero_mesa = ? LIMIT 1';
  db.query(findMesa, [e, String(m)], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!rows.length) return res.status(404).json({ error: 'Mesa no encontrada' });
    const mesaId = rows[0].id_mesa;
    const updUser = 'UPDATE usuarios SET mesa_id_activa = ? WHERE id_user = ?';
    db.query(updUser, [mesaId, userId], (uErr) => {
      if (uErr) return res.status(500).json({ error: 'DB error' });
      const io = req.app.get('io');
      io.to(`establecimiento:${e}`).emit('establecimiento:clientes_actualizados');
      io.to(`establecimiento:${e}`).emit('establecimiento:mesas_actualizadas');
      res.json({ success: true, mesa_id: mesaId, establecimiento_id: e, numero_mesa: String(m), estado_orden: 'Inactiva' });
    });
  });
}

// Listar clientes activos por establecimiento (usuarios con mesa asignada)
function listClientes(req, res) {
  ensureSchema();
  if (req.user?.roll !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  const { id } = req.params; // establecimiento id
  const sql = `
    SELECT u.id_user AS id, u.nombre, u.mesa_id_activa AS mesa_id, m.numero_mesa AS mesa
    FROM usuarios u
    JOIN mesas m ON m.id_mesa = u.mesa_id_activa
    WHERE m.establecimiento_id = ?
  `;
  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const clientes = rows.map(r => ({ id: r.id, nombre: r.nombre, mesa: parseInt(r.mesa, 10) || 0, estado: 'Inactiva' }));
    res.json({ success: true, clientes });
  });
}
// Eliminar la última mesa (la de mayor numero_mesa) de un establecimiento
function deleteLastMesa(req, res) {
  ensureSchema();
  if (!requireAdmin(req, res)) return;
  const { id } = req.params; // establecimiento id
  const selectLast = 'SELECT id_mesa, numero_mesa FROM mesas WHERE establecimiento_id = ? ORDER BY CAST(numero_mesa AS UNSIGNED) DESC LIMIT 1';
  db.query(selectLast, [id], (sErr, rows) => {
    if (sErr) return res.status(500).json({ error: 'DB error' });
    if (!rows.length) return res.status(404).json({ error: 'No hay mesas para eliminar' });
    const last = rows[0];
    // Verificar si hay usuarios ocupando la mesa
    const check = 'SELECT COUNT(*) AS cnt FROM usuarios WHERE mesa_id_activa = ?';
    db.query(check, [last.id_mesa], (cErr, cRows) => {
      if (cErr) return res.status(500).json({ error: 'DB error' });
      if (cRows && cRows[0] && cRows[0].cnt > 0) {
        return res.status(409).json({ error: 'mesa_ocupada', message: 'No se puede eliminar: hay un usuario asignado a esta mesa.' });
      }
    const del = 'DELETE FROM mesas WHERE id_mesa = ?';
    db.query(del, [last.id_mesa], (dErr) => {
      if (dErr) return res.status(500).json({ error: 'DB error' });
      const io = req.app.get('io');
      io.to(`establecimiento:${id}`).emit('establecimiento:mesas_actualizadas');
      res.json({ success: true, deleted: last });
    });
    });
  });
}

// Expulsar usuarios del establecimiento: desvincular mesa, eliminar órdenes y llamadas
function kickUsers(req, res) {
  ensureSchema();
  if (req.user?.roll !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  const { id } = req.params; // establecimiento id
  const { user_ids } = req.body || {};
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids requerido' });
  }
  const placeholders = user_ids.map(() => '?').join(',');
  
  // Paso 1: Obtener llamadas pendientes de estos usuarios ANTES de eliminarlas
  const getLlamadasSql = `SELECT id_llamada FROM llamadas WHERE usuario_id IN (${placeholders}) AND establecimiento_id = ? AND status = 'pendiente'`;
  db.query(getLlamadasSql, [...user_ids, id], (err0, llamadasResult) => {
    if (err0) {
      console.error('Error obteniendo llamadas:', err0);
      return res.status(500).json({ error: 'DB error al obtener llamadas' });
    }
    
    const llamadasIds = llamadasResult.map(l => l.id_llamada);
    
    // Paso 2: Obtener órdenes pendientes de estos usuarios ANTES de eliminarlas
    const getOrdenesSql = `SELECT id_orden FROM ordenes WHERE usuario_id IN (${placeholders})`;
    db.query(getOrdenesSql, user_ids, (err0b, ordenesResult) => {
      if (err0b) {
        console.error('Error obteniendo órdenes:', err0b);
        return res.status(500).json({ error: 'DB error al obtener órdenes' });
      }
      
      const ordenesIds = ordenesResult.map(o => o.id_orden);
      
      // Paso 3: Eliminar llamadas pendientes de estos usuarios
      const deleteLlamadasSql = `DELETE FROM llamadas WHERE usuario_id IN (${placeholders}) AND establecimiento_id = ?`;
      db.query(deleteLlamadasSql, [...user_ids, id], (err1) => {
        if (err1) {
          console.error('Error eliminando llamadas:', err1);
          return res.status(500).json({ error: 'DB error al eliminar llamadas' });
        }
        
        // Paso 4: Eliminar órdenes de estos usuarios
        const deleteOrdenesSql = `DELETE FROM ordenes WHERE usuario_id IN (${placeholders})`;
        db.query(deleteOrdenesSql, user_ids, (err1b) => {
          if (err1b) {
            console.error('Error eliminando órdenes:', err1b);
            return res.status(500).json({ error: 'DB error al eliminar órdenes' });
          }
          
          // Paso 5: Desvincular mesa de los usuarios
          const updateUserSql = `
            UPDATE usuarios u
            JOIN mesas m ON m.id_mesa = u.mesa_id_activa
            SET u.mesa_id_activa = NULL
            WHERE m.establecimiento_id = ? AND u.id_user IN (${placeholders})
          `;
          db.query(updateUserSql, [id, ...user_ids], (err2, result) => {
            if (err2) {
              console.error('Error desvinculando usuarios:', err2);
              return res.status(500).json({ error: 'DB error al desvincular usuarios' });
            }
            
            // Paso 6: Emitir eventos de socket
            const io = req.app.get('io');
            io.to(`establecimiento:${id}`).emit('establecimiento:clientes_actualizados');
            io.to(`establecimiento:${id}`).emit('establecimiento:mesas_actualizadas');
            user_ids.forEach((uid) => {
              io.to(`user:${uid}`).emit('user:kicked');
            });
            
            // Emitir evento de llamada_atendida para cada llamada eliminada
            llamadasIds.forEach((llamadaId) => {
              io.to(`establecimiento:${id}`).emit('llamada_atendida', { id_llamada: llamadaId });
            });
            
            // Emitir evento de ordenes_deleted para las órdenes eliminadas
            if (ordenesIds.length > 0) {
              io.to(`establecimiento:${id}`).emit('ordenes_deleted', { ids: ordenesIds });
            }
            
            res.json({ success: true, affected: result?.affectedRows || 0 });
          });
        });
      });
    });
  });
}

// Obtener información de una mesa por su ID
function getMesaById(req, res) {
  ensureSchema();
  const { mesaId } = req.params;
  
  if (!mesaId) {
    return res.status(400).json({ error: 'mesaId es requerido' });
  }

  const sql = 'SELECT * FROM mesas WHERE id_mesa = ? LIMIT 1';
  db.query(sql, [mesaId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!rows.length) return res.status(404).json({ error: 'Mesa no encontrada' });
    
    res.json({ success: true, mesa: rows[0] });
  });
}

// Salir del restaurante: eliminar la relación mesa_id_activa del usuario cliente
function leaveRestaurant(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const findEst = `SELECT m.establecimiento_id FROM usuarios u JOIN mesas m ON m.id_mesa = u.mesa_id_activa WHERE u.id_user = ? LIMIT 1`;
  db.query(findEst, [userId], (fErr, rows) => {
    const estId = rows && rows[0] ? rows[0].establecimiento_id : null;
    const sql = 'UPDATE usuarios SET mesa_id_activa = NULL WHERE id_user = ?';
    db.query(sql, [userId], (err) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      const io = req.app.get('io');
      if (estId) {
        io.to(`establecimiento:${estId}`).emit('establecimiento:clientes_actualizados');
        io.to(`establecimiento:${estId}`).emit('establecimiento:mesas_actualizadas');
      } else {
        io.emit('establecimiento:clientes_actualizados');
      }
      res.json({ success: true });
    });
  });
}

// Obtener establecimiento activo del cliente (basado en su mesa activa)
function getEstablecimientoActivo(req, res) {
  const userId = req.user.id_user || req.user.id; // Soportar ambos formatos

  // Primero verificar si el usuario tiene mesa_id_activa
  const checkUserQuery = 'SELECT id_user, nombre, mesa_id_activa FROM usuarios WHERE id_user = ?';
  db.query(checkUserQuery, [userId], (err, userResults) => {
    if (err) {
      console.error('Error al verificar usuario:', err);
      return res.status(500).json({ error: 'Error al verificar usuario' });
    }
    
    if (!userResults[0] || !userResults[0].mesa_id_activa) {
      return res.json({ success: false, mensaje: 'No tienes una mesa activa' });
    }

    const query = `
      SELECT 
        e.id_establecimiento,
        e.nombre,
        e.url_menu,
        e.ubicacion,
        m.id_mesa,
        m.numero_mesa
      FROM usuarios u
      INNER JOIN mesas m ON u.mesa_id_activa = m.id_mesa
      INNER JOIN establecimientos e ON m.establecimiento_id = e.id_establecimiento
      WHERE u.id_user = ?
    `;

    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error('Error al obtener establecimiento activo:', err);
        return res.status(500).json({ error: 'Error al obtener establecimiento activo' });
      }

      if (results.length === 0) {
        return res.json({ success: false, mensaje: 'No tienes una mesa activa' });
      }

      res.json({ 
        success: true, 
        establecimiento: results[0]
      });
    });
  });
}

// DEBUG: Verificar estado del usuario actual
function debugUserStatus(req, res) {
  const userId = req.user.id_user || req.user.id; // Soportar ambos formatos
  console.log('=== DEBUG User Status ===');
  console.log('userId from token:', userId);
  console.log('req.user completo:', req.user);
  
  const query = `
    SELECT 
      u.id_user,
      u.nombre,
      u.email,
      u.roll,
      u.mesa_id_activa,
      m.numero_mesa,
      m.establecimiento_id,
      e.nombre AS establecimiento_nombre,
      (SELECT COUNT(*) FROM ordenes WHERE usuario_id = u.id_user) AS total_ordenes
    FROM usuarios u
    LEFT JOIN mesas m ON u.mesa_id_activa = m.id_mesa
    LEFT JOIN establecimientos e ON m.establecimiento_id = e.id_establecimiento
    WHERE u.id_user = ?
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error:', err);
      return res.status(500).json({ error: 'Error al obtener información del usuario' });
    }
    
    console.log('Resultado:', results[0]);
    res.json({ success: true, user: results[0] });
  });
}

module.exports = {
  ensureSchema,
  upsertMyEstablecimiento,
  getMyEstablecimiento,
  createMesa,
  listMesas,
  deleteLastMesa,
  getMesaQr,
  getMesaById,
  linkByQr,
  listClientes,
  leaveRestaurant,
  kickUsers,
  getEstablecimientoActivo,
  debugUserStatus
};
