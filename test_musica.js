#!/usr/bin/env node

/**
 * Script de prueba para el módulo de música
 * Ejecutar con: node test_musica.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/musica';

// Colores para la consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(method, endpoint, data = null, description = '') {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    
    log(`✅ ${description || `${method} ${endpoint}`}`, 'green');
    log(`   Status: ${response.status}`, 'blue');
    log(`   Success: ${response.data.success}`, 'blue');
    
    if (response.data.data && Array.isArray(response.data.data)) {
      log(`   Results: ${response.data.data.length} items`, 'blue');
    }
    
    return response.data;
  } catch (error) {
    log(`❌ ${description || `${method} ${endpoint}`}`, 'red');
    log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    return null;
  }
}

async function runTests() {
  log('🎵 Iniciando pruebas del módulo de música...', 'blue');
  log('', 'reset');
  
  // Test 1: Health check
  log('1. Verificando salud del módulo...', 'yellow');
  await testEndpoint('GET', '/health', null, 'Health check');
  log('', 'reset');
  
  // Test 2: Obtener géneros
  log('2. Obteniendo géneros musicales...', 'yellow');
  await testEndpoint('GET', '/generos', null, 'Obtener géneros');
  log('', 'reset');
  
  // Test 3: Buscar canciones
  log('3. Buscando canciones...', 'yellow');
  await testEndpoint('GET', '/canciones/buscar?q=queen&limit=5', null, 'Buscar canciones');
  log('', 'reset');
  
  // Test 4: Obtener canciones populares
  log('4. Obteniendo canciones populares...', 'yellow');
  await testEndpoint('GET', '/canciones/populares?limit=5', null, 'Canciones populares');
  log('', 'reset');
  
  // Test 5: Obtener artistas
  log('5. Obteniendo artistas...', 'yellow');
  await testEndpoint('GET', '/artistas?limit=5', null, 'Obtener artistas');
  log('', 'reset');
  
  // Test 6: Obtener recomendaciones
  log('6. Obteniendo recomendaciones...', 'yellow');
  await testEndpoint('GET', '/recomendaciones?generos=rock&limit=5', null, 'Obtener recomendaciones');
  log('', 'reset');
  
  // Test 7: Crear playlist (simulado)
  log('7. Creando playlist...', 'yellow');
  const playlistData = {
    nombre: 'Test Playlist',
    descripcion: 'Playlist de prueba',
    esPublica: false
  };
  await testEndpoint('POST', '/usuarios/test-user/playlists', playlistData, 'Crear playlist');
  log('', 'reset');
  
  // Test 8: Validaciones de error
  log('8. Probando validaciones de error...', 'yellow');
  
  // Búsqueda sin parámetros
  await testEndpoint('GET', '/canciones/buscar', null, 'Búsqueda sin parámetros (debe fallar)');
  
  // Límite inválido
  await testEndpoint('GET', '/canciones?limit=200', null, 'Límite inválido (debe fallar)');
  
  // ID de Spotify inválido
  await testEndpoint('GET', '/artistas/invalid-id', null, 'ID inválido (debe fallar)');
  
  log('', 'reset');
  
  log('🎉 Pruebas completadas!', 'green');
  log('', 'reset');
  
  log('📝 Notas:', 'yellow');
  log('- Algunas pruebas pueden fallar si no tienes configuradas las credenciales de Spotify', 'yellow');
  log('- Configura SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en tu archivo .env', 'yellow');
  log('- El servidor debe estar ejecutándose en http://localhost:3000', 'yellow');
}

// Verificar si el servidor está ejecutándose
async function checkServer() {
  try {
    const response = await axios.get('http://localhost:3000/health');
    if (response.data.status === 'OK') {
      log('✅ Servidor está ejecutándose', 'green');
      return true;
    }
  } catch (error) {
    log('❌ Servidor no está ejecutándose', 'red');
    log('   Ejecuta: npm start o npm run dev', 'red');
    return false;
  }
}

// Función principal
async function main() {
  log('🔍 Verificando servidor...', 'blue');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  log('', 'reset');
  await runTests();
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testEndpoint, runTests };
