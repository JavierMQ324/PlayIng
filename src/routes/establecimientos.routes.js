const express = require('express');
const router = express.Router();
const { verifyToken } = require('../controllers/usuarios.controller');
const {
  upsertMyEstablecimiento,
  getMyEstablecimiento,
  createMesa,
  listMesas,
  deleteLastMesa,
  getMesaQr
} = require('../controllers/establecimientos.controller');

router.get('/mio', verifyToken, getMyEstablecimiento);
router.post('/mio', verifyToken, upsertMyEstablecimiento);

router.post('/mesas', verifyToken, createMesa);
router.get('/:id/mesas', verifyToken, listMesas);
router.delete('/:id/mesas/ultima', verifyToken, deleteLastMesa);
router.get('/mesas/:mesaId/qr', getMesaQr);

module.exports = router;
