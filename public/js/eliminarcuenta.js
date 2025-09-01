// eliminarcuenta.js

document.addEventListener("DOMContentLoaded", () => {
  const btnEliminar = document.getElementById("btnEliminarCuenta");

  if (!btnEliminar) return;

  btnEliminar.addEventListener("click", async () => {
    const userId = btnEliminar.dataset.userid;

    if (!userId) {
      alert("No se encontró el ID de usuario para eliminar.");
      return;
    }

    const confirmDelete = confirm("¿Estás seguro de que deseas eliminar esta cuenta? Esta acción no se puede deshacer.");

    if (!confirmDelete) return;

    try {
      const response = await fetch(`/api/users/${userId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const result = await response.json();

      if (response.ok) {
        alert("Cuenta eliminada correctamente.");
        window.location.reload(); // o redirige a donde corresponda
      } else {
        alert(result.message || "No se pudo eliminar la cuenta.");
      }

    } catch (error) {
      console.error("Error al eliminar la cuenta:", error);
      alert("Ocurrió un error al eliminar la cuenta. Intenta nuevamente.");
    }
  });
});
// <button id="btnEliminarCuenta" data-userid="123">Eliminar cuenta</button>
