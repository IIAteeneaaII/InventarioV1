// /public/js/acotaciones-modal.js

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-acotaciones");
  const modal = document.getElementById("modalAcotaciones");
  const closeBtn = document.getElementById("closeAcotaciones");
  const body = document.getElementById("modalAcotacionesBody");
  const tpl = document.getElementById("acotacionesTemplate");

  // Abrir modal
  function abrirModal() {
    body.innerHTML = "";
    if (tpl?.content) {
      const clon = tpl.content.cloneNode(true);
      const cont = clon.querySelector(".acotaciones-container");
      if (cont) cont.classList.add("acotaciones-compact"); // versión compacta
      body.appendChild(clon);
    }
    modal.style.display = "block";
    document.body.style.overflow = "hidden"; // Evita scroll del fondo
  }

  // Cerrar modal
  function cerrarModal() {
    modal.style.display = "none";
    document.body.style.overflow = "";
    body.innerHTML = "";
  }

  // Eventos
  btn?.addEventListener("click", abrirModal);
  closeBtn?.addEventListener("click", cerrarModal);

  // Click fuera del contenido
  window.addEventListener("click", (e) => {
    if (e.target === modal) cerrarModal();
  });

  // Cerrar con tecla ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "block") {
      cerrarModal();
    }
  });
});
