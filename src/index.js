// index.js
const express = require('express');
const app = express();
const db = require('./db'); 

app.use(express.json());

// Ruta principal
app.get('/', (req, res) => {
  res.send('Servidor y base de datos funcionando correctamente ');
});

// Ejemplo: obtener todos los registros de una tabla
app.get('/usuarios', (req, res) => {
  db.query('SELECT * FROM usuarios', (err, results) => {
    if (err) {
      console.error('Error al hacer la consulta:', err);
      res.status(500).json({ error: 'Error al obtener datos' });
      return;
    }
    res.json(results);
  });
});

// Puerto
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

