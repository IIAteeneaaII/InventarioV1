/**
 * Middleware para prevenir el almacenamiento en caché de respuestas.
 * Esto asegura que el navegador siempre pida una versión fresca de la página,
 * evitando que se muestren páginas protegidas después de cerrar sesión.
 */
module.exports = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};