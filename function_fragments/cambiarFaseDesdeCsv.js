async function cambiarFaseDesdeCsv() {
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
    
    // Seleccionar usuario responsable
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
              nuevoEstadoId = estadoMap['REGISTRO'];
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
          estadoEspecificoId = estadoMap['REGISTRO'];
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
              nuevoEstadoId = estadoMap['REGISTRO'];
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
  } finally {
    await prisma.$disconnect();
  }
}