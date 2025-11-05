const mysql = require('mysql2');
require('dotenv').config({ path: './src/.env' }); 

// Configuración del pool de conexiones usando variables de entorno
// El pool maneja automáticamente la reconexión y mantiene las conexiones vivas
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10, // Máximo de conexiones en el pool
  queueLimit: 0, // Sin límite en la cola de conexiones
  enableKeepAlive: true, // Mantener conexiones vivas
  keepAliveInitialDelay: 0, // Iniciar keep-alive inmediatamente
  reconnect: true, // Reconectar automáticamente
  // Configuración para evitar que las conexiones se cierren por inactividad
  acquireTimeout: 60000, // 60 segundos para obtener una conexión
  timeout: 60000, // 60 segundos de timeout
});

// Probar conexión inicial
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err);
    return;
  }
  console.log('✅ Pool de conexiones MySQL inicializado correctamente');
  connection.release(); // Liberar la conexión de prueba
});

// Manejar errores del pool
pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de MySQL:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('🔄 Intentando reconectar...');
  }
});

// Crear un wrapper que mantenga la compatibilidad con la API anterior
// pero use el pool internamente
const db = {
  query: (sql, params, callback) => {
    // Si no hay callback, retornar una Promise
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    if (callback) {
      // Usar callback
      pool.query(sql, params, (err, results, fields) => {
        if (err && err.code === 'PROTOCOL_CONNECTION_LOST') {
          console.log('⚠️ Conexión perdida, el pool se reconectará automáticamente');
        }
        callback(err, results, fields);
      });
    } else {
      // Retornar Promise
      return pool.promise().query(sql, params);
    }
  },
  
  // Exponer el pool para casos avanzados
  getPool: () => pool,
  
  // Método para obtener una conexión directamente si es necesario
  getConnection: (callback) => {
    pool.getConnection(callback);
  }
};

module.exports = db;

