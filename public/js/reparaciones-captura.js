(function(){
  const $ = (sel) => document.querySelector(sel);

  // --- Inputs / Controles
  const snInput   = $('#sn-input');
  const diagPrev  = $('#diagnostico-previo');
  const repSel    = $('#reparaciones-input');
  const nivelInp  = $('#nivel-input');      // readonly
  const tecInp    = $('#tecnico-input');    // editable
  const guardarBtn= $('#guardar-btn');
  const statusMsg = $('#status-msg');

  // SCRAP (UI cambia de columna con CSS usando .on)
  const scrapRow    = $('#scrap-row');
  const scrapToggle = $('#scrap-toggle');
  const scrapInput  = $('#scrap-captura');
  let scrapEnabled  = false;

  // Modal Conteo
  const btnConteo     = $('#btn-conteo');
  const conteoModal   = $('#conteo-modal');
  const conteoClose   = $('#conteo-close');
  const conteoOK      = $('#conteo-ok');
  const conteoRefresh = $('#conteo-refresh');
  const conteoTotalEl = $('#conteo-total');
  const conteoTbody   = $('#conteo-tbody');

  // === Datos de prueba (sustituir por fetch a backend)
  const CODIGOS_REP = [
    { clave: 'R101', nombre: 'Cambio de tarjeta', nivel: 'Nivel 3' },
    { clave: 'R050', nombre: 'Resoldado',        nivel: 'Nivel 2' },
    { clave: 'R012', nombre: 'Conector/Jack',    nivel: 'Nivel 1' },
  ];

  // === Estado para conteos ===
  const scanDiagCounts = new Map();   // diagnóstico -> count (se actualiza al ESCANEAR)
  const repairCounts   = new Map();   // código reparación (clave) -> count (se actualiza al GUARDAR)
  let lastCountedSN = null;           // evita doble conteo del mismo SN al blur/enter

  function inc(map, key){
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  }

  function poblarCodigos(){
    repSel.innerHTML = '<option value="">Seleccione código de reparación</option>';
    CODIGOS_REP.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.clave;
      opt.textContent = `${c.clave} — ${c.nombre}`;
      opt.dataset.nivel = c.nivel;
      opt.dataset.nombre = c.nombre;
      repSel.appendChild(opt);
    });
  }

  // === Buscar diagnóstico por SN (MOCK: cambia por fetch real) ===
  async function buscarDiagnosticoAnterior(sn){
    const last = sn.slice(-1);
    if (!sn) return null;
    if (/[57]/.test(last)) {
      return { diagnostico: last === '5' ? 'NO ENCIENDE' : 'SIN SEÑAL', fase: (last==='5'?'TEST_INICIAL':'RETEST') };
    }
    return { diagnostico: 'DIAGNÓSTICO NO DISPONIBLE', fase: null };
    // Real:
    // const r = await fetch(`/api/diagnostico?sn=${encodeURIComponent(sn)}`);
    // if (!r.ok) return null;
    // return r.json();
  }

  function toUpperInp(e){ const t=e.target; if (t && typeof t.value==='string') t.value=t.value.toUpperCase(); }

  function setEnabled(el, enabled){
    if (!el) return;
    el.disabled = !enabled;
    if (!enabled && 'value' in el) el.value = '';
  }

  function validar(){
    const scrapOk = scrapEnabled && scrapInput.value.trim().length > 0; // SCRAP directo
    const normalOk = !!(repSel.value && nivelInp.value && tecInp.value.trim()); // reparación normal
    const ok = scrapOk || normalOk;
    guardarBtn.disabled = !ok;
    return ok;
  }

  async function onScanOrEnter(trigger){
    const sn = snInput.value.trim().toUpperCase();
    if (!sn) {
      diagPrev.value = '';
      setEnabled(repSel, false);
      statusMsg.textContent = 'Escanee un S/N válido';
      validar();
      return;
    }
    statusMsg.textContent = 'Consultando diagnóstico...';
    try{
      const info = await buscarDiagnosticoAnterior(sn);
      const diag = (info && info.diagnostico) ? info.diagnostico : '';
      diagPrev.value = diag;
      setEnabled(repSel, true);
      statusMsg.textContent = 'Diagnóstico consultado';

      // --- Conteo por diagnóstico (solo una vez por SN) ---
      if (sn !== lastCountedSN && diag) {
        inc(scanDiagCounts, diag.trim());
        lastCountedSN = sn;
        // si el modal está abierto, refrescamos
        if (conteoModal && conteoModal.style.display === 'block') renderConteo();
      }
    }catch(err){
      diagPrev.value = '';
      setEnabled(repSel, false);
      statusMsg.textContent = 'Error consultando diagnóstico';
      console.error(err);
    }
    validar();
  }

  function onCodigoChange(){
    const opt = repSel.options[repSel.selectedIndex];
    nivelInp.value = opt ? (opt.dataset.nivel || '') : '';
    validar();
  }

  function onTecChange(){ validar(); }
  function onScrapChange(){ validar(); }

  async function guardar(){
    if (!validar()) return;

    const payload = {
      sn: snInput.value.trim().toUpperCase(),
      diagnosticoPrevio: diagPrev.value || '',
      esScrap: scrapEnabled && !!scrapInput.value.trim(),
      scrapDetalle: scrapInput.value.trim() || '',
      clave: repSel.value || '',
      reparacion: repSel.options[repSel.selectedIndex]?.dataset.nombre || '',
      nivel: nivelInp.value || '',
      tecnico: tecInp.value.trim() || ''
    };

    // Aquí enviarías al backend:
    // await fetch('/api/reparaciones', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });

    // Conteo por código de reparación (solo si NO es SCRAP directo)
    if (!payload.esScrap && payload.clave) {
      inc(repairCounts, payload.clave);
    }

    agregarFilaHistorial(payload);
    renderConteo(); // por si el modal está abierto

    Swal.fire({ icon: 'success', title: payload.esScrap ? 'SCRAP registrado' : 'Reparación registrada', timer: 1200, showConfirmButton: false });

    if (!payload.esScrap) { repSel.value=''; nivelInp.value=''; }
    scrapInput.value='';
    validar();
  }

  function agregarFilaHistorial(p){
    const tb = $('#registros-body');
    const tr = document.createElement('tr');
    const fecha = new Date().toLocaleString('es-MX');

    const userName = (window.user && (user.nombre || user.userName)) || 'Yo';
    const clave = p.esScrap ? 'SCRAP' : (p.clave || 'N/A');
    const repNom = p.esScrap ? (p.scrapDetalle || 'SCRAP') : (p.reparacion || 'N/A');
    const nivel  = p.esScrap ? '—' : (p.nivel || 'N/A');

    tr.innerHTML = `
      <td>${userName}</td>
      <td>${p.sn}</td>
      <td>${fecha}</td>
      <td>${p.diagnosticoPrevio || 'N/A'}</td>
      <td>${clave}</td>
      <td>${repNom}</td>
      <td>${nivel}</td>
      <td>${p.tecnico || 'N/A'}</td>
    `;
    tb.insertBefore(tr, tb.firstChild);

    // Mantener arreglo local por si te sirve
    window._registros = window._registros || [];
    window._registros.push({
      user: { nombre: userName },
      sn: p.sn,
      createdAt: new Date().toISOString(),
      diagnosticoPrevio: p.diagnosticoPrevio,
      clave, reparacion: repNom, nivel, tecnico: p.tecnico
    });
  }

  // ===== SCRAP UI =====
  function updateScrapUI(){
    scrapRow.classList.toggle('on', scrapEnabled);
    if (scrapEnabled) {
      scrapToggle.textContent = 'SCRAP: ON';
      scrapToggle.classList.add('is-on'); scrapToggle.classList.remove('is-off');
    } else {
      scrapToggle.textContent = 'SCRAP: OFF';
      scrapToggle.classList.add('is-off'); scrapToggle.classList.remove('is-on');
      scrapInput.value = '';
    }
    validar();
  }

  // ===== Modal Conteo =====
  function renderConteo(){
    // Armar filas de diagnóstico (escaneos)
    const diagPairs = Array.from(scanDiagCounts.entries()).sort((a,b)=>b[1]-a[1]);
    const repPairs  = Array.from(repairCounts.entries()).sort((a,b)=>b[1]-a[1]);

    conteoTbody.innerHTML = '';

    const addSection = (title) => {
      const tr = document.createElement('tr');
      tr.className = 'section';
      tr.innerHTML = `<td colspan="2">${title}</td>`;
      conteoTbody.appendChild(tr);
    };

    const addRows = (pairs) => {
      if (!pairs.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="2">Sin datos</td>`;
        conteoTbody.appendChild(tr);
        return;
      }
      pairs.forEach(([k,v]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${k}</td><td>${v}</td>`;
        conteoTbody.appendChild(tr);
      });
    };

    addSection('Diagnóstico (escaneos)');
    addRows(diagPairs);

    addSection('Código de reparación (guardados)');
    addRows(repPairs);

    // Total escaneos (suma de conteos de diagnóstico)
    const total = diagPairs.reduce((s, [,n]) => s+n, 0);
    conteoTotalEl.textContent = String(total);
  }

  function openConteo(){ renderConteo(); conteoModal.style.display='block'; }
  function closeConteo(){ conteoModal.style.display='none'; }

  // --- Eventos
  if (snInput){
    snInput.addEventListener('input', toUpperInp);
    snInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') onScanOrEnter('enter'); });
    snInput.addEventListener('blur', ()=>onScanOrEnter('blur'));
  }
  repSel.addEventListener('change', onCodigoChange);
  tecInp.addEventListener('input', onTecChange);
  guardarBtn.addEventListener('click', (e)=>{ e.preventDefault(); guardar(); });

  scrapToggle.addEventListener('click', (e)=>{ e.preventDefault(); scrapEnabled = !scrapEnabled; updateScrapUI(); });
  scrapInput.addEventListener('input', onScrapChange);

  btnConteo.addEventListener('click', openConteo);
  conteoClose.addEventListener('click', closeConteo);
  conteoOK.addEventListener('click', closeConteo);
  conteoRefresh.addEventListener('click', renderConteo);
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeConteo(); });

  // Init
  poblarCodigos();
  updateScrapUI();
})();
