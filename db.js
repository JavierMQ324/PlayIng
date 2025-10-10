// db.js
const mysql = require('mysql2');

// Configuración de la conexión
const conexion = mysql.createConnection({
  host: 'localhost',        
  user: 'root',             
  password: '',             
  database: 'PlayIng'  
});

// Probar conexión
conexion.connect((err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err);
    return;
  }
  console.log('Conectado a la base de datos MySQL');
});

module.exports = conexion;
