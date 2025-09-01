// desactivarcuenta.js

document.addEventListener("DOMContentLoaded", () => {
  const btnDesactivar = document.getElementById("btnDesactivarCuenta");

  if (!btnDesactivar) return;

  btnDesactivar.addEventListener("click", async () => {
    const userId = btnDesactivar.dataset.userid;

    if (!userId) {
      alert("No se encontró el ID de usuario para desactivar.");
      return;
    }

    const confirmDeactivate = confirm("¿Estás seguro de que deseas desactivar esta cuenta? El usuario no podrá iniciar sesión hasta que la reactives.");

    if (!confirmDeactivate) return;

    try {
      const response = await fetch(`/api/users/${userId}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const result = await response.json();

      if (response.ok) {
        alert("Cuenta desactivada correctamente.");
        window.location.reload(); // o redirige a donde corresponda
      } else {
        alert(result.message || "No se pudo desactivar la cuenta.");
      }

    } catch (error) {
      console.error("Error al desactivar la cuenta:", error);
      alert("Ocurrió un error al desactivar la cuenta. Intenta nuevamente.");
    }
  });
});
// <button id="btnDesactivarCuenta" data-userid="123">Desactivar cuenta</button>