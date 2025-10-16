const db = require('../db');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verificar token de Google
const verifyGoogleToken = async (token) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  } catch (error) {
    throw new Error('Token de Google inválido');
  }
};

// Crear o actualizar usuario
const createOrUpdateUser = async (googleUser, appType) => {
  const { sub: google_id, name, email } = googleUser;
  
  // Determinar el rol basado en la aplicación
  const roll = appType === 'admin' ? 'admin' : 'cliente';
  
  return new Promise((resolve, reject) => {
    // Verificar si el usuario ya existe
    const checkQuery = 'SELECT * FROM usuarios WHERE google_id = ? OR email = ?';
    db.query(checkQuery, [google_id, email], (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      if (results.length > 0) {
        // Usuario existe, actualizar información
        const updateQuery = `
          UPDATE usuarios 
          SET google_id = ?, nombre = ?, roll = ?, mesa_id_activa = ?
          WHERE id_user = ?
        `;
        const mesaId = roll === 'cliente' ? null : results[0].mesa_id_activa;
        
        db.query(updateQuery, [google_id, name, roll, mesaId, results[0].id_user], (err, updateResult) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({ ...results[0], google_id, nombre: name, roll, mesa_id_activa: mesaId });
        });
      } else {
        // Usuario nuevo, crear
        const insertQuery = `
          INSERT INTO usuarios (google_id, nombre, email, roll, mesa_id_activa) 
          VALUES (?, ?, ?, ?, ?)
        `;
        const mesaId = roll === 'cliente' ? null : null;
        
        db.query(insertQuery, [google_id, name, email, roll, mesaId], (err, insertResult) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            id_user: insertResult.insertId,
            google_id,
            nombre: name,
            email,
            roll,
            mesa_id_activa: mesaId,
            creada_en: new Date()
          });
        });
      }
    });
  });
};

// Generar JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id_user, 
      email: user.email, 
      roll: user.roll,
      mesa_id_activa: user.mesa_id_activa
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Intercambiar código por tokens
const exchangeCodeForTokens = async (code, redirectUri) => {
  try {
    console.log('Intercambiando código por tokens:', code);
    console.log('Redirect URI:', redirectUri);
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    const data = await response.json();
    console.log('Respuesta de Google:', data);
    return data;
  } catch (error) {
    console.error('Error intercambiando código por tokens:', error);
    throw error;
  }
};

// Autenticación con Google para Admin
const googleAuthAdmin = async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log('Admin auth request:', { code });
    
    if (!code) {
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    // Intercambiar código por tokens
    const tokenResponse = await exchangeCodeForTokens(code, process.env.ADMIN_APP_URL || 'http://localhost:4200');
    
    if (!tokenResponse.id_token) {
      console.error('No se pudo obtener id_token:', tokenResponse);
      return res.status(400).json({ error: 'No se pudo obtener el token de ID' });
    }

    const googleUser = await verifyGoogleToken(tokenResponse.id_token);
    const user = await createOrUpdateUser(googleUser, 'admin');
    const jwtToken = generateToken(user);

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user.id_user,
        nombre: user.nombre,
        email: user.email,
        roll: user.roll
      }
    });
  } catch (error) {
    console.error('Error en autenticación admin:', error);
    res.status(401).json({ error: error.message });
  }
};

// Autenticación con Google para Cliente
const googleAuthCliente = async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log('Cliente auth request:', { code });
    
    if (!code) {
      return res.status(400).json({ error: 'Código de autorización requerido' });
    }

    // Intercambiar código por tokens - usar callback
    const tokenResponse = await exchangeCodeForTokens(code, 'http://localhost:3000/auth/callback');
    
    if (!tokenResponse.id_token) {
      console.error('No se pudo obtener id_token:', tokenResponse);
      return res.status(400).json({ error: 'No se pudo obtener el token de ID' });
    }

    const googleUser = await verifyGoogleToken(tokenResponse.id_token);
    const user = await createOrUpdateUser(googleUser, 'cliente');
    const jwtToken = generateToken(user);

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user.id_user,
        nombre: user.nombre,
        email: user.email,
        roll: user.roll,
        mesa_id_activa: user.mesa_id_activa
      }
    });
  } catch (error) {
    console.error('Error en autenticación cliente:', error);
    res.status(401).json({ error: error.message });
  }
};

// Verificar token JWT
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// Obtener perfil del usuario autenticado
const getProfile = (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
};

// Obtener todos los usuarios (solo admin)
const getAllUsers = (req, res) => {
  if (req.user.roll !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  db.query('SELECT id_user, nombre, email, roll, mesa_id_activa, creada_en FROM usuarios', (err, results) => {
    if (err) {
      console.error('Error al obtener usuarios:', err);
      res.status(500).json({ error: 'Error al obtener usuarios' });
      return;
    }
    res.json({ success: true, users: results });
  });
};

module.exports = {
  googleAuthAdmin,
  googleAuthCliente,
  verifyToken,
  getProfile,
  getAllUsers
};
