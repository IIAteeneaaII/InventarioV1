// Variables globales para almacenar las instancias de las gráficas
let estadoChart, faseChart, loteChart, tendenciaChart;

document.addEventListener('DOMContentLoaded', function() {
    // Obtener el ID del SKU del elemento oculto en la página
    const skuId = document.getElementById('sku-id')?.value;
    if (!skuId) {
        console.error('No se encontró el ID del SKU');
        return;
    }
    
    // Configurar listeners de eventos
    setupEventListeners(skuId);
    
    // Cargar datos iniciales
    cargarDatosGraficas(skuId);
});

function setupEventListeners(skuId) {
    // Botón de actualizar
    const refreshButton = document.getElementById('refresh-charts');
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            cargarDatosGraficas(skuId);
        });
    }
    
    // Selector de rango de tiempo
    const timeRangeSelect = document.getElementById('chart-time-range');
    if (timeRangeSelect) {
        timeRangeSelect.addEventListener('change', function() {
            cargarDatosGraficas(skuId, this.value);
        });
    }
}

function cargarDatosGraficas(skuId, dias = 30) {
    // Mostrar indicadores de carga
    mostrarCargando();
    
    // Cargar datos con parámetro de días
    fetch(`/api/stats/sku/${skuId}?dias=${dias}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Error al cargar datos estadísticos');
            }
            return response.json();
        })
        .then(data => {
            // Actualizar contador total
            actualizarContadorTotal(data);
            
            // Crear todas las gráficas con los datos recibidos
            crearGraficas(data);
        })
        .catch(error => {
            console.error('Error:', error);
            mostrarErrorEnGraficas();
        });
}

function mostrarCargando() {
    const contenedores = [
        'estadoChart', 'faseChart', 'loteChart', 'tendenciaChart'
    ];
    
    // Contador total
    const totalModemsCount = document.getElementById('total-modems-count');
    if (totalModemsCount) {
        totalModemsCount.textContent = 'Cargando...';
    }
    
    contenedores.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = '#666';
            ctx.textAlign = 'center';
            ctx.fillText('Cargando datos...', canvas.width / 2, canvas.height / 2);
        }
    });
}

function actualizarContadorTotal(data) {
    let total = 0;
    
    // Sumar desde estadoStats
    if (data.estadoStats && data.estadoStats.length > 0) {
        data.estadoStats.forEach(item => {
            total += parseInt(item.cantidad);
        });
    }
    
    // Actualizar en la UI
    const totalModemsCount = document.getElementById('total-modems-count');
    if (totalModemsCount) {
        totalModemsCount.textContent = total.toLocaleString();
    }
}

function crearGraficas(data) {
    // Verificar que hay datos para cada gráfica
    if (data.estadoStats && data.estadoStats.length > 0) {
        crearGraficaEstado(data.estadoStats);
    } else {
        mostrarNoData('estadoChart');
    }
    
    if (data.faseStats && data.faseStats.length > 0) {
        crearGraficaFase(data.faseStats);
    } else {
        mostrarNoData('faseChart');
    }
    
    if (data.loteStats && data.loteStats.length > 0) {
        crearGraficaLote(data.loteStats);
    } else {
        mostrarNoData('loteChart');
    }
    
    if (data.tendencia && data.tendencia.length > 0) {
        crearGraficaTendencia(data.tendencia);
    } else {
        mostrarNoData('tendenciaChart');
    }
}

function crearGraficaEstado(datos) {
    const ctx = document.getElementById('estadoChart');
    if (!ctx) return;
    
    // Destruir gráfica anterior si existe
    if (estadoChart) {
        estadoChart.destroy();
    }
    
    const labels = datos.map(item => item.nombre);
    const values = datos.map(item => parseInt(item.cantidad));
    
    // Usar colores de la base de datos si están disponibles
    const colors = datos.map(item => {
        return item.color ? item.color : generarColorAleatorio();
    });
    
    estadoChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.chart.getDatasetMeta(0).total;
                            const percentage = total ? Math.round((value / total) * 100) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function crearGraficaFase(datos) {
    const ctx = document.getElementById('faseChart');
    if (!ctx) return;
    
    // Destruir gráfica anterior si existe
    if (faseChart) {
        faseChart.destroy();
    }
    
    const labels = datos.map(item => item.faseActual);
    const values = datos.map(item => parseInt(item.cantidad));
    const colors = generarColores(datos.length);
    
    faseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.chart.getDatasetMeta(0).total;
                            const percentage = total ? Math.round((value / total) * 100) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function crearGraficaLote(datos) {
    const ctx = document.getElementById('loteChart');
    if (!ctx) return;
    
    // Destruir gráfica anterior si existe
    if (loteChart) {
        loteChart.destroy();
    }
    
    const labels = datos.map(item => item.numero);
    const values = datos.map(item => parseInt(item.cantidad));
    
    loteChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cantidad de modems',
                data: values,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function crearGraficaTendencia(datos) {
    const ctx = document.getElementById('tendenciaChart');
    if (!ctx) return;
    
    // Destruir gráfica anterior si existe
    if (tendenciaChart) {
        tendenciaChart.destroy();
    }
    
    const labels = datos.map(item => {
        const fecha = new Date(item.fecha);
        return fecha.toLocaleDateString();
    });
    
    const values = datos.map(item => parseInt(item.cantidad));
    
    tendenciaChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Registros por día',
                data: values,
                fill: false,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function mostrarNoData(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '16px Arial';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText('No hay datos disponibles', canvas.width / 2, canvas.height / 2);
}

function mostrarErrorEnGraficas() {
    const contenedores = [
        'estadoChart', 'faseChart', 'loteChart', 'tendenciaChart'
    ];
    
    // Actualizar contador con error
    const totalModemsCount = document.getElementById('total-modems-count');
    if (totalModemsCount) {
        totalModemsCount.textContent = 'Error';
    }
    
    contenedores.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '16px Arial';
            ctx.fillStyle = '#dc3545';
            ctx.textAlign = 'center';
            ctx.fillText('Error al cargar datos', canvas.width / 2, canvas.height / 2);
        }
    });
}

function generarColores(cantidad) {
    const colores = [
        'rgba(255, 99, 132, 0.7)',   // Rojo
        'rgba(54, 162, 235, 0.7)',   // Azul
        'rgba(255, 206, 86, 0.7)',   // Amarillo
        'rgba(75, 192, 192, 0.7)',   // Verde azulado
        'rgba(153, 102, 255, 0.7)',  // Púrpura
        'rgba(255, 159, 64, 0.7)',   // Naranja
        'rgba(199, 199, 199, 0.7)',  // Gris
        'rgba(83, 102, 255, 0.7)',   // Azul-púrpura
        'rgba(40, 159, 64, 0.7)',    // Verde
        'rgba(210, 105, 30, 0.7)'    // Marrón
    ];
    
    // Si necesitamos más colores, generamos aleatoriamente
    if (cantidad > colores.length) {
        for (let i = colores.length; i < cantidad; i++) {
            colores.push(generarColorAleatorio());
        }
    }
    
    return colores.slice(0, cantidad);
}

function generarColorAleatorio() {
    const r = Math.floor(Math.random() * 255);
    const g = Math.floor(Math.random() * 255);
    const b = Math.floor(Math.random() * 255);
    return `rgba(${r}, ${g}, ${b}, 0.7)`;
}