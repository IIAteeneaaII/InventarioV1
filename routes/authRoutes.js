const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const {
  registrar,
  login,
  logout,
  recoverPassword,
  resetPassword,
  verificarAuth,
  verificarRol
} = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../middlewares/validateAuth');

// Público
router.post('/login', validateLogin, login);
router.post('/registro', validateRegister, registrar);
router.post('/recover-password', recoverPassword);
router.post('/reset-password', resetPassword);

// Logout
router.post('/logout', logout);

module.exports = router;
