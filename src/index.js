// index.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const app = express();
const db = require('./db');
const WebSocketService = require('./services/websocket.service');

// Configuración de CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:4200",
  credentials: true
}));

app.use(express.json());

// Importar rutas
// const usuariosRoutes = require('./routes/usuarios.routes');
const musicaRoutes = require('./routes/musica.routes');

// Ruta principal
app.get('/', (req, res) => {
  res.json({
    message: 'Servidor y base de datos funcionando correctamente',
    version: '1.0.0',
    modules: ['usuarios', 'musica'],
    websocket: '/ws'
  });
});

// Usar rutas
// app.use('/api/usuarios', usuariosRoutes);
app.use('/api/musica', musicaRoutes);

// Ruta de salud general
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    modules: {
      usuarios: 'active',
      musica: 'active',
      websocket: 'active'
    }
  });
});

// Crear servidor HTTP
const server = http.createServer(app);

// Inicializar WebSocket
WebSocketService.inicializar(server);

// Hacer el servicio WebSocket globalmente disponible
global.websocketService = WebSocketService;

// Puerto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`WebSocket disponible en ws://localhost:${PORT}/ws`);
  console.log(`Módulos activos: usuarios, musica`);
});

