const express = require('express');
const router = express.Router();
const { 
  googleAuthAdmin, 
  googleAuthCliente, 
  verifyToken, 
  getProfile,
  updateProfile,
  getAllUsers,
  logout
} = require('../controllers/usuarios.controller');

// Rutas de autenticación
router.post('/google/admin', googleAuthAdmin);
router.post('/google/cliente', googleAuthCliente);
router.post('/logout', logout);

// Rutas protegidas
router.get('/profile', verifyToken, getProfile);
router.put('/profile', verifyToken, updateProfile);
router.get('/users', verifyToken, getAllUsers);

module.exports = router;
