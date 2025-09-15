const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

// IMPORTACIONES
const userRepo = require('../repositories/userRepositoryPrisma');
const { setFlashMessage } = require('../utils/flashMessage');
// const { sendRecoveryEmail } = require('../emailSender'); // Comentado si no existe
// const { createOrUpdateJob } = require('../utils/jobManager'); // Comentado si no existe

// Destructuring del repositorio
const {
  createResetCode,
  findValidResetCode,
  deleteResetCodeById,
  saveMood,
  findMoodByUserAndDate,
  getMoodsByUser
} = userRepo;

// LOGIN - Función principal
exports.login = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    console.log('Intento de login para:', email);
    
    // Buscar usuario por email
    const user = await userRepo.findByEmail(email);
    if (!user) {
      console.log('Usuario no encontrado:', email);
      return res.status(401).json({
        error: 'Usuario o contraseña incorrectos'
      });
    }

    // Verificar si la cuenta está activa
    if (!user.activo) {
      console.log('Cuenta desactivada:', email);
      return res.status(403).json({
        error: 'Tu cuenta está desactivada. Contacta a un administrador.'
      });
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Contraseña incorrecta para:', email);
      return res.status(401).json({
        error: 'Usuario o contraseña incorrectos'
      });
    }

    console.log('Login exitoso para:', email);

    // Crear token JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        userName: user.userName,
        nombre: user.nombre,
        rol: user.rol
      },
      process.env.JWT_SECRET || 'supersecret',
      { expiresIn: '1h' }
    );

    // Establecer cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 1000,
    });

    // Determinar redirección según rol
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
        redirectTo = '/historial';
        break;
      case 'UA':
        redirectTo = '/almacen';
        break;
      case 'UReg':
        redirectTo = '/seleccionlote';
        break;
      default:
        if (rolesSeleccionLote.includes(user.rol)) {
          redirectTo = '/seleccionlote';
        } else {
          return res.status(403).json({ 
            error: 'Rol no autorizado'
          });
        }
    }

    // Respuesta exitosa
    return res.status(200).json({
      success: true,
      message: 'Inicio de sesión exitoso',
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
    console.error('Error en login:', err);
    return res.status(500).json({ 
      error: 'Error del servidor. Intenta más tarde.' 
    });
  }
};

// REGISTRO
exports.registrar = async (req, res) => {
  try {
    const { nombre, userName, email, password, rol } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await userRepo.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        error: 'El correo electrónico ya está registrado'
      });
    }

    // Verificar si el userName ya existe
    const existingUserName = await userRepo.findByUserName(userName);
    if (existingUserName) {
      return res.status(400).json({
        error: 'El nombre de usuario ya está en uso'
      });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const newUser = await userRepo.create({
      nombre,
      userName,
      email,
      password: hashedPassword,
      rol: rol || 'UR',
      activo: true
    });

    return res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser.id,
        nombre: newUser.nombre,
        userName: newUser.userName,
        email: newUser.email,
        rol: newUser.rol
      }
    });

  } catch (err) {
    console.error('Error en registro:', err);
    return res.status(500).json({
      error: 'Error del servidor. Intenta más tarde.'
    });
  }
};

// LOGOUT
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ 
    success: true,
    message: 'Sesión cerrada exitosamente' 
  });
};

// RECUPERAR CONTRASEÑA
exports.recoverPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await userRepo.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        error: 'No se encontró una cuenta con ese correo electrónico'
      });
    }

    // Aquí iría la lógica para enviar email
    // const resetCode = uuidv4();
    // await createResetCode(user.id, resetCode);
    // await sendRecoveryEmail(email, resetCode);

    return res.status(200).json({
      success: true,
      message: 'Se ha enviado un código de recuperación a tu correo'
    });

  } catch (err) {
    console.error('Error en recuperación:', err);
    return res.status(500).json({
      error: 'Error del servidor. Intenta más tarde.'
    });
  }
};

// RESETEAR CONTRASEÑA
exports.resetPassword = async (req, res) => {
  try {
    const { resetCode, newPassword } = req.body;

    // Aquí iría la lógica para resetear
    // const resetRecord = await findValidResetCode(resetCode);
    // if (!resetRecord) {
    //   return res.status(400).json({
    //     error: 'Código de recuperación inválido o expirado'
    //   });
    // }

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });

  } catch (err) {
    console.error('Error en reset password:', err);
    return res.status(500).json({
      error: 'Error del servidor. Intenta más tarde.'
    });
  }
};

// MIDDLEWARE DE AUTENTICACIÓN
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

// MIDDLEWARE DE ROLES
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

// DEBUG
console.log('=== DEBUG AUTH CONTROLLER ===');
console.log('login:', typeof exports.login);
console.log('registrar:', typeof exports.registrar);
console.log('logout:', typeof exports.logout);
console.log('recoverPassword:', typeof exports.recoverPassword);
console.log('resetPassword:', typeof exports.resetPassword);
console.log('verificarAuth:', typeof exports.verificarAuth);
console.log('verificarRol:', typeof exports.verificarRol);
console.log('============================');