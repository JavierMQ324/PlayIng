const WebSocket = require('ws');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.rooms = new Map();
  }

  // Inicializar el servidor WebSocket
  inicializar(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:4200",
        credentials: true
      }
    });

    this.wss.on('connection', (ws, req) => {
      console.log('Nueva conexión WebSocket establecida');
      
      // Generar ID único para el cliente
      const clientId = this.generarIdCliente();
      this.clients.set(clientId, {
        ws: ws,
        id: clientId,
        rooms: new Set(),
        usuarioId: null,
        conectado: true
      });

      // Enviar ID del cliente
      this.enviarMensaje(ws, 'connection_established', { clientId });

      // Manejar mensajes del cliente
      ws.on('message', (data) => {
        try {
          const mensaje = JSON.parse(data);
          this.manejarMensaje(clientId, mensaje);
        } catch (error) {
          console.error('Error al procesar mensaje WebSocket:', error);
          this.enviarError(ws, 'Mensaje inválido');
        }
      });

      // Manejar desconexión
      ws.on('close', () => {
        console.log('Cliente WebSocket desconectado:', clientId);
        this.manejarDesconexion(clientId);
      });

      // Manejar errores
      ws.on('error', (error) => {
        console.error('Error en WebSocket:', error);
        this.manejarDesconexion(clientId);
      });
    });

    console.log('Servidor WebSocket inicializado en /ws');
  }

  // Generar ID único para el cliente
  generarIdCliente() {
    return 'client_' + Math.random().toString(36).substr(2, 9);
  }

  // Manejar mensajes del cliente
  manejarMensaje(clientId, mensaje) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    const { tipo, datos } = mensaje;

    switch (tipo) {
      case 'join_room':
        this.unirClienteASala(clientId, datos.sala);
        break;
      
      case 'leave_room':
        this.sacarClienteDeSala(clientId, datos.sala);
        break;
      
      case 'authenticate':
        this.autenticarCliente(clientId, datos.usuarioId);
        break;
      
      case 'music_play':
        this.manejarReproduccionMusica(clientId, datos);
        break;
      
      case 'music_pause':
        this.manejarPausaMusica(clientId, datos);
        break;
      
      case 'music_skip':
        this.manejarSaltarMusica(clientId, datos);
        break;
      
      case 'playlist_update':
        this.manejarActualizacionPlaylist(clientId, datos);
        break;
      
      default:
        console.log('Tipo de mensaje no reconocido:', tipo);
    }
  }

  // Unir cliente a una sala
  unirClienteASala(clientId, sala) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    cliente.rooms.add(sala);
    
    if (!this.rooms.has(sala)) {
      this.rooms.set(sala, new Set());
    }
    this.rooms.get(sala).add(clientId);

    this.enviarMensaje(cliente.ws, 'joined_room', { sala });
    console.log(`Cliente ${clientId} se unió a la sala ${sala}`);
  }

  // Sacar cliente de una sala
  sacarClienteDeSala(clientId, sala) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    cliente.rooms.delete(sala);
    
    if (this.rooms.has(sala)) {
      this.rooms.get(sala).delete(clientId);
    }

    this.enviarMensaje(cliente.ws, 'left_room', { sala });
    console.log(`Cliente ${clientId} salió de la sala ${sala}`);
  }

  // Autenticar cliente
  autenticarCliente(clientId, usuarioId) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    cliente.usuarioId = usuarioId;
    this.enviarMensaje(cliente.ws, 'authenticated', { usuarioId });
    console.log(`Cliente ${clientId} autenticado como usuario ${usuarioId}`);
  }

  // Manejar reproducción de música
  manejarReproduccionMusica(clientId, datos) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    // Transmitir a todos los clientes en las salas del cliente
    cliente.rooms.forEach(sala => {
      this.transmitirASala(sala, 'music_play', {
        usuarioId: cliente.usuarioId,
        cancion: datos.cancion,
        timestamp: Date.now()
      });
    });
  }

  // Manejar pausa de música
  manejarPausaMusica(clientId, datos) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    cliente.rooms.forEach(sala => {
      this.transmitirASala(sala, 'music_pause', {
        usuarioId: cliente.usuarioId,
        timestamp: Date.now()
      });
    });
  }

  // Manejar saltar música
  manejarSaltarMusica(clientId, datos) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    cliente.rooms.forEach(sala => {
      this.transmitirASala(sala, 'music_skip', {
        usuarioId: cliente.usuarioId,
        cancion: datos.cancion,
        timestamp: Date.now()
      });
    });
  }

  // Manejar actualización de playlist
  manejarActualizacionPlaylist(clientId, datos) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    cliente.rooms.forEach(sala => {
      this.transmitirASala(sala, 'playlist_updated', {
        usuarioId: cliente.usuarioId,
        playlist: datos.playlist,
        timestamp: Date.now()
      });
    });
  }

  // Transmitir mensaje a una sala específica
  transmitirASala(sala, tipo, datos) {
    if (!this.rooms.has(sala)) return;

    const mensaje = {
      tipo,
      datos,
      timestamp: Date.now()
    };

    this.rooms.get(sala).forEach(clientId => {
      const cliente = this.clients.get(clientId);
      if (cliente && cliente.conectado) {
        this.enviarMensaje(cliente.ws, tipo, datos);
      }
    });
  }

  // Transmitir mensaje a todos los clientes
  transmitirATodos(tipo, datos) {
    const mensaje = {
      tipo,
      datos,
      timestamp: Date.now()
    };

    this.clients.forEach((cliente, clientId) => {
      if (cliente.conectado) {
        this.enviarMensaje(cliente.ws, tipo, datos);
      }
    });
  }

  // Transmitir mensaje a un cliente específico
  transmitirACliente(clientId, tipo, datos) {
    const cliente = this.clients.get(clientId);
    if (cliente && cliente.conectado) {
      this.enviarMensaje(cliente.ws, tipo, datos);
    }
  }

  // Transmitir mensaje a usuarios específicos
  transmitirAUsuarios(usuarioIds, tipo, datos) {
    this.clients.forEach((cliente, clientId) => {
      if (cliente.conectado && usuarioIds.includes(cliente.usuarioId)) {
        this.enviarMensaje(cliente.ws, tipo, datos);
      }
    });
  }

  // Enviar mensaje a un WebSocket
  enviarMensaje(ws, tipo, datos) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ tipo, datos }));
    }
  }

  // Enviar error a un WebSocket
  enviarError(ws, mensaje) {
    this.enviarMensaje(ws, 'error', { mensaje });
  }

  // Manejar desconexión de cliente
  manejarDesconexion(clientId) {
    const cliente = this.clients.get(clientId);
    if (!cliente) return;

    cliente.conectado = false;
    
    // Remover de todas las salas
    cliente.rooms.forEach(sala => {
      if (this.rooms.has(sala)) {
        this.rooms.get(sala).delete(clientId);
      }
    });

    // Notificar a otros clientes en las salas
    cliente.rooms.forEach(sala => {
      this.transmitirASala(sala, 'user_disconnected', {
        usuarioId: cliente.usuarioId,
        timestamp: Date.now()
      });
    });

    // Limpiar después de un tiempo
    setTimeout(() => {
      this.clients.delete(clientId);
    }, 5000);
  }

  // Broadcast general (método estático)
  static broadcast(tipo, datos) {
    if (global.websocketService) {
      global.websocketService.transmitirATodos(tipo, datos);
    }
  }

  // Obtener estadísticas
  obtenerEstadisticas() {
    return {
      clientesConectados: this.clients.size,
      salasActivas: this.rooms.size,
      clientesPorSala: Array.from(this.rooms.entries()).map(([sala, clientes]) => ({
        sala,
        clientes: clientes.size
      }))
    };
  }
}

module.exports = new WebSocketService();
