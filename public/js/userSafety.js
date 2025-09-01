/**
 * Script para garantizar un acceso seguro a los datos de usuario en el cliente.
 * Debe incluirse en el <head> de las páginas antes que otros scripts.
 */
(function() {
  // Asegurar que el objeto window.user siempre exista para evitar errores de 'undefined'.
  if (typeof window.user === 'undefined' || window.user === null) {
    window.user = { id: null, rol: '', nombre: '', userName: '', email: '' };

    // Intentar recuperar del localStorage si existe, como respaldo.
    try {
      const storedUser = localStorage.getItem('usuario');
      if (storedUser) {
        window.user = JSON.parse(storedUser);
      }
    } catch (e) {
      console.warn('No se pudieron recuperar los datos de usuario desde localStorage.');
    }
  }

  // Función de acceso seguro a las propiedades del objeto de usuario.
  window.getUserProperty = function(prop, defaultValue = '') {
    if (!window.user || typeof window.user !== 'object') return defaultValue;
    return window.user[prop] !== undefined ? window.user[prop] : defaultValue;
  };
})();

