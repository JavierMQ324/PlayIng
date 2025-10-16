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

  db.query(createEstablecimientos, () => {
    db.query(addMesaForeign, () => {
      db.query(addMesaConstraint, () => {});
      db.query(addUniqueMesaByEst, () => {});
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
    if (err) return res.status(500).json({ error: 'DB error' });
    try {
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 300 });
      res.json({ success: true, mesa: { id_mesa: result.insertId, numero_mesa: String(numero_mesa), qr_code: qrPayload, establecimiento_id }, qr_image: qrDataUrl, qr_payload: payload });
    } catch (e) {
      res.json({ success: true, mesa: { id_mesa: result.insertId, numero_mesa: String(numero_mesa), qr_code: qrPayload, establecimiento_id }, qr_payload: payload });
    }
  });
}

// Listar mesas por establecimiento
function listMesas(req, res) {
  ensureSchema();
  const { id } = req.params;
  const sql = 'SELECT id_mesa, numero_mesa, status, establecimiento_id FROM mesas WHERE establecimiento_id = ? ORDER BY numero_mesa ASC';
  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, mesas: rows });
  });
}

module.exports = {
  ensureSchema,
  upsertMyEstablecimiento,
  getMyEstablecimiento,
  createMesa,
  listMesas
};
