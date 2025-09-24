const { PrismaClient, FaseProceso } = require('@prisma/client');
const prisma = new PrismaClient();
const logService = require('../services/logService');
const modemService = require('../services/modemService');

// Caché para optimizar rendimiento
let cacheDanos = null;
let cacheDanosExpiry = null;
let cacheReparaciones = null;
let cacheReparacionesExpiry = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

/**
 * Transición directa a reparación desde cualquier fase válida
 */
exports.transicionReparacion = async (req, res) => {
  try {
    const { sn, motivo } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Roles permitidos para enviar a reparación
    const rolesPermitidos = ['URep', 'UTI', 'UA'];
    
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para enviar modems a reparación'
      });
    }
    
    if (!sn) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere el número de serie del modem'
      });
    }
    
    // Buscar el modem
    const modem = await modemService.buscarPorSN(sn);
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un modem con número de serie ${sn}`
      });
    }
    
    // Verificar fases válidas para entrada a reparación
    const fasesValidas = ['TEST_INICIAL', 'ENSAMBLE', 'RETEST'];
    const puedeDesdeScrap = modem.faseActual === 'SCRAP' && modem.motivoScrap === 'FUERA_DE_RANGO';
    
    if (!fasesValidas.includes(modem.faseActual) && !puedeDesdeScrap) {
      return res.status(400).json({
        success: false,
        message: `No se puede enviar a reparación desde fase ${modem.faseActual}. Fases válidas: ${fasesValidas.join(', ')} o SCRAP con motivo FUERA_DE_RANGO`
      });
    }
    
    // Verificar si ya está en reparación
    if (modem.faseActual === 'REPARACION') {
      return res.status(400).json({
        success: false,
        message: 'El modem ya está en fase de reparación'
      });
    }
    
    // Iniciar transacción
    const resultado = await prisma.$transaction(async (tx) => {
      // Buscar el estado de REPARACION
      const estadoReparacion = await tx.estado.findFirst({
        where: { nombre: 'REPARACION' }
      });
      
      if (!estadoReparacion) {
        throw new Error('No se encontró el estado REPARACION');
      }
      
      // Actualizar el modem
      const modemActualizado = await tx.modem.update({
        where: { id: modem.id },
        data: {
          faseActual: 'REPARACION',
          estadoActualId: estadoReparacion.id,
          responsableId: userId
        }
      });
      
      // Crear registro de transición
      const registro = await tx.registro.create({
        data: {
          sn: modem.sn,
          fase: 'REPARACION',
          estado: 'REPARACION',
          reparacion: motivo || `Enviado a reparación desde ${modem.faseActual}`,
          userId,
          loteId: modem.loteId,
          modemId: modem.id
        }
      });
      
      return { modem: modemActualizado, registro };
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'TRANSICION_A_REPARACION',
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, Fase origen: ${modem.faseActual}, Motivo: ${motivo || 'Sin especificar'}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Modem enviado a reparación exitosamente',
      data: resultado
    });
  } catch (error) {
    console.error('Error en transición a reparación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Listar todos los modems en fase de reparación
 */
exports.listarModemsEnReparacion = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Roles permitidos para ver modems en reparación
    const rolesPermitidos = ['URep', 'UTI', 'UA'];
    
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver modems en reparación'
      });
    }
    
    // Consultar modems en fase de reparación
    const modems = await prisma.modem.findMany({
      where: {
        faseActual: 'REPARACION',
        deletedAt: null
      },
      include: {
        sku: {
          select: {
            nombre: true,
            skuItem: true
          }
        },
        estadoActual: true,
        registros: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1,
          include: {
            codigoReparacion: true,
            codigoDano: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    return res.status(200).json({
      success: true,
      data: modems
    });
  } catch (error) {
    console.error('Error al listar modems en reparación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Registrar un diagnóstico de reparación
 */
exports.registrarDiagnostico = async (req, res) => {
  try {
    const { sn, codigosDano, observaciones, requiereReparacion, tecnicoReparador } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Roles permitidos para diagnóstico
    const rolesPermitidos = ['URep', 'UTI', 'UA'];
    
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para registrar diagnósticos'
      });
    }
    
    if (!sn || !codigosDano || !Array.isArray(codigosDano) || codigosDano.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Datos incompletos. Se requiere número de serie y al menos un código de daño'
      });
    }
    
    // Si requiere reparación, el técnico es obligatorio
    if (requiereReparacion && (!tecnicoReparador || tecnicoReparador.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere especificar el técnico reparador cuando se requiere reparación'
      });
    }
    
    // Buscar el modem
    const modem = await modemService.buscarPorSN(sn);
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un modem con número de serie ${sn}`
      });
    }
    
    // Verificar fase actual del modem
    if (modem.faseActual !== 'TEST_INICIAL' && modem.faseActual !== 'REPARACION') {
      return res.status(400).json({
        success: false,
        message: `El modem debe estar en fase TEST_INICIAL o REPARACION, no en ${modem.faseActual}`
      });
    }
    
    // Iniciar transacción para garantizar integridad
    const resultado = await prisma.$transaction(async (tx) => {
      // Buscar los códigos de daño
      const codigosDanoObj = await tx.codigoDano.findMany({
        where: {
          codigo: {
            in: codigosDano
          }
        }
      });
      
      if (codigosDanoObj.length === 0) {
        throw new Error('Ninguno de los códigos de daño proporcionados es válido');
      }
      
      // Registros para cada código de daño
      const registros = [];
      
      for (const codigoDanoObj of codigosDanoObj) {
        const registro = await tx.registro.create({
          data: {
            sn: modem.sn,
            fase: 'REPARACION',
            estado: 'REPARACION',
            reparacion: observaciones || `Diagnóstico con código: ${codigoDanoObj.codigo}`,
            codigoDanoId: codigoDanoObj.id,
            codigoReparacionId: codigoDanoObj.codigoRepId,
            fechaInicioReparacion: requiereReparacion ? new Date() : null,
            tecnicoReparador: tecnicoReparador,
            observacionesReparacion: observaciones,
            userId,
            loteId: modem.loteId,
            modemId: modem.id
          }
        });
        
        registros.push(registro);
      }
      
      // Si requiere reparación, cambiar fase del modem
      if (requiereReparacion && modem.faseActual !== 'REPARACION') {
        // Buscar el estado de REPARACION
        const estadoReparacion = await tx.estado.findFirst({
          where: { nombre: 'REPARACION' }
        });
        
        if (!estadoReparacion) {
          throw new Error('No se encontró el estado REPARACION en la base de datos');
        }
        
        // Actualizar el modem
        await tx.modem.update({
          where: { id: modem.id },
          data: {
            faseActual: 'REPARACION',
            estadoActualId: estadoReparacion.id,
            responsableId: userId
          }
        });
      }
      
      return { registros };
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: 'DIAGNOSTICO_REPARACION',
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, Códigos: ${codigosDano.join(', ')}, Requiere reparación: ${requiereReparacion}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: requiereReparacion 
        ? 'Diagnóstico registrado y modem enviado a reparación' 
        : 'Diagnóstico registrado exitosamente',
      data: resultado
    });
  } catch (error) {
    console.error('Error al registrar diagnóstico:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Completar reparación y avanzar a la siguiente fase
 */
exports.completarReparacion = async (req, res) => {
  try {
    const { sn, codigosReparacion, exitosa, observaciones, tecnicoReparador } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Roles permitidos para completar reparaciones
    const rolesPermitidos = ['URep', 'UTI', 'UA'];
    
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para completar reparaciones'
      });
    }
    
    if (!sn || exitosa === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Datos incompletos. Se requiere número de serie y resultado (exitosa)'
      });
    }
    
    // Validar técnico reparador (obligatorio)
    if (!tecnicoReparador || tecnicoReparador.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Se requiere especificar el técnico reparador'
      });
    }
    
    // Validar códigos de reparación
    if (!codigosReparacion || !Array.isArray(codigosReparacion) || codigosReparacion.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere al menos un código de reparación'
      });
    }
    
    // Fases válidas para mover después de reparación
    // Según la documentación: EXITOSO -> ENSAMBLE, FALLIDO -> SCRAP
    const faseDestino = exitosa ? 'ENSAMBLE' : 'SCRAP';
    
    // Buscar el modem
    const modem = await modemService.buscarPorSN(sn);
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un modem con número de serie ${sn}`
      });
    }
    
    if (modem.faseActual !== 'REPARACION') {
      return res.status(400).json({
        success: false,
        message: `El modem debe estar en fase REPARACION, no en ${modem.faseActual}`
      });
    }
    
    // Iniciar transacción para garantizar integridad
    const resultado = await prisma.$transaction(async (tx) => {
      // Buscar el estado correspondiente a la fase destino
      const estadoDestino = await tx.estado.findFirst({
        where: { nombre: faseDestino }
      });
      
      if (!estadoDestino) {
        throw new Error(`No se encontró el estado para la fase ${faseDestino}`);
      }
      
      // Buscar los códigos de reparación
      const codigosReparacionObj = await tx.codigoReparacion.findMany({
        where: {
          codigo: {
            in: codigosReparacion
          }
        }
      });
      
      if (codigosReparacionObj.length === 0) {
        throw new Error('Ninguno de los códigos de reparación proporcionados es válido');
      }
      
      // Verificar si hay códigos de SCRAP cuando el destino es SCRAP
      if (faseDestino === 'SCRAP') {
        const tieneCodigoScrap = codigosReparacionObj.some(c => c.codigo.startsWith('SC'));
        
        if (!tieneCodigoScrap) {
          throw new Error('Para enviar a SCRAP debe incluir al menos un código SC');
        }
      }
      
      // Registros para cada código de reparación
      const registros = [];
      
      for (const codigoRepObj of codigosReparacionObj) {
        const registro = await tx.registro.create({
          data: {
            sn: modem.sn,
            fase: 'REPARACION',
            estado: exitosa ? 'SN_OK' : 'SCRAP_ELECTRONICO',
            reparacion: `${observaciones || 'Reparación completada'} (Código: ${codigoRepObj.codigo})`,
            codigoReparacionId: codigoRepObj.id,
            tecnicoReparador: tecnicoReparador,
            observacionesReparacion: observaciones,
            fechaFinReparacion: new Date(),
            userId,
            loteId: modem.loteId,
            modemId: modem.id
          }
        });
        
        registros.push(registro);
      }
      
      // Actualizar el modem
      const modemActualizado = await tx.modem.update({
        where: { id: modem.id },
        data: {
          estadoActualId: estadoDestino.id,
          faseActual: faseDestino,
          responsableId: userId,
          // Si va a SCRAP, actualizar el motivo
          ...(faseDestino === 'SCRAP' ? { 
            motivoScrap: 'FUERA_DE_RANGO',
            detalleScrap: 'CIRCUITO_NOK_BASE_NOK'
          } : {})
        }
      });
      
      // Crear registro final de transición
      await tx.registro.create({
        data: {
          sn: modem.sn,
          fase: faseDestino,
          estado: faseDestino === 'SCRAP' ? 'SCRAP_ELECTRONICO' : 'SN_OK',
          reparacion: `Transición de REPARACION a ${faseDestino} - ${exitosa ? 'Reparación exitosa' : 'No reparable'}`,
          userId,
          loteId: modem.loteId,
          modemId: modem.id
        }
      });
      
      return { modem: modemActualizado, registros };
    });
    
    // Registrar en log
    await logService.registrarAccion({
      accion: `COMPLETAR_REPARACION_A_${faseDestino}`,
      entidad: 'Modem',
      detalle: `SN: ${modem.sn}, Fase: ${faseDestino}, Exitosa: ${exitosa}, Códigos: ${codigosReparacion.join(', ')}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: `Reparación completada. Modem avanzado a fase ${faseDestino}`,
      data: resultado
    });
  } catch (error) {
    console.error('Error al completar reparación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener historial de reparaciones de un modem
 */
exports.obtenerHistorialReparaciones = async (req, res) => {
  try {
    const { sn } = req.params;
    
    if (!sn) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere el número de serie'
      });
    }
    
    // Buscar el modem
    const modem = await modemService.buscarPorSN(sn);
    
    if (!modem) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un modem con número de serie ${sn}`
      });
    }
    
    // Buscar todos los registros de reparación
    const registros = await prisma.registro.findMany({
      where: {
        modemId: modem.id,
        OR: [
          { fase: 'REPARACION' },
          { codigoDanoId: { not: null } },
          { codigoReparacionId: { not: null } }
        ]
      },
      include: {
        user: {
          select: {
            nombre: true,
            userName: true
          }
        },
        codigoDano: true,
        codigoReparacion: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Formatear para la respuesta
    const reparaciones = registros.map(reg => ({
      id: reg.id,
      sn: reg.sn,
      tipo: reg.codigoDanoId ? 'Diagnóstico' : (reg.codigoReparacionId ? 'Reparación' : 'Transición'),
      codigos: [
        ...(reg.codigoDano ? [reg.codigoDano.codigo] : []),
        ...(reg.codigoReparacion ? [reg.codigoReparacion.codigo] : [])
      ],
      estado: reg.estado,
      observaciones: reg.reparacion,
      fechaCreacion: reg.createdAt,
      usuario: reg.user.nombre
    }));
    
    return res.status(200).json({
      success: true,
      data: {
        modem,
        reparaciones
      }
    });
  } catch (error) {
    console.error('Error al obtener historial de reparaciones:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener todos los códigos de daño disponibles (con caché)
 */
exports.obtenerCodigosDano = async (req, res) => {
  try {
    const ahora = Date.now();
    
    // Verificar caché válido
    if (cacheDanos && cacheDanosExpiry && cacheDanosExpiry > ahora) {
      return res.status(200).json({
        success: true,
        message: 'Códigos de daño obtenidos exitosamente (caché)',
        data: cacheDanos
      });
    }
    
    // Consultar todos los códigos de daño
    const codigosDano = await prisma.codigoDano.findMany({
      include: {
        codigoRep: true
      },
      orderBy: {
        codigo: 'asc'
      }
    });
    
    // Actualizar caché
    cacheDanos = codigosDano;
    cacheDanosExpiry = ahora + CACHE_TTL;
    
    return res.status(200).json({
      success: true,
      message: 'Códigos de daño obtenidos exitosamente',
      data: codigosDano
    });
  } catch (error) {
    console.error('Error al obtener códigos de daño:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener todos los códigos de reparación disponibles (con caché)
 */
exports.obtenerCodigosReparacion = async (req, res) => {
  try {
    const ahora = Date.now();
    
    // Verificar caché válido
    if (cacheReparaciones && cacheReparacionesExpiry && cacheReparacionesExpiry > ahora) {
      return res.status(200).json({
        success: true,
        message: 'Códigos de reparación obtenidos exitosamente (caché)',
        data: cacheReparaciones
      });
    }
    
    // Consultar todos los códigos de reparación
    const codigosReparacion = await prisma.codigoReparacion.findMany({
      orderBy: {
        codigo: 'asc'
      }
    });
    
    // Determinar nivel de cada código
    const codigosConNivel = codigosReparacion.map(codigo => ({
      ...codigo,
      nivel: codigo.codigo.startsWith('SC') ? 'NIVEL_2' : 'NIVEL_1'
    }));
    
    // Actualizar caché
    cacheReparaciones = codigosConNivel;
    cacheReparacionesExpiry = ahora + CACHE_TTL;
    
    return res.status(200).json({
      success: true,
      message: 'Códigos de reparación obtenidos exitosamente',
      data: codigosConNivel
    });
  } catch (error) {
    console.error('Error al obtener códigos de reparación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener equipos pendientes de reparación
 */
exports.obtenerEquiposPendientes = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Roles permitidos para ver modems pendientes
    const rolesPermitidos = ['URep', 'UTI', 'UA'];
    
    if (!rolesPermitidos.includes(userRol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver equipos pendientes de reparación'
      });
    }
    
    // Buscar modems en fase REPARACION
    const modems = await prisma.modem.findMany({
      where: {
        faseActual: 'REPARACION',
        deletedAt: null
      },
      include: {
        sku: {
          select: {
            nombre: true
          }
        },
        registros: {
          where: {
            fase: 'REPARACION',
            codigoDanoId: {
              not: null
            }
          },
          include: {
            codigoDano: true,
            user: {
              select: {
                nombre: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    // Formatear respuesta
    const equiposPendientes = modems.map(modem => {
      const codigosDano = modem.registros
        .filter(reg => reg.codigoDano)
        .map(reg => reg.codigoDano.codigo);
      
      const observaciones = modem.registros.length > 0 
        ? modem.registros[0].reparacion 
        : null;
      
      return {
        id: modem.id,
        sn: modem.sn,
        sku: modem.sku.nombre,
        codigosDano: [...new Set(codigosDano)], // Eliminar duplicados
        observaciones,
        diagnosticadoPor: modem.registros.length > 0 ? modem.registros[0].user.nombre : null,
        fechaCreacion: modem.updatedAt
      };
    });
    
    return res.status(200).json({
      success: true,
      message: 'Equipos pendientes obtenidos exitosamente',
      data: equiposPendientes
    });
  } catch (error) {
    console.error('Error al obtener equipos pendientes:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Obtener estadísticas de códigos de diagnóstico por fecha
 */
exports.obtenerEstadisticasDiagnostico = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    const whereClause = {
      fase: 'SCRAP',
      motivoScrap: 'ELECTRONICO',
      codigoDanoId: { not: null }
    };
    
    // Agregar filtro de fechas si se proporcionan
    if (fechaInicio && fechaFin) {
      whereClause.createdAt = {
        gte: new Date(fechaInicio),
        lte: new Date(fechaFin)
      };
    }
    
    const estadisticas = await prisma.registro.groupBy({
      by: ['codigoDanoId'],
      where: whereClause,
      _count: {
        codigoDanoId: true
      }
    });
    
    // Formatear las estadísticas para el frontend
    const estadisticasFormateadas = await Promise.all(
      estadisticas.map(async (stat) => {
        const codigoDano = await prisma.codigoDano.findUnique({
          where: { id: stat.codigoDanoId },
          include: {
            codigoReparacion: true
          }
        });
        
        return {
          codigo: codigoDano.codigo,
          descripcion: codigoDano.descripcion,
          nivelReparacion: codigoDano.nivelRep,
          codigoReparacion: codigoDano.codigoReparacion?.codigo || 'N/A',
          descripcionReparacion: codigoDano.codigoReparacion?.descripcion || 'Sin reparación',
          cantidad: stat._count.codigoDanoId
        };
      })
    );
    
    res.json({
      success: true,
      estadisticas: estadisticasFormateadas,
      periodo: fechaInicio && fechaFin ? 
        { inicio: fechaInicio, fin: fechaFin } : 
        { descripcion: 'Todos los registros' }
    });
    
  } catch (error) {
    console.error('Error al obtener estadísticas de diagnóstico:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
};