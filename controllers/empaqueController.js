const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logService = require('../services/logService');
const modemService = require('../services/modemService');

/**
 * Registrar un modem en empaque (lote de salida)
 */
exports.registrarModemEmpaque = async (req, res) => {
  try {
    const { sn } = req.body;
    const userId = req.user.id;
    const userRol = req.user.rol;
    
    // Verificar que el usuario tenga rol de empaque
    if (userRol !== 'UE') {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para registrar modems en empaque'
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
    
    // Verificar que el modem esté en un estado válido para empaque (RETEST)
    if (modem.estadoActual.nombre !== 'RETEST') {
      return res.status(400).json({
        success: false,
        message: `El modem debe estar en estado RETEST para pasar a empaque. Estado actual: ${modem.estadoActual.nombre}`
      });
    }
    
    // Buscar el estado de EMPAQUE
    const estadoEmpaque = await prisma.estado.findFirst({
      where: { nombre: 'EMPAQUE' }
    });
    
    if (!estadoEmpaque) {
      return res.status(500).json({
        success: false,
        message: 'Error: No se encontró el estado EMPAQUE'
      });
    }
    
    // Buscar lote de salida activo para este SKU
    let loteSalida = await prisma.lote.findFirst({
      where: {
        skuId: modem.skuId,
        responsableId: userId,
        tipoLote: 'SALIDA',
        esScrap: false,
        estado: 'EN_PROCESO',
        deletedAt: null
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Si no existe un lote de salida activo, crear uno nuevo
    if (!loteSalida) {
      // Generar número de lote único para salida
      const fechaActual = new Date();
      const prefijo = `S${fechaActual.getFullYear()}${(fechaActual.getMonth() + 1).toString().padStart(2, '0')}`;
      const contadorLotes = await prisma.lote.count({
        where: {
          numero: {
            startsWith: prefijo
          }
        }
      });
      
      const nuevoNumeroLote = `${prefijo}-${(contadorLotes + 1).toString().padStart(4, '0')}`;
      
      // Crear el nuevo lote de salida
      loteSalida = await prisma.lote.create({
        data: {
          numero: nuevoNumeroLote,
          skuId: modem.skuId,
          responsableId: userId,
          tipoLote: 'SALIDA',
          esScrap: false,
          estado: 'EN_PROCESO'
        }
      });
    }
    
    try {
      // Validar la transición de fase usando el servicio
      await modemService.validarTransicionFase(modem.faseActual, 'EMPAQUE');
      
      // Actualizar el modem
      const modemActualizado = await prisma.modem.update({
        where: { id: modem.id },
        data: {
          estadoActualId: estadoEmpaque.id,
          faseActual: 'EMPAQUE',
          responsableId: userId,
          loteSalidaId: loteSalida.id // Asignar al lote de salida
        }
      });
      
      // Crear registro de la acción
      await prisma.registro.create({
        data: {
          sn: modem.sn,
          fase: 'EMPAQUE',
          estado: 'SN_OK',
          userId,
          loteId: loteSalida.id,
          modemId: modem.id
        }
      });
      
      // Registrar en log
      await logService.registrarAccion({
        accion: 'EMPAQUE_MODEM',
        entidad: 'Modem',
        detalle: `SN: ${modem.sn}, Lote Salida: ${loteSalida.numero}`,
        userId
      });
      
      return res.status(200).json({
        success: true,
        message: 'Modem registrado en empaque exitosamente',
        data: {
          modem: modemActualizado,
          loteSalida
        }
      });
    } catch (validationError) {
      // Captura errores específicos de la validación de transición
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }
  } catch (error) {
    console.error('Error al registrar modem en empaque:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};

/**
 * Cerrar lote de empaque (normal)
 */
exports.cerrarLoteSalida = async (req, res) => {
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
    
    if (lote.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Este lote ha sido eliminado'
      });
    }
    
    // Verificar que sea un lote de salida
    if (lote.tipoLote !== 'SALIDA') {
      return res.status(400).json({
        success: false,
        message: 'Solo se pueden cerrar lotes de salida'
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
      accion: 'CERRAR_LOTE_SALIDA',
      entidad: 'Lote',
      detalle: `Lote: ${lote.numero}, SKU: ${lote.sku.nombre}, Total modems: ${totalModems}`,
      userId
    });
    
    return res.status(200).json({
      success: true,
      message: `Lote de salida ${lote.numero} cerrado con ${totalModems} modems`,
      data: {
        lote: loteCerrado,
        totalModems
      }
    });
  } catch (error) {
    console.error('Error al cerrar lote de salida:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
};