const {
  PrismaClient,
  FaseProceso,
  EstadoLote,
  TipoLote,
  EstadoRegistro,
  MotivoScrap,
  DetalleScrap
} = require('@prisma/client');
const prisma = new PrismaClient();
const modemService = require('../services/modemService');
const { v4: uuidv4 } = require('uuid');



async function resolveSkuId(tx, skuCodeRaw) {
  if (!skuCodeRaw) throw new Error('SKU requerido');
  const plain = String(skuCodeRaw).trim();
  const numeric = plain.includes('-') ? plain.split('-')[1].trim() : plain;

  const row = await tx.catalogoSKU.findFirst({
    where: {
      OR: [
        { nombre: plain },     // ej. "FIBERHOME"
        { skuItem: numeric }   // ej. "69643"
      ]
    },
    select: { id: true }
  });
  if (!row) throw new Error(`El SKU "${skuCodeRaw}" no existe en CatalogoSKU`);
  return row.id; // este es el que va en skuId (FK)
}
/**
 * Mapea un rol de usuario a una fase del proceso y carpeta de formato.
 */
const getRolConfig = (rol) => {
  const configs = {
    UReg: { fase: FaseProceso.REGISTRO, carpeta: 'formato_registro' },
    UE: { fase: FaseProceso.EMPAQUE, carpeta: 'formato_empaque' },
    UEN: { fase: FaseProceso.ENSAMBLE, carpeta: 'formato_general' },
    UTI: { fase: FaseProceso.TEST_INICIAL, carpeta: 'formato_general' },
    UR: { fase: FaseProceso.RETEST, carpeta: 'formato_general' },
    URep: { fase: FaseProceso.REPARACION, carpeta: 'formato_reparacion' },
    UA: { fase: FaseProceso.REGISTRO, carpeta: 'formato_registro' }
  };
  
  return configs[rol] || { fase: null, carpeta: null };
};

/**
 * Guarda un nuevo registro de escaneo desde cualquier formato.
 * Asocia el registro con el usuario logueado y el módem correspondiente.
 */
exports.guardarRegistro = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Sesión caducada. Por favor, inicie sesión nuevamente.' });
  }

  const userId = req.user.id;
  const userRol = req.user.rol;
  let { sn, scrap, motivoScrap, detalleScrap, sku, finalizarLote, loteId, codigoDanoId } = req.body;

  if (finalizarLote && loteId) return this.finalizarLote(req, res);

  if (!sn) return res.status(400).json({ error: 'El número de serie (S/N) es obligatorio.' });
  sn = sn.toUpperCase().trim();

  if (userRol === 'UReg' && !sku) {
    return res.status(400).json({ error: 'El SKU es obligatorio para registrar un nuevo lote.' });
  }

  // 🚨 VALIDACIÓN: UReg no puede marcar SCRAP FUERA_DE_RANGO (electrónico)
  if ((userRol === 'UReg' || userRol === 'UA') && scrap && motivoScrap) {
    const m = motivoScrap.toString().toLowerCase();
    if (m.includes('electro') || m.includes('fuera') || m.includes('rango')) {
      return res.status(403).json({ 
        error: 'El rol de Registro no puede marcar modems como SCRAP Electrónico. Solo puede marcar Cosmética e Infestado.' 
      });
    }
  }

  // Validar código de diagnóstico para SCRAP electrónico
  if (scrap && motivoScrap && motivoScrap.toLowerCase().includes('electro') && codigoDanoId) {
    const codigoDanoIdNum = parseInt(codigoDanoId);
    if (!codigoDanoIdNum || codigoDanoIdNum <= 0) {
      return res.status(400).json({ error: 'Código de diagnóstico no válido.' });
    }
  }

  const rolConfig = getRolConfig(userRol);
  if (!rolConfig.fase) return res.status(403).json({ error: 'Tu rol no tiene una fase de proceso asignada.' });
  // Comentamos esta restricción para permitir que el rol UE use este endpoint también
  // if (userRol === 'UE') return res.status(403).json({ error: 'Usa el endpoint de empaque para registrar en la fase de Empaque.' });
  
  // Validacion de largo por sku
  async function getExpectedSnLengthBySkuId(txOrClient, skuId) {
    const sku = await txOrClient.catalogoSKU.findUnique({
      where: { id: skuId },
      select: { nombre: true }
    });
    const nombre = (sku?.nombre || '').toUpperCase();

    if (nombre.includes('4KM37')) return 18;   // SKU tipo “4K”
    if (nombre.includes('4KM36B')) return 18;   // SKU tipo “4K”
    if (nombre.includes('4KM36A')) return 18;   // SKU tipo “4K”
    if (nombre.includes('4KALEXA')) return 18;   // SKU tipo “4K”
    if (nombre.includes('ZTE')) return 14;  // SKU tipo “ZTE”
    return 16;                               // demás SKU
  }

  try {
    // anti‑spam 6s
    const existeRegistro = await prisma.registro.findFirst({
      where: { sn, fase: rolConfig.fase, userId },
      orderBy: { createdAt: 'desc' },
      take: 1
    });
    
    if (existeRegistro && Date.now() - new Date(existeRegistro.createdAt).getTime() < 6000) {
      return res.status(400).json({ error: 'Este número de serie ya fue escaneado en los últimos 6 segundos.' });
    }

    // Mapear SCRAP (igual que tenías)
    let estadoRegistro = EstadoRegistro.SN_OK;
    let motivoScrapEnum = null;
    let detalleScrapEnum = null;
    if (scrap) {
      if (motivoScrap) {
        const m = motivoScrap.toString().toLowerCase();
        if (m.includes('cosmetica')) { motivoScrapEnum = MotivoScrap.COSMETICA; estadoRegistro = EstadoRegistro.SCRAP_COSMETICO; }
        else if (m.includes('fuera') || m.includes('rango') || m.includes('electro')) { motivoScrapEnum = MotivoScrap.FUERA_DE_RANGO; estadoRegistro = EstadoRegistro.SCRAP_ELECTRONICO; }
        else if (m.includes('infestado') || m.includes('infestacion')) { motivoScrapEnum = MotivoScrap.INFESTADO; estadoRegistro = EstadoRegistro.SCRAP_INFESTACION; }
        else { motivoScrapEnum = MotivoScrap.OTRO; estadoRegistro = EstadoRegistro.SCRAP_ELECTRONICO; }
      }
      if (detalleScrap) {
        const d = detalleScrap.toString().toLowerCase();
        if (d.includes('circuito ok') || d.includes('sirve circuito') || (d.includes('circuito') && d.includes('no base'))) detalleScrapEnum = DetalleScrap.CIRCUITO_OK_BASE_NOK;
        else if (d.includes('base ok') || d.includes('sirve base')) detalleScrapEnum = DetalleScrap.BASE_OK_CIRCUITO_NOK;
        else if (d.includes('infestacion')) detalleScrapEnum = DetalleScrap.INFESTACION;
        else detalleScrapEnum = DetalleScrap.OTRO;
      }
    }

    const resultado = await prisma.$transaction(async (tx) => {
      let loteActivo;
      let modem;

      if (userRol === 'UReg' || userRol === 'UA') {
        // RESOLVER id real del catálogo (NO usar el código 69643)
        const skuId = await resolveSkuId(tx, sku);

        // validar largo SN por SKU
        const expectedLen = await getExpectedSnLengthBySkuId(tx, skuId);
        if (sn.length !== expectedLen) {
          throw new Error(`El S/N para este SKU debe tener ${expectedLen} caracteres (recibido ${sn.length}).`);
        }
        // evitar SN duplicado
        const ya = await tx.modem.findUnique({ where: { sn } });
        if (ya) throw new Error(`El módem ${sn} ya existe.`);

        // buscar o crear lote
        loteActivo = await tx.lote.findFirst({
          where: { skuId, tipoLote: TipoLote.ENTRADA, estado: EstadoLote.EN_PROCESO, esScrap: false },
          orderBy: { createdAt: 'desc' }
        });
        if (!loteActivo) {
          const fecha = new Date();
          const skuNumber = String(sku).includes('-') ? String(sku).split('-')[1].trim() : String(sku).trim();
          const numero = `${skuNumber}-${fecha.getFullYear()}${String(fecha.getMonth()+1).padStart(2,'0')}${String(fecha.getDate()).padStart(2,'0')}-${uuidv4().slice(0,6)}`;
          loteActivo = await tx.lote.create({
            data: { numero, skuId, tipoLote: TipoLote.ENTRADA, estado: EstadoLote.EN_PROCESO, prioridad: 5, responsableId: userId }
          });
        }

        const estadoInit = await tx.estado.findFirst({ where: { nombre: 'REGISTRO' } });
        if (!estadoInit) throw new Error('No existe el estado "REGISTRO" en la tabla Estado.');

        modem = await tx.modem.create({
          data: {
            sn,
            skuId: loteActivo.skuId, // FK correcta
            estadoActualId: estadoInit.id,
            faseActual: rolConfig.fase,
            loteId: loteActivo.id,
            responsableId: userId
          }
        });
      } else {
        // Avance de fase (UTI / UEN / UR / UE)
        modem = await tx.modem.findUnique({ where: { sn } });
        if (!modem) throw new Error(`Módem ${sn} no encontrado.`);

        // 🚨 VALIDACIÓN CRÍTICA: Verificar si el modem está en SCRAP
        if (modem.faseActual === 'SCRAP') {
          // Solo URep puede procesar modems en SCRAP para reparación
          if (userRol !== 'URep') {
            throw new Error(`El módem ${sn} está en SCRAP y solo puede ser procesado por usuarios URep para reparación.`);
          }
          
          // Para URep, validar que sea SCRAP ELECTRONICO/FUERA_DE_RANGO con diagnóstico
          if (modem.motivoScrap !== 'FUERA_DE_RANGO') {
            throw new Error(`El módem ${sn} en SCRAP motivo "${modem.motivoScrap}" no puede ser reparado. Solo se permite FUERA_DE_RANGO.`);
          }
          
          // Verificar que tenga código de diagnóstico
          const tieneDiagnostico = await tx.registro.findFirst({
            where: {
              modemId: modem.id,
              fase: 'SCRAP',
              codigoDanoId: { not: null }
            }
          });
          
          if (!tieneDiagnostico) {
            throw new Error(`El módem ${sn} en SCRAP no tiene código de diagnóstico. No se puede procesar para reparación.`);
          }
          
          // 🔧 LIBERACIÓN AUTOMÁTICA: URep puede liberar modems SCRAP para continuar proceso
          // Actualizar modem de SCRAP a REPARACION y limpiar motivoScrap
          await tx.modem.update({
            where: { id: modem.id },
            data: {
              faseActual: 'REPARACION',
              motivoScrap: null, // Limpiar motivo SCRAP
              responsableId: userId,
              updatedAt: new Date()
            }
          });
          
          // Actualizar variable local para el resto del procesamiento
          modem.faseActual = 'REPARACION';
          modem.motivoScrap = null;
        }

        // Lógica especial para empaque (UE)
        if (userRol === 'UE') {
          // Para UE, el modem ya debe estar en fase RETEST para pasar a EMPAQUE
          if (modem.faseActual !== 'RETEST') {
            throw new Error(`Para empaque, el módem debe estar en fase RETEST, no en ${modem.faseActual}.`);
          }
          
          // Verificar si ya existe un registro de EMPAQUE para este modem
          const registroExistente = await tx.registro.findFirst({
            where: {
              modemId: modem.id,
              fase: 'EMPAQUE'
            }
          });
          
          if (registroExistente) {
            console.log(`Registro de EMPAQUE ya existe para modem ${modem.id}, no creando duplicado`);
            
            // Actualizar el modem a EMPAQUE (por si acaso)
            await tx.$executeRaw`
              UPDATE "Modem" 
              SET "faseActual" = 'EMPAQUE', 
                  "responsableId" = ${userId}, 
                  "updatedAt" = ${new Date()} 
              WHERE id = ${modem.id}
            `;
            
            // Devolver el registro existente
            return { 
              registro: {
                id: registroExistente.id,
                sn: sn,
                fase: 'EMPAQUE', 
                estado: 'SN_OK',
                userId: userId,
                loteId: modem.loteId,
                modemId: modem.id,
                user: { id: userId, nombre: req.user.nombre } // Añadir objeto user manual
              }, 
              loteId: modem.loteId 
            };
          }
          
          // Si no hay registro existente, actualizar el modem y crear registro
          await tx.$executeRaw`
            UPDATE "Modem" 
            SET "faseActual" = 'EMPAQUE', 
                "responsableId" = ${userId}, 
                "updatedAt" = ${new Date()} 
            WHERE id = ${modem.id}
          `;
          
          // Crear nuevo registro
          const nuevoRegistro = await tx.registro.create({
            data: {
              sn,
              fase: 'EMPAQUE',
              estado: 'SN_OK',
              userId,
              loteId: modem.loteId,
              modemId: modem.id
            },
            include: { user: { select: { id: true, nombre: true } } } // Incluir relación de usuario
          });
          
          return { registro: nuevoRegistro, loteId: modem.loteId };
        }
        // 🚨 VALIDACIÓN PARA SCRAP: Si se está marcando como SCRAP, manejar correctamente
        else if (scrap && motivoScrapEnum) {
          // Verificar que no esté ya en SCRAP para evitar sobrescribir
          if (modem.faseActual === 'SCRAP') {
            throw new Error(`El módem ${sn} ya está en SCRAP. No se puede volver a marcar.`);
          }
          
          // Actualizar modem a SCRAP con el motivo
          modem = await tx.modem.update({
            where: { id: modem.id },
            data: {
              faseActual: 'SCRAP',
              motivoScrap: motivoScrapEnum,
              responsableId: userId,
              updatedAt: new Date()
            }
          });
          
          loteActivo = await tx.lote.findUnique({ where: { id: modem.loteId } });
        } 
        else {
          // Lógica normal para otros roles (UTI / UEN / UR)
          const flujo = [FaseProceso.REGISTRO, FaseProceso.TEST_INICIAL, FaseProceso.ENSAMBLE, FaseProceso.RETEST, FaseProceso.EMPAQUE];
          const iA = flujo.indexOf(modem.faseActual);
          const iN = flujo.indexOf(rolConfig.fase);
          
          // Caso especial: RETEST → ENSAMBLE está permitido
          if (modem.faseActual === FaseProceso.RETEST && rolConfig.fase === FaseProceso.ENSAMBLE) {
            // Permitir esta transición
          } 
          // Validación estándar para otros casos
          else if (iA < 0 || iN < 0 || iN !== iA + 1) {
            throw new Error(`No se puede avanzar de ${modem.faseActual} a ${rolConfig.fase}.`);
          }

          modem = await tx.modem.update({
            where: { id: modem.id },
            data: {
              faseActual: rolConfig.fase,
              responsableId: userId,
              updatedAt: new Date()
            }
          });
        }

        loteActivo = await tx.lote.findUnique({ where: { id: modem.loteId } });
      }

      // Crear registro (para todos los casos excepto UE que ya lo maneja arriba)
      if (userRol !== 'UE') {
        // Primero verificar si ya existe un registro reciente
        const existeRegistro = await tx.registro.findFirst({
          where: { 
            sn, 
            fase: rolConfig.fase,
            createdAt: { gte: new Date(Date.now() - 5000) } // últimos 5 segundos
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        });
        
        if (existeRegistro) {
          console.log(`Registro reciente encontrado para SN:${sn}, fase:${rolConfig.fase}`);
          return { 
            registro: {
              ...existeRegistro,
              user: { id: userId, nombre: req.user.nombre } // Añadir objeto user manual
            },
            loteId: modem.loteId 
          };
        }
        
        // Si no existe, crear el registro
        const registroData = {
          sn,
          fase: rolConfig.fase,
          estado: estadoRegistro,
          motivoScrap: motivoScrapEnum,
          detalleScrap: detalleScrapEnum,
          userId,
          loteId: modem.loteId,
          modemId: modem.id
        };

        // Agregar código de diagnóstico si es SCRAP electrónico
        if (motivoScrapEnum === MotivoScrap.FUERA_DE_RANGO && codigoDanoId) {
          registroData.codigoDanoId = parseInt(codigoDanoId);
        }

        const registro = await tx.registro.create({
          data: registroData,
          include: { user: { select: { id: true, nombre: true } } } // Incluir la relación de usuario
        });

        return { registro, loteId: loteActivo ? loteActivo.id : null };
      }
    });

    if (req.session) req.session.touch();

    // Asegurarnos de que todos los datos necesarios están presentes
    return res.status(201).json({
      ...resultado.registro,
      loteId: resultado.loteId,
      success: true,
      userName: resultado.registro.user ? resultado.registro.user.nombre : req.user.nombre // Fallback a user actual
    });
  } catch (error) {
    console.error('Error al guardar el registro:', error);
    return res.status(500).json({ error: error.message || 'Error interno al guardar el registro.' });
  }
};

/**
 * Finaliza un lote cuando se completa el registro
 */
exports.finalizarLote = async (req, res) => {
  // Verificar sesión
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Sesión caducada. Por favor, inicie sesión nuevamente.' });
  }

  const userId = req.user.id;
  const { loteId } = req.body;
  
  if (!loteId) {
    return res.status(400).json({ error: 'El ID del lote es obligatorio.' });
  }
  
  try {
    const lote = await prisma.lote.findUnique({
      where: { id: parseInt(loteId) }
    });
    
    if (!lote) {
      return res.status(404).json({ error: 'Lote no encontrado.' });
    }
    
    // Verificar que el lote no esté ya completado
    if (lote.estado === 'COMPLETADO') {
      return res.status(400).json({ error: 'Este lote ya ha sido finalizado.' });
    }
    
    // Actualizar el estado del lote a completado
    const loteActualizado = await prisma.lote.update({
      where: { id: parseInt(loteId) },
      data: {
        estado: 'COMPLETADO'
      }
    });
    
    // Registrar en el log
    await prisma.log.create({
      data: {
        accion: 'FINALIZAR_LOTE',
        entidad: 'Lote',
        detalle: `Lote ${lote.numero} finalizado durante registro`,
        userId: userId
      }
    });
    
    // Renovar sesión
    if (req.session) {
      req.session.touch();
    }
    
    res.status(200).json({
      message: 'Lote finalizado correctamente',
      lote: loteActualizado,
      success: true
    });
    
  } catch (error) {
    console.error('Error al finalizar el lote:', error);
    res.status(500).json({ error: 'Error interno al finalizar el lote.' });
  }
};

/**
 * Verifica si un rol tiene acceso a una carpeta específica
 */
exports.verificarAccesoCarpeta = (rol, carpeta) => {
  const carpetasPermitidas = {
    UReg: ['formato_registro'],
    UE: ['formato_empaque'],
    UEN: ['formato_general'],
    UTI: ['formato_general'],
    UR: ['formato_general'],
    URep: ['formato_reparacion'],
    UA: ['formato_registro', 'formato_empaque', 'formato_general', 'formato_reparacion']
  };
  
  return carpetasPermitidas[rol]?.includes(carpeta) || false;
};

/**
 * Obtiene la carpeta correspondiente a un rol
 */
exports.obtenerCarpetaPorRol = (rol) => {
  const rolConfig = getRolConfig(rol);
  return rolConfig.carpeta;
};