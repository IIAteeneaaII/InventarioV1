const { body, validationResult, check } = require('express-validator');

// Dominios permitidos
const allowedDomains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'];
const domainRegex = new RegExp(`@(${allowedDomains.join('|').replace(/\./g, '\\.')})$`);

// =======================
// VALIDACIÓN DE REGISTRO
// =======================
const validateRegister = [
  //Validar nombre
  body('nombre')
  .notEmpty().withMessage('El nombre es obligatorio')
  .isLength({ min: 2 }).withMessage('El nombre debe tener al menos 2 caracteres'),

  // Validación de nombre de usuario
  body('userName')
    .notEmpty().withMessage('El nombre de usuario es obligatorio')
    .isLength({ min: 6, max: 20 }).withMessage('Debe tener entre 6 y 20 caracteres')
    .matches(/^[a-zA-Z0-9]+$/).withMessage('Solo se permiten letras y números'),

  // Validación de correo
  body('email')
    .isEmail().withMessage('Correo electrónico inválido')
    .matches(domainRegex).withMessage(`El correo debe ser de: ${allowedDomains.join(', ')}`),

  // Validación de contraseña
  body('password')
    .isLength({ min: 8, max: 12 }).withMessage('Debe tener entre 8 y 12 caracteres')
    .matches(/[a-z]/).withMessage('Debe contener una minúscula')
    .matches(/[A-Z]/).withMessage('Debe contener una mayúscula')
    .matches(/[0-9]/).withMessage('Debe contener un número')
    .isAlphanumeric().withMessage('Solo se permiten letras y números'),

  // Validación de confirmación de contraseña
  body('confirmarContrasena')
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Las contraseñas no coinciden'),

  // Validación de rol
  body('rol')
    .notEmpty().withMessage('Selecciona un rol válido'),

  // Validación final
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Para registro, devolvemos JSON con los errores específicos
      return res.status(400).json({
        error: 'Datos de registro inválidos',
        details: errors.array().map(err => err.msg)
      });
    }
    next();
  }
];

// ===================
// VALIDACIÓN DE LOGIN - CORREGIDA
// ===================
const validateLogin = [
  body('email')
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isEmail().withMessage('Ingresa un correo electrónico válido'),
  
  body('password')
    .notEmpty().withMessage('La contraseña es obligatoria')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),

  // Middleware de validación final para login
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Para login, mostramos un mensaje genérico por seguridad
      return res.status(400).json({
        error: 'Por favor, verifica que todos los campos estén completos y sean válidos'
      });
    }
    next();
  }
];

// ============================
// VALIDACIÓN DE ELIMINAR CUENTA
// ============================
const validateDeleteAcc = [
  body('email').notEmpty().withMessage('Email obligatorio'),
  body('password').notEmpty().withMessage('Contraseña obligatoria'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Datos requeridos faltantes',
        details: errors.array() 
      });
    }
    next();
  }
];

// ============================
// VALIDACIÓN DE RECUPERAR CONTRASEÑA
// ============================
const validateRecoverPassword = [
  body('email')
    .notEmpty().withMessage('El correo electrónico es obligatorio')
    .isEmail().withMessage('Ingresa un correo electrónico válido'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Por favor, ingresa un correo electrónico válido'
      });
    }
    next();
  }
];

// ============================
// VALIDACIÓN DE RESET CONTRASEÑA
// ============================
const validateResetPassword = [
  body('resetCode')
    .notEmpty().withMessage('El código de recuperación es obligatorio'),
  
  body('newPassword')
    .isLength({ min: 8, max: 12 }).withMessage('La contraseña debe tener entre 8 y 12 caracteres')
    .matches(/[a-z]/).withMessage('Debe contener al menos una minúscula')
    .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula')
    .matches(/[0-9]/).withMessage('Debe contener al menos un número')
    .isAlphanumeric().withMessage('Solo se permiten letras y números'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de reseteo inválidos',
        details: errors.array().map(err => err.msg)
      });
    }
    next();
  }
];

// Una sola exportación para todos los validadores
module.exports = {
  validateRegister,
  validateLogin,
  validateDeleteAcc,
  validateRecoverPassword,
  validateResetPassword
};

// Para depuración (opcional)
console.log('validateLogin is array:', Array.isArray(validateLogin));
console.log('validateRegister is array:', Array.isArray(validateRegister)); 