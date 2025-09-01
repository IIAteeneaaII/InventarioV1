// Verificar autenticación al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const usuario = JSON.parse(localStorage.getItem('usuario'));
  
  if (!token || !usuario) {
    window.location.href = '/login';
    return;
  }
  
  // Verificar token con el servidor
  fetch('/auth/verify', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Token inválido');
    }
    return response.json();
  })
  .catch(error => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/login';
  });
});

// Función para cerrar sesión
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/login';
}