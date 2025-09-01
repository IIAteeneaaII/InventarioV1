document.addEventListener('DOMContentLoaded', () => {
  const guardarBtn = document.getElementById('guardar-btn');
  const finalizarLoteBtn = document.getElementById('finalizar-lote-btn');
  const snInput = document.getElementById('sn-input');
  const scrapInput = document.getElementById('scrap-input');
  const motivoScrapSelect = document.getElementById('motivo-scrap');
  const skuTitle = document.querySelector('.form-section h1');

  // Indicador de estado en UI
  const statusIndicator = document.querySelector('.status-indicator');

  // --- Sincroniza input de SCRAP con el select de motivo (si el usuario cambia el motivo manualmente)
  if (scrapInput && motivoScrapSelect) {
    motivoScrapSelect.addEventListener('change', () => {
      const motivo = motivoScrapSelect.value.trim();
      if (motivo !== '') {
        scrapInput.value = `SCRAP-${motivo}`;
      } else {
        scrapInput.value = '';
      }
    });
  }

  // Extraer SKU del H1
  const skuText = skuTitle ? skuTitle.textContent.trim() : '';
  const skuMatch = skuText.match(/\d{5,6}$/);
  const sku = skuMatch ? skuMatch[0] : '';

  if (!sku) {
    console.error('No se pudo detectar el SKU del título:', skuText);
    return;
  }
  console.log(`SKU detectado: ${sku}`);

  // Usuario
  const userInfo = document.querySelector('.username');
  const userName = userInfo ? userInfo.textContent.trim() : '';

  // Sesión por SKU/usuario/fecha
  const sessionKey = `scan_session_${sku}_${userName}_${new Date().toISOString().split('T')[0]}`;
  limpiarOtrosSKUs(sessionKey);

  // Indicador SKU
  const skuIndicator = document.createElement('div');
  skuIndicator.className = 'sku-indicator';
  skuIndicator.textContent = `SKU: ${sku}`;
  document.querySelector('.form-section').appendChild(skuIndicator);

  // Contador
  let scanCounter = parseInt(localStorage.getItem(`${sessionKey}_count`) || '0');
  let scanCountDisplay = document.createElement('div');
  scanCountDisplay.className = 'scan-counter';
  scanCountDisplay.textContent = `Escaneos (${sku}): ${scanCounter}`;
  if (guardarBtn && guardarBtn.parentNode) {
    guardarBtn.parentNode.appendChild(scanCountDisplay);
  }

  if (!guardarBtn || !snInput || !statusIndicator) return;

  // Mayúsculas automáticas
  snInput.addEventListener('input', function () { this.value = this.value.toUpperCase(); });
  if (scrapInput) {
    scrapInput.addEventListener('input', function () { this.value = this.value.toUpperCase(); });
  }

  // Lote activo
  let loteActivo = localStorage.getItem(`${sessionKey}_loteId`) || null;
  if (loteActivo && finalizarLoteBtn) finalizarLoteBtn.style.display = 'block';

  // Cache de últimos SN
  const scannedItems = JSON.parse(localStorage.getItem(`${sessionKey}_items`) || '[]');

  // Datos iniciales
  cargarDatosIniciales(sku);

  // ---- Helpers de sesión/tabla -------------------------------------------------

  function limpiarOtrosSKUs(currentKey) {
    const keysToKeep = [];
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('scan_session_') && !key.startsWith(currentKey)) {
        localStorage.removeItem(key);
      } else if (key.startsWith(currentKey)) {
        keysToKeep.push(key);
      }
    });
    console.log('Claves mantenidas:', keysToKeep);
  }

  async function cargarDatosIniciales(sku) {
    try {
      const tablaBody = document.getElementById('registros-body');
      if (!tablaBody) {
        console.error('No se encontró la tabla de registros');
        return;
      }
      tablaBody.innerHTML = '';
      statusIndicator.innerHTML = '<span class="processing">Cargando datos...</span>';

      const response = await fetch(`/api/registros/sku/${sku}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.registros && data.registros.length > 0) {
          data.registros.forEach(registro => {
            const nuevaFila = document.createElement('tr');
            nuevaFila.innerHTML = `
              <td>${registro.user?.nombre || 'Usuario'}</td>
              <td>${registro.sn || registro.modem?.sn || 'N/A'}</td>
              <td>${new Date(registro.createdAt).toLocaleString('es-MX')}</td>
              <td>${registro.estado || 'N/A'}</td>
              <td>${registro.motivoScrap || 'N/A'}</td>
            `;
            if (registro.estado && registro.estado.includes('SCRAP')) {
              nuevaFila.classList.add('fila-scrap');
            }
            tablaBody.appendChild(nuevaFila);
          });
          console.log(`Cargados ${data.registros.length} registros para SKU ${sku}`);
        } else {
          console.log(`No hay registros para el SKU ${sku}`);
        }
        statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>';
      } else {
        console.error('Error al cargar datos iniciales:', await response.text());
        statusIndicator.innerHTML = '<span class="error">Error al cargar datos</span>';
        setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
      }
    } catch (error) {
      console.error('Error de red al cargar datos iniciales:', error);
      statusIndicator.innerHTML = '<span class="error">Error de conexión</span>';
      setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
    }
  }

  function actualizarTablaOptimizada(data) {
    const tablaBody = document.getElementById('registros-body');
    if (!tablaBody) return;

    const nuevaFila = document.createElement('tr');
    const esScrap = data.scrap && data.scrap.includes('SCRAP');
    if (esScrap) nuevaFila.classList.add('fila-scrap');

    const motivoMostrado = data.motivoScrap
      ? data.motivoScrap.replace('SCRAP-', '').replace(/_/g, ' ')
      : 'N/A';

    nuevaFila.innerHTML = `
      <td>${data.userName || userName}</td>
      <td>${data.sn}</td>
      <td>${new Date().toLocaleString('es-MX')}</td>
      <td>${esScrap ? 'SCRAP' : 'SN_OK'}</td>
      <td>${motivoMostrado}</td>
    `;

    if (tablaBody.firstChild) {
      tablaBody.insertBefore(nuevaFila, tablaBody.firstChild);
    } else {
      tablaBody.appendChild(nuevaFila);
    }

    const maxRows = 20;
    while (tablaBody.children.length > maxRows) {
      tablaBody.removeChild(tablaBody.lastChild);
    }
  }

  // ---- Estado y UI de SCRAP ----------------------------------------------------

  // Estado real de SCRAP (por defecto OFF)
  let scrapEnabled = false;

  // Botón/Toggle (se mantiene el id actual para no tocar HTML)
  const autoEnterToggle = document.getElementById('autoenter-toggle');

  const updateScrapToggleUI = () => {
    if (!autoEnterToggle) return;
    if (scrapEnabled) {
      autoEnterToggle.classList.add('autoenter-on');
      autoEnterToggle.classList.remove('autoenter-off');
      autoEnterToggle.innerHTML = '<i class="fas fa-keyboard"></i> SCRAP: ON';
      autoEnterToggle.title = 'SCRAP activado (clic para desactivar)';
    } else {
      autoEnterToggle.classList.add('autoenter-off');
      autoEnterToggle.classList.remove('autoenter-on');
      autoEnterToggle.innerHTML = '<i class="fas fa-keyboard"></i> SCRAP: OFF';
      autoEnterToggle.title = 'SCRAP desactivado (clic para activar)';
      // Al apagar SCRAP, limpiamos motivo y campo
      if (motivoScrapSelect) motivoScrapSelect.value = '';
      if (scrapInput) scrapInput.value = '';
    }
  };

  if (autoEnterToggle) {
    autoEnterToggle.addEventListener('click', (e) => {
      e.preventDefault();
      scrapEnabled = !scrapEnabled;
      updateScrapToggleUI();
      statusIndicator.innerHTML = scrapEnabled
        ? '<span class="success">SCRAP ACTIVADO</span>'
        : '<span class="warning">SCRAP DESACTIVADO</span>';
      setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 1500);
    });
    updateScrapToggleUI();
  }

  // Validación única usada por Enter y por el botón Guardar
  function validarScrapAntesDeGuardar() {
    // Si SCRAP está ON, el motivo es obligatorio
    if (scrapEnabled) {
      const motivo = motivoScrapSelect ? motivoScrapSelect.value.trim() : '';
      if (!motivo) {
        statusIndicator.innerHTML = '<span class="warning">Seleccione motivo scrap</span>';
        if (motivoScrapSelect) motivoScrapSelect.focus();
        return false;
      }
      // Sincroniza el input con el motivo
      if (scrapInput) scrapInput.value = `SCRAP-${motivo}`;
    } else {
      // Si SCRAP está OFF, aseguramos que el campo quede vacío
      if (scrapInput) scrapInput.value = '';
      if (motivoScrapSelect) motivoScrapSelect.value = '';
    }
    return true;
  }

  // ---- Guardar registro --------------------------------------------------------

  const guardarRegistro = async () => {
    const sn = snInput.value.toUpperCase().trim();

    if (!sn) {
      statusIndicator.innerHTML = '<span class="error">S/N vacío</span>';
      setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 1000);
      return;
    }

    // Duplicado inmediato
    if (scannedItems.includes(sn)) {
      statusIndicator.innerHTML = '<span class="warning">S/N duplicado</span>';
      snInput.value = '';
      snInput.focus();
      setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 1000);
      return;
    }

    // >>> VALIDACIÓN CRÍTICA DE SCRAP (común para Enter y botón)
    if (!validarScrapAntesDeGuardar()) {
      return;
    }

    // Agregar a cache local
    scannedItems.push(sn);
    if (scannedItems.length > 100) scannedItems.shift();
    localStorage.setItem(`${sessionKey}_items`, JSON.stringify(scannedItems));

    const scrap = scrapInput ? scrapInput.value.toUpperCase() : '';
    const motivoScrap = motivoScrapSelect ? motivoScrapSelect.value : '';

    statusIndicator.innerHTML = '<span class="processing">Procesando...</span>';

    try {
      const response = await fetch('/api/registros', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin',
        body: JSON.stringify({ sn, scrap, motivoScrap, sku }),
      });

      if (response.ok) {
        const data = await response.json();

        // Contador
        scanCounter++;
        localStorage.setItem(`${sessionKey}_count`, scanCounter.toString());
        scanCountDisplay.textContent = `Escaneos (${sku}): ${scanCounter}`;

        // Lote activo
        if (data.loteId) {
          loteActivo = data.loteId;
          localStorage.setItem(`${sessionKey}_loteId`, loteActivo);
          if (finalizarLoteBtn) finalizarLoteBtn.style.display = 'block';
        }

        // Tabla
        actualizarTablaOptimizada({
          sn,
          scrap,
          motivoScrap,
          userName: data.userName || userName
        });

        statusIndicator.innerHTML = '<span class="success">✓</span>';
        setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 500);

        // Limpiar campos
        snInput.value = '';
        if (scrapInput) scrapInput.value = '';
        if (motivoScrapSelect) motivoScrapSelect.value = '';
      } else {
        const errorData = await response.json();
        statusIndicator.innerHTML = `<span class="error">${errorData.error || 'Error'}</span>`;
        console.error('Error en registro:', errorData);
        setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
      }
    } catch (error) {
      statusIndicator.innerHTML = `<span class="error">Error de red</span>`;
      console.error('Error de red:', error);
      setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
    }

    snInput.focus();
  };

  // ---- Finalizar lote ----------------------------------------------------------

  const finalizarLote = async () => {
    if (!loteActivo) {
      statusIndicator.innerHTML = '<span class="warning">No hay lote activo</span>';
      setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
      return;
    }
    if (!confirm('¿Finalizar el lote actual?')) return;

    statusIndicator.innerHTML = '<span class="processing">Finalizando lote...</span>';

    try {
      const response = await fetch('/api/lotes/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ loteId: loteActivo }),
      });

      if (response.ok) {
        statusIndicator.innerHTML = '<span class="success">Lote finalizado</span>';
        localStorage.removeItem(`${sessionKey}_loteId`);
        localStorage.removeItem(`${sessionKey}_count`);
        localStorage.removeItem(`${sessionKey}_items`);
        scanCounter = 0;
        scanCountDisplay.textContent = `Escaneos (${sku}): ${scanCounter}`;
        if (finalizarLoteBtn) finalizarLoteBtn.style.display = 'none';
        loteActivo = null;
        setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
      } else {
        const errorData = await response.json();
        statusIndicator.innerHTML = `<span class="error">${errorData.error || 'Error al finalizar'}</span>`;
        setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
      }
    } catch (error) {
      statusIndicator.innerHTML = '<span class="error">Error de red</span>';
      console.error('Error:', error);
      setTimeout(() => statusIndicator.innerHTML = '<span class="ready">Listo para escanear</span>', 2000);
    }
  };

  // ---- Ping sesión -------------------------------------------------------------

  setInterval(() => {
    fetch('/api/test', { method: 'GET', credentials: 'same-origin' })
      .catch(err => console.error('Error en ping de sesión:', err));
  }, 3 * 60 * 1000);

  // ---- Eventos ----------------------------------------------------------------

  // Click en Guardar: ahora valida SCRAP igual que Enter
  guardarBtn.addEventListener('click', (e) => {
    e.preventDefault();
    guardarRegistro();
  });

  if (finalizarLoteBtn) {
    finalizarLoteBtn.addEventListener('click', finalizarLote);
    if (!loteActivo) finalizarLoteBtn.style.display = 'none';
  }

  // Enter en SN: reutiliza la MISMA validación
  snInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      guardarRegistro();
    }
  });

  // Enfoque inicial
  snInput.focus();
});
