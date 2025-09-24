document.addEventListener('DOMContentLoaded', () => {
  const scrapToggle   = document.getElementById('autoenter-toggle');

  const motivoGroup   = document.querySelector('.motivo-scrap-group');
  const motivoSelect  = document.getElementById('motivo-scrap');

  const codigoGroup   = document.querySelector('.codigo-diagnostico-group');
  const codigoSelect  = document.getElementById('codigo-diagnostico');

  const descGroup     = document.querySelector('.descripcion-codigo-group');
  const descInput     = document.getElementById('descripcion-codigo');

  const scrapInput    = document.getElementById('scrap-input');

  const hiddenCodigo       = document.getElementById('codigo-diagnostico-hidden');
  const hiddenDescripcion  = document.getElementById('descripcion-diagnostico-hidden');

  if (!scrapToggle) return;

  // Motivos (por si backend no los puso)
  const ensureMotivoOptions = () => {
    if (!motivoSelect) return;
    const texts = Array.from(motivoSelect.options).map(o => (o.textContent || '').toUpperCase());
    const addIfMissing = (value, text, attrs={}) => {
      const o = document.createElement('option');
      o.value = value; o.textContent = text;
      Object.entries(attrs).forEach(([k,v]) => o.setAttribute(k, v));
      motivoSelect.appendChild(o);
    };
    if (!texts.some(t => t.includes('INFESTADO'))) addIfMissing('INFESTADO','Infestado');
    if (!texts.some(t => t.includes('COSM')))      addIfMissing('COSMETICA','Cosmética');
    if (!texts.some(t => t.includes('ELECTR')))    addIfMissing('ELECTRONICA','Electrónica', {'data-requiere-diagnostico':'true'});
  };

  // Códigos de prueba
  const STATIC_CODIGOS = [
    { codigo: 'T001', descripcion: 'TARJETA SCRAP' },
    { codigo: 'D002', descripcion: 'NO ENCIENDE' }
  ];
  const ensureCodigoOptions = () => {
    if (!codigoSelect) return;
    if (codigoSelect.options.length <= 1) {
      STATIC_CODIGOS.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.codigo;
        opt.textContent = `${c.codigo} — ${c.descripcion}`;
        opt.setAttribute('data-descripcion', c.descripcion);
        codigoSelect.appendChild(opt);
      });
    }
  };

  let scrapEnabled = false;

  const normalize = (s) =>
    (s || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();

  const motivoEsElectronico = () => {
    if (!motivoSelect || motivoSelect.selectedIndex < 0) return false;
    const opt = motivoSelect.options[motivoSelect.selectedIndex];
    if (opt && opt.getAttribute('data-requiere-diagnostico') === 'true') return true;
    const txt = normalize(opt.textContent || opt.value);
    return txt.includes('ELECTRONIC');
  };

  const shouldShowCodigo = () => scrapEnabled && motivoEsElectronico();

  const clearCodigoYDescripcion = () => {
    if (codigoSelect) codigoSelect.value = '';
    if (descInput)    descInput.value = '';
    if (hiddenCodigo) hiddenCodigo.value = '';
    if (hiddenDescripcion) hiddenDescripcion.value = '';
  };

  const updateCodigoVisibility = () => {
    if (!codigoGroup) return;
    if (shouldShowCodigo()) {
      codigoGroup.style.display = 'block';
      if (descGroup) descGroup.style.display = 'block';
      ensureCodigoOptions();
    } else {
      codigoGroup.style.display = 'none';
      if (descGroup) descGroup.style.display = 'none';
      clearCodigoYDescripcion();
    }
  };

  const updateDescripcionDesdeCodigo = () => {
    if (!codigoSelect || !descInput) return;
    const selectedOpt = codigoSelect.options[codigoSelect.selectedIndex];
    let descripcion = '';
    if (selectedOpt) {
      descripcion = selectedOpt.getAttribute('data-descripcion') || '';
      if (!descripcion) {
        const found = STATIC_CODIGOS.find(c => c.codigo === selectedOpt.value);
        if (found) descripcion = found.descripcion;
      }
    }
    descInput.value = descripcion || '';
    if (hiddenCodigo) hiddenCodigo.value = codigoSelect.value || '';
    if (hiddenDescripcion) hiddenDescripcion.value = descInput.value || '';
  };

  const updateScrapInput = () => {
    if (!scrapInput) return;
    const motivo = normalize(motivoSelect && motivoSelect.value);
    const codigoId = codigoSelect ? (codigoSelect.value || '').trim() : '';
    const esElec = motivoEsElectronico();
    if (scrapEnabled && motivo) {
      let scrapValue = `SCRAP-${motivo}`;
      if (esElec && codigoId) scrapValue += `-CODIGO-${codigoId}`;
      scrapInput.value = scrapValue;
    } else {
      scrapInput.value = '';
    }
  };

  const updateUI = () => {
    // Botón
    if (scrapEnabled) {
      scrapToggle.textContent = 'SCRAP: ON';
      scrapToggle.classList.add('is-on');
      scrapToggle.classList.remove('is-off');
    } else {
      scrapToggle.textContent = 'SCRAP: OFF';
      scrapToggle.classList.add('is-off');
      scrapToggle.classList.remove('is-on');
    }

    // Mostrar/Ocultar grupos
    if (motivoGroup) motivoGroup.style.display = scrapEnabled ? 'block' : 'none';

    if (!scrapEnabled) {
      if (motivoSelect) motivoSelect.value = '';
      clearCodigoYDescripcion();
    }

    updateCodigoVisibility();
    updateScrapInput();
  };

  // Eventos
  scrapToggle.addEventListener('click', (e) => {
    e.preventDefault();
    scrapEnabled = !scrapEnabled;
    updateUI();
  });

  if (motivoSelect) {
    motivoSelect.addEventListener('change', () => {
      updateCodigoVisibility();
      updateScrapInput();
    });
  }

  if (codigoSelect) {
    codigoSelect.addEventListener('change', () => {
      updateDescripcionDesdeCodigo();
      updateScrapInput();
    });
  }

  // Inicialización
  ensureMotivoOptions();
  updateUI();
});
