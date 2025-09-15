// authorutas

const express = require('express');
const router = express.Router();

// Importar controladores
const {
  registrar,
  login,
  logout,
  recoverPassword,
  resetPassword,
  verificarAuth,
  verificarRol
} = require('../controllers/authController');

// Importar validaciones
const { 
  validateRegister, 
  validateLogin,
  validateRecoverPassword,
  validateResetPassword
} = require('../middlewares/validateAuth');

// DEBUG: Verificar que las funciones existan
console.log('=== DEBUG AUTH ROUTES ===');
console.log('login function:', typeof login);
console.log('registrar function:', typeof registrar);
console.log('logout function:', typeof logout);
console.log('recoverPassword function:', typeof recoverPassword);
console.log('resetPassword function:', typeof resetPassword);
console.log('validateLogin is array:', Array.isArray(validateLogin));
console.log('validateRegister is array:', Array.isArray(validateRegister));
console.log('========================');

// ===================
// RUTAS PÚBLICAS
// ===================

// Login - LÍNEA 28 APROXIMADAMENTE
router.post('/login', validateLogin, login);

// Registro
router.post('/registro', validateRegister, registrar);

// Recuperar contraseña
router.post('/recover-password', recoverPassword);

// Resetear contraseña  
router.post('/reset-password', resetPassword);

// ===================
// RUTAS PROTEGIDAS
// ===================

// Logout
router.post('/logout', logout);

module.exports = router;