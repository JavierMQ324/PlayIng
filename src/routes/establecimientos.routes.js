const express = require('express');
const router = express.Router();
const { verifyToken } = require('../controllers/usuarios.controller');
const {
  upsertMyEstablecimiento,
  getMyEstablecimiento,
  createMesa,
  listMesas,
  deleteLastMesa,
  getMesaQr,
  linkByQr,
  listClientes,
  leaveRestaurant,
  kickUsers
} = require('../controllers/establecimientos.controller');

router.get('/mio', verifyToken, getMyEstablecimiento);
router.post('/mio', verifyToken, upsertMyEstablecimiento);

router.post('/mesas', verifyToken, createMesa);
router.get('/:id/mesas', verifyToken, listMesas);
router.delete('/:id/mesas/ultima', verifyToken, deleteLastMesa);
router.get('/mesas/:mesaId/qr', getMesaQr);
router.post('/qr/vincular', verifyToken, linkByQr);
router.get('/:id/clientes', verifyToken, listClientes);
router.post('/leave', verifyToken, leaveRestaurant);
router.post('/:id/kick', verifyToken, kickUsers);

module.exports = router;
