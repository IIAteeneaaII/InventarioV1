const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

// IMPORTACIONES FALTANTES - AÑADIDAS
const userRepo = require('../repositories/userRepositoryPrisma');
const { setFlashMessage } = require('../utils/flashMessage');
const redis = require('../redisClient');
const { sendRecoveryEmail } = require('../emailSender');
const { createOrUpdateJob } = require('../utils/jobManager');

// Destrucutrando funciones del repositorio si las necesitas
const {
  createResetCode,
  findValidResetCode,
  deleteResetCodeById,
  saveMood,
  findMoodByUserAndDate,
  getMoodsByUser
} = userRepo;

// LOGIN - Versión robusta y con logs
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await userRepo.findByEmail(email);
    if (!user) {
      setFlashMessage(res, 'Correo o contraseña incorrectos', 'error');
      return res.redirect('/');
    }

    // AÑADIR ESTA VERIFICACIÓN
    if (!user.activo) {
      // Usamos JSON porque el login es una API que responde al frontend
      return res.status(403).json({
        message: 'Tu cuenta está desactivada. Contacta a un administrador.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      setFlashMessage(res, 'Correo o contraseña incorrectos', 'error');
      return res.redirect('/');
    }

    // CAMBIO IMPORTANTE: Incluir nombre en el token JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        userName: user.userName,
        nombre: user.nombre, // Añadido nombre
        rol: user.rol
      },
      process.env.JWT_SECRET || 'supersecret',
      { expiresIn: '1h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      maxAge: 60 * 60 * 1000,
    });

    setFlashMessage(res, '¡Inicio de sesión éxitoso.', 'success');
    
    // Redirección según rol
    const rolesSeleccionLote = ['UReg', 'UTI', 'UR', 'UE', 'UEN'];
    let redirectTo;
    switch (user.rol) {
      case 'UAI':
        redirectTo = '/adminventario';
        break;
      case 'UC':
        redirectTo = '/cosmetica';
        break;
      case 'UV':
        redirectTo = '/historial'; // Vista limitada para el visualizador
        break;
      case 'UA':
        redirectTo = '/almacen'; // Nueva vista de dashboard para Almacén
        break;
      case 'UReg':
        redirectTo = '/seleccionlote';
        break;
      default:
        if (rolesSeleccionLote.includes(user.rol)) {
          redirectTo = '/seleccionlote'; // Sin guión, como está en viewRoutes
        } else {
          return res.status(403).json({ 
            error: 'Rol no autorizado',
            user: null 
          });
        }
    }

    // Devolver datos de usuario junto con redirectTo
    return res.status(200).json({
      redirectTo: redirectTo,
      user: {
        id: user.id,
        email: user.email,
        userName: user.userName,
        nombre: user.nombre,
        rol: user.rol
      }
    });

  } catch (err) {
    console.error(err);
    setFlashMessage(res, 'Hubo un error en el servidor. Intenta más tarde', 'error');
    return res.status(500).json({ error: 'Error del servidor' });
  }
};

// Implementaciones de los otros métodos (usa los existentes)
exports.registrar = async (req, res) => { /* Tu implementación existente */ };
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ message: 'Sesión cerrada exitosamente' });
};
exports.recoverPassword = async (req, res) => { /* Tu implementación existente */ };
exports.resetPassword = async (req, res) => { /* Tu implementación existente */ };

// Versión limpia del middleware verificarAuth
exports.verificarAuth = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.redirect('/');
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret');
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Error al verificar token:', err.message);
    res.clearCookie('token');
    return res.redirect('/');
  }
};

// Versión limpia del middleware verificarRol
exports.verificarRol = (roles) => (req, res, next) => {
  if (!req.user) {
    return res.redirect('/');
  }
  if (Array.isArray(roles) && roles.includes(req.user.rol)) {
    next();
  } else {
    return res.redirect('/');
  }
};

// CORRECCIÓN: Eliminar verificación de validateLogin que no pertenece a este archivo
console.log('login:', typeof exports.login);
console.log('registrar:', typeof exports.registrar);