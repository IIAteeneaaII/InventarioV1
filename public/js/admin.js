
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.toggle-activo').forEach(toggle => {
    toggle.addEventListener('change', function(e) {
      e.preventDefault(); // Evita cambiar el switch visualmente de inmediato
      const self = this;
      const userId = self.dataset.id;
      const willActivate = self.checked;

      Swal.fire({
        title: willActivate ? '¿Activar usuario?' : '¿Desactivar usuario?',
        text: willActivate
          ? '¿Estás seguro de que deseas activar este usuario?'
          : '¿Estás seguro de que deseas DESACTIVAR este usuario? El usuario no podrá iniciar sesión.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, confirmar',
        cancelButtonText: 'Cancelar'
      }).then((result) => {
        if (result.isConfirmed) {
          fetch(`/admin/usuarios/${userId}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: willActivate })
          })
          .then(res => res.json())
          .then(data => {
            const estadoTexto = self.closest('td').querySelector('.estado-texto');
            // Solo cambia el texto y el switch si backend confirma el cambio
            if (data.activo !== undefined && estadoTexto) {
              estadoTexto.textContent = data.activo ? "Activo" : "Inactivo";
              self.checked = data.activo; // Sincroniza el estado visual
              Swal.fire(
                '¡Listo!',
                data.mensaje || (data.activo ? 'Usuario activado' : 'Usuario desactivado'),
                'success'
              );
            } else {
              self.checked = !willActivate; // Reviértelo si hubo error
              Swal.fire('Error', data.error || 'No se pudo actualizar el usuario', 'error');
            }
          }).catch(() => {
            self.checked = !willActivate;
            Swal.fire('Error', 'No se pudo actualizar el usuario', 'error');
          });
        } else {
          self.checked = !willActivate; // Si cancela, no cambia el switch
        }
      });
    });
  });

  // Toggle del modal de editar (opcional, tu lógica extra aquí)
  const editarActivo = document.getElementById('editarActivo');
  const editarEstadoTexto = document.getElementById('editarEstadoTexto');
  if (editarActivo && editarEstadoTexto) {
    editarActivo.addEventListener('change', function() {
      editarEstadoTexto.textContent = this.checked ? "Activo" : "Inactivo";
    });
  }
});
