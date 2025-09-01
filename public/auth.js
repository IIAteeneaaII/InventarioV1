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
      errorMessage: 'La contraseña es obligatoria',
    },
    {
      rule: 'minLength',
      value: 8,
      errorMessage: 'Debe tener al menos 8 caracteres',
    },
    {
      rule: 'customRegexp',
      value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
      errorMessage: 'Debe contener al menos una mayúscula, una minúscula y un número', //comprueba que almenos una mayúsucla
    },
  ])
  .onSuccess((event) => {
    event.target.submit();
  });
