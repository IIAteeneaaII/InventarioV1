// Filtro de búsqueda para la tabla "Historial de Registros"
document.addEventListener('DOMContentLoaded', () => {
  // Ejecutar la inicialización después de un breve retraso para permitir que
  // otros scripts carguen los datos primero
  setTimeout(inicializarBuscador, 500);
  
  // También re-inicializar después de 2 segundos para asegurarnos
  // de capturar datos que puedan cargarse más tarde
  setTimeout(inicializarBuscador, 2000);
  
  function inicializarBuscador() {
    const input = document.getElementById('historial-search');
    const clearBtn = document.getElementById('clear-search');
    const countEl = document.getElementById('search-count');
    const table = document.querySelector('.registros-table');
    
    if (!table || !input) {
      console.warn('No se encontraron los elementos necesarios para la búsqueda en historial');
      return;
    }

    console.log('Script historial-search.js inicializado');
    
    // Añadir estilos dinámicamente para efectos visuales
    if (!document.getElementById('historial-search-styles')) {
      const style = document.createElement('style');
      style.id = 'historial-search-styles';
      style.textContent = `
        .highlighted-row {
          background-color: rgba(255, 236, 179, 1) !important;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
          transition: background-color 2s ease;
        }
        
        .fade-highlight {
          background-color: transparent !important;
        }
        
        .registros-table tbody tr {
          transition: background-color 0.3s ease;
        }
        
        .no-results-row td {
          text-align: center;
          padding: 15px;
          color: #888;
          font-style: italic;
        }
      `;
      document.head.appendChild(style);
    }

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    
    if (!tbody) {
      console.warn('No se encontró el cuerpo de la tabla');
      return;
    }
    
    // Función para obtener filas actualizadas - crucial para capturar filas
    // que pueden cargarse después de la inicialización
    function obtenerFilasActuales() {
      return Array.from(tbody.querySelectorAll('tr'));
    }
    
    let rows = obtenerFilasActuales();
    console.log(`Filas encontradas: ${rows.length}`);
    
    // Si no hay filas todavía, configurar un observador para detectar cuando se añadan
    if (rows.length === 0) {
      console.log('Configurando observador para detectar cambios en la tabla...');
      
      const observer = new MutationObserver((mutations) => {
        // Cuando se detectan cambios, verificar si ahora hay filas
        const nuevasFilas = obtenerFilasActuales();
        if (nuevasFilas.length > 0 && rows.length === 0) {
          console.log(`Se detectaron ${nuevasFilas.length} filas nuevas`);
          rows = nuevasFilas;
          observer.disconnect(); // Dejar de observar una vez que encontramos filas
        }
      });
      
      observer.observe(tbody, { childList: true, subtree: true });
    }
    
    const colCount = thead ? thead.querySelectorAll('th').length : 1;
    
    // Función para normalizar texto (quitar acentos, etc.)
    const normalize = (text) =>
      (text || '')
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    
    // Función para resaltar una fila y moverla al principio
    const highlightRow = (row) => {
      console.log('Resaltando fila:', row);
      
      // Añadir clase para sombrear
      row.classList.add('highlighted-row');
      
      // Mover la fila al principio de la tabla
      if (tbody.firstChild) {
        tbody.insertBefore(row, tbody.firstChild);
      }
      
      // Iniciar desvanecimiento después de un breve retraso
      setTimeout(() => {
        row.classList.add('fade-highlight');
        
        // Eliminar clases después de completar la animación
        setTimeout(() => {
          row.classList.remove('highlighted-row', 'fade-highlight');
        }, 2000);
      }, 100);
    };
    
    // Variable para el debounce
    let debounceId;
    
    // Función principal de filtrado
    const doFilter = () => {
      // IMPORTANTE: Actualizar las filas en cada filtrado para capturar
      // filas que puedan haberse añadido después de la inicialización
      rows = obtenerFilasActuales();
      
      const q = normalize(input.value.trim());
      console.log(`Buscando: "${q}"`);
      
      let visible = 0;
      let firstMatchFound = false;
      
      // Quitar fila de "sin resultados" previa si existe
      const prevNo = tbody.querySelector('.no-results-row');
      if (prevNo) prevNo.remove();
      
      // Procesar cada fila
      rows.forEach((tr) => {
        const hayTexto = normalize(tr.textContent);
        const match = q === '' || hayTexto.includes(q);
        
        tr.style.display = match ? '' : 'none';
        
        if (match) {
          visible++;
          
          // Resaltar solo el primer resultado encontrado
          if (q !== '' && !firstMatchFound) {
            highlightRow(tr);
            firstMatchFound = true;
          }
        }
      });
      
      console.log(`Resultados encontrados: ${visible}`);
      
      // Actualizar contador de resultados
      if (q === '' || visible === rows.length) {
        countEl.textContent = '';
      } else {
        countEl.textContent = `${visible} resultado${visible !== 1 ? 's' : ''}`;
      }
      
      // Mostrar mensaje si no hay resultados
      if (visible === 0 && rows.length > 0) {
        const tr = document.createElement('tr');
        tr.className = 'no-results-row';
        const td = document.createElement('td');
        td.colSpan = colCount;
        td.textContent = 'No hay resultados para la búsqueda.';
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    };
    
    // Implementar debounce para evitar ejecutar búsqueda en cada pulsación
    const debounced = () => {
      window.clearTimeout(debounceId);
      debounceId = setTimeout(doFilter, 120);
    };
    
    // Conectar eventos
    input.addEventListener('input', debounced);
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        doFilter();
      }
    });
    
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        input.focus();
        doFilter();
      });
    }
    
    // Ejecutar filtro inicial
    doFilter();
  }
});