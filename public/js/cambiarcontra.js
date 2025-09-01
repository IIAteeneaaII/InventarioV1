async function cambiarContrasena(contrasena, confirmarContrasena, email) {
  if (!email) {
    return Swal.fire("Error", "No se encontró el correo. Vuelve a ingresar el código.", "error");
  }

  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        newPassword: contrasena,
        confirmPassword: confirmarContrasena,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Swal.fire("Error", data.message || "No se pudo cambiar la contraseña", "error");
    }

    Swal.fire("Éxito", "Contraseña actualizada correctamente", "success").then(() => {
      sessionStorage.removeItem("recoveryEmail");
      window.location.href = "/";
    });

  } catch (error) {
    console.error(error);
    Swal.fire("Error", "No se pudo conectar con el servidor.", "error");
  }
}
//.onSuccess(() => {
//  const contrasena = document.querySelector("#nuevaContrasena").value.trim();
//  const confirmarContrasena = document.querySelector("#confirmarContrasena").value.trim();
//  const email = sessionStorage.getItem("recoveryEmail");

//  cambiarContrasena(contrasena, confirmarContrasena, email);
//});
