const express = require('express');
const router = express.Router();

// ⚠️ Aquí definimos la función UpdateLog
const UpdateLog = async (req, res) => {
  try {
    console.log('Ejecutando UpdateLog con datos:', req.body);
    // Aquí podrías guardar en tu base de datos si usas Prisma o algo similar
    res.status(200).json({ message: 'Log actualizado correctamente' });
  } catch (error) {
    console.error('Error en UpdateLog:', error);
    res.status(500).json({ message: 'Error al actualizar log' });
  }
};

// Agrega tus rutas
router.post('/actualizarLogs', UpdateLog);

module.exports = router;
