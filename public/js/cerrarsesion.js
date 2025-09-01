// cerrarSesion.js

function cerrarSesion() {
  Swal.fire({
    title: "¿Deseas cerrar sesión?",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí, salir",
    cancelButtonText: "Cancelar"
  }).then((result) => {
    if (result.isConfirmed) {
      // 1. Llama al endpoint del backend para que invalide la cookie del token
      fetch('/api/auth/logout', { method: 'POST' })
        .then(response => {
          if (!response.ok) {
            throw new Error('No se pudo cerrar la sesión en el servidor.');
          }
          // 2. Limpia el localStorage del cliente
          localStorage.removeItem('usuario'); // ¡Importante!
          localStorage.removeItem('token'); // Por si acaso
          
          // 3. Marca que se mostró el logout (opcional)
          localStorage.setItem("showLogoutModal", "1");
          
          // 4. Redirige al inicio
          window.location.href = "/";
        })
        .catch(error => {
          console.error('Error al cerrar sesión:', error);
          Swal.fire('Error', 'No se pudo cerrar la sesión. Intenta de nuevo.', 'error');
        });
    }
  });
}

// Espera a que cargue el DOM y agrega el evento a todos los elementos con clase "logout-icon"
document.addEventListener("DOMContentLoaded", () => {
  const logoutButtons = document.querySelectorAll(".logout-icon");
  logoutButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); // Por si alguno es <a>
      cerrarSesion();
    });
  });
});
