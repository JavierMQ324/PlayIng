const db = require('../db');

class ConfiguracionController {
  // Obtener configuración de límites de un establecimiento
  static getConfiguracion(req, res) {
    const { establecimientoId } = req.query;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId es requerido'
      });
    }

    db.query(
      'SELECT limite_reproduccion_cancion, limite_peticiones_usuario_hora FROM establecimientos WHERE id_establecimiento = ?',
      [establecimientoId],
      (err, results) => {
        if (err) {
          console.error('Error obteniendo configuración:', err);
          return res.status(500).json({
            success: false,
            error: 'Error al obtener configuración'
          });
        }

        if (results.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Establecimiento no encontrado'
          });
        }

        res.json({
          success: true,
          configuracion: {
            limiteReproduccionCancion: results[0].limite_reproduccion_cancion || 'sin_limite',
            limitePeticionesUsuarioHora: results[0].limite_peticiones_usuario_hora || 0
          }
        });
      }
    );
  }

  // Actualizar configuración de límites
  static updateConfiguracion(req, res) {
    const { establecimientoId, limiteReproduccionCancion, limitePeticionesUsuarioHora } = req.body;

    if (!establecimientoId) {
      return res.status(400).json({
        success: false,
        error: 'establecimientoId es requerido'
      });
    }

    // Validar limiteReproduccionCancion
    const valoresValidos = ['1_hora', '2_horas', 'sin_limite'];
    if (limiteReproduccionCancion && !valoresValidos.includes(limiteReproduccionCancion)) {
      return res.status(400).json({
        success: false,
        error: 'limiteReproduccionCancion debe ser: 1_hora, 2_horas o sin_limite'
      });
    }

    // Validar limitePeticionesUsuarioHora
    if (limitePeticionesUsuarioHora !== undefined && (isNaN(limitePeticionesUsuarioHora) || limitePeticionesUsuarioHora < 0)) {
      return res.status(400).json({
        success: false,
        error: 'limitePeticionesUsuarioHora debe ser un número mayor o igual a 0'
      });
    }

    const updates = [];
    const values = [];

    if (limiteReproduccionCancion) {
      updates.push('limite_reproduccion_cancion = ?');
      values.push(limiteReproduccionCancion);
    }

    if (limitePeticionesUsuarioHora !== undefined) {
      updates.push('limite_peticiones_usuario_hora = ?');
      values.push(limitePeticionesUsuarioHora);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay datos para actualizar'
      });
    }

    values.push(establecimientoId);

    db.query(
      `UPDATE establecimientos SET ${updates.join(', ')} WHERE id_establecimiento = ?`,
      values,
      (err, result) => {
        if (err) {
          console.error('Error actualizando configuración:', err);
          return res.status(500).json({
            success: false,
            error: 'Error al actualizar configuración'
          });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            error: 'Establecimiento no encontrado'
          });
        }

        res.json({
          success: true,
          message: 'Configuración actualizada exitosamente'
        });
      }
    );
  }
}

module.exports = ConfiguracionController;




