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
      // En lugar de redirigir aquí, adjuntamos los errores a la petición
      // para que el controlador decida qué hacer.
      req.validationErrors = errors.array();
    }
    next();
  }
];

// ===================
// VALIDACIÓN DE LOGIN
// ===================
// CORRECCIÓN: Definir como constante en lugar de exportar directamente
const validateLogin = [
  check('email', 'El email es obligatorio').isEmail(),
  check('password', 'La contraseña debe tener al menos 6 caracteres').isLength({ min: 6 })
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
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Una sola exportación para todos los validadores
module.exports = {
  validateRegister,
  validateLogin,
  validateDeleteAcc
};

// Para depuración (opcional)
console.log('validateLogin is array:', Array.isArray(validateLogin));
console.log('validateRegister is array:', Array.isArray(validateRegister));