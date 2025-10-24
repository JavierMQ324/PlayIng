#!/usr/bin/env node

/**
 * Script simple para agregar datos de ejemplo
 */

const mysql = require('mysql2');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'playing',
  port: process.env.DB_PORT || 3306
};

async function addSampleData() {
  let connection;
  
  try {
    console.log('🎵 Agregando datos de ejemplo...');
    
    connection = mysql.createConnection(dbConfig);
    
    // Verificar si ya hay canciones
    const [rows] = await connection.promise().execute('SELECT COUNT(*) as count FROM canciones');
    const songCount = rows[0].count;
    
    if (songCount > 0) {
      console.log(`ℹ️  Ya hay ${songCount} canciones en la base de datos`);
      return;
    }
    
    // Agregar algunas canciones de ejemplo
    const insertQuery = `
      INSERT INTO canciones (spotify_id, titulo, artista, album, duracion) VALUES 
      ('song1', 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera', 355),
      ('song2', 'Hotel California', 'Eagles', 'Hotel California', 391),
      ('song3', 'Imagine', 'John Lennon', 'Imagine', 183),
      ('song4', 'Stairway to Heaven', 'Led Zeppelin', 'Led Zeppelin IV', 482),
      ('song5', 'Sweet Child O Mine', 'Guns N Roses', 'Appetite for Destruction', 356)
    `;
    
    await connection.promise().execute(insertQuery);
    
    console.log(`✅ 5 canciones agregadas exitosamente`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      connection.end();
    }
  }
}

addSampleData();
