document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formEditarUsuario');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('usuarioId').value;
    const nombre = document.getElementById('nombre').value;
    const userName = document.getElementById('userName').value;
    const email = document.getElementById('email').value;
    const rol = document.getElementById('rol').value;
    const nuevaContrasena = document.getElementById('nuevaContrasena').value;
    const confirmarContrasena = document.getElementById('confirmarContrasena').value;

    // Validación básica de contraseña: si se escribe, debe coincidir
    if (nuevaContrasena || confirmarContrasena) {
      if (nuevaContrasena !== confirmarContrasena) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Las contraseñas no coinciden'
        });
        return;
      }
      if (nuevaContrasena.length < 8 || nuevaContrasena.length > 12) {
        Swal.fire({
          icon: 'error',
          title: 'Contraseña inválida',
          text: 'La contraseña debe tener entre 8 y 12 caracteres'
        });
        return;
      }
    }

    // Prepara el payload, solo manda la contraseña si no está vacía
    const payload = { nombre, userName, email, rol };
    if (nuevaContrasena) {
      payload.nuevaContrasena = nuevaContrasena;
    }

    try {
      const res = await fetch(`/admin/usuarios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await Swal.fire({
          icon: 'success',
          title: '¡Usuario editado correctamente!',
          confirmButtonText: 'Aceptar',
          timer: 1800
        });

        let result;
try {
  result = await res.json();
} catch {
  const text = await res.text();
  throw new Error('Respuesta inesperada del servidor: ' + text.slice(0, 120));
}

        window.location.href = '/admin/usuarios';
      } else {
        const error = await res.json();
        throw new Error(error.error || 'Error al actualizar');
      }
    } catch (error) {
      console.error('Error:', error.message);
      Swal.fire({
        icon: 'error',
        title: 'Error al editar usuario',
        text: error.message || 'Ocurrió un error inesperado'
      });
    }
  });
});
