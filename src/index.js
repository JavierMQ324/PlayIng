// index.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const app = express();
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: true, credentials: true } });
const db = require('./db'); 
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:3000',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:3000',
  'https://tu-angular.vercel.app'
];

// Función para verificar si es un dominio ngrok
const isNgrokDomain = (origin) => {
  if (!origin) return false;
  return origin.includes('.ngrok-free.app') || origin.includes('.ngrok.io') || origin.includes('.ngrok.app');
};
require('dotenv').config({ path: './src/.env' });


// Middleware
app.use(express.json());

app.use(cors({
  origin: function(origin, callback){
    // Permitir requests sin origen (Postman, CURL, mobile apps, etc.)
    if(!origin) return callback(null, true);
    
    // En desarrollo, permitir cualquier localhost
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Permitir dominios ngrok (para desarrollo remoto)
    if (isNgrokDomain(origin)) {
      return callback(null, true);
    }
    
    // Verificar si está en la lista de orígenes permitidos
    if(allowedOrigins.indexOf(origin) === -1){
      console.log(`⚠️ CORS: Origen no permitido: ${origin}`);
      const msg = `El CORS policy no permite ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'User-Agent']
}));

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const establecimientosRoutes = require('./routes/establecimientos.routes');
const spotifyRoutes = require('./routes/spotify.routes');
const spotifyEstablecimientoRoutes = require('./routes/spotify-establecimiento.routes');
const musicaRoutes = require('./routes/musica.routes');
const filtrosRoutes = require('./routes/filtros.routes');
const configuracionRoutes = require('./routes/configuracion.routes');
const lyricsRoutes = require('./routes/lyrics.routes');
const ordenesRoutes = require('./routes/ordenes.routes');
const llamadasRoutes = require('./routes/llamadas.routes');


// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/establecimientos', establecimientosRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/spotify-establecimiento', spotifyEstablecimientoRoutes);
app.use('/api/musica', musicaRoutes);
app.use('/api/filtros', filtrosRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/lyrics', lyricsRoutes);
app.use('/api/ordenes', ordenesRoutes);
app.use('/api/llamadas', llamadasRoutes);

// Almacenamiento temporal de códigos de autenticación (en producción usar Redis)
const authCodes = new Map();

// Ruta para iniciar sesión - genera un ID de sesión
app.get('/auth/start', (req, res) => {
  const sessionId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  authCodes.set(sessionId, { code: null, timestamp: Date.now() });
  
  // Limpiar códigos antiguos (más de 5 minutos)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, value] of authCodes.entries()) {
    if (value.timestamp < fiveMinutesAgo) {
      authCodes.delete(key);
    }
  }
  
  res.json({ sessionId, success: true });
});

// Ruta para verificar si hay código disponible
app.get('/auth/check/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const authData = authCodes.get(sessionId);
  
  if (authData && authData.code) {
    const code = authData.code;
    authCodes.delete(sessionId); // Eliminar después de usar
    res.json({ success: true, code });
  } else {
    res.json({ success: false, code: null });
  }
});

// Ruta de callback para OAuth móvil
app.get('/auth/callback', (req, res) => {
  const { code, state } = req.query;
  console.log('Callback móvil recibido:', { code, state });
  
  if (!code) {
    res.status(400).send('Código de autorización no encontrado');
    return;
  }
  
  // Si hay state, es Android (método de polling)
  if (state) {
    const authData = authCodes.get(state);
    if (authData) {
      authData.code = code;
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Autenticación exitosa</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #000;
                color: #fff;
              }
              .container {
                text-align: center;
                padding: 20px;
              }
              .success {
                font-size: 24px;
                margin-bottom: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅ Autenticación exitosa</div>
              <p>Puedes cerrar esta ventana y volver a la app.</p>
            </div>
            <script>
              // No intentar cerrar automáticamente, solo mostrar mensaje
            </script>
          </body>
        </html>
      `);
    } else {
      res.status(400).send('Sesión no encontrada o expirada');
    }
  } else {
    // iOS: redirigir directamente al deep link (método original)
    const mobileAppUrl = process.env.MOBILE_APP_URL || 'playingmovil://auth/callback';
    res.redirect(`${mobileAppUrl}?code=${encodeURIComponent(code)}`);
  }
});

// Ruta de callback para Spotify
app.get('/callback/spotify', (req, res) => {
  const { code, state } = req.query;
  console.log('Callback de Spotify recibido:', { code, state });
  
  if (code && state) {
    // Redirigir al frontend con los parámetros
    const frontendUrl = process.env.ADMIN_APP_URL || 'http://localhost:4200';
    res.redirect(`${frontendUrl}/callback/spotify?code=${code}&state=${state}`);
  } else {
    res.status(400).send('Parámetros de callback faltantes');
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
      },
      spotify: {
        'GET /api/spotify/auth': 'Obtener URL de autorización de Spotify',
        'POST /api/spotify/callback': 'Manejar callback de OAuth de Spotify',
        'GET /api/spotify/credentials/:userId': 'Obtener credenciales de Spotify del usuario',
        'POST /api/spotify/refresh/:userId': 'Refrescar token de acceso de Spotify',
        'GET /api/spotify/search/:userId': 'Buscar canciones en Spotify',
        'DELETE /api/spotify/disconnect/:userId': 'Desconectar cuenta de Spotify'
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
server.listen(PORT, '0.0.0.0', () => {
  const publicBaseUrl = process.env.SERVER_PUBLIC_URL || `http://0.0.0.0:${PORT}`;
  console.log(`Servidor escuchando en ${publicBaseUrl}`);
  console.log(`Admin app URL: ${process.env.ADMIN_APP_URL || 'http://localhost:4200'}`);
  console.log(`Mobile app URL: ${process.env.MOBILE_APP_URL || 'playingmovil://auth/callback'}`);
});

// Inicializar Socket Service
const SocketService = require('./services/socket.service');
const socketService = new SocketService(io);

// Exponer io y socketService a controladores
app.set('io', io);
app.set('socketService', socketService);

io.on('connection', (socket) => {
  socket.on('join_establecimiento', (establecimientoId) => {
    socket.join(`establecimiento:${establecimientoId}`);
    console.log(`✅ Cliente conectado a sala: establecimiento:${establecimientoId}`);
  });
  
  socket.on('join_user', (userId) => {
    socket.join(`user:${userId}`);
  });
  
  // Escuchar cuando un cliente emite actualización de cola
  socket.on('queue_updated', (data) => {
    const { establecimientoId } = data;
    console.log(`📋 Recibido queue_updated para establecimiento ${establecimientoId}, retransmitiendo...`);
    socketService.emitQueueUpdate(establecimientoId);
  });
  
  socket.on('disconnect', () => {
    // Cliente desconectado
  });
});

