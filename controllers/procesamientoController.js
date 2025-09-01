const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logService = require('../services/logService');
const modemService = require('../services/modemService');

/**
 * Procesar un modem - cambiar de estado/fase
 */
exports.procesarModem = async (req, res) => {
  try {
    const { sn, accion } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Roles permitidos para procesamiento
    const rolesPermitidos = ['UTI', 'UEN', 'UR', 'UA'];
    
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para procesar modems'
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
    
    // Verificar transiciones disponibles para este modem y usuario
    const transicionesDisponibles = await prisma.$queryRaw`
      SELECT * FROM obtener_transiciones_disponibles(${modem.id}, ${userId})
    `;
    
    // Verificar si la acción solicitada está entre las transiciones disponibles
    const transicionPermitida = transicionesDisponibles.some(
      t => t.nombre_evento === accion
    );
    
    if (!transicionPermitida) {
      return res.status(403).json({
        success: false,
        message: `No tienes permiso para realizar la acción: ${accion}`
      });
    }
    
    // Buscar la transición específica para obtener el estado destino
    const transicion = await prisma.transicionEstado.findFirst({
      where: {
        estadoDesdeId: modem.estadoActualId,
        nombreEvento: accion
      },
      include: {
        estadoHacia: true
      }
    });
    
    if (!transicion) {
      return res.status(400).json({
        success: false,
        message: 'Transición no encontrada'
      });
    }
    
    // Mapear nombre de estado a fase
    let nuevaFase;
    switch (transicion.estadoHacia.nombre) {
      case 'TEST_INICIAL':
        nuevaFase = 'TEST_INICIAL';
        break;
      case 'LIBERACION_LIMPIEZA':
        nuevaFase = 'LIBERACION_LIMPIEZA';
        break;
      case 'RETEST':
        nuevaFase = 'RETEST';
        break;
      case 'SCRAP':
        nuevaFase = 'SCRAP';
        break;
      case 'REPARACION':
        nuevaFase = 'REPARACION';
        break;
      default:
        nuevaFase = modem.faseActual;
    }
    
    // Actualizar el modem
    const modemActualizado = await prisma.modem.update({
      where: { id: modem.id },
      data: {
        estadoActualId: transicion.estadoHaciaId,
        faseActual: nuevaFase,
        responsableId: userId,
        updatedAt: new Date()
      }
    });
    
    // Determinar el estado de registro
    let estadoRegistro = 'SN_OK';
    if (nuevaFase === 'SCRAP') {
      estadoRegistro = 'SCRAP_ELECTRONICO'; // Por defecto, se puede ajustar según el caso
    } else if (nuevaFase === 'REPARACION') {
      estadoRegistro = 'REPARACION';
    }
    
    // Crear registro de la acción
    await prisma.registro.create({
      data: {
        sn: modem.sn,
        fase: nuevaFase,
        estado: estadoRegistro,
        userId,
        loteId: modem.loteId,
        modemId: modem.id
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: `PROCESAR_MODEM_${nuevaFase}`,
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, Acción: ${accion}, Estado anterior: ${modem.estadoActual.nombre}, Nuevo estado: ${transicion.estadoHacia.nombre}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: `Modem procesado exitosamente. Nuevo estado: ${transicion.estadoHacia.nombre}`,
      data: {
        modem: modemActualizado,
        estadoAnterior: modem.estadoActual.nombre,
        nuevoEstado: transicion.estadoHacia.nombre
      }
    });
  } catch (error) {
    console.error('Error al procesar modem:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Registrar una reparación
 */
exports.registrarReparacion = async (req, res) => {
  try {
    const { sn, codigoReparacion } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Roles permitidos para reparaciones
    const rolesPermitidos = ['UR', 'UTI', 'UV'];
    
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para registrar reparaciones'
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
    
    // Buscar el estado de REPARACION
    const estadoReparacion = await prisma.estado.findFirst({
      where: { nombre: 'REPARACION' }
    });
    
    if (!estadoReparacion) {
      return res.status(500).json({
        success: false,
        message: 'Error: No se encontró el estado REPARACION'
      });
    }
    
    // Actualizar el modem
    const modemActualizado = await prisma.modem.update({
      where: { id: modem.id },
      data: {
        estadoActualId: estadoReparacion.id,
        faseActual: 'REPARACION',
        responsableId: userId,
        updatedAt: new Date()
      }
    });
    
    // Crear registro de la acción
    await prisma.registro.create({
      data: {
        sn: modem.sn,
        fase: 'REPARACION',
        estado: 'REPARACION',
        reparacion: codigoReparacion,
        userId,
        loteId: modem.loteId,
        modemId: modem.id
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'REGISTRAR_REPARACION',
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, Código: ${codigoReparacion}, Estado anterior: ${modem.estadoActual.nombre}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Reparación registrada exitosamente',
      data: {
        modem: modemActualizado,
        codigoReparacion
      }
    });
  } catch (error) {
    console.error('Error al registrar reparación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Registrar un scrap durante el procesamiento
 */
exports.registrarScrapProceso = async (req, res) => {
  try {
    const { sn, motivoScrap, detalleScrap } = req.body;
    const userId = req.user.id;
    
    // Buscar el modem
    const modem = await modemService.buscarPorSN(sn);
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: 'Modem no encontrado'
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
    
    // Normalizar motivo y detalle
    const motivoScrapNormalizado = normalizarMotivoScrap(motivoScrap);
    const detalleScrapNormalizado = normalizarDetalleScrap(detalleScrap, motivoScrapNormalizado);
    
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
    
    // Actualizar el modem
    const modemActualizado = await prisma.modem.update({
      where: { id: modem.id },
      data: {
        estadoActualId: estadoScrap.id,
        faseActual: 'SCRAP',
        motivoScrap: motivoScrapNormalizado,
        detalleScrap: detalleScrapNormalizado,
        responsableId: userId,
        updatedAt: new Date()
      }
    });
    
    // Crear registro de la acción
    await prisma.registro.create({
      data: {
        sn: modem.sn,
        fase: 'SCRAP',
        estado: estadoRegistro,
        motivoScrap: motivoScrapNormalizado,
        detalleScrap: detalleScrapNormalizado,
        userId,
        loteId: modem.loteId,
        modemId: modem.id
      }
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'REGISTRAR_SCRAP_PROCESO',
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, Motivo: ${motivoScrapNormalizado}, Detalle: ${detalleScrapNormalizado}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Scrap registrado exitosamente',
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