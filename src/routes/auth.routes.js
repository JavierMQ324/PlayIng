const express = require('express');
const router = express.Router();
const { 
  googleAuthAdmin, 
  googleAuthCliente, 
  verifyToken, 
  getProfile,
  getAllUsers 
} = require('../controllers/usuarios.controller');

// Rutas de autenticación
router.post('/google/admin', googleAuthAdmin);
router.post('/google/cliente', googleAuthCliente);

// Rutas protegidas
router.get('/profile', verifyToken, getProfile);
router.get('/users', verifyToken, getAllUsers);

module.exports = router;
