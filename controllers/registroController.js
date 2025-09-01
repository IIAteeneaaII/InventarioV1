const { PrismaClient, EstadoRegistro, MotivoScrap, DetalleScrap, FaseProceso } = require('@prisma/client');
const prisma = new PrismaClient();
const modemService = require('../services/modemService');
const logService = require('../services/logService');
const logger = require('../utils/logger');


// Registrar un nuevo modem
exports.registrarModem = async (req, res) => {
  console.log('--- INICIO registrarModem ---');
  logger.info('Datos recibidos en registrarModem', { body: req.body });
  try {
    // Verificar que el usuario esté autenticado
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }
  console.log('Datos recibidos en registrarModem:', req.body);


    const { sn, skuId } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Validaciones básicas
    if (!sn || !skuId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere número de serie y SKU'
      });
    }
    
    // Verificar que el usuario tenga rol permitido para registro
    if (userRol !== 'UA' && userRol !== 'UReg') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para registrar modems'
      });
    }
    
    // Validar formato del número de serie
    const validacionSN = await modemService.validarFormatoSN(sn, skuId);
    if (!validacionSN.esValido) {
      return res.status(400).json({
        success: false,
        message: validacionSN.mensaje
      });
    }
    
    // Verificar si el modem ya existe
    const modemExistente = await prisma.modem.findUnique({
      where: { sn },
    });
    
    if (modemExistente && !modemExistente.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Este número de serie ya está registrado'
      });
    }
    
    // Buscar el lote activo más reciente para este SKU y usuario
    const loteActivo = await prisma.lote.findFirst({
      where: {
        skuId: parseInt(skuId),
        responsableId: userId,
        tipoLote: 'ENTRADA',
        estado: 'EN_PROCESO',
        deletedAt: null
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    let loteId;
    // Si no hay lote activo, crear uno nuevo
    if (!loteActivo) {
      // Generar número de lote único
      const fechaActual = new Date();
      const prefijo = `${fechaActual.getFullYear()}${(fechaActual.getMonth() + 1).toString().padStart(2, '0')}`;
      const contadorLotes = await prisma.lote.count({
        where: {
          numero: {
            startsWith: prefijo
          }
        }
      });
      
      const nuevoNumeroLote = `${prefijo}-${(contadorLotes + 1).toString().padStart(4, '0')}`;
      
      // Crear el nuevo lote
      const nuevoLote = await prisma.lote.create({
        data: {
          numero: nuevoNumeroLote,
          skuId: parseInt(skuId),
          responsableId: userId,
          tipoLote: 'ENTRADA',
          estado: 'EN_PROCESO'
        }
      });
      
      loteId = nuevoLote.id;
    } else {
      loteId = loteActivo.id;
    }
    
    // Buscar el estado inicial (REGISTRO)
    const estadoRegistro = await prisma.estado.findFirst({
      where: { nombre: 'REGISTRO' }
    });
    
    if (!estadoRegistro) {
      return res.status(500).json({
        success: false,
        message: 'Error: No se encontró el estado REGISTRO'
      });
    }
    
    // Crear o actualizar el modem
    let modem;
    if (modemExistente) {
      // Actualizar modem existente (si estaba eliminado lógicamente)
      modem = await prisma.modem.update({
        where: { id: modemExistente.id },
        data: {
          loteId,
          skuId: parseInt(skuId),
          estadoActualId: estadoRegistro.id,
          faseActual: 'REGISTRO',
          responsableId: userId,
          deletedAt: null,
          updatedAt: new Date()
        }
      });
    } else {
      // Crear nuevo modem
      modem = await prisma.modem.create({
        data: {
          sn,
          loteId,
          skuId: parseInt(skuId),
          estadoActualId: estadoRegistro.id,
          faseActual: 'REGISTRO',
          responsableId: userId
        }
      });
    }
    
    // Crear registro de la acción
    await prisma.registro.create({
      data: {
        sn,
        fase: 'REGISTRO',
        estado: 'SN_OK',
        userId,
        loteId,
        modemId: modem.id
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: modemExistente ? 'ACTUALIZAR_MODEM' : 'CREAR_MODEM',
      entidad: 'Modem',
      detalle: `SN: ${sn}, Lote: ${loteId}`,
      userId
    });
    
    return res.status(201).json({
      success: true,
      message: modemExistente ? 'Modem reactivado exitosamente' : 'Modem registrado exitosamente',
      data: {
        modem,
        loteId
      }
    });
  } catch (error) {
    console.error('Error al registrar modem:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Función para "topar" o delimitar un lote
exports.confirmarLote = async (req, res) => {
  try {
    // Verificar que el usuario esté autenticado
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    const { skuId } = req.body;
    const userId = req.user.id;
    
    if (!skuId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere el ID del SKU'
      });
    }
    
    // Buscar el lote activo para este SKU y usuario
    const loteActivo = await prisma.lote.findFirst({
      where: {
        skuId: parseInt(skuId),
        responsableId: userId,
        tipoLote: 'ENTRADA',
        estado: 'EN_PROCESO',
        deletedAt: null
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        sku: true
      }
    });
    
    if (!loteActivo) {
      return res.status(404).json({
        success: false,
        message: 'No hay lote activo para confirmar'
      });
    }
    
    // Contar modems en el lote
    const totalModems = await prisma.modem.count({
      where: {
        loteId: loteActivo.id,
        deletedAt: null
      }
    });
    
    if (totalModems === 0) {
      return res.status(400).json({
        success: false,
        message: 'El lote no tiene modems registrados'
      });
    }

    // Opcionalmente, actualizar el estado del lote a COMPLETADO si se desea "topar" completamente
    // const loteFinalizado = await prisma.lote.update({
    //   where: { id: loteActivo.id },
    //   data: { estado: 'COMPLETADO' }
    // });
    
    // Registrar confirmación en log
    await logService.registrarAccion({
      accion: 'CONFIRMAR_LOTE',
      entidad: 'Lote',
      detalle: `Lote: ${loteActivo.numero}, SKU: ${loteActivo.sku.nombre}, Total modems: ${totalModems}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: `Lote ${loteActivo.numero} confirmado con ${totalModems} modems`,
      data: {
        lote: loteActivo,
        totalModems
      }
    });
  } catch (error) {
    console.error('Error al confirmar lote:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Registrar un scrap durante el proceso de registro
exports.registrarScrap = async (req, res) => {
  try {
    // Verificar que el usuario esté autenticado
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    const { sn, motivoScrap, detalleScrap } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Validaciones básicas
    if (!sn || !motivoScrap) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere número de serie y motivo de scrap'
      });
    }
    
    // Verificar que el usuario tenga rol permitido y fase REGISTRO
    if ((userRol !== 'UA' && userRol !== 'UReg')) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para registrar scraps en esta fase'
      });
    }
    
    // Buscar el modem por número de serie
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
    
    // Buscar el estado de SCRAP
    const estadoScrap = await prisma.estado.findFirst({
      where: { nombre: 'SCRAP' }
    });
    
    if (!estadoScrap) {
      return res.status(500).json({
        success: false,
        message: 'Error: No se encontró el estado SCRAP'
      });
    }
    
    // Mapear motivo y detalle a los valores del enum
    const motivoEnum = (() => {
      const m = normalizarMotivoScrap(motivoScrap).toUpperCase();
      if (m === 'COSMETICA') return MotivoScrap.COSMETICA;
      if (m === 'INFESTADO') return MotivoScrap.INFESTADO;
      return MotivoScrap.FUERA_DE_RANGO;
    })();
    const detalleEnum = (() => {
      const d = normalizarDetalleScrap(detalleScrap, motivoEnum);
      switch (d) {
        case 'CIRCUITO_OK_BASE_NOK': return DetalleScrap.CIRCUITO_OK_BASE_NOK;
        case 'BASE_OK_CIRCUITO_NOK': return DetalleScrap.BASE_OK_CIRCUITO_NOK;
        case 'INFESTACION': return DetalleScrap.INFESTACION;
        default: return DetalleScrap.OTRO;
      }
    })();
    // Determinar el estado de registro según el motivo
    const estadoRegistro = motivoEnum === MotivoScrap.COSMETICA
      ? EstadoRegistro.SCRAP_COSMETICO
      : motivoEnum === MotivoScrap.INFESTADO
        ? EstadoRegistro.SCRAP_INFESTACION
        : EstadoRegistro.SCRAP_ELECTRONICO;
    
    // Actualizar el modem a estado de scrap
    const modemActualizado = await prisma.modem.update({
      where: { id: modem.id },
      data: {
        estadoActualId: estadoScrap.id,
        faseActual: FaseProceso.SCRAP,
        motivoScrap: motivoEnum,
        detalleScrap: detalleEnum,
        updatedAt: new Date()
      }
    });
    
    // Crear registro de la acción
    await prisma.registro.create({
      data: {
        sn: modem.sn,
        fase: FaseProceso.SCRAP,
        estado: estadoRegistro,
        motivoScrap: motivoEnum,
        detalleScrap: detalleEnum,
        userId,
        loteId: modem.loteId,
        modemId: modem.id
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'REGISTRAR_SCRAP',
      entidad: 'Modem',
      detalle: `SN: ${sn}, Motivo: ${motivoScrapNormalizado}, Detalle: ${detalleScrapNormalizado}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Scrap registrado correctamente',
      data: {
        modem: modemActualizado
      }
    });
  } catch (error) {
    console.error('Error al registrar scrap:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Obtener historial de registros para un lote
exports.obtenerHistorial = async (req, res) => {
  try {
    // Verificar que el usuario esté autenticado
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    const { loteId } = req.params;
    const userId = req.user.id;
    
    if (!loteId || isNaN(parseInt(loteId))) {
      return res.status(400).json({
        success: false,
        message: 'ID de lote inválido'
      });
    }
    
    // Verificar si el lote existe
    const loteExiste = await prisma.lote.findUnique({
      where: { id: parseInt(loteId) }
    });
    
    if (!loteExiste) {
      return res.status(404).json({
        success: false,
        message: 'Lote no encontrado'
      });
    }
    
    const registros = await prisma.registro.findMany({
      where: {
        loteId: parseInt(loteId),
        userId // Filtrar por usuario actual (cada usuario ve sus propios registros)
      },
      include: {
        user: {
          select: { userName: true, rol: true }
        },
        lote: {
          select: { numero: true }
        },
        modem: {
          select: { sn: true, faseActual: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return res.status(200).json({
      success: true,
      count: registros.length,
      data: registros
    });
  } catch (error) {
    console.error('Error al obtener historial:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

// Funciones auxiliares para normalización
function normalizarMotivoScrap(motivoScrap) {
  if (!motivoScrap) return 'OTRO';
  
  const motivo = motivoScrap.toString().toUpperCase();
  logger.info(`Valor normalizado de motivoScrap: ${motivo}`);

  
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
  
  const detalle = detalleScrap.toString().toUpperCase();
  
  if (detalle.includes('CIRCUITO OK') || detalle.includes('SIRVE CIRCUITO') || 
      (detalle.includes('CIRCUITO') && detalle.includes('NO BASE'))) {
    return 'CIRCUITO_OK_BASE_NOK';
  } else if (detalle.includes('BASE OK') || detalle.includes('SIRVE BASE') || 
             (detalle.includes('BASE') && detalle.includes('NO CIRCUITO'))) {
    return 'BASE_OK_CIRCUITO_NOK';
  } else if ((detalle.includes('NO SIRVE') || 
             (detalle.includes('CIRCUITO NOK') && detalle.includes('BASE NOK')))) {
    return 'CIRCUITO_NOK_BASE_NOK';
  } else if (motivoScrap === 'INFESTADO') {
    return 'INFESTACION';
  } else {
    return 'OTRO';
  }
}