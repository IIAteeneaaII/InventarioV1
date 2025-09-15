// swalConfig.js - Versión para CDN
// Configuración global de SweetAlert2

// Verificar que SweetAlert2 esté disponible
if (typeof Swal !== 'undefined') {
  // Configurar los defaults globalmente
  Swal.mixin({
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    allowOutsideClick: false,
    customClass: {
      confirmButton: 'btn btn-success',
      cancelButton: 'btn btn-danger'
    }
  });

  // También crear una instancia reutilizable
  window.MySwal = Swal.mixin({
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    allowOutsideClick: false,
    customClass: {
      confirmButton: 'btn btn-success',
      cancelButton: 'btn btn-danger'
    }
  });
  
  console.log('✅ SweetAlert2 configurado correctamente');
} else {
  console.error('❌ SweetAlert2 no está disponible');
}