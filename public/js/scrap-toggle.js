document.addEventListener('DOMContentLoaded', () => {
  const scrapToggle   = document.getElementById('autoenter-toggle');
  const motivoGroup   = document.querySelector('.motivo-scrap-group');
  const motivoSelect  = document.getElementById('motivo-scrap');
  const scrapInput    = document.getElementById('scrap-input');

  if (!scrapToggle || !motivoGroup) return;

  // Estado inicial
  let scrapEnabled = false;

  function updateUI() {
    if (scrapEnabled) {
      motivoGroup.style.display = 'block';   // aparece
      scrapToggle.textContent = 'SCRAP: ON';
      scrapToggle.classList.add('is-on');
      scrapToggle.classList.remove('is-off');
    } else {
      motivoGroup.style.display = 'none';    // se oculta
      scrapToggle.textContent = 'SCRAP: OFF';
      scrapToggle.classList.add('is-off');
      scrapToggle.classList.remove('is-on');
      // limpiar campos
      if (motivoSelect) motivoSelect.value = '';
      if (scrapInput) scrapInput.value = '';
    }
  }

  // Toggle al hacer click
  scrapToggle.addEventListener('click', (e) => {
    e.preventDefault();
    scrapEnabled = !scrapEnabled;
    updateUI();
  });

  // Sincronizar hidden input cuando el usuario elige motivo
  if (motivoSelect && scrapInput) {
    motivoSelect.addEventListener('change', () => {
      const motivo = motivoSelect.value.trim();
      scrapInput.value = scrapEnabled && motivo ? `SCRAP-${motivo}` : '';
    });
  }

  // Inicialización
  updateUI();
});
