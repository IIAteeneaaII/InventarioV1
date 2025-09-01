// Dashboard-charts.js - Versión simplificada para resolver problemas de gráficas

// Almacena las instancias de gráficas para su posterior destrucción
let charts = {};

document.addEventListener('DOMContentLoaded', function() {
  console.log('Dashboard inicializando...');
  
  // Configurar botones y selectores
  setupControls();
  
  // Cargar datos iniciales
  loadData(30);
});

function setupControls() {
  // Botón Regresar
  const btnRegresar = document.getElementById('REGRESAR');
  if (btnRegresar) {
    btnRegresar.addEventListener('click', () => window.location.href = '/adminventario');
  }
  
  // Botón Actualizar
  const btnActualizar = document.getElementById('actualizarDatos');
  if (btnActualizar) {
    btnActualizar.addEventListener('click', () => {
      const dias = document.getElementById('rangoDias')?.value || 30;
      loadData(dias);
    });
  }
  
  // Selector de días
  const selectDias = document.getElementById('rangoDias');
  if (selectDias) {
    selectDias.addEventListener('change', (e) => loadData(e.target.value));
  }
  
  // Selector de SKU
  const skuSelector = document.getElementById('skuSelector');
  if (skuSelector) {
    skuSelector.addEventListener('change', (e) => {
      const dias = document.getElementById('rangoDias')?.value || 30;
      loadData(dias, e.target.value);
    });
  }
}

function loadData(dias, skuNombre = 'todos') {
  console.log(`Cargando datos para ${dias} días, SKU: ${skuNombre}`);
  
  // Mostrar estado de carga
  setLoadingState();
  
  // Destruir gráficas existentes
  destroyAllCharts();
  
  // Cargar SKUs para el selector
  loadSKUs();
  
  // Cargar datos principales
  const url = `/api/stats/dashboard-filtered?dias=${dias}${skuNombre !== 'todos' ? `&skuNombre=${skuNombre}` : ''}`;
  
  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Error ${response.status}`);
      return response.json();
    })
    .then(data => {
      // Actualizar contador
      document.getElementById('total-modems-count').textContent = data.totalModems || 0;
      
      // Renderizar gráficas
      renderSkuChart(data.distribucionSKU);
      renderDailyChart(data.modemsRegistradosPorDia);
      renderPhaseChart(data.estadoPorFase);
      
      // Cargar datos de etapas
      loadStagesData(skuNombre);
    })
    .catch(error => {
      console.error('Error al cargar datos:', error);
      showError(error.message);
    });
}

function loadSKUs() {
  fetch('/api/stats/dashboard-filtered')
    .then(response => {
      if (!response.ok) throw new Error(`Error ${response.status}`);
      return response.json();
    })
    .then(data => {
      const selector = document.getElementById('skuSelector');
      if (!selector) return;
      
      // Mantener solo la primera opción
      while (selector.options.length > 1) {
        selector.remove(1);
      }
      
      // Añadir opciones
      data.distribucionSKU.forEach(sku => {
        const option = document.createElement('option');
        option.value = sku.nombre;
        option.textContent = sku.nombre;
        selector.appendChild(option);
      });
    })
    .catch(error => {
      console.error('Error al cargar SKUs:', error);
    });
}

function loadStagesData(skuNombre) {
  const url = `/api/stats/etapas-proceso${skuNombre !== 'todos' ? `?skuNombre=${skuNombre}` : ''}`;
  
  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Error ${response.status}`);
      return response.json();
    })
    .then(data => {
      renderStagesChart(data);
    })
    .catch(error => {
      console.error('Error al cargar datos de etapas:', error);
      showStagesError(error.message);
    });
}

// --- Funciones auxiliares ---

function setLoadingState() {
  // Actualizar contador
  const counter = document.getElementById('total-modems-count');
  if (counter) counter.textContent = 'Cargando...';
  
  // Mostrar indicadores de carga en cada contenedor
  document.querySelectorAll('.chart-container').forEach(container => {
    // Eliminar canvas existente si lo hay
    const existingCanvas = container.querySelector('canvas');
    const canvasId = existingCanvas?.id || '';
    
    // Limpiar el contenedor
    container.innerHTML = '';
    
    // Recrear el canvas
    if (canvasId) {
      const canvas = document.createElement('canvas');
      canvas.id = canvasId;
      container.appendChild(canvas);
    }
    
    // Añadir indicador de carga
    const loading = document.createElement('div');
    loading.className = 'loading-indicator';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i><p>Cargando datos...</p>';
    container.appendChild(loading);
  });
}

function destroyAllCharts() {
  // Destruir todas las instancias de gráficas
  Object.values(charts).forEach(chart => {
    if (chart) {
      try {
        chart.destroy();
      } catch (e) {
        console.error('Error al destruir gráfica:', e);
      }
    }
  });
  
  // Reiniciar el objeto de charts
  charts = {};
}

function showError(message) {
  // Mostrar error en el contador
  const counter = document.getElementById('total-modems-count');
  if (counter) counter.textContent = 'Error';
  
  // Mostrar error en todos los contenedores de gráficas
  document.querySelectorAll('.chart-container').forEach(container => {
    container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error al cargar datos</p>
        <small>${message}</small>
      </div>
    `;
  });
}

function showStagesError(message) {
  const container = document.querySelector('.chart-section:nth-child(3) .chart-container');
  if (container) {
    container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error al cargar datos de etapas</p>
        <small>${message}</small>
      </div>
    `;
  }
}

// --- Funciones de renderizado de gráficas ---

function renderSkuChart(data) {
  const container = document.querySelector('.chart-section:nth-child(1) .chart-container');
  if (!container) return;
  
  // Eliminar indicador de carga
  container.querySelector('.loading-indicator')?.remove();
  
  // Recrear canvas si no existe
  if (!container.querySelector('canvas')) {
    const canvas = document.createElement('canvas');
    canvas.id = 'chartSKU';
    container.appendChild(canvas);
  }
  
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  
  // Datos para la gráfica
  const labels = data.map(item => item.nombre);
  const values = data.map(item => item.cantidad);
  const colors = ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b', 
                 '#5a5c69', '#858796', '#6610f2', '#6f42c1', '#fd7e14'];
  
  // Crear gráfica
  charts.sku = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' }
      }
    }
  });
}

function renderDailyChart(data) {
  const container = document.querySelector('.chart-section:nth-child(2) .chart-container');
  if (!container) return;
  
  // Eliminar indicador de carga
  container.querySelector('.loading-indicator')?.remove();
  
  // Recrear canvas si no existe
  if (!container.querySelector('canvas')) {
    const canvas = document.createElement('canvas');
    canvas.id = 'chartDiario';
    container.appendChild(canvas);
  }
  
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  
  // Datos para la gráfica
  const labels = data.map(item => new Date(item.fecha).toLocaleDateString());
  const values = data.map(item => item.cantidad);
  
  // Crear gráfica
  charts.diario = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Modems registrados',
        data: values,
        fill: true,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

function renderStagesChart(data) {
  const container = document.querySelector('.chart-section:nth-child(3) .chart-container');
  if (!container) return;
  
  // Eliminar indicador de carga
  container.querySelector('.loading-indicator')?.remove();
  
  // Recrear canvas si no existe
  if (!container.querySelector('canvas')) {
    const canvas = document.createElement('canvas');
    canvas.id = 'chartEtapas';
    container.appendChild(canvas);
  }
  
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  
  // Obtener el total de modems del contador principal
  const totalModems = parseInt(document.getElementById('total-modems-count')?.textContent) || 0;
  
  // Datos para la gráfica
  const etiquetas = ['Registro', 'En Proceso', 'Entrega', 'Final', 'Scrap'];
  const valores = [
    data.registro || 0,
    data.enProceso || 0,
    data.entrega || 0,
    data.final || 0,
    data.scrap || 0
  ];
  
  // Colores para cada categoría
  const colores = ['#4e73df', '#f6c23e', '#1cc88a', '#36b9cc', '#dc3545'];
  
  // Crear dataset para línea de referencia
  const referenceLine = {
    label: 'Total General',
    data: etiquetas.map(() => totalModems),
    type: 'line',
    borderColor: 'rgba(255, 0, 0, 0.7)',
    borderWidth: 2,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false
  };
  
  // Crear gráfica
  charts.etapas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: 'Cantidad de modems',
          data: valores,
          backgroundColor: colores,
          borderColor: colores,
          borderWidth: 1
        },
        referenceLine  // Añadir línea de referencia
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: 'top',
          labels: {
            generateLabels: function(chart) {
              const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              if (labels[1]) {
                labels[1].text = `Total General (${totalModems})`;
              }
              return labels;
            }
          }
        },
        tooltip: {
          callbacks: {
            footer: function() {
              return `Total de modems: ${totalModems}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Cantidad' },
          suggestedMax: Math.max(...valores, totalModems) * 1.1 // 10% extra
        },
        x: {
          title: { display: true, text: 'Etapa' }
        }
      }
    }
  });
}

function renderPhaseChart(data) {
  const container = document.querySelector('.chart-section:nth-child(4) .chart-container');
  if (!container) return;

  container.querySelector('.loading-indicator')?.remove();

  if (!container.querySelector('canvas')) {
    const canvas = document.createElement('canvas');
    canvas.id = 'chartFase';
    container.appendChild(canvas);
  }

  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  // Obtener el total de modems del contador principal
  const totalModems = parseInt(document.getElementById('total-modems-count')?.textContent) || 0;

  // Definir el orden específico de las fases
  const ordenFases = [
    'REGISTRO', 
    'TEST_INICIAL', 
    'ENSAMBLE',
    'RETEST', 
    'EMPAQUE',
    'SCRAP'
  ];
  
  // Mapeo de nombres legibles para las fases
  const nombresFases = {
    'REGISTRO': 'Registro',
    'TEST_INICIAL': 'Test Inicial',
    'ENSAMBLE': 'Ensamble',
    'RETEST': 'Retest',
    'EMPAQUE': 'Empaque',
    'SCRAP': 'Scrap'
  };
  
  // Agrupar los datos por fase (acumulando los valores para cada fase)
  const datosPorFase = {};
  ordenFases.forEach(fase => {
    datosPorFase[fase] = 0;
  });
  
  data.forEach(item => {
    // Si la fase existe en nuestro orden predefinido, acumular su cantidad
    if (ordenFases.includes(item.faseActual)) {
      datosPorFase[item.faseActual] += item.cantidad;
    }
  });
  
  // Preparar etiquetas y datos para la gráfica
  const faseLabels = ordenFases.map(fase => nombresFases[fase] || formatFaseName(fase));
  const valores = ordenFases.map(fase => datosPorFase[fase] || 0);
  
  // Colores para cada fase
  const colores = [
    '#4e73df', // Registro (azul)
    '#36b9cc', // Test Inicial (cyan)
    '#1cc88a', // Ensamble (verde)
    '#f6c23e', // Retest (amarillo)
    '#5a5c69', // Empaque (gris)
    '#dc3545'  // Scrap (rojo oscuro)
  ];

  // Dataset principal para las barras
  const barDataset = {
    label: 'Cantidad por fase',
    data: valores,
    backgroundColor: colores,
    borderColor: colores.map(color => color),
    borderWidth: 1,
    barPercentage: 0.7, // Ajuste del ancho de las barras
    categoryPercentage: 0.9
  };

  // Línea de referencia del total
  const referenceLine = {
    label: 'Total General',
    data: faseLabels.map(() => totalModems),
    type: 'line',
    borderColor: 'rgba(255, 0, 0, 0.7)',
    borderWidth: 2,
    borderDash: [5, 5],
    pointRadius: 0,
    fill: false,
    order: 0
  };

  // Crear gráfica
  charts.fase = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: faseLabels,
      datasets: [barDataset, referenceLine]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: { 
            display: true, 
            text: 'Cantidad de modems',
            font: { weight: 'bold' }
          },
          suggestedMax: Math.max(totalModems, ...valores) * 1.1
        },
        x: {
          title: { 
            display: true, 
            text: 'Fase',
            font: { weight: 'bold' }
          },
          ticks: {
            font: { size: 12 }
          },
          grid: { display: false }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 15,
            padding: 10,
            generateLabels: function(chart) {
              const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              if (labels.length > 1) {
                labels[1].text = `Total General (${totalModems})`;
              }
              return labels;
            }
          }
        },
        tooltip: {
          callbacks: {
            footer: function() {
              return `Total de modems: ${totalModems}`;
            }
          }
        }
      }
    }
  });
}

// Función auxiliar para formatear nombres de fases
function formatFaseName(fase) {
  if (typeof fase === 'string' && fase.includes('_')) {
    return fase.toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return `Fase ${fase}`;
}

function simplifyStateName(name) {
  if (typeof name !== 'string') return name;
  if (name.length > 15) {
    return name.split(' ').slice(0, 2).join(' ') + '...';
  }
  return name;
}