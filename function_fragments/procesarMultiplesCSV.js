async function procesarMultiplesCSV() {
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
    
    // Seleccionar usuario
    const usuariosUA = usuarios.filter(u => u.rol === 'UA');
    let userId;
    
    if (usuariosUA.length === 1) {
      userId = usuariosUA[0].id;
      console.log(`👤 Usuario seleccionado: ${usuariosUA[0].nombre}`);
    } else {
      const { selectedUserId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedUserId',
          message: 'Selecciona el usuario responsable:',
          choices: usuarios.map(u => ({ 
            name: `${u.nombre} (${u.userName}) - ${u.rol}`, 
            value: u.id 
          }))
        }
      ]);
      userId = selectedUserId;
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
          
          const estadoRegistroId = estadoMap['REGISTRO'];
          
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
  } finally {
    await prisma.$disconnect();
  }
}