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
  getMesaById,
  linkByQr,
  listClientes,
  leaveRestaurant,
  kickUsers,
  getEstablecimientoActivo,
  debugUserStatus
} = require('../controllers/establecimientos.controller');

router.get('/mio', verifyToken, getMyEstablecimiento);
router.post('/mio', verifyToken, upsertMyEstablecimiento);
router.get('/activo', verifyToken, getEstablecimientoActivo); // Para clientes móviles
router.get('/debug/user', verifyToken, debugUserStatus); // DEBUG endpoint

router.post('/mesas', verifyToken, createMesa);
router.get('/:id/mesas', verifyToken, listMesas);
router.delete('/:id/mesas/ultima', verifyToken, deleteLastMesa);
router.get('/mesas/:mesaId/qr', getMesaQr);
router.get('/mesa/:mesaId', verifyToken, getMesaById);
router.post('/qr/vincular', verifyToken, linkByQr);
router.get('/:id/clientes', verifyToken, listClientes);
router.post('/leave', verifyToken, leaveRestaurant);
router.post('/:id/kick', verifyToken, kickUsers);

module.exports = router;
