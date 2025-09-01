const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logService = require('../services/logService');
const modemService = require('../services/modemService');

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
    const modem = await modemService.buscarPorSN(sn);
    
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
    if (modem.estadoActual.nombre !== 'SCRAP') {
      return res.status(400).json({
        success: false,
        message: `El modem debe estar en estado SCRAP para ser registrado como salida. Estado actual: ${modem.estadoActual.nombre}`
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
  
  if (motivo.includes('FUERA') || motivo.includes('RANGO') || motivo.includes('ELECTRO')) {
    return 'FUERA_DE_RANGO';
  } else if (motivo.includes('COSME')) {
    return 'COSMETICA';
  } else if (motivo.includes('INFEST')) {
    return 'INFESTADO';
  } else {
    return 'OTRO';
  }
}

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