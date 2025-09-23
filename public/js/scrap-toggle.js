document.addEventListener('DOMContentLoaded', () => {
  const scrapToggle   = document.getElementById('autoenter-toggle');
  const motivoGroup   = document.querySelector('.motivo-scrap-group');
  const codigoGroup   = document.querySelector('.codigo-diagnostico-group');
  const motivoSelect  = document.getElementById('motivo-scrap');
  const codigoSelect  = document.getElementById('codigo-diagnostico');
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
      
      // Mostrar/ocultar código de diagnóstico según el motivo
      updateCodigoVisibility();
    } else {
      motivoGroup.style.display = 'none';    // se oculta
      if (codigoGroup) codigoGroup.style.display = 'none';
      scrapToggle.textContent = 'SCRAP: OFF';
      scrapToggle.classList.add('is-off');
      scrapToggle.classList.remove('is-on');
      // limpiar campos
      if (motivoSelect) motivoSelect.value = '';
      if (codigoSelect) codigoSelect.value = '';
      if (scrapInput) scrapInput.value = '';
    }
  }

  function updateCodigoVisibility() {
    if (!codigoGroup || !motivoSelect) return;
    
    const selectedOption = motivoSelect.options[motivoSelect.selectedIndex];
    const requiereDiagnostico = selectedOption && selectedOption.getAttribute('data-requiere-diagnostico') === 'true';
    
    if (requiereDiagnostico) {
      codigoGroup.style.display = 'block';
    } else {
      codigoGroup.style.display = 'none';
      if (codigoSelect) codigoSelect.value = '';
    }
  }

  // Toggle al hacer click
  scrapToggle.addEventListener('click', (e) => {
    e.preventDefault();
    scrapEnabled = !scrapEnabled;
    updateUI();
  });

  // Mostrar/ocultar código de diagnóstico según motivo
  if (motivoSelect) {
    motivoSelect.addEventListener('change', () => {
      updateCodigoVisibility();
      updateScrapInput();
    });
  }

  // Actualizar cuando se cambie el código de diagnóstico
  if (codigoSelect) {
    codigoSelect.addEventListener('change', () => {
      updateScrapInput();
    });
  }

  // Sincronizar hidden input
  function updateScrapInput() {
    if (!scrapInput || !motivoSelect) return;
    
    const motivo = motivoSelect.value.trim();
    const codigoId = codigoSelect ? codigoSelect.value.trim() : '';
    const selectedOption = motivoSelect.options[motivoSelect.selectedIndex];
    const requiereDiagnostico = selectedOption && selectedOption.getAttribute('data-requiere-diagnostico') === 'true';
    
    if (scrapEnabled && motivo) {
      let scrapValue = `SCRAP-${motivo}`;
      if (requiereDiagnostico && codigoId) {
        scrapValue += `-CODIGO-${codigoId}`;
      }
      scrapInput.value = scrapValue;
    } else {
      scrapInput.value = '';
    }
  }

  // Inicialización
  updateUI();
});
