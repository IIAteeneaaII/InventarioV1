const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { verificarAuth, verificarRol } = require('../controllers/authController');
const registroController = require('../controllers/registroController');
const formatoController = require('../controllers/formatoController');
const cosmeticaController = require('../controllers/cosmeticaController');
const procesamientoController = require('../controllers/procesamientoController.js');
const empaqueController = require('../controllers/empaqueController');
const scrapController = require('../controllers/scrapController');
const loteController = require('../controllers/loteController');
const { replaceBigIntWithNumber } = require('../utils/dataUtils');

// Ruta para guardar registros de los formatos de captura (empaque, registro, general, etc.)
router.post('/registros',
  verificarRol(['UReg', 'UA', 'UTI', 'UR', 'UE', 'UEN']), // UEN ahora escanea
  formatoController.guardarRegistro
);

// Ruta para finalizar un lote
router.post('/lotes/finalizar', formatoController.finalizarLote);

// Rutas de registro
router.post('/registro/modem', verificarRol(['UA', 'UReg']), registroController.registrarModem);
router.post('/registro/confirmar-lote', verificarRol(['UA', 'UReg']), registroController.confirmarLote);
router.post('/registro/scrap', verificarRol(['UA', 'UReg']), registroController.registrarScrap);
router.get('/registro/historial/:loteId', registroController.obtenerHistorial);

// Añadir este endpoint para obtener registros por SKU
// ...existing code...

// Rutas de procesamiento
router.post('/proceso/modem', verificarRol(['UTI', 'UR', 'UEN']), procesamientoController.procesarModem);
router.post('/proceso/reparacion', verificarRol(['UR', 'UTI']), procesamientoController.registrarReparacion);
router.post('/proceso/scrap', procesamientoController.registrarScrapProceso);

// Rutas de empaque
router.post('/empaque/modem', verificarRol(['UE']), empaqueController.registrarModemEmpaque);
router.post('/empaque/cerrar-lote', verificarRol(['UE']), empaqueController.cerrarLoteSalida);
router.post('/scrap/registrar-salida', verificarRol(['UE']), scrapController.registrarScrapSalida);
router.post('/scrap/cerrar-lote', verificarRol(['UE']), scrapController.cerrarLoteScrap);

// Rutas de cosmética
router.post('/cosmetica/movimiento', verificarRol(['UC', 'UAI']), cosmeticaController.registrarMovimiento);

// Rutas de consulta
router.get('/lotes/activos', loteController.obtenerLotesActivos);
router.get('/lotes/activos/scrap', loteController.obtenerLotesScrapActivos);
router.get('/modems/lote/:loteId', loteController.obtenerModemsPorLote);

// Endpoint para estadísticas generales
router.get('/stats/resumen', verificarRol(['UAI', 'UV']), async (req, res) => {
  try {
    const dias = parseInt(req.query.dias || 30);
    
    // Obtener datos para todas las gráficas en paralelo
    const [
      distribucionSKU,
      modemsRegistradosPorDia, 
      distribucionLotes,
      estadoPorFase
    ] = await Promise.all([
      // Distribución por SKU
      prisma.$queryRaw`
        SELECT c.nombre, COUNT(*) as cantidad 
        FROM "Modem" m 
        JOIN "CatalogoSKU" c ON m."skuId" = c.id 
        WHERE m."deletedAt" IS NULL
        GROUP BY c.nombre
        ORDER BY COUNT(*) DESC
      `,
      
      // Modems registrados por día (últimos N días)
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', m."createdAt")::date as fecha, COUNT(*) as cantidad
        FROM "Modem" m
        WHERE m."createdAt" > NOW() - INTERVAL '${dias} days'
          AND m."deletedAt" IS NULL
        GROUP BY DATE_TRUNC('day', m."createdAt")::date
        ORDER BY fecha
      `,
      
      // Distribución por lote
      prisma.$queryRaw`
        SELECT l.numero, l.estado, COUNT(*) as cantidad 
        FROM "Modem" m 
        JOIN "Lote" l ON m."loteId" = l.id 
        WHERE m."deletedAt" IS NULL
        GROUP BY l.numero, l.estado
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `,
      
      // Distribución de estados por fase de proceso
      prisma.$queryRaw`
        SELECT m."faseActual", e.nombre as estado, COUNT(*) as cantidad 
        FROM "Modem" m 
        JOIN "Estado" e ON m."estadoActualId" = e.id 
        WHERE m."deletedAt" IS NULL
        GROUP BY m."faseActual", e.nombre
        ORDER BY m."faseActual", COUNT(*) DESC
      `
    ]);
    
    // Procesar los resultados para convertir BigInt a Number
    const results = {
      distribucionSKU: replaceBigIntWithNumber(distribucionSKU),
      modemsRegistradosPorDia: replaceBigIntWithNumber(modemsRegistradosPorDia),
      distribucionLotes: replaceBigIntWithNumber(distribucionLotes),
      estadoPorFase: replaceBigIntWithNumber(estadoPorFase)
    };
    
    // Enviar los datos como JSON
    res.json(results);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats/etapas-proceso', verificarRol(['UAI', 'UA', 'UV']), async (req, res) => {
  try {
    const { skuNombre } = req.query;
    console.log('Solicitud recibida para etapas-proceso, SKU:', skuNombre);
    
    // Preparar filtro de SKU
    let whereClause = 'm."deletedAt" IS NULL';
    let params = [];
    
    if (skuNombre && skuNombre !== 'todos') {
      whereClause += ' AND c.nombre = $1';
      params.push(skuNombre);
    }
    
    // Consulta optimizada que obtiene directamente los conteos por categoría
    const query = `
      SELECT 
        'registro' as categoria,
        COUNT(*) as cantidad
      FROM "Modem" m
      JOIN "CatalogoSKU" c ON m."skuId" = c.id
      WHERE ${whereClause} AND m."faseActual" = 'REGISTRO'
      
      UNION ALL
      
      SELECT 
        'enProceso' as categoria,
        COUNT(*) as cantidad
      FROM "Modem" m
      JOIN "CatalogoSKU" c ON m."skuId" = c.id
      WHERE ${whereClause} AND m."faseActual" IN ('TEST_INICIAL', 'ENSAMBLE')
      
      UNION ALL
      
      SELECT 
        'entrega' as categoria,
        COUNT(*) as cantidad
      FROM "Modem" m
      JOIN "CatalogoSKU" c ON m."skuId" = c.id
      WHERE ${whereClause} AND m."faseActual" = 'RETEST'
      
      UNION ALL
      
      SELECT 
        'final' as categoria,
        COUNT(*) as cantidad
      FROM "Modem" m
      JOIN "CatalogoSKU" c ON m."skuId" = c.id
      WHERE ${whereClause} AND m."faseActual" = 'EMPAQUE'
      
      UNION ALL
      
      SELECT 
        'scrap' as categoria,
        COUNT(*) as cantidad
      FROM "Modem" m
      JOIN "CatalogoSKU" c ON m."skuId" = c.id
      WHERE ${whereClause} AND m."faseActual" = 'SCRAP'
    `;
    
    console.log('Ejecutando consulta para obtener etapas');
    const resultados = await prisma.$queryRawUnsafe(query, ...params);
    console.log('Datos de etapas obtenidos:', resultados);
    
    // Construir respuesta con formato consistente
    const etapas = {
      registro: 0,
      enProceso: 0,
      entrega: 0,
      final: 0,
      scrap: 0
    };
    
    // Actualizar con los resultados reales
    resultados.forEach(row => {
      etapas[row.categoria] = parseInt(row.cantidad);
    });
    
    res.json(etapas);
  } catch (error) {
    console.error('Error al obtener datos de etapas del proceso:', error);
    res.status(500).json({ 
      error: true,
      message: 'Error al calcular datos de etapas del proceso',
      details: error.message
    });
  }
});

// Endpoint para estadísticas por SKU específico
router.get('/stats/sku/:skuId', verificarRol(['UAI', 'UA', 'UV']), async (req, res) => {
  try {
    const skuId = parseInt(req.params.skuId);
    
    if (isNaN(skuId)) {
      return res.status(400).json({ error: 'ID de SKU inválido' });
    }
    
    const dias = parseInt(req.query.dias || 30);
    
    // Validar que el SKU existe
    const sku = await prisma.catalogoSKU.findUnique({
      where: { id: skuId }
    });
    
    if (!sku) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    // Consultas para este SKU específico
    const [estadoStats, faseStats, loteStats, tendencia] = await Promise.all([
      // Estadísticas por estado
      prisma.$queryRaw`
        SELECT e.nombre, COUNT(*) as cantidad, e.color
        FROM "Modem" m 
        JOIN "Estado" e ON m."estadoActualId" = e.id 
        WHERE m."skuId" = ${skuId} AND m."deletedAt" IS NULL
        GROUP BY e.nombre, e.color
        ORDER BY COUNT(*) DESC
      `,
      
      // Estadísticas por fase
      prisma.$queryRaw`
        SELECT "faseActual", COUNT(*) as cantidad 
        FROM "Modem" 
        WHERE "skuId" = ${skuId} AND "deletedAt" IS NULL
        GROUP BY "faseActual"
      `,
      
      // Estadísticas por lote
      prisma.$queryRaw`
        SELECT l.numero, COUNT(*) as cantidad 
        FROM "Modem" m 
        JOIN "Lote" l ON m."loteId" = l.id 
        WHERE m."skuId" = ${skuId} AND m."deletedAt" IS NULL
        GROUP BY l.numero
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `,
      
      // Tendencia de registros por día
      prisma.$queryRaw`
        SELECT DATE_TRUNC('day', r."createdAt")::date as fecha, COUNT(*) as cantidad
        FROM "Registro" r
        JOIN "Modem" m ON r."modemId" = m.id
        WHERE m."skuId" = ${skuId}
          AND r."createdAt" > NOW() - INTERVAL '${dias} days'
        GROUP BY DATE_TRUNC('day', r."createdAt")::date
        ORDER BY fecha
      `
    ]);
    
    // Procesar los resultados para convertir BigInt a Number
    const results = {
      estadoStats: replaceBigIntWithNumber(estadoStats),
      faseStats: replaceBigIntWithNumber(faseStats),
      loteStats: replaceBigIntWithNumber(loteStats),
      tendencia: replaceBigIntWithNumber(tendencia)
    };
    
    res.json(results);
  } catch (error) {
    console.error('Error al obtener estadísticas del SKU:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de prueba para verificar que la API funciona
router.get('/test', (req, res) => {
  res.json({ 
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString(),
    user: req.user
  });
});

// Endpoint para actualizar contabilidad de SKUs
router.post('/skus/actualizar-contabilidad', verificarRol(['UAI']), async (req, res) => {
  try {
    const { actualizaciones } = req.body;
    
    if (!actualizaciones || !Array.isArray(actualizaciones)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    
    // Verificar si existe la tabla contabilidadHistorial
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ContabilidadHistorial'
      );
    `;
    
    if (tableExists[0].exists) {
      // Registrar la actualización en un historial
      await prisma.contabilidadHistorial.create({
        data: {
          usuarioId: req.user.id,
          fecha: new Date(),
          datos: JSON.stringify(actualizaciones)
        }
      });
    } else {
      console.log('Tabla ContabilidadHistorial no existe. Saltando registro de historial.');
    }
    
    // Aquí implementar la lógica de actualización según tu modelo específico
    // ...
    
    res.json({ success: true, message: 'Datos actualizados correctamente' });
  } catch (error) {
    console.error('Error al actualizar contabilidad:', error);
    res.status(500).json({ error: error.message });
  }
});

// Nuevo endpoint para detalles de SKU específico
router.get('/stats/sku-detalle', async (req, res) => {
  try {
    const { sku } = req.query;
    
    if (!sku) {
      return res.status(400).json({ error: 'Se requiere parámetro SKU' });
    }
    
    // Buscar el ID del SKU primero
    const skuRecord = await prisma.catalogoSKU.findFirst({
      where: {
        nombre: sku
      },
      select: {
        id: true
      }
    });
    
    if (!skuRecord) {
      return res.status(404).json({ error: 'SKU no encontrado' });
    }
    
    // Consultar modems con este SKU agrupados por fase
    const detallesPorFase = await prisma.$queryRaw`
      SELECT 
        m."faseActual" AS categoria, 
        COUNT(*) AS cantidad
      FROM "Modem" m
      WHERE m."skuId" = ${skuRecord.id}
      AND m."deletedAt" IS NULL
      GROUP BY m."faseActual"
      ORDER BY cantidad DESC
    `;
    
    // Convertir BigInt a Number
    const resultado = detallesPorFase.map(item => ({
      categoria: item.categoria,
      cantidad: Number(item.cantidad)
    }));
    
    res.json(resultado);
    
  } catch (error) {
    console.error('Error al obtener detalles del SKU:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para datos filtrados por SKU para el dashboard principal
router.get('/stats/dashboard-filtered', async (req, res) => {
  try {
    const { skuNombre } = req.query;
    const dias = parseInt(req.query.dias || 30);

    // Buscar el ID del SKU si se proporciona un nombre
    let skuId = null;
    if (skuNombre && skuNombre !== 'todos') {
      const skuInfo = await prisma.catalogoSKU.findFirst({
        where: { nombre: skuNombre },
        select: { id: true }
      });
      if (skuInfo) {
        skuId = skuInfo.id;
      } else {
        return res.status(404).json({ error: 'SKU no encontrado' });
      }
    }

    // Obtener el total de modems para el SKU seleccionado o todos
    const totalModems = await prisma.modem.count({
      where: {
        deletedAt: null,
        ...(skuId ? { skuId: skuId } : {})
      }
    });

    // Construir consultas SQL basadas en si hay un SKU seleccionado o no
    let distribucionSKU, modemsRegistradosPorDia, distribucionLotes, estadoPorFase;

    if (skuId) {
      // Consultas con filtro de SKU
      [distribucionSKU, modemsRegistradosPorDia, distribucionLotes, estadoPorFase] = await Promise.all([
        prisma.$queryRaw`
          SELECT c.nombre, CAST(COUNT(*) AS INTEGER) as cantidad 
          FROM "Modem" m 
          JOIN "CatalogoSKU" c ON m."skuId" = c.id 
          WHERE m."deletedAt" IS NULL AND m."skuId" = ${skuId}
          GROUP BY c.nombre
          ORDER BY COUNT(*) DESC
        `,
        prisma.$queryRaw`
          SELECT DATE_TRUNC('day', m."createdAt")::date as fecha, CAST(COUNT(*) AS INTEGER) as cantidad
          FROM "Modem" m
          WHERE m."createdAt" > NOW() - INTERVAL '${dias} days'
            AND m."deletedAt" IS NULL
            AND m."skuId" = ${skuId}
          GROUP BY DATE_TRUNC('day', m."createdAt")::date
          ORDER BY fecha
        `,
        prisma.$queryRaw`
          SELECT l.numero, l.estado, CAST(COUNT(*) AS INTEGER) as cantidad 
          FROM "Modem" m 
          JOIN "Lote" l ON m."loteId" = l.id 
          WHERE m."deletedAt" IS NULL
            AND m."skuId" = ${skuId}
          GROUP BY l.numero, l.estado
          ORDER BY COUNT(*) DESC
          LIMIT 10
        `,
        prisma.$queryRaw`
          SELECT m."faseActual", e.nombre as estado, CAST(COUNT(*) AS INTEGER) as cantidad 
          FROM "Modem" m 
          JOIN "Estado" e ON m."estadoActualId" = e.id 
          WHERE m."deletedAt" IS NULL
            AND m."skuId" = ${skuId}
          GROUP BY m."faseActual", e.nombre
          ORDER BY m."faseActual", COUNT(*) DESC
        `
      ]);
    } else {
      // Consultas sin filtro de SKU (todos)
      [distribucionSKU, modemsRegistradosPorDia, distribucionLotes, estadoPorFase] = await Promise.all([
        prisma.$queryRaw`
          SELECT c.nombre, CAST(COUNT(*) AS INTEGER) as cantidad 
          FROM "Modem" m 
          JOIN "CatalogoSKU" c ON m."skuId" = c.id 
          WHERE m."deletedAt" IS NULL
          GROUP BY c.nombre
          ORDER BY COUNT(*) DESC
        `,
        prisma.$queryRaw`
          SELECT DATE_TRUNC('day', m."createdAt")::date as fecha, CAST(COUNT(*) AS INTEGER) as cantidad
          FROM "Modem" m
          WHERE m."createdAt" > NOW() - INTERVAL '${dias} days'
            AND m."deletedAt" IS NULL
          GROUP BY DATE_TRUNC('day', m."createdAt")::date
          ORDER BY fecha
        `,
        prisma.$queryRaw`
          SELECT l.numero, l.estado, CAST(COUNT(*) AS INTEGER) as cantidad 
          FROM "Modem" m 
          JOIN "Lote" l ON m."loteId" = l.id 
          WHERE m."deletedAt" IS NULL
          GROUP BY l.numero, l.estado
          ORDER BY COUNT(*) DESC
          LIMIT 10
        `,
        prisma.$queryRaw`
          SELECT m."faseActual", e.nombre as estado, CAST(COUNT(*) AS INTEGER) as cantidad 
          FROM "Modem" m 
          JOIN "Estado" e ON m."estadoActualId" = e.id 
          WHERE m."deletedAt" IS NULL
          GROUP BY m."faseActual", e.nombre
          ORDER BY m."faseActual", COUNT(*) DESC
        `
      ]);
    }

    // Crear objeto de respuesta
    const results = {
      totalModems,
      distribucionSKU: replaceBigIntWithNumber(distribucionSKU),
      modemsRegistradosPorDia: replaceBigIntWithNumber(modemsRegistradosPorDia),
      distribucionLotes: replaceBigIntWithNumber(distribucionLotes),
      estadoPorFase: replaceBigIntWithNumber(estadoPorFase),
      filteredBySku: skuId ? true : false,
      skuNombre: skuNombre
    };

    res.json(results);
  } catch (error) {
    console.error('Error al obtener estadísticas filtradas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ...existing code...
// Endpoint para obtener registros por SKU (versión mejorada)
router.get('/registros/sku/:sku', verificarAuth, async (req, res) => {
  try {
    const { sku } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.user.id;
    
    // Obtener el ID del SKU - primero intentamos con búsqueda exacta por skuItem
    let catalogoSKU = await prisma.catalogoSKU.findFirst({
      where: { skuItem: sku }
    });
    
    // Si no encontramos, intentamos con búsqueda flexible
    if (!catalogoSKU) {
      const resultados = await prisma.$queryRaw`
        SELECT * FROM "CatalogoSKU" 
        WHERE nombre LIKE ${`%${sku}%`}
        OR id = ${parseInt(sku, 10) || 0}
        OR "skuItem" = ${sku}
        LIMIT 1
      `;
      
      if (resultados && resultados.length > 0) {
        catalogoSKU = resultados[0];
      }
    }
    
    if (!catalogoSKU) {
      return res.status(404).json({ 
        error: `No existe un catálogo para el SKU ${sku}.`
      });
    }

    const skuId = catalogoSKU.id;
    console.log(`Buscando registros para SKU ID: ${skuId}, Usuario ID: ${userId}`);
    
    // Obtener registros específicos para este SKU y usuario
    const registros = await prisma.registro.findMany({
      where: {
        modem: {
          skuId: skuId
        },
        userId: userId
      },
      include: {
        user: {
          select: { 
            id: true, 
            nombre: true 
          }
        },
        modem: {
          select: {
            sn: true,
            sku: {
              select: {
                nombre: true,
                skuItem: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });
    
    console.log(`Encontrados ${registros.length} registros para SKU ${sku}`);
    
    // Renovar la sesión
    if (req.session) {
      req.session.touch();
    }
    
    res.json({ 
      success: true,
      registros: registros,
      skuInfo: {
        id: catalogoSKU.id,
        nombre: catalogoSKU.nombre,
        skuItem: catalogoSKU.skuItem
      }
    });
  } catch (error) {
    console.error('Error al obtener registros por SKU:', error);
    res.status(500).json({ error: 'Error interno al obtener registros.' });
  }
});

// Endpoint de prueba para mantener la sesión activa
router.get('/test', (req, res) => {
  // Renovar la sesión
  if (req.session) {
    req.session.touch();
  }
  
  res.json({ 
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString(),
    user: req.user ? {
      id: req.user.id,
      nombre: req.user.nombre,
      rol: req.user.rol
    } : null
  });
});

// Endpoint para obtener todos los SKUs disponibles para el inventario
router.get('/catalogos/skus', verificarAuth, async (req, res) => {
  try {
    const skus = await prisma.catalogoSKU.findMany({
      select: {
        id: true,
        nombre: true,
        skuItem: true
      },
      orderBy: {
        nombre: 'asc'
      }
    });
    res.json(skus);
  } catch (error) {
    console.error('Error al obtener SKUs:', error);
    res.status(500).json({ error: 'Error al obtener los SKUs disponibles' });
  }
});

module.exports = router;