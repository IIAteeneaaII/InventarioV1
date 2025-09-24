// Caché para evitar consultas repetidas
const cacheEstados = new Map();
const cacheLotes = new Map();

// Función para procesar SNs en lotes grandes con transacciones optimizadas
async function procesarSNsEnLotes(seriales, procesadorFn, batchSize = 200) {
  const total = seriales.length;
  let procesados = 0;
  let fallidos = 0;
  
  // Dividir en lotes para mejorar rendimiento
  for (let i = 0; i < total; i += batchSize) {
    const batch = seriales.slice(i, i + batchSize);
    console.log(`   Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(total/batchSize)}...`);
    
    // Usar una sola transacción para todo el lote
    try {
      await prisma.$transaction(async (tx) => {
        for (const sn of batch) {
          try {
            await procesadorFn(sn, tx);
            procesados++;
          } catch (error) {
            fallidos++;
            console.error(`   ❌ Error procesando ${sn}: ${error.message}`);
            // No propagamos el error para que la transacción continúe con el resto del lote
          }
        }
      }, {
        timeout: 120000, // 2 minutos por lote
        maxWait: 60000   // 1 minuto de espera máxima
      });
    } catch (error) {
      console.error(`   ❌ Error en transacción de lote: ${error.message}`);
      fallidos += batch.length;
    }
    
    const progreso = Math.min(i + batchSize, total);
    console.log(`   ✅ Progreso: ${progreso}/${total} (${Math.round(progreso/total*100)}%)`);
  }
  
  return { procesados, fallidos };
}

// Función para obtener estado con caché
async function getEstadoWithCache(tx, nombreEstado, fallbackNombre = null) {
  const key = nombreEstado + (fallbackNombre ? `-${fallbackNombre}` : '');
  
  if (cacheEstados.has(key)) {
    return cacheEstados.get(key);
  }
  
  let estado = await tx.estado.findFirst({
    where: { nombre: nombreEstado }
  });
  
  if (!estado && fallbackNombre) {
    estado = await tx.estado.findFirst({
      where: { nombre: fallbackNombre }
    });
  }
  
  if (estado) {
    cacheEstados.set(key, estado.id);
    return estado.id;
  }
  
  return null;
}

// Función para crear múltiples registros en batch
async function createBatchRegistros(tx, registros) {
  if (registros.length === 0) return;
  
  await tx.registro.createMany({
    data: registros,
    skipDuplicates: true
  });
}

// Cambio de fase desde CSV
async function cambiarFaseDesdeCsv(loadInquirer, prisma) {
  try {
    console.log('\n🔄 CAMBIO DE FASE MASIVO DESDE CSV 🔄\n');
    
    await loadInquirer();
    
    console.log('🔌 Conectando a la base de datos...');
    await prisma.$connect();
    console.log('✅ Conexión establecida\n');

    // Cargar datos necesarios
    console.log('📚 Cargando datos...');
    const usuarios = await prisma.user.findMany({ 
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    const estados = await prisma.estado.findMany();
    const estadoMap = {};
    estados.forEach(e => { estadoMap[e.nombre] = e.id; });
    
    // Seleccionar archivo CSV
    console.log('📂 Buscando archivos...');
    const files = await findCSVFiles();
    
    if (files.length === 0) {
      console.log('❌ No se encontraron archivos CSV/TXT/PRN en el directorio');
      return;
    }

    const { filePath } = await inquirer.prompt([
      {
        type: 'list',
        name: 'filePath',
        message: 'Selecciona el archivo con los números de serie:',
        choices: [
          ...files.map(f => ({ name: `📄 ${path.basename(f)} (${f})`, value: f })),
          { name: '📂 Especificar ruta manualmente...', value: 'manual' }
        ]
      }
    ]);

    let selectedFile = filePath;
    if (filePath === 'manual') {
      const { manualPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'manualPath',
          message: 'Ingresa la ruta completa del archivo:',
          validate: (input) => fs.existsSync(input) ? true : 'El archivo no existe'
        }
      ]);
      selectedFile = manualPath;
    }

    console.log(`\n📂 Analizando archivo: ${selectedFile}`);
    const content = readTextSmart(selectedFile);
    
    // Extraer seriales del archivo - soporta diferentes formatos
    let seriales = [];
    try {
      // Intentar parsear con la función existente
      const rows = parseRowsFromContent(content);
      if (rows.length > 0) {
        seriales = [...new Set(rows.map(r => r.serialNumber.toUpperCase()))];
      } else {
        // Si falla, tratar como lista simple
        seriales = content.split(/[\r\n,;\t]+/)
          .map(s => s.trim().toUpperCase())
          .filter(s => s && s.length >= 6);
      }
    } catch (error) {
      // En caso de error, tratar como lista simple
      seriales = content.split(/[\r\n,;\t]+/)
        .map(s => s.trim().toUpperCase())
        .filter(s => s && s.length >= 6);
    }
    
    if (seriales.length === 0) {
      console.log('❌ No se encontraron números de serie válidos en el archivo');
      return;
    }
    
    console.log(`✅ Se encontraron ${seriales.length} números de serie en el archivo`);
    
    // Verificar existencia y fase actual de los módems
    console.log('\n🔍 Verificando existencia de módems en la base de datos...');
    const modemsExistentes = await prisma.modem.findMany({
      where: {
        sn: { in: seriales }
      },
      select: {
        id: true,
        sn: true,
        faseActual: true,
        skuId: true,
        loteId: true
      }
    });
    
    const snExistentes = new Set(modemsExistentes.map(m => m.sn));
    const snNoExistentes = seriales.filter(sn => !snExistentes.has(sn));
    
    // Agrupar por fase actual
    const faseStats = {};
    modemsExistentes.forEach(m => {
      faseStats[m.faseActual] = (faseStats[m.faseActual] || 0) + 1;
    });
    
    console.log(`\n📊 Resumen de módems encontrados:`);
    console.log(`   - Total encontrados: ${modemsExistentes.length}`);
    console.log(`   - No encontrados: ${snNoExistentes.length}`);
    console.log('\n📊 Distribución por fase actual:');
    Object.entries(faseStats).forEach(([fase, count]) => {
      console.log(`   - ${fase}: ${count} módems`);
    });
    
    if (modemsExistentes.length === 0) {
      console.log('❌ No se encontraron módems en la base de datos. Operación cancelada.');
      return;
    }
    
    // Seleccionar tipo de cambio de fase
    const { tipoOperacion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'tipoOperacion',
        message: '¿Qué tipo de cambio de fase deseas realizar?',
        choices: [
          { name: '🔼 Avanzar todos los módems a la siguiente fase', value: 'avanzar' },
          { name: '🎯 Establecer una fase específica para todos', value: 'establecer' },
          { name: '🔄 Mover automáticamente según reglas de negocio', value: 'reglas' },
          { name: '↩️ Volver al menú principal', value: 'volver' }
        ]
      }
    ]);
    
    if (tipoOperacion === 'volver') {
      return;
    }
    
    // Seleccionar usuario responsable (automáticamente selecciona usuario UA)
    const usuariosUA = usuarios.filter(u => u.rol === 'UA');
    let userId;
    
    if (usuariosUA.length > 0) {
      userId = usuariosUA[0].id;
      console.log(`👤 Usuario seleccionado automáticamente: ${usuariosUA[0].nombre} (UA)`);
    } else {
      console.log('⚠️ No se encontraron usuarios con rol UA, seleccionando el primero disponible...');
      userId = usuarios[0]?.id;
      if (userId) {
        console.log(`👤 Usuario seleccionado: ${usuarios[0].nombre} (${usuarios[0].rol})`);
      } else {
        console.error('❌ No se encontraron usuarios disponibles');
        return;
      }
    }
    
    // Permitir especificar fecha personalizada
    const { usarFechaPersonalizada } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'usarFechaPersonalizada',
        message: '¿Deseas especificar una fecha personalizada para los registros?',
        default: false
      }
    ]);
    
    let fechaOperacion = new Date();
    
    if (usarFechaPersonalizada) {
      const fechaActual = new Date();
      const fechaFormateada = `${fechaActual.getFullYear()}-${String(fechaActual.getMonth() + 1).padStart(2, '0')}-${String(fechaActual.getDate()).padStart(2, '0')}`;
      
      const { fechaSeleccionada } = await inquirer.prompt([
        {
          type: 'input',
          name: 'fechaSeleccionada',
          message: 'Ingresa la fecha (YYYY-MM-DD):',
          default: fechaFormateada,
          validate: (input) => {
            const fecha = new Date(input);
            return !isNaN(fecha.getTime()) ? true : 'Ingresa una fecha válida en formato YYYY-MM-DD';
          }
        }
      ]);
      
      fechaOperacion = new Date(fechaSeleccionada);
      console.log(`✅ Fecha seleccionada: ${fechaOperacion.toLocaleDateString()}`);
    }
    
    let procesados = 0;
    let saltados = 0;
    let fallidos = 0;
    
    // Mapa de secuencia de fases
    const secuenciaFases = {
      'REGISTRO': 'TEST_INICIAL',
      'TEST_INICIAL': 'ENSAMBLE',
      'ENSAMBLE': 'RETEST',
      'RETEST': 'EMPAQUE',
      'EMPAQUE': 'EMPAQUE' // No avanza más
    };
    
    // Procesar según el tipo de operación
    if (tipoOperacion === 'avanzar') {
      console.log('\n🔼 Avanzando módems a la siguiente fase...');
      
      for (const modem of modemsExistentes) {
        try {
          const faseActual = modem.faseActual;
          const faseSiguiente = secuenciaFases[faseActual] || faseActual;
          
          if (faseActual === faseSiguiente) {
            console.log(`⚠️ Módem ${modem.sn} ya está en la fase final (${faseActual}). No se puede avanzar más.`);
            saltados++;
            continue;
          }
          
          // Obtener el estado correspondiente para la nueva fase
          let nuevoEstadoId;
          switch (faseSiguiente) {
            case 'REGISTRO':
              nuevoEstadoId = estadoMap['REGISTRO'] || estadoMap['RETEST'];
              break;
            case 'TEST_INICIAL':
              nuevoEstadoId = estadoMap['TEST_INICIAL'] || estadoMap['RETEST'];
              break;
            case 'ENSAMBLE':
              nuevoEstadoId = estadoMap['ENSAMBLE'] || estadoMap['RETEST'];
              break;
            case 'RETEST':
              nuevoEstadoId = estadoMap['RETEST'];
              break;
            case 'EMPAQUE':
              nuevoEstadoId = estadoMap['EMPAQUE'] || estadoMap['RETEST'];
              break;
            default:
              nuevoEstadoId = estadoMap['RETEST'];
          }
          
          await prisma.$transaction(async (tx) => {
            // Actualizar módem
            await tx.modem.update({
              where: { id: modem.id },
              data: {
                faseActual: faseSiguiente,
                estadoActualId: nuevoEstadoId,
                updatedAt: fechaOperacion
              }
            });
            
            // Crear registro para la nueva fase
            await tx.registro.create({
              data: {
                sn: modem.sn,
                fase: faseSiguiente,
                estado: 'SN_OK',
                userId: userId,
                loteId: modem.loteId,
                modemId: modem.id,
                createdAt: fechaOperacion
              }
            });
          });
          
          procesados++;
          if (procesados % 50 === 0 || procesados === modemsExistentes.length) {
            console.log(`   ✅ Progreso: ${procesados}/${modemsExistentes.length} (${Math.round(procesados/modemsExistentes.length*100)}%)`);
          }
        } catch (error) {
          fallidos++;
          console.error(`   ❌ Error al procesar ${modem.sn}: ${error.message}`);
        }
      }
    } else if (tipoOperacion === 'establecer') {
      // Seleccionar fase específica
      const { faseEspecifica } = await inquirer.prompt([
        {
          type: 'list',
          name: 'faseEspecifica',
          message: 'Selecciona la fase específica:',
          choices: ['REGISTRO', 'TEST_INICIAL', 'ENSAMBLE', 'RETEST', 'EMPAQUE']
        }
      ]);
      
      console.log(`\n🎯 Estableciendo fase ${faseEspecifica} para todos los módems...`);
      
      // Obtener el estado correspondiente para la fase específica
      let estadoEspecificoId;
      switch (faseEspecifica) {
        case 'REGISTRO':
          estadoEspecificoId = estadoMap['REGISTRO'] || estadoMap['RETEST'];
          break;
        case 'TEST_INICIAL':
          estadoEspecificoId = estadoMap['TEST_INICIAL'] || estadoMap['RETEST'];
          break;
        case 'ENSAMBLE':
          estadoEspecificoId = estadoMap['ENSAMBLE'] || estadoMap['RETEST'];
          break;
        case 'RETEST':
          estadoEspecificoId = estadoMap['RETEST'];
          break;
        case 'EMPAQUE':
          estadoEspecificoId = estadoMap['EMPAQUE'] || estadoMap['RETEST'];
          break;
        default:
          estadoEspecificoId = estadoMap['RETEST'];
      }
      
      for (const modem of modemsExistentes) {
        try {
          if (modem.faseActual === faseEspecifica) {
            console.log(`⚠️ Módem ${modem.sn} ya está en la fase ${faseEspecifica}. Saltando.`);
            saltados++;
            continue;
          }
          
          await prisma.$transaction(async (tx) => {
            // Actualizar módem
            await tx.modem.update({
              where: { id: modem.id },
              data: {
                faseActual: faseEspecifica,
                estadoActualId: estadoEspecificoId,
                updatedAt: fechaOperacion
              }
            });
            
            // Crear registro para la nueva fase
            await tx.registro.create({
              data: {
                sn: modem.sn,
                fase: faseEspecifica,
                estado: 'SN_OK',
                userId: userId,
                loteId: modem.loteId,
                modemId: modem.id,
                createdAt: fechaOperacion
              }
            });
          });
          
          procesados++;
          if (procesados % 50 === 0 || procesados === modemsExistentes.length) {
            console.log(`   ✅ Progreso: ${procesados}/${modemsExistentes.length} (${Math.round(procesados/modemsExistentes.length*100)}%)`);
          }
        } catch (error) {
          fallidos++;
          console.error(`   ❌ Error al procesar ${modem.sn}: ${error.message}`);
        }
      }
    } else if (tipoOperacion === 'reglas') {
      console.log('\n🔄 Aplicando reglas de negocio para mover módems...');
      
      // Definir reglas de negocio específicas
      // Por ejemplo: módems en cierto lote o con cierto SKU se mueven de cierta manera
      
      // Aquí implementarías la lógica específica según tus reglas de negocio
      
      // Ejemplo simplificado:
      for (const modem of modemsExistentes) {
        try {
          let nuevaFase = modem.faseActual;
          
          // Aplicar reglas según fase actual
          if (modem.faseActual === 'REGISTRO') {
            nuevaFase = 'TEST_INICIAL';
          } else if (modem.faseActual === 'TEST_INICIAL') {
            nuevaFase = 'ENSAMBLE';
          } else if (modem.faseActual === 'ENSAMBLE') {
            nuevaFase = 'RETEST';
          } else if (modem.faseActual === 'RETEST') {
            nuevaFase = 'EMPAQUE';
          } else {
            console.log(`⚠️ Módem ${modem.sn} en fase ${modem.faseActual}. No se aplica regla. Saltando.`);
            saltados++;
            continue;
          }
          
          if (modem.faseActual === nuevaFase) {
            saltados++;
            continue;
          }
          
          // Obtener el estado correspondiente
          let nuevoEstadoId;
          switch (nuevaFase) {
            case 'REGISTRO':
              nuevoEstadoId = estadoMap['REGISTRO'] || estadoMap['RETEST'];
              break;
            case 'TEST_INICIAL':
              nuevoEstadoId = estadoMap['TEST_INICIAL'] || estadoMap['RETEST'];
              break;
            case 'ENSAMBLE':
              nuevoEstadoId = estadoMap['ENSAMBLE'] || estadoMap['RETEST'];
              break;
            case 'RETEST':
              nuevoEstadoId = estadoMap['RETEST'];
              break;
            case 'EMPAQUE':
              nuevoEstadoId = estadoMap['EMPAQUE'] || estadoMap['RETEST'];
              break;
            default:
              nuevoEstadoId = estadoMap['RETEST'];
          }
          
          await prisma.$transaction(async (tx) => {
            // Actualizar módem
            await tx.modem.update({
              where: { id: modem.id },
              data: {
                faseActual: nuevaFase,
                estadoActualId: nuevoEstadoId,
                updatedAt: fechaOperacion
              }
            });
            
            // Crear registro para la nueva fase
            await tx.registro.create({
              data: {
                sn: modem.sn,
                fase: nuevaFase,
                estado: 'SN_OK',
                userId: userId,
                loteId: modem.loteId,
                modemId: modem.id,
                createdAt: fechaOperacion
              }
            });
          });
          
          procesados++;
          if (procesados % 50 === 0 || procesados === modemsExistentes.length) {
            console.log(`   ✅ Progreso: ${procesados}/${modemsExistentes.length} (${Math.round(procesados/modemsExistentes.length*100)}%)`);
          }
        } catch (error) {
          fallidos++;
          console.error(`   ❌ Error al procesar ${modem.sn}: ${error.message}`);
        }
      }
    }
    
    console.log('\n🎉 ¡Proceso completado!');
    console.log(`✅ Módems procesados: ${procesados}`);
    console.log(`⚠️ Módems saltados: ${saltados}`);
    console.log(`❌ Errores: ${fallidos}`);
    
    // Mostrar distribución final
    console.log('\n📊 Consultando distribución final por fase...');
    const distribucionFinal = await prisma.modem.groupBy({
      by: ['faseActual'],
      where: {
        sn: { in: seriales }
      },
      _count: true
    });
    
    console.log('\n📊 Distribución final por fase:');
    distribucionFinal.forEach(item => {
      console.log(`   - ${item.faseActual}: ${item._count} módems`);
    });
    
  } catch (error) {
    console.error('❌ Error durante el cambio de fase:', error);
  }
}

// Procesamiento de múltiples archivos CSV
async function procesarMultiplesCSV(loadInquirer, prisma) {
  try {
    console.log('\n📚 PROCESAMIENTO DE MÚLTIPLES ARCHIVOS CSV 📚\n');
    
    await loadInquirer();
    
    console.log('🔌 Conectando a la base de datos...');
    await prisma.$connect();
    console.log('✅ Conexión establecida\n');
    
    console.log('📂 Buscando archivos CSV...');
    const files = await findCSVFiles();
    
    if (files.length === 0) {
      console.log('❌ No se encontraron archivos CSV/TXT/PRN en el directorio');
      return;
    }
    
    // Permitir seleccionar múltiples archivos
    const { selectedFiles } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedFiles',
        message: 'Selecciona los archivos a procesar:',
        choices: files.map(f => ({ name: `📄 ${path.basename(f)} (${f})`, value: f })),
        validate: (input) => input.length > 0 ? true : 'Selecciona al menos un archivo'
      }
    ]);
    
    if (selectedFiles.length === 0) {
      console.log('❌ No se seleccionaron archivos. Operación cancelada.');
      return;
    }
    
    console.log(`\n✅ Se seleccionaron ${selectedFiles.length} archivos para procesar.`);
    
    // Seleccionar tipo de operación
    const { tipoOperacion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'tipoOperacion',
        message: '¿Qué operación deseas realizar con estos archivos?',
        choices: [
          { name: '📥 Importar todos como ENTRADAS', value: 'entradas' },
          { name: '📦 Procesar todos como SALIDAS', value: 'salidas' },
          { name: '🔄 Procesar archivos según su nombre (auto-detectar)', value: 'auto' },
          { name: '↩️ Volver al menú principal', value: 'volver' }
        ]
      }
    ]);
    
    if (tipoOperacion === 'volver') {
      return;
    }
    
    // Cargar datos necesarios
    console.log('\n📚 Cargando datos de la base...');
    const skus = await prisma.catalogoSKU.findMany({ orderBy: { nombre: 'asc' }});
    const usuarios = await prisma.user.findMany({ 
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    const estados = await prisma.estado.findMany();
    const estadoMap = {};
    estados.forEach(e => { estadoMap[e.nombre] = e.id; });
    
    // Seleccionar SKU
    let skuId;
    const { selectedSkuId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedSkuId',
        message: 'Selecciona el SKU:',
        choices: skus.map(s => ({ 
          name: `${s.nombre} - Material: ${s.skuItem || 'N/A'}`, 
          value: s.id 
        }))
      }
    ]);
    skuId = selectedSkuId;
    
    // Seleccionar usuario (automáticamente selecciona usuario UA)
    const usuariosUA = usuarios.filter(u => u.rol === 'UA');
    let userId;
    
    if (usuariosUA.length > 0) {
      userId = usuariosUA[0].id;
      console.log(`👤 Usuario seleccionado automáticamente: ${usuariosUA[0].nombre} (UA)`);
    } else {
      console.log('⚠️ No se encontraron usuarios con rol UA, seleccionando el primero disponible...');
      userId = usuarios[0]?.id;
      if (userId) {
        console.log(`👤 Usuario seleccionado: ${usuarios[0].nombre} (${usuarios[0].rol})`);
      } else {
        console.error('❌ No se encontraron usuarios disponibles');
        return;
      }
    }
    
    // Configurar lote (usar uno existente o crear nuevo)
    const suggestedLoteNumero = `MULTI_${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
    
    const { loteNumero } = await inquirer.prompt([
      {
        type: 'input',
        name: 'loteNumero',
        message: 'Número de lote para todos los archivos:',
        default: suggestedLoteNumero,
        validate: (input) => input.trim().length > 0 ? true : 'El número de lote no puede estar vacío'
      }
    ]);
    
    // Resumen de operación
    console.log(`\n📋 Resumen de la operación:`);
    console.log(`   - Archivos a procesar: ${selectedFiles.length}`);
    console.log(`   - Tipo de operación: ${tipoOperacion}`);
    console.log(`   - SKU: ${skus.find(s => s.id === skuId)?.nombre}`);
    console.log(`   - Lote: ${loteNumero}`);
    console.log(`   - Usuario: ${usuarios.find(u => u.id === userId)?.nombre}`);
    
    const { confirmar } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmar',
        message: '¿Confirmas proceder con el procesamiento?',
        default: true
      }
    ]);
    
    if (!confirmar) {
      console.log('❌ Operación cancelada');
      return;
    }
    
    // Procesar cada archivo
    console.log('\n⏳ Iniciando procesamiento de archivos...');
    let totalProcesados = 0;
    let totalFallidos = 0;
    
    for (const [index, file] of selectedFiles.entries()) {
      console.log(`\n📄 Procesando archivo ${index + 1}/${selectedFiles.length}: ${path.basename(file)}`);
      
      // Determinar tipo de procesamiento para este archivo
      let tipoProceso = tipoOperacion;
      
      if (tipoOperacion === 'auto') {
        const nombreArchivo = path.basename(file).toLowerCase();
        if (nombreArchivo.includes('entrada') || nombreArchivo.includes('input') || nombreArchivo.includes('in')) {
          tipoProceso = 'entradas';
          console.log('   🔍 Auto-detectado como: ENTRADAS');
        } else if (nombreArchivo.includes('salida') || nombreArchivo.includes('output') || nombreArchivo.includes('out')) {
          tipoProceso = 'salidas';
          console.log('   🔍 Auto-detectado como: SALIDAS');
        } else {
          tipoProceso = 'entradas'; // Por defecto
          console.log('   🔍 No se pudo detectar tipo. Procesando como: ENTRADAS');
        }
      }
      
      try {
        // Leer archivo
        const content = readTextSmart(file);
        const rows = parseRowsFromContent(content);
        
        if (rows.length === 0) {
          console.log('   ⚠️ No se encontraron datos válidos en el archivo. Saltando.');
          continue;
        }
        
        console.log(`   📊 Encontrados ${rows.length} registros válidos`);
        
        // Preparar datos según tipo de proceso
        if (tipoProceso === 'entradas') {
          // Procesar como entradas
          console.log('   📥 Procesando como ENTRADAS...');
          
          let procesados = 0;
          let fallidos = 0;
          
          // Verificar si el lote ya existe o crearlo
          let lote = await prisma.lote.findUnique({
            where: { numero: loteNumero }
          });

          if (!lote) {
            lote = await prisma.lote.create({
              data: {
                numero: loteNumero,
                skuId: skuId,
                tipoLote: 'ENTRADA',
                esScrap: false,
                estado: 'EN_PROCESO',
                prioridad: 2,
                responsableId: userId,
              }
            });
            console.log(`   ✅ Lote creado: ${lote.numero}`);
          } else {
            console.log(`   ⚠️ Usando lote existente: ${lote.numero}`);
          }
          
          const estadoRegistroId = estadoMap['REGISTRO'] || estadoMap['RETEST'];
          
          // Procesar en lotes para mejorar rendimiento
          const batchSize = 100;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            
            for (const row of batch) {
              try {
                // Convertir SN a mayúsculas
                const sn = row.serialNumber.toUpperCase();
                
                // Verificar si ya existe
                const existingModem = await prisma.modem.findUnique({
                  where: { sn: sn }
                });
                
                if (!existingModem) {
                  // Crear el módem
                  const modem = await prisma.modem.create({
                    data: {
                      sn: sn,
                      skuId: skuId,
                      estadoActualId: estadoRegistroId,
                      faseActual: 'REGISTRO',
                      loteId: lote.id,
                      responsableId: userId,
                      createdAt: row.fechaRecibo || new Date(),
                    }
                  });
                  
                  // Crear registro para la fase REGISTRO
                  await prisma.registro.create({
                    data: {
                      sn: sn,
                      fase: 'REGISTRO',
                      estado: 'SN_OK',
                      userId: userId,
                      loteId: lote.id,
                      modemId: modem.id,
                      createdAt: row.fechaRecibo || new Date(),
                    }
                  });
                  
                  procesados++;
                } else {
                  console.log(`   ⚠️ Módem ${sn} ya existe, omitiendo...`);
                }
              } catch (error) {
                fallidos++;
                console.error(`   ❌ Error procesando entrada ${row.serialNumber}: ${error.message}`);
              }
            }
            
            const progreso = Math.min(i + batchSize, rows.length);
            console.log(`   ✅ Progreso: ${progreso}/${rows.length} (${Math.round(progreso/rows.length*100)}%)`);
          }
          
          console.log(`   ✅ Archivo procesado: ${procesados} módems creados, ${fallidos} fallidos`);
          totalProcesados += procesados;
          totalFallidos += fallidos;
          
        } else if (tipoProceso === 'salidas') {
          // Procesar como salidas (lógica similar a la implementada en procesarImportacionEntradaYSalida)
          console.log('   📦 Procesando como SALIDAS...');
          
          let procesados = 0;
          let fallidos = 0;
          
          // Verificar si el lote ya existe o crearlo
          let lote = await prisma.lote.findUnique({
            where: { numero: loteNumero }
          });

          if (!lote) {
            lote = await prisma.lote.create({
              data: {
                numero: loteNumero,
                skuId: skuId,
                tipoLote: 'SALIDA',
                esScrap: false,
                estado: 'EN_PROCESO',
                prioridad: 2,
                responsableId: userId,
              }
            });
            console.log(`   ✅ Lote creado: ${lote.numero}`);
          } else {
            console.log(`   ⚠️ Usando lote existente: ${lote.numero}`);
          }
          
          // Procesar en lotes para mejorar rendimiento
          const batchSize = 100;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            
            for (const row of batch) {
              try {
                // Convertir SN a mayúsculas
                const sn = row.serialNumber.toUpperCase();
                
                // Buscar el módem existente
                const existingModem = await prisma.modem.findUnique({
                  where: { sn: sn },
                  select: {
                    id: true,
                    faseActual: true,
                    skuId: true
                  }
                });
                
                if (!existingModem) {
                  console.log(`   ⚠️ Módem ${sn} no existe en la base de datos, omitiendo...`);
                  fallidos++;
                  continue;
                }
                
                // Solo procesar si está en fase correcta (debe estar en EMPAQUE)
                if (existingModem.faseActual !== 'EMPAQUE') {
                  console.log(`   ⚠️ Módem ${sn} no está en fase EMPAQUE (actual: ${existingModem.faseActual}), omitiendo...`);
                  fallidos++;
                  continue;
                }
                
                // Actualizar el lote del módem
                await prisma.modem.update({
                  where: { id: existingModem.id },
                  data: {
                    loteId: lote.id,
                    updatedAt: new Date()
                  }
                });
                
                procesados++;
              } catch (error) {
                fallidos++;
                console.error(`   ❌ Error procesando salida ${row.serialNumber}: ${error.message}`);
              }
            }
            
            const progreso = Math.min(i + batchSize, rows.length);
            console.log(`   ✅ Progreso: ${progreso}/${rows.length} (${Math.round(progreso/rows.length*100)}%)`);
          }
          
          console.log(`   ✅ Archivo procesado: ${procesados} módems actualizados, ${fallidos} fallidos`);
          totalProcesados += procesados;
          totalFallidos += fallidos;
        }
        
      } catch (error) {
        console.error(`   ❌ Error procesando archivo: ${error.message}`);
      }
    }
    
    console.log('\n🎉 ¡Procesamiento completado!');
    console.log(`✅ Total de módems procesados: ${totalProcesados}`);
    console.log(`❌ Total de errores: ${totalFallidos}`);
    
  } catch (error) {
    console.error('❌ Error durante el procesamiento de múltiples archivos:', error);
  }
}

module.exports = {
  procesarSNsEnLotes,
  getEstadoWithCache,
  createBatchRegistros,
  cambiarFaseDesdeCsv,
  procesarMultiplesCSV
};