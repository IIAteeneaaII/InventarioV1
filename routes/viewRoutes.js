const express = require('express');
const router = express.Router();
const { verificarAuth, verificarRol } = require('../controllers/authController');
const { PrismaClient, FaseProceso } = require('@prisma/client');
const prisma = new PrismaClient();
const adminController = require('../controllers/adminController');
const cosmeticaController = require('../controllers/cosmeticaController');
const { vistaEditarUsuario } = require('../controllers/adminController');
const fs = require('fs');
const path = require('path');

// Ruta basada en BD - Si utilizas la tabla VistaPorSKU
router.get('/vista/:skuCode', async (req, res) => {
  const skuCode = req.params.skuCode;
  const user = req.user;

  try {
    // Buscar el SKU en la tabla CatalogoSKU
    const sku = await prisma.catalogoSKU.findUnique({
      where: { nombre: skuCode }
    });

    if (!sku) {
      return res.status(404).render('404', { message: 'SKU no encontrado' });
    }

    // Buscar la vista correspondiente al rol del usuario
    const vistaAsignada = await prisma.vistaPorSKU.findFirst({
      where: {
        skuId: sku.id,
        rol: user.rol
      }
    });

    if (!vistaAsignada) {
      return res.status(403).render('403', { message: 'No tienes acceso a esta vista' });
    }

    // Renderizar la vista correspondiente
    return res.render(vistaAsignada.vista, { user });
  } catch (error) {
    console.error(error);
    return res.status(500).send('Error interno del servidor');
  }
});

// Ruta pública para registro de usuario
router.get('/registro_prueba', (req, res) => {
  res.render('dasboard_registro');
});

// Dashboard para editar usuarios
router.get('/editarusuario/:id',
  verificarRol(['UAI', 'UA']), 
  vistaEditarUsuario
);

// Dashboard para rol Admin inventario
//router.get('/adminventario', 
//  verificarAuth, 
//  verificarRol(['UAI', 'UA', 'UV']), 
//  adminController.listarUsuarios
//);

// Tabla de contabilidad por SKU
router.get('/resumen_totales', verificarRol(['UAI', 'UA']), async (req, res) => {
  try {
    const skuData = await prisma.$queryRaw`
      SELECT 
        c.nombre,
        (SELECT COUNT(*) FROM "Modem" m 
         WHERE m."skuId" = c.id 
         AND m."faseActual" = 'REGISTRO'
         AND m."deletedAt" IS NULL) as entrada,
        (SELECT COUNT(*) FROM "Modem" m 
         WHERE m."skuId" = c.id 
         AND m."faseActual" IN ('EMPAQUE', 'SCRAP')
         AND m."deletedAt" IS NULL) as salida,
        (SELECT COUNT(*) FROM "Modem" m 
         WHERE m."skuId" = c.id 
         AND m."faseActual" IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST', 'REPARACION')
         AND m."deletedAt" IS NULL) as "enProceso"
      FROM "CatalogoSKU" c
      ORDER BY c.nombre
    `;
    const processedData = skuData.map(item => ({
      nombre: item.nombre,
      entrada: Number(item.entrada),
      salida: Number(item.salida),
      enProceso: Number(item.enProceso)
    }));
    res.render('resumen_totales', { user: req.user, skuData: processedData });
  } catch (error) {
    console.error('Error al cargar datos de resumen_totales:', error);
    res.render('resumen_totales', { user: req.user, skuData: [] });
  }
});

// Dashboard para rol registro
router.get('/registro', 
  verificarRol(['UReg', 'UA']),
  (req, res) => {
      res.render('registro_lote', { user: req.user });
  }
);

// Ruta principal para selección de lote
router.get('/seleccionlote', 
  verificarRol(['UA', 'UTI', 'UR', 'UE', 'UEN', 'UReg']),
  (req, res) => {
    res.render('seleccion_modelo', { user: req.user });
  }
);

// Dashboard para rol almacen
router.get('/almacen', 
  verificarRol(['UA']),
  (req, res) => {
      res.render('almacen_dashboard', { user: req.user });
  }
);

// Dashboard para rol visualizador
router.get('/nuevos_usuarios', 
  verificarRol(['UA', 'UAI']),
  (req, res) => {
      res.render('nuevos_usuarios', { user: req.user });
  }
);

// Dashboard para redireccionamiento a la vista de crear lote
router.get('/crearlote', 
  (req, res) => {
      res.render('asignacion_lote', { user: req.user });
  }
);

// Dashboard para rol Test inicial
router.get('/testini', 
  verificarRol(['UTI']),
  (req, res) => {
      res.render('seleccion_lote', { user: req.user });
  }
);

// Dashboard para rol Cosmetica (NUEVA VISTA DE INVENTARIO)
router.get('/cosmetica',
  verificarRol(['UC', 'UAI', 'UA']),
  cosmeticaController.renderInventario
);

// Dashboard para ver inventario de cosmética como administrador (solo lectura)
router.get('/admin/cosmetica', 
  verificarRol(['UAI', 'UA']),
  cosmeticaController.renderInventarioSoloLectura
);   

// Dashboard para rol Empaque
router.get('/empaque', 
  verificarRol(['UE', 'UA']),
  (req, res) => {
      res.render('seleccion_lote', { user: req.user });
  }
);

// Dashboard para Liberacion y limpieza
router.get('/lineaLote', 
  verificarRol(['UEN', 'UA']), // UEN ahora hace Ensamble, UA también puede
  (req, res) => {
      res.render('seleccion_lote', { user: req.user });
  }
);

// Dashboard para Registro
router.get('/Registros', 
  verificarRol(['UReg']),
  (req, res) => {
      res.render('dashboard_registros', { user: req.user });
  }
);

// Vista de estadísticas por SKU específico
router.get('/sku/:skuId',
  verificarRol(['UAI', 'UA']),
  async (req, res) => {
    try {
      const skuId = parseInt(req.params.skuId);
      const sku = await prisma.catalogoSKU.findUnique({
        where: { id: skuId }
      });

      if (!sku) {
        return res.status(404).render('error', {
          message: 'SKU no encontrado',
          error: { status: 404 },
          user: req.user
        });
      }

      res.render('sku_estadisticas', {
        user: req.user,
        sku: sku,
        skuId: skuId
      });
    } catch (error) {
      console.error('Error al cargar estadísticas de SKU:', error);
      res.status(500).render('error', {
        message: 'Error al cargar estadísticas',
        error: { status: 500 },
        user: req.user
      });
    }
  }
);

// Vista de gráficas (resumen)
router.get('/resumen', verificarRol(['UAI', 'UA']), async (req, res) => {
  try {
    // Consulta SQL sin referencias a deletedAt
    const skuData = await prisma.$queryRaw`
      SELECT 
        c.nombre,
        (SELECT COUNT(*) FROM "Modem" m 
         WHERE m."skuId" = c.id 
         AND m."faseActual" = 'REGISTRO'
         AND m."deletedAt" IS NULL) as entrada,
        (SELECT COUNT(*) FROM "Modem" m 
         WHERE m."skuId" = c.id 
         AND m."faseActual" IN ('EMPAQUE', 'SCRAP')
         AND m."deletedAt" IS NULL) as salida,
        (SELECT COUNT(*) FROM "Modem" m 
         WHERE m."skuId" = c.id 
         AND m."faseActual" IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST', 'REPARACION')
         AND m."deletedAt" IS NULL) as "enProceso"
      FROM "CatalogoSKU" c
      ORDER BY c.nombre
    `;
    // Convertir BigInt a Number
    const processedData = skuData.map(item => ({
      nombre: item.nombre,
      entrada: Number(item.entrada),
      salida: Number(item.salida),
      enProceso: Number(item.enProceso)
    }));
    res.render('resumen', { 
      user: req.user,
      skuData: processedData
    });
  } catch (error) {
    console.error('Error al cargar datos de resumen:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Error</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; text-align: center; }
            .error-container { margin-top: 50px; }
            h1 { color: #d9534f; }
            .btn { display: inline-block; padding: 10px 15px; background-color: #1a9ad7; color: white; 
                   text-decoration: none; border-radius: 4px; margin-top: 20px; }
            .btn:hover { background-color: #0f5a7d; }
            pre { text-align: left; background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; max-width: 90%; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h1>Error al cargar datos</h1>
            <p>Se produjo un error al procesar tu solicitud</p>
            <pre>${error.message}</pre>
            <a href="/adminventario" class="btn">Volver al panel</a>
          </div>
        </body>
      </html>
    `);
  }
});

router.get('/terminos', 
  verificarRol(['UA', 'UTI', 'UR', 'UC', 'UE', 'ULL','UReg', 'UAI']),
  (req, res) => {
      res.render('terminos', { user: req.user });
  }
);

router.post('/seleccionar-sku', (req, res) => {
  console.log('SKU seleccionado:', req.body.sku);
  res.status(200).json({ ok: true });
});

// NUEVA RUTA - Para archivos basados en carpeta y SKU directamente
// Se añade una expresión regular para que :carpeta solo coincida con los directorios de formatos válidos.
// Esto evita que la ruta intercepte peticiones a assets como /js/ o /css/.
router.get('/:carpeta/:sku', async (req, res, next) => {
  const { carpeta, sku } = req.params;

  // Middleware de validación manual para evitar problemas con path-to-regexp
  // y para no interceptar peticiones a /js, /css, etc.
  const carpetasValidas = ['formato_empaque', 'formato_registro', 'formato_general'];
  if (!carpetasValidas.includes(carpeta)) {
    return next(); // IMPORTANTE: Si no es una carpeta de formato, pasa a la siguiente ruta (ej. express.static).
  }

  const user = req.user;
  console.log(`Usuario ${user.userName} (${user.rol}) accediendo a ${carpeta}/${sku}`);

  // Importamos el controlador para verificar acceso
  const formatoController = require('../controllers/formatoController');

  // Verificar si el rol tiene acceso a esta carpeta
  const tieneAcceso = formatoController.verificarAccesoCarpeta(user.rol, carpeta);

  if (!tieneAcceso) {
    // Determinar a qué carpeta debería acceder este rol
    const carpetaCorrecta = formatoController.obtenerCarpetaPorRol(user.rol);

    if (carpetaCorrecta) {
      console.log(`Redirigiendo a ${carpetaCorrecta}/${sku}`);
      return res.redirect(`/${carpetaCorrecta}/${sku}`);
    }

    return res.status(403).render('error', {
      message: 'No tienes acceso a esta vista',
      error: { status: 403 },
      user: user
    });
  }

  const viewsDir = path.join(__dirname, '..', 'views', carpeta);
  try {
    if (!fs.existsSync(viewsDir)) {
      console.error(`La carpeta ${carpeta} no existe`);
      return res.status(404).send(`Carpeta ${carpeta} no encontrada`);
    }
    const files = fs.readdirSync(viewsDir);
    const fileMatch = files.find(f => f.includes(sku) && f.endsWith('.ejs'));
    if (fileMatch) {
      console.log(`Renderizando vista: ${carpeta}/${fileMatch.replace('.ejs', '')}`);
      const registros = await prisma.registro.findMany({
        where: { userId: user.id }, // Solo registros del usuario actual
        orderBy: { createdAt: 'desc' },
        take: 50, // Limitar a los últimos 50 para no sobrecargar
        include: { user: { select: { nombre: true } } }
      });
      return res.render(`${carpeta}/${fileMatch.replace('.ejs', '')}`, { user: req.user, registros });
    } else {
      console.error(`No se encontró archivo para SKU ${sku} en la carpeta ${carpeta}`);
      return res.status(404).send(`Vista no encontrada para SKU ${sku} en ${carpeta}`);
    }
  } catch (err) {
    console.error(`Error al buscar vista para SKU ${sku} en ${carpeta}:`, err);
    return res.status(500).send('Error interno al buscar la vista.');
  }
});

// Redireccionamiento de la ruta antigua a la nueva (para compatibilidad)
router.get('/vista/:formato/:sku', (req, res) => {
  const { formato, sku } = req.params;
  console.log(`Redirigiendo de /vista/${formato}/${sku} a /${formato}/${sku}`);
  res.redirect(`/${formato}/${sku}`);
});

const getFaseFromRol = (rol) => {
  const mapeo = {
    UReg: FaseProceso.REGISTRO,
    UEN: FaseProceso.ENSAMBLE,
    UE: FaseProceso.EMPAQUE,
    UTI: FaseProceso.TEST_INICIAL,
    UR: FaseProceso.RETEST,
    UA: FaseProceso.REGISTRO
  };
  return mapeo[rol] || null;
};

// La ruta con tres parámetros ahora se maneja como caso especial
// para admitir casos donde se pasa el nombre en la URL (opcional)
router.get('/:carpeta/:nombre/:sku', (req, res) => {
  const { carpeta, sku } = req.params;
  console.log(`Redirigiendo de /${carpeta}/${req.params.nombre}/${sku} a /${carpeta}/${sku}`);
  res.redirect(`/${carpeta}/${sku}`);
});

// búsqueda de NS
router.get('/ns', 
  verificarRol(['UAI', 'UA']),
  (req, res) => {
      res.render('consulta_ns_admin', { user: req.user });
  }
);

// Crear nuevos usuarios
router.get('/crearusuario', 
  verificarRol(['UAI', 'UA']),
  (req, res) => {
      res.render('crearusuario', { user: req.user });
  }
);
router.post('/crearusuario', 
  verificarRol(['UAI', 'UA']),
  adminController.register
);

// Crear nuevos usuarios
router.get('/adminventario', 
  verificarRol(['UAI', 'UA']),
  (req, res) => {
      res.render('admin_dashboard', { user: req.user });
  }
);

// Listar usuarios (para admin y roles autorizados)
router.get('/listarusuarios',
  verificarRol(['UAI', 'UA']),
  adminController.listarUsuarios
);

router.get('/historial', 
  verificarRol(['UAI', 'UA', 'UV']),
  async (req, res) => {
    const { sn } = req.query;

    if (!sn) {
      return res.render('historialVisual', {
        user: req.user,
        sn: null,
        skuId: null,
        skuItem: null,
        skuNombre: null,
        fasesRealizadas: []
      });
    }

    try {
      const registros = await prisma.registro.findMany({
        where: { sn },
        orderBy: { createdAt: 'asc' },
        select: { fase: true }
      });
      const fasesRealizadas = registros.map(r => r.fase);

      // 🔧 Selecciona también skuItem
      const modem = await prisma.modem.findUnique({
        where: { sn },
        include: { sku: { select: { id: true, nombre: true, skuItem: true } } }
      });

      res.render('historialVisual', {
        user: req.user,
        sn,
        skuId: modem?.sku?.id ?? null,
        skuNombre: modem?.sku?.nombre ?? null,
        skuItem: modem?.sku?.skuItem ?? null, // ahora sí llega
        fasesRealizadas
      });
    } catch (error) {
      console.error('Error al consultar historial:', error);
      res.status(500).render('historialVisual', {
        user: req.user,
        sn,
        skuId: null,
        skuNombre: null,
        skuItem: null,
        fasesRealizadas: [],
        error: 'Error al cargar historial'
      });
    }
  }
);

// Ruta para scrap - acceso para UA y encargados de empaque
router.get('/scrap', 
  verificarRol(['UA', 'UE']),
  (req, res) => {
      res.render('seleccion_modelo', { user: req.user });
  }
);

// Ruta para test inicial - acceso para UA y test inicial
router.get('/testinicial', 
  verificarRol(['UA', 'UTI']),
  (req, res) => {
      res.render('seleccion_modelo', { user: req.user });
  }
);

module.exports = router;
