/**
 * Controlador para SweetAlert2
 * Proporciona funciones de ayuda para mostrar alertas y notificaciones
 */

// Verificar que SweetAlert2 esté disponible
if (typeof Swal === 'undefined') {
  console.error('SweetAlert2 no está disponible. Asegúrate de incluir la biblioteca antes de este script.');
}

/**
 * Muestra un mensaje de error
 * @param {string} message - El mensaje a mostrar
 */
function showError(message) {
  Swal.fire({
    icon: 'error',
    title: '¡Atención!',
    text: message,
    confirmButtonText: 'Entendido',
    confirmButtonColor: '#d33',
    background: '#fff',
    color: '#333'
  });
}

/**
 * Muestra un mensaje de éxito
 * @param {string} mensaje - El mensaje a mostrar
 * @param {string} titulo - Título opcional (por defecto: '¡Éxito!')
 */
function mostrarExito(mensaje, titulo = '¡Éxito!') {
  Swal.fire({
    icon: 'success',
    title: titulo,
    text: mensaje,
    confirmButtonColor: '#1a9ad7',
    timer: 3000
  });
}

/**
 * Muestra un mensaje de advertencia
 * @param {string} mensaje - El mensaje de advertencia
 * @param {string} titulo - Título opcional (por defecto: '¡Atención!')
 */
function mostrarAdvertencia(mensaje, titulo = '¡Atención!') {
  Swal.fire({
    icon: 'warning',
    title: titulo,
    text: mensaje,
    confirmButtonColor: '#f8bb86'
  });
}

/**
 * Muestra una confirmación con botones de aceptar/cancelar
 * @param {string} mensaje - El mensaje de confirmación
 * @param {string} titulo - Título opcional (por defecto: 'Confirmar')
 * @param {Function} callback - Función a ejecutar si el usuario confirma
 */
function confirmar(mensaje, titulo = 'Confirmar', callback) {
  Swal.fire({
    icon: 'question',
    title: titulo,
    text: mensaje,
    showCancelButton: true,
    confirmButtonText: 'Aceptar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#1a9ad7',
    cancelButtonColor: '#d33'
  }).then((result) => {
    if (result.isConfirmed && typeof callback === 'function') {
      callback();
    }
  });
}

/**
 * Muestra una notificación tipo toast (pequeña, desaparece automáticamente)
 * @param {string} mensaje - El mensaje a mostrar
 * @param {string} tipo - Tipo de notificación: 'success', 'error', 'warning', 'info'
 */
function mostrarToast(mensaje, tipo = 'success') {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
  });
  
  Toast.fire({
    icon: tipo,
    title: mensaje
  });
}

/**
 * Muestra un mensaje con resaltado y desvanecimiento similar a un registro nuevo
 * @param {string} mensaje - El mensaje a mostrar
 */
function mostrarResaltado(mensaje) {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top',
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
    background: 'rgba(252, 248, 227, 0.95)',
    color: '#333'
  });
  
  Toast.fire({
    title: mensaje
  });
}