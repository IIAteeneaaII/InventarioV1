// Filtro de búsqueda para la tabla "Historial de Registros"
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('historial-search');
  const clearBtn = document.getElementById('clear-search');
  const countEl = document.getElementById('search-count');
  const table = document.querySelector('.registros-table');
  if (!table || !input) return;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const colCount = thead ? thead.querySelectorAll('th').length : 1;

  const normalize = (t) =>
    (t || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // quita acentos

  let debounceId;
  const doFilter = () => {
    const q = normalize(input.value.trim());
    let visible = 0;

    // Quitar fila de "sin resultados" previa si existe
    const prevNo = tbody.querySelector('.no-results-row');
    if (prevNo) prevNo.remove();

    rows.forEach((tr) => {
      // Si la fila tiene celdas (evita filas especiales)
      const hayTexto = normalize(tr.textContent);
      const match = q === '' || hayTexto.includes(q);
      tr.style.display = match ? '' : 'none';
      if (match) visible++;
    });

    // Contador
    if (q === '' || visible === rows.length) {
      countEl.textContent = '';
    } else {
      countEl.textContent = `${visible} resultado${visible === 1 ? '' : 's'}`;
    }

    // Si no hay resultados, inserta una fila informativa
    if (visible === 0) {
      const tr = document.createElement('tr');
      tr.className = 'no-results-row';
      const td = document.createElement('td');
      td.colSpan = colCount;
      td.textContent = 'No hay resultados para la búsqueda.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  };

  const debounced = () => {
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(doFilter, 120);
  };

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
});
