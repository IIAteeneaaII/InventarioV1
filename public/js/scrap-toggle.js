// Control del botón SCRAP ON/OFF y visibilidad de Motivo de Scrap
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('autoenter-toggle');
  const motivoSelect = document.getElementById('motivo-scrap');
  const scrapHiddenInput = document.getElementById('scrap-input');

  // Obtener el contenedor .form-group del select
  const motivoGroup = motivoSelect ? motivoSelect.closest('.form-group') : null;
  if (motivoGroup && !motivoGroup.classList.contains('motivo-scrap-group')) {
    motivoGroup.classList.add('motivo-scrap-group'); // Para aplicar el CSS
  }

  // Estado inicial: OFF (rojo) y motivo oculto
  let isOn = false;
  applyState();

  btn.addEventListener('click', () => {
    isOn = !isOn;
    applyState();
  });

  function applyState() {
    if (!btn || !motivoGroup) return;

    if (isOn) {
      btn.classList.add('is-on');
      btn.classList.remove('is-off');
      btn.setAttribute('title', 'SCRAP activado');
      btn.innerHTML = '<i class="fas fa-keyboard"></i> SCRAP: ON';

      motivoGroup.classList.add('visible');
      if (motivoSelect) motivoSelect.disabled = false;
      if (scrapHiddenInput) scrapHiddenInput.value = 'ON';
    } else {
      btn.classList.add('is-off');
      btn.classList.remove('is-on');
      btn.setAttribute('title', 'SCRAP desactivado');
      btn.innerHTML = '<i class="fas fa-keyboard"></i> SCRAP: OFF';

      motivoGroup.classList.remove('visible');
      if (motivoSelect) {
        motivoSelect.disabled = true;
        motivoSelect.value = ''; // limpiar selección si se apaga
      }
      if (scrapHiddenInput) scrapHiddenInput.value = 'OFF';
    }
  }
});
