document.addEventListener("DOMContentLoaded", () => {
  const validator = new JustValidate('#formLogin');

  validator
    .addField('#correo', [
      {
        rule: 'required',
        errorMessage: 'El correo es obligatorio',
      },
      {
        rule: 'email',
        errorMessage: 'Ingresa un correo válido',
      },
    ])
    .addField('#contrasena', [
      {
        rule: 'required',
        errorMessage: 'La contraseña es obligatori',
      },
      {
        rule: 'minLength',
        value: 8,
        errorMessage: 'Debe tener al menos 8 caracteres',
      },
      {
        rule: 'customRegexp',
        value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
        errorMessage: 'Debe contener al menos una mayúscula, una minúscula y un número',
      },
    ])
    .onSuccess((event) => {
      event.preventDefault();
      loginUser();
    });

  async function loginUser() {
    const form = document.getElementById('formLogin');
    const formData = new FormData(form);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password')
        })
      });

      const data = await response.json();
      
      if (response.ok && data.redirectTo && data.user) {
        // 1. Guardar los datos del usuario en localStorage ANTES de redirigir.
        localStorage.setItem('usuario', JSON.stringify(data.user));
        
        // 2. Establecer el objeto global para la sesión actual (buena práctica).
        window.user = data.user;
        
        // 3. Ahora sí, redirigir a la página que indicó el servidor.
        window.location.href = data.redirectTo;
      } else {
        throw new Error(data.message || 'Error en el inicio de sesión');
      }
      
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message
      });
    }
  }
});