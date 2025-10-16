// index.js
const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http, { cors: { origin: true, credentials: true } });
const db = require('./db'); 
require('dotenv').config({ path: './src/.env' });

// Middleware
app.use(express.json());

app.use(cors({
  origin: true, // Permitir todos los orígenes temporalmente
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const establecimientosRoutes = require('./routes/establecimientos.routes');

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/establecimientos', establecimientosRoutes);

// Ruta de callback para OAuth móvil
app.get('/auth/callback', (req, res) => {
  const { code } = req.query;
  console.log('Callback móvil recibido:', { code });
  if (code) {
    // Redirigir a la app móvil con el código
    const mobileAppUrl = process.env.MOBILE_APP_URL || 'exp://localhost:8081';
    res.redirect(`${mobileAppUrl}/--/auth?code=${code}`);
  } else {
    res.status(400).send('Código de autorización no encontrado');
  }
});

// Ruta principal
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Playing funcionando correctamente',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/google/admin': 'Autenticación Google para administradores',
        'POST /api/auth/google/cliente': 'Autenticación Google para clientes',
        'GET /api/auth/profile': 'Obtener perfil del usuario autenticado',
        'GET /api/auth/users': 'Obtener todos los usuarios (solo admin)'
      }
    }
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Puerto
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  const publicBaseUrl = process.env.SERVER_PUBLIC_URL || `http://0.0.0.0:${PORT}`;
  console.log(`Servidor escuchando en ${publicBaseUrl}`);
  console.log(`Admin app URL: ${process.env.ADMIN_APP_URL || 'http://localhost:4200'}`);
  console.log(`Mobile app URL: ${process.env.MOBILE_APP_URL || 'exp://localhost:8081'}`);
});

// Exponer io a controladores
app.set('io', io);

io.on('connection', (socket) => {
  socket.on('join_establecimiento', (establecimientoId) => {
    socket.join(`establecimiento:${establecimientoId}`);
  });
});

