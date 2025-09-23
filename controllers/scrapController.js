const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logService = require('../services/logService');
const modemService = require('../services/modemService');

/**
 * Enviar un modem a SCRAP (transición inicial desde cualquier fase)
 */
exports.enviarAScrap = async (req, res) => {
  try {
    const { sn, motivoScrap, codigoDanoId, detalle } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Verificar permisos - permitir UTI, UR, URep, UA y UE
    const rolesPermitidos = ['UTI', 'UR', 'URep', 'UA', 'UE'];
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para enviar modems a SCRAP'
      });
    }
    
    // Validar datos obligatorios
    if (!sn || !motivoScrap) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere número de serie y motivo de SCRAP'
      });
    }
    
    // Para SCRAP ELECTRONICO, el código de daño es obligatorio
    if ((motivoScrap === 'ELECTRONICO' || motivoScrap === 'FUERA_DE_RANGO') && !codigoDanoId) {
      return res.status(400).json({
        success: false,
        message: 'Para SCRAP ELECTRONICO se requiere código de diagnóstico'
      });
    }
    
    // Buscar el modem
    const modem = await prisma.modem.findUnique({
      where: { sn: sn },
      include: {
        sku: true
      }
    });
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: 'Modem no encontrado'
      });
    }
    
    if (modem.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Este modem ha sido eliminado del sistema'
      });
    }
    
    // Verificar que no esté ya en SCRAP
    if (modem.faseActual === 'SCRAP') {
      return res.status(400).json({
        success: false,
        message: 'El modem ya está en estado SCRAP'
      });
    }
    
    // Guardar fase anterior para el registro
    const faseAnterior = modem.faseActual;
    
    // Normalizar motivo SCRAP
    const motivoScrapNormalizado = normalizarMotivoScrap(motivoScrap);
    
    // Validar código de daño si es ELECTRONICO
    let codigoDanoValidado = null;
    if ((motivoScrapNormalizado === 'FUERA_DE_RANGO' || motivoScrapNormalizado === 'ELECTRONICO') && codigoDanoId) {
      const codigoDano = await prisma.codigoDano.findUnique({
        where: { id: parseInt(codigoDanoId) }
      });
      
      if (!codigoDano) {
        return res.status(400).json({
          success: false,
          message: 'Código de diagnóstico no válido'
        });
      }
      
      codigoDanoValidado = codigoDano.id;
    }
    
    // Actualizar modem a estado SCRAP
    const modemActualizado = await prisma.modem.update({
      where: { id: modem.id },
      data: {
        faseActual: 'SCRAP',
        motivoScrap: motivoScrapNormalizado,
        responsableId: userId,
        updatedAt: new Date()
      }
    });
    
    // Crear registro de la transición con código de daño
    await prisma.registro.create({
      data: {
        modemId: modem.id,
        userId: userId,
        fase: 'SCRAP',
        faseAnterior: faseAnterior,
        detalle: detalle || `SCRAP ${motivoScrapNormalizado}`,
        codigoDanoId: codigoDanoValidado,
        createdAt: new Date()
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'ENVIAR_A_SCRAP',
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, De: ${faseAnterior} a SCRAP, Motivo: ${motivoScrapNormalizado}${codigoDanoValidado ? `, Código: ${codigoDanoId}` : ''}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Modem enviado a SCRAP exitosamente',
      data: {
        modem: modemActualizado,
        faseAnterior,
        codigoDiagnostico: codigoDanoValidado
      }
    });
    
  } catch (error) {
    console.error('Error al enviar a SCRAP:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Liberar un modem de SCRAP para que continúe en el proceso normal
 * Solo URep puede realizar esta operación
 */
exports.liberarDeScrap = async (req, res) => {
  try {
    const { sn, siguienteFase, detalle } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Solo URep puede liberar modems de SCRAP
    if (userRol !== 'URep') {
      return res.status(403).json({
        success: false,
        message: 'Solo los usuarios URep pueden liberar modems de SCRAP'
      });
    }
    
    // Validar datos obligatorios
    if (!sn || !siguienteFase) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere número de serie y fase de destino'
      });
    }
    
    // Validar que la siguiente fase sea válida
    const fasesValidas = ['REGISTRO', 'TEST_INICIAL', 'ENSAMBLE', 'RETEST', 'EMPAQUE'];
    if (!fasesValidas.includes(siguienteFase)) {
      return res.status(400).json({
        success: false,
        message: 'Fase de destino no válida'
      });
    }
    
    // Buscar el modem
    const modem = await prisma.modem.findUnique({
      where: { sn: sn },
      include: {
        sku: true,
        registros: {
          where: { fase: 'SCRAP' },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: 'Modem no encontrado'
      });
    }
    
    if (modem.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Este modem ha sido eliminado del sistema'
      });
    }
    
    // Verificar que esté en SCRAP
    if (modem.faseActual !== 'SCRAP') {
      return res.status(400).json({
        success: false,
        message: 'El modem no está en estado SCRAP'
      });
    }
    
    // Obtener información del SCRAP actual
    const registroScrap = modem.registros[0];
    const motivoScrapOriginal = modem.motivoScrap;
    
    // Actualizar modem a la nueva fase
    const modemActualizado = await prisma.modem.update({
      where: { id: modem.id },
      data: {
        faseActual: siguienteFase,
        motivoScrap: null, // Limpiar motivo SCRAP
        responsableId: userId,
        updatedAt: new Date()
      }
    });
    
    // Crear registro de liberación
    await prisma.registro.create({
      data: {
        modemId: modem.id,
        userId: userId,
        fase: siguienteFase,
        faseAnterior: 'SCRAP',
        estado: 'SN_OK',
        detalle: detalle || `Liberado de SCRAP ${motivoScrapOriginal} por URep`,
        createdAt: new Date()
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'LIBERAR_DE_SCRAP',
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, De: SCRAP (${motivoScrapOriginal}) a ${siguienteFase}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Modem liberado de SCRAP exitosamente',
      data: {
        modem: modemActualizado,
        faseAnterior: 'SCRAP',
        motivoScrapAnterior: motivoScrapOriginal,
        nuevaFase: siguienteFase
      }
    });
    
  } catch (error) {
    console.error('Error al liberar de SCRAP:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener modems en SCRAP con sus códigos de diagnóstico
 */
exports.obtenerModemsEnScrap = async (req, res) => {
  try {
    const { motivoScrap, conDiagnostico } = req.query;
    const userRol = req.user.rol;
    
    // Preparar condiciones de búsqueda
    const whereConditions = {
      faseActual: 'SCRAP',
      deletedAt: null
    };
    
    // Filtrar por motivo si se especifica
    if (motivoScrap) {
      whereConditions.motivoScrap = motivoScrap;
    }
    
    const modems = await prisma.modem.findMany({
      where: whereConditions,
      include: {
        sku: {
          select: {
            id: true,
            nombre: true
          }
        },
        registros: {
          where: {
            fase: 'SCRAP',
            codigoDanoId: {
              not: null
            }
          },
          include: {
            codigoDano: {
              select: {
                id: true,
                codigo: true,
                descripcion: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    // Filtrar solo los que tienen diagnóstico si se solicita
    let modemsResultado = modems;
    if (conDiagnostico === 'true') {
      modemsResultado = modems.filter(modem => 
        modem.registros.length > 0 && modem.registros[0].codigoDano
      );
    }
    
    // Formatear respuesta
    const modemsFormateados = modemsResultado.map(modem => ({
      id: modem.id,
      sn: modem.sn,
      mac: modem.mac,
      sku: modem.sku,
      faseActual: modem.faseActual,
      motivoScrap: modem.motivoScrap,
      responsableId: modem.responsableId,
      updatedAt: modem.updatedAt,
      diagnostico: modem.registros.length > 0 ? {
        codigo: modem.registros[0].codigoDano.codigo,
        descripcion: modem.registros[0].codigoDano.descripcion,
        fechaDiagnostico: modem.registros[0].createdAt
      } : null
    }));
    
    return res.status(200).json({
      success: true,
      data: {
        total: modemsFormateados.length,
        modems: modemsFormateados
      }
    });
    
  } catch (error) {
    console.error('Error al obtener modems en SCRAP:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Registrar un modem como scrap de salida
 */
exports.registrarScrapSalida = async (req, res) => {
  try {
    const { sn, motivoScrap, detalleScrap } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Verificar que el usuario tenga rol de empaque
    if (userRol !== 'UE') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para registrar scraps de salida'
      });
    }
    
    // Validar datos
    if (!sn || !motivoScrap || !detalleScrap) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere número de serie, motivo de scrap y detalle'
      });
    }
    
    // Buscar el modem
    const modem = await prisma.modem.findUnique({
      where: { sn: sn },
      include: {
        sku: true
      }
    });
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: 'Modem no encontrado'
      });
    }
    
    if (modem.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Este modem ha sido eliminado del sistema'
      });
    }
    
    // Verificar que el modem esté en estado SCRAP
    if (modem.faseActual !== 'SCRAP') {
      return res.status(400).json({
        success: false,
        message: `El modem debe estar en estado SCRAP para ser registrado como salida. Estado actual: ${modem.faseActual}`
      });
    }
    
    // Normalizar los valores de motivo y detalle
    const motivoScrapNormalizado = normalizarMotivoScrap(motivoScrap);
    const detalleScrapNormalizado = normalizarDetalleScrap(detalleScrap, motivoScrapNormalizado);
    
    // Buscar lote de salida de scrap activo para este SKU y motivo
    let loteScrapSalida = await prisma.lote.findFirst({
      where: {
        skuId: modem.skuId,
        responsableId: userId,
        tipoLote: 'SALIDA',
        esScrap: true,
        motivoScrap: motivoScrapNormalizado,
        estado: 'EN_PROCESO',
        deletedAt: null
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Si no existe un lote de salida activo para este tipo de scrap, crear uno nuevo
    if (!loteScrapSalida) {
      // Generar número de lote único para salida de scrap
      const fechaActual = new Date();
      const prefijo = `SCR${fechaActual.getFullYear()}${(fechaActual.getMonth() + 1).toString().padStart(2, '0')}`;
      const contadorLotes = await prisma.lote.count({
        where: {
          numero: {
            startsWith: prefijo
          }
        }
      });
      
      const nuevoNumeroLote = `${prefijo}-${motivoScrapNormalizado}-${(contadorLotes + 1).toString().padStart(4, '0')}`;
      
      // Crear el nuevo lote de salida de scrap
      loteScrapSalida = await prisma.lote.create({
        data: {
          numero: nuevoNumeroLote,
          skuId: modem.skuId,
          responsableId: userId,
          tipoLote: 'SALIDA',
          esScrap: true,
          motivoScrap: motivoScrapNormalizado,
          estado: 'EN_PROCESO'
        }
      });
    }
    
    // Actualizar el modem con el lote de salida y los detalles del scrap
    const modemActualizado = await prisma.modem.update({
      where: { id: modem.id },
      data: {
        loteSalidaId: loteScrapSalida.id,
        motivoScrap: motivoScrapNormalizado,
        detalleScrap: detalleScrapNormalizado,
        updatedAt: new Date()
      }
    });
    
    // Determinar el estado de registro según el motivo
    let estadoRegistro;
    switch (motivoScrapNormalizado) {
      case 'COSMETICA':
        estadoRegistro = 'SCRAP_COSMETICO';
        break;
      case 'FUERA_DE_RANGO':
        estadoRegistro = 'SCRAP_ELECTRONICO';
        break;
      case 'INFESTADO':
        estadoRegistro = 'SCRAP_INFESTACION';
        break;
      default:
        estadoRegistro = 'SCRAP_ELECTRONICO';
    }
    
    // Crear registro de la acción
    await prisma.registro.create({
      data: {
        sn: modem.sn,
        fase: 'SCRAP',
        estado: estadoRegistro,
        motivoScrap: motivoScrapNormalizado,
        detalleScrap: detalleScrapNormalizado,
        userId,
        loteId: loteScrapSalida.id,
        modemId: modem.id
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'REGISTRO_SCRAP_SALIDA',
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, Motivo: ${motivoScrapNormalizado}, Detalle: ${detalleScrapNormalizado}, Lote Salida: ${loteScrapSalida.numero}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Modem registrado en scrap de salida exitosamente',
      data: {
        modem: modemActualizado,
        loteScrapSalida
      }
    });
  } catch (error) {
    console.error('Error al registrar scrap de salida:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Cerrar lote de scrap
 */
exports.cerrarLoteScrap = async (req, res) => {
  try {
    const { loteId } = req.body;
    const userId = req.user.id;
    
    // Buscar el lote
    const lote = await prisma.lote.findUnique({
      where: { id: parseInt(loteId) },
      include: { sku: true }
    });
    
    if (!lote) {
      return res.status(404).json({
        success: false,
        message: 'Lote no encontrado'
      });
    }
    
    // Verificar que sea un lote de salida y de scrap
    if (lote.tipoLote !== 'SALIDA' || !lote.esScrap) {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden cerrar lotes de salida de scrap'
      });
    }
    
    // Verificar que el lote no esté ya cerrado
    if (lote.estado === 'COMPLETADO') {
      return res.status(400).json({
        success: false,
        message: 'El lote ya está cerrado'
      });
    }
    
    // Contar modems en el lote
    const totalModems = await prisma.modem.count({
      where: {
        loteSalidaId: parseInt(loteId),
        deletedAt: null
      }
    });
    
    if (totalModems === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede cerrar un lote sin modems'
      });
    }
    
    // Actualizar el lote a COMPLETADO
    const loteCerrado = await prisma.lote.update({
      where: { id: parseInt(loteId) },
      data: {
        estado: 'COMPLETADO',
        updatedAt: new Date()
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'CERRAR_LOTE_SCRAP',
      entidad: 'Lote',
      detalle: `Lote: ${lote.numero}, SKU: ${lote.sku.nombre}, Motivo: ${lote.motivoScrap}, Total modems: ${totalModems}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: `Lote de scrap ${lote.numero} cerrado con ${totalModems} modems`,
      data: {
        lote: loteCerrado,
        totalModems
      }
    });
  } catch (error) {
    console.error('Error al cerrar lote de scrap:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener estadísticas de scraps
 */
exports.obtenerEstadisticasScrap = async (req, res) => {
  try {
    const { desde, hasta, skuId } = req.query;
    
    // Preparar condiciones de búsqueda
    const where = {
      tipoLote: 'SALIDA',
      esScrap: true,
      deletedAt: null
    };
    
    // Filtrar por SKU si se proporciona
    if (skuId) {
      where.skuId = parseInt(skuId);
    }
    
    // Filtrar por fecha
    if (desde || hasta) {
      where.createdAt = {};
      
      if (desde) {
        where.createdAt.gte = new Date(desde);
      }
      
      if (hasta) {
        where.createdAt.lte = new Date(hasta);
      }
    }
    
    // Estadísticas por motivo de scrap
    const estadisticasPorMotivo = await prisma.$queryRaw`
      SELECT l."motivoScrap", COUNT(m.id) as total
      FROM "Lote" l
      JOIN "Modem" m ON m."loteSalidaId" = l.id
      WHERE l."tipoLote" = 'SALIDA'
        AND l."esScrap" = true
        AND l."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        ${skuId ? prisma.sql`AND l."skuId" = ${parseInt(skuId)}` : prisma.sql``}
        ${desde ? prisma.sql`AND l."createdAt" >= ${new Date(desde)}` : prisma.sql``}
        ${hasta ? prisma.sql`AND l."createdAt" <= ${new Date(hasta)}` : prisma.sql``}
      GROUP BY l."motivoScrap"
    `;
    
    // Estadísticas por detalle de scrap
    const estadisticasPorDetalle = await prisma.$queryRaw`
      SELECT m."detalleScrap", COUNT(m.id) as total
      FROM "Modem" m
      JOIN "Lote" l ON m."loteSalidaId" = l.id
      WHERE l."tipoLote" = 'SALIDA'
        AND l."esScrap" = true
        AND l."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        ${skuId ? prisma.sql`AND l."skuId" = ${parseInt(skuId)}` : prisma.sql``}
        ${desde ? prisma.sql`AND l."createdAt" >= ${new Date(desde)}` : prisma.sql``}
        ${hasta ? prisma.sql`AND l."createdAt" <= ${new Date(hasta)}` : prisma.sql``}
      GROUP BY m."detalleScrap"
    `;
    
    // Estadísticas por SKU
    const estadisticasPorSKU = await prisma.$queryRaw`
      SELECT c.nombre as sku, COUNT(m.id) as total
      FROM "Modem" m
      JOIN "Lote" l ON m."loteSalidaId" = l.id
      JOIN "CatalogoSKU" c ON l."skuId" = c.id
      WHERE l."tipoLote" = 'SALIDA'
        AND l."esScrap" = true
        AND l."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        ${skuId ? prisma.sql`AND l."skuId" = ${parseInt(skuId)}` : prisma.sql``}
        ${desde ? prisma.sql`AND l."createdAt" >= ${new Date(desde)}` : prisma.sql``}
        ${hasta ? prisma.sql`AND l."createdAt" <= ${new Date(hasta)}` : prisma.sql``}
      GROUP BY c.nombre
    `;
    
    // Total general
    const totalGeneral = await prisma.modem.count({
      where: {
        loteSalida: {
          tipoLote: 'SALIDA',
          esScrap: true,
          deletedAt: null,
          ...(skuId && { skuId: parseInt(skuId) }),
          ...(desde && { createdAt: { gte: new Date(desde) } }),
          ...(hasta && { createdAt: { lte: new Date(hasta) } })
        },
        deletedAt: null
      }
    });
    
    // Formatear respuesta
    const formatearMotivo = (motivo) => {
      if (!motivo) return 'DESCONOCIDO';
      return motivo.replace('_', ' ').replace('FUERA_DE_RANGO', 'FUERA DE RANGO');
    };
    
    const formatearDetalle = (detalle) => {
      if (!detalle) return 'DESCONOCIDO';
      
      switch(detalle) {
        case 'CIRCUITO_OK_BASE_NOK':
          return 'Sirve circuito pero no base';
        case 'BASE_OK_CIRCUITO_NOK':
          return 'Sirve base pero no circuito';
        case 'CIRCUITO_NOK_BASE_NOK':
          return 'No sirve circuito ni base';
        case 'INFESTACION':
          return 'Infestación';
        default:
          return 'Otro';
      }
    };
    
    return res.status(200).json({
      success: true,
      data: {
        totalGeneral,
        porMotivo: estadisticasPorMotivo.map(item => ({
          motivo: formatearMotivo(item.motivoScrap),
          total: parseInt(item.total)
        })),
        porDetalle: estadisticasPorDetalle.map(item => ({
          detalle: formatearDetalle(item.detalleScrap),
          total: parseInt(item.total)
        })),
        porSKU: estadisticasPorSKU.map(item => ({
          sku: item.sku,
          total: parseInt(item.total)
        }))
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de scrap:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Funciones auxiliares
function normalizarMotivoScrap(motivoScrap) {
  const motivo = motivoScrap.toUpperCase();
  
  if (motivo.includes('ELECTRONICO') || motivo === 'ELECTRONICO' || motivo.includes('FUERA') || motivo.includes('RANGO')) {
    return 'FUERA_DE_RANGO';
  } else if (motivo.includes('COSME')) {
    return 'COSMETICA';
  } else if (motivo.includes('INFEST')) {
    return 'INFESTADO';
  } else if (motivo.includes('DEFECTO') || motivo.includes('SW')) {
    return 'DEFECTO_SW';
  } else if (motivo.includes('SIN_REPARACION')) {
    return 'SIN_REPARACION';
  } else {
    return 'OTRO';
  }
}

/**
 * Obtener opciones dinámicas de SCRAP según el rol del usuario
 */
exports.obtenerOpcionesScrap = async (req, res) => {
  try {
    // Intentar obtener el rol del usuario si está autenticado, sino usar valor por defecto
    const userRol = (req.user && req.user.rol) ? req.user.rol : 'UTI';
    
    console.log('Obteniendo opciones SCRAP para rol:', userRol);
    
    // Definir opciones de SCRAP según el rol con formato esperado por el frontend
    const opcionesScrapPorRol = {
      // Registro y Almacén solo pueden marcar cosmética e infestado
      'UReg': [
        { value: 'COSMETICA', text: 'Cosmética', requiereDiagnostico: false },
        { value: 'INFESTADO', text: 'Infestado', requiereDiagnostico: false }
      ],
      'UA': [
        { value: 'COSMETICA', text: 'Cosmética', requiereDiagnostico: false },
        { value: 'INFESTADO', text: 'Infestado', requiereDiagnostico: false }
      ],
      // Procesamiento puede marcar cualquier SCRAP
      'UTI': [
        { value: 'COSMETICA', text: 'Cosmética', requiereDiagnostico: false },
        { value: 'ELECTRONICO', text: 'Electrónica', requiereDiagnostico: true },
        { value: 'INFESTADO', text: 'Infestado', requiereDiagnostico: false }
      ],
      'UEN': [
        { value: 'COSMETICA', text: 'Cosmética', requiereDiagnostico: false },
        { value: 'ELECTRONICO', text: 'Electrónica', requiereDiagnostico: true },
        { value: 'INFESTADO', text: 'Infestado', requiereDiagnostico: false }
      ],
      'UR': [
        { value: 'COSMETICA', text: 'Cosmética', requiereDiagnostico: false },
        { value: 'ELECTRONICO', text: 'Electrónica', requiereDiagnostico: true },
        { value: 'INFESTADO', text: 'Infestado', requiereDiagnostico: false }
      ],
      // URep puede marcar cualquier SCRAP
      'URep': [
        { value: 'COSMETICA', text: 'Cosmética', requiereDiagnostico: false },
        { value: 'ELECTRONICO', text: 'Electrónica', requiereDiagnostico: true },
        { value: 'INFESTADO', text: 'Infestado', requiereDiagnostico: false }
      ]
    };
    
    // Obtener códigos de diagnóstico
    const codigosDiagnostico = await prisma.codigoDano.findMany({
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, descripcion: true }
    });
    
    // Opciones de reparación estáticas (pueden venir de BD después)
    const opcionesReparacion = [
      { value: 'R01', text: 'R01 - Cambio de conectores' },
      { value: 'R02', text: 'R02 - Reparación de antena' },
      { value: 'R03', text: 'R03 - Limpieza general' },
      { value: 'R04', text: 'R04 - Cambio de componentes TH' },
      { value: 'R05', text: 'R05 - Cambio de componentes SMT' },
      { value: 'R06', text: 'R06 - Reparación de PCB' },
      { value: 'R07', text: 'R07 - Calibración' },
      { value: 'R08', text: 'R08 - Actualización firmware' },
      { value: 'R09', text: 'R09 - Otros' }
    ];

    // Niveles de reparación
    const nivelesReparacion = [
      { value: 'N1', text: 'N1 - Cambio de Conectores' },
      { value: 'N2', text: 'N2 - Reparación a Nivel Componente TH' },
      { value: 'N2+', text: 'N2+ - Reparación a Nivel Componente SMT' },
      { value: 'N3', text: 'N3 - Reparación de PCB Completo' }
    ];
    
    // Opciones de SCRAP para el rol actual
    const opcionesScrap = opcionesScrapPorRol[userRol] || opcionesScrapPorRol['UTI']; // Default a UTI si no se encuentra el rol
    
    const response = {
      success: true,
      opcionesScrap,
      opcionesReparacion,
      nivelesReparacion,
      codigosDiagnostico,
      rol: userRol,
      permisos: {
        puede_scrap_electronico: ['UTI', 'UEN', 'UR', 'URep'].includes(userRol),
        puede_liberar_scrap: userRol === 'URep'
      }
    };
    
    console.log('Respuesta de opciones SCRAP:', JSON.stringify(response, null, 2));
    
    // Agregar headers para evitar caché
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Error al obtener opciones de SCRAP:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

function normalizarDetalleScrap(detalleScrap, motivoScrap) {
  if (!detalleScrap) return 'OTRO';
  
  const detalle = detalleScrap.toUpperCase();
  
  if (detalle.includes('CIRCUITO OK') || detalle.includes('SIRVE CIRCUITO') || 
      (detalle.includes('CIRCUITO') && detalle.includes('NO BASE'))) {
    return 'CIRCUITO_OK_BASE_NOK';
  } else if (detalle.includes('BASE OK') || detalle.includes('SIRVE BASE') || 
             (detalle.includes('BASE') && detalle.includes('NO CIRCUITO'))) {
    return 'BASE_OK_CIRCUITO_NOK';
  } else if (detalle.includes('NO SIRVE') || detalle.includes('CIRCUITO NOK') && detalle.includes('BASE NOK')) {
    return 'CIRCUITO_NOK_BASE_NOK';
  } else if (motivoScrap === 'INFESTADO') {
    return 'INFESTACION';
  } else {
    return 'OTRO';
  }
}