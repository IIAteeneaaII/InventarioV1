const validator = new JustValidate('#formRegistro');

validator
  .addField('#nombre', [
    { rule: 'required', errorMessage: 'El nombre es obligatorio' }
  ])
  .addField('#userName', [
    { rule: 'required', errorMessage: 'El nombre de usuario es obligatorio' },
    { rule: 'minLength', value: 6, errorMessage: 'Debe tener al menos 6 caracteres' },
    { rule: 'maxLength', value: 20, errorMessage: 'No puede tener más de 20 caracteres' },
    { rule: 'customRegexp', value: /^[a-zA-Z0-9]+$/, errorMessage: 'Solo letras y números sin espacios' }
  ])
  .addField('#email', [
    { rule: 'required', errorMessage: 'El correo es obligatorio' },
    { rule: 'email', errorMessage: 'Ingresa un correo válido' }
  ])
  .addField('#password', [
    { rule: 'required', errorMessage: 'La contraseña es obligatoria' },
    {
      validator: (value) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value),
      errorMessage: 'Debe tener al menos 8 caracteres, mayúsculas, minúsculas y números'
    }
  ])
  .addField('#confirmarContrasena', [
    { rule: 'required', errorMessage: 'Debes confirmar tu contraseña' },
    {
      validator: (value, fields) => value === fields['#password'].elem.value,
      errorMessage: 'Las contraseñas no coinciden'
    }
  ])
  .addField('#rol', [
    { rule: 'required', errorMessage: 'Selecciona un rol válido' }
  ])
  .addField('#terminosCheck', [
    { rule: 'required', errorMessage: 'Debes aceptar los términos' }
  ])
  .onSuccess(async (event) => {
    event.preventDefault();

    const data = {
      nombre: document.getElementById('nombre').value,
      userName: document.getElementById('userName').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      confirmarContrasena: document.getElementById('confirmarContrasena').value,
      rol: document.getElementById('rol').value,
      activo: true
    };

    try {
const res = await fetch('/crearusuario', { 
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

      const json = await res.json();

      if (res.ok && json.success) {
        Swal.fire({
          title: '¡Registro exitoso!',
          text: json.message || 'El usuario ha sido creado correctamente.',
          icon: 'success',
          confirmButtonText: 'Aceptar'
        }).then(() => {
          document.getElementById('formRegistro').reset();
          validator.refresh(); // Limpia los errores visuales
        });
      } else {
        Swal.fire({
          title: 'Error al registrar',
          text: json.message || 'Verifica los datos e intenta nuevamente.',
          icon: 'error',
          confirmButtonText: 'Entendido'
        });
      }
    } catch (err) {
      Swal.fire({
        title: 'Error de red',
        text: err.message,
        icon: 'error',
        confirmButtonText: 'Cerrar'
      });
    }
  });
