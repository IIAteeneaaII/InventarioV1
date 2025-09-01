const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verificarAuth, verificarRol } = require('../controllers/authController');

// Registrar usuario (solo admin)
router.post('/usuarios', adminController.register);

// Listar usuarios
router.get('/usuarios', adminController.listarUsuarios);

// Actualizar usuario
router.put('/usuarios/:id', adminController.actualizarUsuario);

// Eliminar usuario (hard)
router.delete('/usuarios/:id', adminController.eliminarUsuario);

// Soft delete
router.post('/usuarios/:id/eliminar', adminController.eliminarUsuarioSoft);

// Activar/desactivar usuario

router.patch('/usuarios/:id/toggle', adminController.toggleEstadoUsuario);

// Ver logs
router.get('/logs', adminController.verLogs);

module.exports = router;
