// services/modemService.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Valida si la transición de fase es válida según el flujo definido.
 * @param {String} faseActual - Fase actual del módem.
 * @param {String} faseNueva - Fase a la que se quiere mover el módem.
 * @param {String} estadoNuevo - Estado nuevo (opcional, para lógica extendida de reparaciones).
 * @throws Error si la transición es inválida.
 */
exports.validarTransicionFase = async function(faseActual, faseNueva, estadoNuevo = null) {
  const ordenes = {
    ALMACEN: 1,
    TEST_INICIAL: 2,
    COSMETICA: 3,
    LIBERACION_LIMPIEZA: 4,
    RETEST: 5,
    EMPAQUE: 6
  };

  const ordenActual = ordenes[faseActual];
  const ordenNueva = ordenes[faseNueva];

  if (!ordenActual || !ordenNueva) {
    throw new Error(`Fase inválida. Actual: ${faseActual}, Nueva: ${faseNueva}`);
  }

  // No permitir retroceso salvo si es reparación
  if (ordenNueva < ordenActual) {
    if (estadoNuevo !== 'REPARACION') {
      throw new Error(`No puedes retroceder de ${faseActual} a ${faseNueva} salvo para reparación.`);
    }
  }

  // No permitir saltos de más de una fase adelante
  if (ordenNueva > ordenActual + 1) {
    throw new Error(`No puedes saltar fases intermedias de ${faseActual} a ${faseNueva}.`);
  }

  return true;
}

/**
 * Crear un nuevo modem
 * @param {Object} modemData - Datos del nuevo modem
 * @returns {Promise<Object>} Modem creado
 */
exports.crearModem = async function(modemData) {
  try {
    const nuevoModem = await prisma.modem.create({
      data: modemData
    });
    return nuevoModem;
  } catch (error) {
    console.error('Error al crear modem:', error);
    throw error;
  }
}

/**
 * Actualizar un modem existente
 * @param {Number} modemId - ID del modem a actualizar
 * @param {Object} datosActualizacion - Datos a actualizar
 * @returns {Promise<Object>} Modem actualizado
 */
exports.actualizarModem = async function(modemId, datosActualizacion) {
  try {
    const modemActualizado = await prisma.modem.update({
      where: { id: modemId },
      data: {
        ...datosActualizacion,
        updatedAt: new Date()
      }
    });
    return modemActualizado;
  } catch (error) {
    console.error('Error al actualizar modem:', error);
    throw error;
  }
}

/**
 * Buscar modem por número de serie
 * @param {String} sn - Número de serie a buscar
 * @returns {Promise<Object|null>} Modem encontrado o null
 */
exports.buscarPorSN = async function(sn) {
  try {
    const modem = await prisma.modem.findUnique({
      where: { sn },
      include: {
        sku: true,
        lote: true,
        loteSalida: true,
        estadoActual: true,
        responsable: {
          select: { userName: true, rol: true }
        }
      }
    });
    return modem;
  } catch (error) {
    console.error('Error al buscar modem por SN:', error);
    throw error;
  }
}

/**
 * Buscar modems por lote
 * @param {Number} loteId - ID del lote
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Array>} Lista de modems
 */
exports.buscarPorLote = async function(loteId, options = {}) {
  try {
    const { tipoLote = 'entrada' } = options;
    
    const where = {
      deletedAt: null
    };
    
    // Determinar si buscamos por lote de entrada o salida
    if (tipoLote.toLowerCase() === 'salida') {
      where.loteSalidaId = parseInt(loteId);
    } else {
      where.loteId = parseInt(loteId);
    }
    
    const modems = await prisma.modem.findMany({
      where,
      include: {
        sku: true,
        estadoActual: true,
        responsable: {
          select: { userName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return modems;
  } catch (error) {
    console.error('Error al buscar modems por lote:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de modems por lote
 * @param {Number} loteId - ID del lote
 * @param {String} tipoLote - Tipo de lote ('entrada' o 'salida')
 * @returns {Promise<Object>} Estadísticas del lote
 */
exports.obtenerEstadisticasPorLote = async function(loteId, tipoLote = 'entrada') {
  try {
    // Definir campo de lote según el tipo
    const loteCampo = tipoLote.toLowerCase() === 'salida' ? 'loteSalidaId' : 'loteId';
    
    // Contar modems por fase
    const estadisticasFase = await prisma.$queryRaw`
      SELECT "faseActual", COUNT(*) as total
      FROM "Modem"
      WHERE ${loteCampo} = ${parseInt(loteId)} AND "deletedAt" IS NULL
      GROUP BY "faseActual"
    `;
    
    // Contar modems por estado
    const estadisticasEstado = await prisma.$queryRaw`
      SELECT e."nombre" as estado, COUNT(*) as total
      FROM "Modem" m
      JOIN "Estado" e ON m."estadoActualId" = e.id
      WHERE m.${loteCampo} = ${parseInt(loteId)} AND m."deletedAt" IS NULL
      GROUP BY e."nombre"
    `;
    
    // Total de modems en el lote
    const totalModems = await prisma.modem.count({
      where: {
        [loteCampo]: parseInt(loteId),
        deletedAt: null
      }
    });
    
    return {
      totalModems,
      porFase: estadisticasFase,
      porEstado: estadisticasEstado
    };
  } catch (error) {
    console.error('Error al obtener estadísticas por lote:', error);
    throw error;
  }
}

/**
 * Validar formato de número de serie según SKU
 * @param {String} sn - Número de serie a validar
 * @param {Number} skuId - ID del SKU
 * @returns {Promise<Object>} Resultado de la validación
 */
exports.validarFormatoSN = async function(sn, skuId) {
  try {
    // Obtener el SKU
    const sku = await prisma.catalogoSKU.findUnique({
      where: { id: parseInt(skuId) }
    });
    
    if (!sku) {
      throw new Error('SKU no encontrado');
    }
    
    // Aplicar reglas de validación según el SKU
    // Ejemplo: Diferentes SKUs pueden tener diferentes formatos de SN
    let esValido = true;
    let mensaje = '';
    
    // Implementar lógica específica de validación según el SKU
    switch (sku.nombre) {
      case 'V5':
        // Validar formato para V5
        if (!/^[A-Z0-9]{10,15}$/.test(sn)) {
          esValido = false;
          mensaje = 'El formato de S/N para V5 debe tener entre 10-15 caracteres alfanuméricos';
        }
        break;
        
      case 'FIBERHOME':
        // Validar formato para FIBERHOME
        if (!/^FH[A-Z0-9]{8,12}$/.test(sn)) {
          esValido = false;
          mensaje = 'El formato de S/N para FIBERHOME debe comenzar con FH seguido de 8-12 caracteres alfanuméricos';
        }
        break;
        
      // Añadir más casos según sea necesario
        
      default:
        // Validación genérica para otros SKUs
        if (!/^[A-Z0-9]{8,20}$/.test(sn)) {
          esValido = false;
          mensaje = 'El formato de S/N debe tener entre 8-20 caracteres alfanuméricos';
        }
    }
    
    return {
      esValido,
      mensaje
    };
  } catch (error) {
    console.error('Error al validar formato de S/N:', error);
    throw error;
  }
}