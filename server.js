const express = require('express');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// --- Rutas y controladores ---
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const principalScrRoutes = require('./routes/principalScrRoutes');
const { verificarAuth, verificarRol } = require('./controllers/authController');
const { loadAllJobs } = require('./utils/jobManager');
const userDataMiddleware = require('./middlewares/userDataMiddleware'); // 1. Importar
const noCacheMiddleware = require('./middlewares/noCache'); // Importar el nuevo middleware
const viewRoutes = require('./routes/viewRoutes');
const loggerMiddleware = require('./middlewares/loggerMiddleware');
const morgan = require('morgan');
const logger = require('./utils/logger');
const logRoutes = require('./routes/logRoutes');
const apiRoutes = require('./routes/apiRoutes');
const axios = require('axios');

// --- Configuración EJS ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middlewares globales ---
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tu_secreto_super_seguro',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Log HTTP requests con morgan y winston
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info({ level: 'HTTP', message: message.trim() })
  }
}));
app.use(loggerMiddleware);

// --- RUTAS PÚBLICAS ---
app.use('/api/auth', authRoutes); // Registro, login, recuperación, etc.
app.use('/api/logs', logRoutes);  // Logs públicos (para testeo)

app.get('/', (req, res) => {
  res.render('login', {
    error: req.session?.error,
    success: req.session?.success
  });
  req.session.error = null;
  req.session.success = null;
});

app.get('/registro_prueba', (req, res) => {
  res.render('dasboard_registro', {
    error: req.session?.error,
    success: req.session?.success
  });
});

app.get('/TerminosyCondiciones', (req, res) => res.render('terminosyCondiciones'));

// --- RUTAS PROTEGIDAS DESDE AQUÍ ---
app.use(verificarAuth); // Todo lo de abajo requiere login/JWT válido

// 2. Aplicar el middleware para que user esté disponible en todas las vistas protegidas
app.use(userDataMiddleware);

// --- Administración de usuarios ---
app.use('/admin', verificarRol(['UAI']), adminRoutes);

// --- API protegida (inventario, lotes, modems, etc) ---
//app.use('/api', inventoryRoutes);

// --- Rutas para logs principales, dashboard, etc ---
app.use('/api', apiRoutes);

// --- Rutas para lógica especial (ejemplo: logs con principalScrRoutes) ---
app.use('/api/inicio', principalScrRoutes);

// --- Vistas (dashboard, por rol, etc) ---
app.use('/', viewRoutes);

// --- VISTAS SECUNDARIAS PROTEGIDAS (puedes adaptarlas según necesites) ---
app.get('/EliminarCuenta', (req, res) => res.render('eliminarCuenta'));
app.get('/EliminarCuenta1', (req, res) => res.render('eliminarCuenta1'));
app.get('/EliminarCuenta2', (req, res) => res.render('eliminarCuenta2'));
app.get('/Privacidad', (req, res) => res.render('privacidad'));

// --- VISTAS DE LOTES (solo si las usas) ---
app.get('/asignacion-lote', (req, res) => res.render('asignacion_lote'));
app.get('/registro-lote', (req, res) => res.render('registro_lote'));
app.get('/consulta-ns-admin', (req, res) => res.render('consulta_ns_admin'));
app.get('/seleccion-lote-admin', (req, res) => res.render('seleccion_lote_admin'));
app.get('/seleccion-lote', (req, res) => res.render('seleccion_lote'));

// --- Página especializada para el Usuario Visualizador (UV) ---
app.get('/visualizador-uv', async (req, res) => {
  try {
    const response = await axios.get('http://localhost:3000/api/logs/test-summary');
    res.render('visualizadorUV', { tests: response.data.tests });
  } catch (error) {
    res.render('visualizadorUV', { tests: [], error: 'No se pudo obtener el resumen de tests.' });
  }
});

// --- Error handler global ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error_erro', { message: 'Error en el servidor' });
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, HOST, async () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  try {
    await loadAllJobs();
    console.log('Tareas programadas cargadas');
  } catch (err) {
    console.error('Error al cargar tareas programadas:', err);
  }
});
