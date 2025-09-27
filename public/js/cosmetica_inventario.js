// Estado global de la aplicación
const AppState = {
  inventario: {},
  transferenciasRecibo: [],
  transferenciasEnviadas: [],
  user: null,
  ramNumber: null,
  loading: false
};

let movimientoModal, envioModal;

// Utilidades
const Utils = {
  formatDate: (dateString) => {
    try { return new Date(dateString).toLocaleDateString('es-ES'); }
    catch { return 'Fecha inválida'; }
  },
  validateForm: (form) => { form.classList.add('was-validated'); return form.checkValidity(); },
  showLoading: (element, show = true) => {
    const spinner = element.querySelector('.spinner-border');
    if (spinner) spinner.style.display = show ? 'inline-block' : 'none';
  },
  updateElementText: (id, text, addSuccessClass = false) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
      if (addSuccessClass) {
        element.classList.add('success-update');
        setTimeout(() => element.classList.remove('success-update'), 2000);
      }
    }
  },
  safeGetProperty: (obj, path, defaultValue = '') => {
    try { return path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue; }
    catch { return defaultValue; }
  }
};

// API calls
const API = {
  async request(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async registrarMovimiento(data) {
    return this.request('/api/cosmetica/movimiento', { method: 'POST', body: JSON.stringify(data) });
  },

  async enviarInsumos(data) {
    return this.request('/api/cosmetica/envio', { method: 'POST', body: JSON.stringify(data) });
  },

  async confirmarRecibo(transferenciaId) {
    return this.request('/api/cosmetica/recibo', {
      method: 'POST', body: JSON.stringify({ transferenciaId })
    });
  },

  async cargarDatos() {
    // DEMO. En producción, reemplazar con llamada real.
    return {
      inventario: {
        'sku1': { skuId: 'sku1', nombre: 'Labial Rojo Intenso', CAPUCHONES: 150, BASES: 200, TAPAS: 100 },
        'sku2': { skuId: 'sku2', nombre: 'Base Líquida Natural', CAPUCHONES: 75, BASES: 120, TAPAS: 90 },
        'sku3': { skuId: 'sku3', nombre: 'Gloss Transparente', CAPUCHONES: 0, BASES: 50, TAPAS: 25 }
      },
      transferenciasRecibo: [
        { id: 1, sku: { nombre: 'Labial Rojo Intenso' }, tipoInsumo: 'CAPUCHONES', cantidad: 50,
          fechaEnvio: new Date().toISOString(), remitente: { nombre: 'RAM 002' } }
      ],
      transferenciasEnviadas: [
        { id: 2, sku: { nombre: 'Base Líquida Natural' }, tipoInsumo: 'BASES', cantidad: 30,
          fechaEnvio: new Date().toISOString(), destinatario: { nombre: 'RAM 003' } }
      ],
      user: { id: 999, nombre: 'Usuario Demo' },
      ramNumber: '001'
    };
  },

  // === Tickets ===
  async createTicket(ticketData) {
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ticketData,
          usuarioSolicitanteId: AppState.user?.id,
          usuarioSolicitante: AppState.user?.nombre
        })
      });
      if (response.ok) {
        const result = await response.json();
        return { success: true, data: result };
      } else {
        throw new Error('Error en el servidor');
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      // Fallback local
      const newTicket = {
        id: Date.now(),
        tipo: ticketData.tipo,
        descripcion: ticketData.descripcion,
        prioridad: ticketData.prioridad,
        estado: 'PENDIENTE',
        fechaCreacion: new Date().toISOString(),
        usuarioSolicitante: ticketData.usuarioSolicitante
      };
      const existingTickets = JSON.parse(localStorage.getItem('userTickets') || '[]');
      existingTickets.unshift(newTicket);
      localStorage.setItem('userTickets', JSON.stringify(existingTickets));
      return { success: true, data: newTicket };
    }
  },

  async loadUserTickets() {
    try {
      const response = await fetch(`/api/tickets/usuario/${AppState.user?.id}`);
      if (response.ok) {
        const result = await response.json();
        return result.data || [];
      } else {
        throw new Error('Error al cargar tickets');
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
      return JSON.parse(localStorage.getItem('userTickets') || '[]');
    }
  }
};

// Renderizado
const Renderer = {
  renderInventario() {
    const tbody = document.getElementById('inventario-tbody');
    if (!tbody) return;

    if (Object.keys(AppState.inventario).length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted">
            <i class="fas fa-box-open fa-2x mb-2 d-block"></i>
            No hay datos de inventario disponibles
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = Object.values(AppState.inventario).map(item => {
      const nombre = Utils.safeGetProperty(item, 'nombre') ||
                     Utils.safeGetProperty(item, 'skuNombre') ||
                     Utils.safeGetProperty(item, 'skuItem') || 'SKU sin nombre';
      const capuchones = parseInt(item.CAPUCHONES) || 0;
      const bases = parseInt(item.BASES) || 0;
      const tapas = parseInt(item.TAPAS) || 0;
      const total = capuchones + bases + tapas;

      return `
        <tr>
          <td>${nombre}</td>
          <td id="cantidad-${item.skuId}-CAPUCHONES">${capuchones}</td>
          <td id="cantidad-${item.skuId}-BASES">${bases}</td>
          <td id="cantidad-${item.skuId}-TAPAS">${tapas}</td>
          <td id="total-${item.skuId}">${total}</td>
          <td>
            <div class="btn-group-actions">
              <button class="btn btn-success btn-sm-custom me-1"
                      data-bs-toggle="modal" data-bs-target="#movimientoModal"
                      data-sku-id="${item.skuId}" data-tipo-movimiento="ENTRADA"
                      data-sku-nombre="${nombre}" aria-label="Envío (entrada) de ${nombre}">
                <i class="fas fa-plus"></i> Envío
              </button>
              <button class="btn btn-danger btn-sm-custom me-1"
                      data-bs-toggle="modal" data-bs-target="#movimientoModal"
                      data-sku-id="${item.skuId}" data-tipo-movimiento="SALIDA"
                      data-sku-nombre="${nombre}" ${total === 0 ? 'disabled' : ''}
                      aria-label="Recibo (salida) de ${nombre}">
                <i class="fas fa-minus"></i> Recibo
              </button>
              <button class="btn btn-info btn-sm-custom"
                      onclick="mostrarTransferenciasPendientes('${item.skuId}')"
                      aria-label="Ver transferencias de ${nombre}">
                <i class="fas fa-exchange-alt"></i> Pendientes
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  },

  renderTransferenciasRecibo() {
    const container = document.getElementById('transferencias-recibo');
    if (!container) return;

    if (AppState.transferenciasRecibo.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted">
          <i class="fas fa-inbox fa-3x mb-3"></i>
          <p>No hay transferencias pendientes de recibo</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="list-group">
        ${AppState.transferenciasRecibo.map(transfer => `
          <div class="list-group-item">
            <div class="d-flex w-100 justify-content-between">
              <h6 class="mb-1">${Utils.safeGetProperty(transfer, 'sku.nombre', 'SKU sin nombre')}</h6>
              <small class="text-muted">${Utils.formatDate(transfer.fechaEnvio)}</small>
            </div>
            <p class="mb-1"><strong>${transfer.tipoInsumo}:</strong> ${transfer.cantidad} unidades</p>
            <small class="text-muted">De: ${Utils.safeGetProperty(transfer, 'remitente.nombre', 'Remitente desconocido')}</small>
            <div class="mt-2">
              <button class="btn btn-success btn-sm" onclick="confirmarRecibo(${transfer.id})" aria-label="Confirmar recibo">
                <i class="fas fa-check"></i> Confirmar Recibo
              </button>
            </div>
          </div>`).join('')}
      </div>`;
  },

  renderTransferenciasEnviadas() {
    const container = document.getElementById('transferencias-enviadas');
    if (!container) return;

    if (AppState.transferenciasEnviadas.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted">
          <i class="fas fa-clock fa-3x mb-3"></i>
          <p>No hay transferencias enviadas pendientes</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="list-group">
        ${AppState.transferenciasEnviadas.map(transfer => `
          <div class="list-group-item">
            <div class="d-flex w-100 justify-content-between">
              <h6 class="mb-1">${Utils.safeGetProperty(transfer, 'sku.nombre', 'SKU sin nombre')}</h6>
              <small class="text-muted">${Utils.formatDate(transfer.fechaEnvio)}</small>
            </div>
            <p class="mb-1"><strong>${transfer.tipoInsumo}:</strong> ${transfer.cantidad} unidades</p>
            <small class="text-muted">Para: ${Utils.safeGetProperty(transfer, 'destinatario.nombre', 'Destinatario desconocido')}</small>
            <div class="mt-2"><span class="badge bg-warning text-dark"><i class="fas fa-clock"></i> Pendiente de confirmación</span></div>
          </div>`).join('')}
      </div>`;
  },

  updateBadge() {
    const badge = document.getElementById('badge-transferencias');
    if (!badge) return;
    const count = AppState.transferenciasRecibo.length;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  },

  // Tickets
  renderTicketsList(tickets) {
    const ticketsList = document.getElementById('tickets-list');
    if (!ticketsList) return;

    if (tickets.length === 0) {
      ticketsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-ticket-alt"></i>
          <p>No tienes tickets creados</p>
          <small>Crea tu primer ticket usando la pestaña "Crear Ticket"</small>
        </div>`;
      return;
    }

    const ticketsHtml = tickets.map(ticket => {
      const typeClass = ticket.tipo === 'SOLICITUD_FUNCION' ? 'solicitud' : 'problema';
      const typeLabel = ticket.tipo === 'SOLICITUD_FUNCION' ? 'Solicitud' : 'Problema';
      const statusLabel = ({ PENDIENTE: 'Pendiente', EN_PROCESO: 'En Proceso', RESUELTO: 'Resuelto' })[ticket.estado] || 'Pendiente';
      const fechaCreacion = new Date(ticket.fechaCreacion).toLocaleDateString('es-ES');

      return `
        <div class="ticket-item">
          <div class="ticket-header">
            <div style="display:flex;align-items:center;">
              <span class="ticket-type ${typeClass}">${typeLabel}</span>
              <div class="ticket-priority priority-${ticket.prioridad}">${ticket.prioridad}</div>
            </div>
            <span class="ticket-status ${ticket.estado.toLowerCase().replace('_','-')}">${statusLabel}</span>
          </div>
          <div class="ticket-description">${ticket.descripcion}</div>
          <div class="ticket-meta">
            <span>Creado: ${fechaCreacion}</span>
            <span>#${ticket.id}</span>
          </div>
        </div>`;
    }).join('');

    ticketsList.innerHTML = ticketsHtml;
  }
};

// === SISTEMA DE TICKETS ===
const TicketSystem = {
  selectedPriority: null,
  userTickets: [],

  init() {
    this.openTicketsBtn = document.getElementById('open-tickets-btn');
    this.closeTicketsBtn = document.getElementById('close-tickets-btn');
    this.ticketsPanel = document.getElementById('tickets-panel');
    this.ticketsOverlay = document.getElementById('tickets-overlay');
    this.ticketUserInput = document.getElementById('ticket-user');
    this.ticketForm = document.getElementById('ticket-form');

    this.setupEventListeners();
    this.updateUserInfo();
    this.loadUserTickets();
  },

  updateUserInfo() {
    if (AppState.user && this.ticketUserInput) {
      const userName = AppState.user.nombre || 'Usuario Demo';
      const userRole = 'RAM ' + (AppState.ramNumber || '--');
      this.ticketUserInput.value = `${userName} (${userRole})`;
    }
  },

  setupEventListeners() {
    this.openTicketsBtn?.addEventListener('click', () => this.openPanel());
    this.closeTicketsBtn?.addEventListener('click', () => this.closePanel());
    this.ticketsOverlay?.addEventListener('click', () => this.closePanel());

    document.querySelectorAll('.tickets-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    document.querySelectorAll('.priority-option').forEach(option => {
      option.addEventListener('click', (e) => this.selectPriority(e.currentTarget));
    });

    this.ticketForm?.addEventListener('submit', (e) => this.submitTicket(e));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.ticketsPanel?.classList.contains('active')) this.closePanel();
    });
  },

  openPanel() {
    this.ticketsPanel?.classList.add('active');
    this.ticketsOverlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
    this.loadUserTickets();
  },

  closePanel() {
    this.ticketsPanel?.classList.remove('active');
    this.ticketsOverlay?.classList.remove('active');
    document.body.style.overflow = '';
    this.resetForm();
  },

  switchTab(targetTab) {
    document.querySelectorAll('.tickets-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${targetTab}"]`)?.classList.add('active');

    const createTab = document.getElementById('create-ticket-tab');
    const viewTab = document.getElementById('view-tickets-tab');

    if (targetTab === 'create') {
      createTab.classList.remove('d-none');
      viewTab.classList.add('d-none');
    } else {
      createTab.classList.add('d-none');
      viewTab.classList.remove('d-none');
      this.loadUserTickets();
    }
  },

  selectPriority(option) {
    document.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    this.selectedPriority = parseInt(option.dataset.priority);
  },

  resetForm() {
    this.ticketForm?.reset();
    this.selectedPriority = null;
    document.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
    this.updateUserInfo();
  },

  async submitTicket(e) {
    e.preventDefault();

    if (!this.selectedPriority) {
      Swal.fire({ icon: 'warning', title: 'Selecciona una prioridad', text: 'Debes seleccionar el nivel de prioridad del ticket', confirmButtonText: 'Entendido' });
      return;
    }

    const formData = new FormData(this.ticketForm);
    const ticketData = {
      tipo: formData.get('tipo'),
      descripcion: formData.get('descripcion'),
      prioridad: this.selectedPriority,
      usuarioSolicitante: formData.get('usuario')
    };

    const submitBtn = this.ticketForm.querySelector('.submit-ticket-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    submitBtn.disabled = true;

    try {
      const result = await API.createTicket(ticketData);
      if (result.success) {
        await Swal.fire({
          icon: 'success',
          title: '¡Ticket Creado!',
          html: `Tu ticket ha sido creado exitosamente.<br><br>
                 <strong>ID:</strong> #${result.data.id}<br>
                 <strong>Tipo:</strong> ${ticketData.tipo === 'SOLICITUD_FUNCION' ? 'Solicitud de Función' : 'Reportar Problema'}<br>
                 <strong>Prioridad:</strong> ${this.selectedPriority}`,
          confirmButtonText: 'Ver mis tickets'
        });
        this.switchTab('view');
        this.resetForm();
      }
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'Error al crear ticket', text: 'Hubo un problema al crear el ticket. Inténtalo nuevamente.', confirmButtonText: 'Entendido' });
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  },

  async loadUserTickets() {
    try {
      this.userTickets = await API.loadUserTickets();
      Renderer.renderTicketsList(this.userTickets);
    } catch (error) {
      console.error('Error loading user tickets:', error);
      Renderer.renderTicketsList([]);
    }
  }
};

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', async function () {
  try {
    // Modales Bootstrap
    movimientoModal = new bootstrap.Modal(document.getElementById('movimientoModal'));
    envioModal = new bootstrap.Modal(document.getElementById('envioModal'));

    // Handlers movidos desde inline
    const logoutBtn = document.getElementById('logout-icon');
    if (logoutBtn) logoutBtn.addEventListener('click', cerrarSesion);

    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) userAvatar.addEventListener('error', () => { userAvatar.style.display = 'none'; });

    // Botón reintentar error
    document.getElementById('retry-btn')?.addEventListener('click', recargarDatos);

    await cargarDatosIniciales();
    configurarEventListeners();

    // Tickets
    TicketSystem.init();

  } catch (error) {
    console.error('Error en inicialización:', error);
    mostrarError('Error al cargar la aplicación');
  }
});

async function cargarDatosIniciales() {
  mostrarCarga(true);
  try {
    const datos = await API.cargarDatos();
    AppState.inventario = datos.inventario || {};
    AppState.transferenciasRecibo = datos.transferenciasRecibo || [];
    AppState.transferenciasEnviadas = datos.transferenciasEnviadas || [];
    AppState.user = datos.user;
    AppState.ramNumber = datos.ramNumber;

    Utils.updateElementText('ram-number', AppState.ramNumber || '--');
    Utils.updateElementText('username', Utils.safeGetProperty(AppState.user, 'nombre', 'Usuario'));

    Renderer.renderInventario();
    Renderer.renderTransferenciasRecibo();
    Renderer.renderTransferenciasEnviadas();
    Renderer.updateBadge();

    TicketSystem.updateUserInfo();
    ocultarError();
  } catch (error) {
    console.error('Error cargando datos:', error);
    mostrarError('Error al cargar los datos del inventario');
  } finally {
    mostrarCarga(false);
  }
}

function configurarEventListeners() {
  // Abrir modal de movimiento
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button[data-bs-target="#movimientoModal"]');
    if (button) {
      const skuId = button.getAttribute('data-sku-id');
      const skuNombre = button.getAttribute('data-sku-nombre');
      const tipoMovimiento = button.getAttribute('data-tipo-movimiento');

      document.getElementById('movimientoSkuId').value = skuId;
      document.getElementById('tipoMovimiento').value = tipoMovimiento;
      document.getElementById('movimientoNombreSkuModal').textContent = skuNombre;

      const modalTitle = document.getElementById('movimientoModalTitle');
      const modalHeader = document.getElementById('movimientoModalHeader');
      const infoDiv = document.getElementById('movimientoInfo');

      if (tipoMovimiento === 'ENTRADA') {
        modalTitle.textContent = 'Registrar Envío de Insumos';
        modalHeader.className = 'modal-header bg-success text-white';
        infoDiv.style.display = 'none';
      } else {
        modalTitle.textContent = 'Registrar Recibo de Insumos';
        modalHeader.className = 'modal-header bg-danger text-white';
        infoDiv.style.display = 'block';
      }

      const form = document.getElementById('movimientoForm');
      form.reset();
      form.classList.remove('was-validated');

      const tipoSelect = document.getElementById('movimientoTipoInsumo');
      tipoSelect.addEventListener('change', function () {
        if (tipoMovimiento === 'SALIDA') actualizarCantidadDisponible(skuId, this.value, 'movimiento');
      }, { once: true });
    }
  });

  // Abrir modal de envío
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button[data-bs-target="#envioModal"]');
    if (button) {
      const skuId = button.getAttribute('data-sku-id');
      const skuNombre = button.getAttribute('data-sku-nombre');

      document.getElementById('envioSkuId').value = skuId;
      document.getElementById('envioNombreSkuModal').textContent = skuNombre;

      const form = document.getElementById('envioForm');
      form.reset();
      form.classList.remove('was-validated');

      const tipoSelect = document.getElementById('envioTipoInsumo');
      tipoSelect.addEventListener('change', function () {
        actualizarCantidadDisponible(skuId, this.value, 'envio');
      }, { once: true });
    }
  });

  // Submit formularios
  document.getElementById('movimientoForm').addEventListener('submit', procesarMovimiento);
  document.getElementById('envioForm').addEventListener('submit', procesarEnvio);

  // Validación en tiempo real
  document.getElementById('movimientoCantidad').addEventListener('input', function () {
    const tipoMovimiento = document.getElementById('tipoMovimiento').value;
    if (tipoMovimiento === 'SALIDA') {
      const max = parseInt(document.getElementById('movimiento-cantidad-disponible').textContent);
      this.setCustomValidity(this.value > max ? `La cantidad no puede ser mayor a ${max}` : '');
    }
  });

  document.getElementById('envioCantidad').addEventListener('input', function () {
    const max = parseInt(document.getElementById('envio-cantidad-disponible').textContent);
    this.setCustomValidity(this.value > max ? `La cantidad no puede ser mayor a ${max}` : '');
  });
}

function actualizarCantidadDisponible(skuId, tipoInsumo, modalType) {
  const item = AppState.inventario[skuId];
  if (item && tipoInsumo) {
    const disponible = item[tipoInsumo] || 0;
    const elementId = modalType === 'movimiento' ? 'movimiento-cantidad-disponible' : 'envio-cantidad-disponible';
    Utils.updateElementText(elementId, disponible);

    const inputId = modalType === 'movimiento' ? 'movimientoCantidad' : 'envioCantidad';
    const cantidadInput = document.getElementById(inputId);
    cantidadInput.setAttribute('max', disponible);
  }
}

async function procesarMovimiento(e) {
  e.preventDefault();
  const form = e.target;
  if (!Utils.validateForm(form)) return;

  const btnMovimiento = document.getElementById('btn-movimiento');
  const spinner = btnMovimiento.querySelector('.spinner-border');

  btnMovimiento.disabled = true;
  spinner.classList.remove('d-none');

  try {
    const formData = {
      skuId: document.getElementById('movimientoSkuId').value,
      tipoInsumo: document.getElementById('movimientoTipoInsumo').value,
      tipoMovimiento: document.getElementById('tipoMovimiento').value,
      cantidad: parseInt(document.getElementById('movimientoCantidad').value)
    };

    const result = await API.registrarMovimiento(formData);

    if (result.success) {
      await Swal.fire({ icon: 'success', title: '¡Movimiento Registrado!', text: result.message, timer: 2000, showConfirmButton: false });
      actualizarInventarioLocal(formData, result.data);
      movimientoModal.hide();
    } else {
      throw new Error(result.message || 'Error al procesar movimiento');
    }
  } catch (error) {
    console.error('Error en movimiento:', error);
    await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'Ocurrió un error al registrar el movimiento.' });
  } finally {
    btnMovimiento.disabled = false;
    spinner.classList.add('d-none');
  }
}

async function procesarEnvio(e) {
  e.preventDefault();
  const form = e.target;
  if (!Utils.validateForm(form)) return;

  const btnEnviar = document.getElementById('btn-enviar');
  const spinner = btnEnviar.querySelector('.spinner-border');

  btnEnviar.disabled = true;
  spinner.classList.remove('d-none');

  try {
    const formData = {
      skuId: document.getElementById('envioSkuId').value,
      tipoInsumo: document.getElementById('envioTipoInsumo').value,
      cantidad: parseInt(document.getElementById('envioCantidad').value)
    };

    const result = await API.enviarInsumos(formData);

    if (result.success) {
      await Swal.fire({ icon: 'success', title: '¡Envío Registrado!', text: result.message, timer: 2000, showConfirmButton: false });
      actualizarInventarioLocal(formData, result.data);
      envioModal.hide();
      setTimeout(async () => { await cargarDatosIniciales(); }, 1000);
    } else {
      throw new Error(result.message || 'Error al procesar envío');
    }
  } catch (error) {
    console.error('Error en envío:', error);
    await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'Ocurrió un error al registrar el envío.' });
  } finally {
    btnEnviar.disabled = false;
    spinner.classList.add('d-none');
  }
}

function actualizarInventarioLocal(formData, newData) {
  const { skuId, tipoInsumo } = formData;

  if (AppState.inventario[skuId]) {
    AppState.inventario[skuId][tipoInsumo] = newData.cantidad;

    Utils.updateElementText(`cantidad-${skuId}-${tipoInsumo}`, newData.cantidad, true);

    const item = AppState.inventario[skuId];
    const total = (item.CAPUCHONES || 0) + (item.BASES || 0) + (item.TAPAS || 0);
    Utils.updateElementText(`total-${skuId}`, total, true);

    actualizarEstadoBotonesSalida(skuId, total);
  }
}

function actualizarEstadoBotonesSalida(skuId, total) {
  const salidaBtn = document.querySelector(`button[data-sku-id="${skuId}"][data-tipo-movimiento="SALIDA"]`);
  if (!salidaBtn) return;
  if (total === 0) salidaBtn.setAttribute('disabled', 'disabled');
  else salidaBtn.removeAttribute('disabled');
}

async function confirmarRecibo(transferenciaId) {
  const result = await Swal.fire({
    title: '¿Confirmar recibo?',
    text: 'Esta acción agregará los insumos a su inventario.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#28a745',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, confirmar',
    cancelButtonText: 'Cancelar'
  });
  if (!result.isConfirmed) return;

  try {
    const responseData = await API.confirmarRecibo(transferenciaId);
    if (responseData.success) {
      await Swal.fire({ icon: 'success', title: '¡Recibo Confirmado!', text: responseData.message, timer: 1500, showConfirmButton: false });
      await cargarDatosIniciales();
    } else {
      throw new Error(responseData.message || 'Error al confirmar recibo');
    }
  } catch (error) {
    console.error('Error confirmando recibo:', error);
    await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'Error al confirmar el recibo.' });
  }
}

function mostrarTransferenciasPendientes(/* skuId */) {
  const transferenciasTab = new bootstrap.Tab(document.getElementById('transferencias-tab'));
  transferenciasTab.show();
}

function mostrarCarga(show) {
  const loadingState = document.getElementById('loading-state');
  if (loadingState) loadingState.style.display = show ? 'block' : 'none';
}

function mostrarError(mensaje) {
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  if (errorState && errorMessage) {
    errorMessage.textContent = mensaje;
    errorState.style.display = 'block';
  }
}

function ocultarError() {
  const errorState = document.getElementById('error-state');
  if (errorState) errorState.style.display = 'none';
}

async function recargarDatos() { await cargarDatosIniciales(); }

// Función global para cerrar sesión (antes inline)
function cerrarSesion() {
  console.warn('Función cerrarSesion() no implementada');
  // Implementar lógica de cierre de sesión (limpiar tokens, fetch /logout, redirect, etc.)
}

// Errores globales
window.addEventListener('error', (event) => {
  console.error('Error global:', event.error);
  mostrarError('Ha ocurrido un error inesperado');
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Promise rechazada:', event.reason);
  mostrarError('Error de conexión o procesamiento');
});
