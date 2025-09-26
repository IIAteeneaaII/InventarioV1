document.addEventListener('DOMContentLoaded', function () {
  // Obtener el botón de descarga
  const descargarBtn = document.getElementById("descargar-btn");
  if (descargarBtn) {
    descargarBtn.addEventListener("click", function () {
      mostrarModalFiltros();
    });
  }

// Función para mostrar el modal de descarga de Excel con filtros
function mostrarModalFiltros() {
  const today = new Date();
  const todayFormatted = today.toLocaleDateString('es-ES'); // Formato dd/mm/yyyy
  const todayISO = today.toISOString().split('T')[0]; // Para el input date
  
  Swal.fire({
    title: '<i class="fas fa-file-excel" style="color: #28a745;"></i> Filtros para Descarga Excel',
    width: '600px',
    background: '#f8f9fa',
    color: '#495057',
    customClass: {
      popup: 'custom-swal-popup',  // Añadimos la clase del estilo
      title: 'custom-swal-title',  // Título del modal con color personalizado
      content: 'custom-swal-content',  // Contenido con espaciado y color
      confirmButton: 'custom-confirm-btn', // Botón de confirmación con estilo
      cancelButton: 'custom-cancel-btn', // Botón de cancelación con estilo
    },
    html: `
      <div class="filter-container">
        <div class="filter-section">
          <h4><i class="fas fa-calendar-alt"></i> Período de Tiempo</h4>
          <div class="filter-grid">
            <div class="filter-input-group clickable-date-group" onclick="document.getElementById('swal-start-date').showPicker()">
              <label for="swal-start-date"><i class="fas fa-calendar-day"></i>Fecha Desde:</label>
              <input type="date" id="swal-start-date" value="${todayISO}" class="filter-input">
              <div class="date-display">${todayFormatted}</div>
            </div>
            <div class="filter-input-group clickable-date-group" onclick="document.getElementById('swal-end-date').showPicker()">
              <label for="swal-end-date"><i class="fas fa-calendar-check"></i>Fecha Hasta:</label>
              <input type="date" id="swal-end-date" value="${todayISO}" class="filter-input">
              <div class="date-display">${todayFormatted}</div>
            </div>
          </div>
        </div>
        
        <div class="filter-section">
          <h4><i class="fas fa-filter"></i> Filtros Adicionales</h4>
          <div class="filter-single-column">
            <div class="filter-input-group">
              <label for="swal-estado"><i class="fas fa-check-circle"></i>Estado:</label>
              <select id="swal-estado" class="filter-select">
                <option value="">📋 Todos los estados</option>
                <option value="OK">✅ OK</option>
                <option value="SCRAP">❌ SCRAP</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-download"></i> Generar Excel',
    cancelButtonText: '<i class="fas fa-times"></i> Cancelar',
    confirmButtonColor: '#28a745',
    cancelButtonColor: '#dc3545',
    buttonsStyling: true,
    customClass: {
      confirmButton: 'custom-confirm-btn',
      cancelButton: 'custom-cancel-btn'
    },
    didOpen: () => {
      // Actualizar displays cuando cambien las fechas
      const startDateInput = document.getElementById('swal-start-date');
      const endDateInput = document.getElementById('swal-end-date');
      
      function updateDateDisplay(input, displayElement) {
        if (input.value) {
          const date = new Date(input.value + 'T00:00:00');
          displayElement.textContent = date.toLocaleDateString('es-ES');
        }
      }
      
      startDateInput.addEventListener('change', function() {
        const display = this.parentElement.querySelector('.date-display');
        updateDateDisplay(this, display);
      });
      
      endDateInput.addEventListener('change', function() {
        const display = this.parentElement.querySelector('.date-display');
        updateDateDisplay(this, display);
      });
    },
    preConfirm: () => {
      const startDate = document.getElementById('swal-start-date').value;
      const endDate = document.getElementById('swal-end-date').value;
      const estado = document.getElementById('swal-estado').value;
      
      if (!startDate || !endDate) {
        Swal.showValidationMessage('⚠️ Por favor seleccione un rango de fechas válido');
        return false;
      }
      
      if (new Date(startDate) > new Date(endDate)) {
        Swal.showValidationMessage('⚠️ La fecha de inicio no puede ser mayor que la fecha final');
        return false;
      }
      
      return { startDate, endDate, estado };
    },
  }).then((result) => {
    if (result.isConfirmed) {
      descargarExcelFiltrado(result.value);
    }
  });
}

  function descargarExcelFiltrado(filtros) {
    const tabla = document.querySelector('.registros-table');
    if (!tabla) {
      Swal.fire('Error', 'No se encontró la tabla de registros.', 'error');
      return;
    }
    
    // Clonar la tabla para filtrar
    const tablaClonada = tabla.cloneNode(true);
    const filas = tablaClonada.querySelectorAll('tbody tr');
    const tbody = tablaClonada.querySelector('tbody');
    tbody.innerHTML = '';
    
    let registrosFiltrados = 0;
    
    filas.forEach(fila => {
      const fechaTexto = fila.cells[2].textContent.trim();
      const estadoTexto = fila.cells[3].textContent.trim();
      const usuarioTexto = fila.cells[0].textContent.trim();
      
      // Parsear fecha (formato: DD/MM/YYYY, HH:MM:SS)
      const fechaParts = fechaTexto.split(',')[0].split('/');
      const fechaRegistro = new Date(fechaParts[2], fechaParts[1] - 1, fechaParts[0]);
      const fechaInicio = new Date(filtros.startDate);
      const fechaFin = new Date(filtros.endDate + 'T23:59:59');
      
      let incluir = true;
      
      // Filtro por fecha
      if (fechaRegistro < fechaInicio || fechaRegistro > fechaFin) {
        incluir = false;
      }
      
      // Filtro por estado
      if (filtros.estado && !estadoTexto.includes(filtros.estado)) {
        incluir = false;
      }
      
      // Solo incluir registros del usuario actual (empaque)
      if (usuarioTexto !== window.user.nombre) {
        incluir = false;
      }
      
      if (incluir) {
        tbody.appendChild(fila.cloneNode(true));
        registrosFiltrados++;
      }
    });
    
    if (registrosFiltrados === 0) {
      Swal.fire('📊 Sin Resultados', 'No se encontraron registros que coincidan con los filtros seleccionados.', 'info');
      return;
    }
    
    // Generar nombre de archivo dinámico
    const skuText = document.querySelector('.form-section h1').textContent.trim().replace(' - ', '_');
    const fechaFormateada = filtros.startDate === filtros.endDate ? filtros.startDate : filtros.startDate + '_a_' + filtros.endDate;
    const nombreArchivo = `Empaque_${skuText}_${fechaFormateada}.xls`;
    
    // Crear enlace de descarga
    const tablaHTML = tablaClonada.outerHTML.replace(/ /g, '%20');
    const enlaceDescarga = document.createElement('a');
    enlaceDescarga.href = 'data:application/vnd.ms-excel,' + tablaHTML;
    enlaceDescarga.download = nombreArchivo;
    document.body.appendChild(enlaceDescarga);
    enlaceDescarga.click();
    document.body.removeChild(enlaceDescarga);
    
    // Mostrar confirmación
    Swal.fire({
      title: '🎉 ¡Descarga Completada!',
      width: '550px',
      background: '#f8f9fa',
      html: `
        <div class="success-container">
          <div class="success-header">
            <h3 style="margin: 0; font-size: 18px;">
              <i class="fas fa-file-excel" style="margin-right: 10px;"></i>
              Archivo Excel Generado Exitosamente
            </h3>
          </div>
          <div class="success-details">
            <div class="detail-row">
              <div class="detail-label">
                <i class="fas fa-file-signature"></i>
                Nombre del Archivo:
              </div>
              <div class="detail-value">${nombreArchivo}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">
                <i class="fas fa-database"></i>
                Total de Registros:
              </div>
              <div class="detail-value">${registrosFiltrados}</div>
            </div>
            <div class="detail-row">
              <div class="detail-label">
                <i class="fas fa-calendar-range"></i>
                Período:
              </div>
              <div class="detail-value">${filtros.startDate} al ${filtros.endDate}</div>
            </div>
          </div>
          <div class="footer-note">
            <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
            El archivo se ha descargado automáticamente en su carpeta de descargas
          </div>
        </div>
      `,
      icon: 'success',
      confirmButtonText: '<i class="fas fa-check"></i> Perfecto',
      confirmButtonColor: '#28a745',
      customClass: {
        popup: 'custom-success-popup'
      },
      timer: 5000,
      timerProgressBar: true
    });
  }
});
