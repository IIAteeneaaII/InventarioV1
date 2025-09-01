/**
 * Middleware para garantizar que datos de usuario estén disponibles en todas las vistas
 */
module.exports = (req, res, next) => {
  // Verificar si tenemos req.user (establecido por verificarAuth)
  if (req.user) {
    // Pasar los datos de usuario a res.locals para que estén disponibles en todas las vistas
    res.locals.user = {
      id: req.user.id,
      nombre: req.user.nombre || '',
      userName: req.user.userName || '',
      email: req.user.email || '',
      rol: req.user.rol || ''
    };
  } else {
    // Usuario no autenticado, valores por defecto
    res.locals.user = { id: null, rol: '', nombre: '', userName: '', email: '' };
  }

  next();
};