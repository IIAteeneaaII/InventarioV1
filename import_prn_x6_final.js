// import_prn_x6.js — Versión con menú interactivo y función de empaque
// Ejecuta: node import_prn_x6.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

// Mapeo de materiales a SKUs basado en seed.js
const MATERIAL_TO_SKU = {
  '72676': { id: 8, nombre: 'V5SMALL' },
  '66262': { id: 9, nombre: 'V5' },
  '69643': { id: 10, nombre: 'FIBERHOME' },
  '76735': { id: 12, nombre: 'X6' },
  '81809': { id: 3, nombre: '4KM36A' },
  '69746': { id: 1, nombre: '4KM37' },
  '69360': { id: 2, nombre: '4KM36B' },
  '72608': { id: 4, nombre: 'EXTENDERAP' },
  '67278': { id: 5, nombre: 'EXTENDERHUAWEI' },
  '80333': { id: 6, nombre: 'APEH7' },
  '73488': { id: 7, nombre: '4KALEXA' },
  '69644': { id: 11, nombre: 'ZTE' },
  '74497': { id: 13, nombre: 'FIBERHOMEEXTENDED' },
  '69358': { id: 14, nombre: 'SOUNDBOX' }
};

// ---------- DEBUG GLOBAL ----------
console.log('BOOT ▶', {
  argv: process.argv,
  main: require.main === module,
  filename: __filename
});
process.on('unhandledRejection', (r) => { console.error('🔴 unhandledRejection:', r); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('🔴 uncaughtException:', e); process.exit(1); });

// Importar inquirer de forma asíncrona para versión 12.x
let inquirer;
async function loadInquirer() {
  if (!inquirer) {
    inquirer = await import('inquirer');
    // En inquirer 12.x, usar el export default
    inquirer = inquirer.default || inquirer;
  }
  return inquirer;
}

// ------------------ Funciones de Utilidad ------------------

function readTextSmart(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const sample = content.slice(0, 2000);
  const unknownCount = (sample.match(/\uFFFD/g) || []).length;
  if (unknownCount > 5) content = fs.readFileSync(filePath, 'latin1');
  return content;
}

function detectDelimiter(content) {
  const sample = content.slice(0, 5000);
  const delimiters = [',', ';', '\t', '|'];
  let bestDelim = ',';
  let maxCount = 0;
  
  for (const delim of delimiters) {
    const count = (sample.match(new RegExp(`\\${delim}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelim = delim;
    }
  }
  return bestDelim;
}

function parseDate(dateStr) {
  const months = { ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11 };
  const s = dateStr.trim().toLowerCase();
  const m = s.match(/^(\d{2})-([a-záéíóúñ]{3})-(\d{2})$/i);
  if (!m) throw new Error(`Formato de fecha no reconocido: "${dateStr}"`);
  const day  = parseInt(m[1], 10);
  const mon3 = m[2].normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const month = months[mon3];
  const year  = 2000 + parseInt(m[3], 10);
  if (month == null) throw new Error(`Mes no reconocido en fecha: "${dateStr}"`);
  return new Date(year, month, day);
}

function parseRowsFromContent(content) {
  const delimiter = detectDelimiter(content);
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) return [];
  
  const firstLine = lines[0].split(delimiter);
  const hasHeader = firstLine.some(col => 
    /material|serie|folio|recibo/i.test(col.trim())
  );
  
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows = [];
  
  for (const line of dataLines) {
    const cols = line.split(delimiter).map(c => c.trim().replace(/['"]/g, ''));
    
    if (cols.length >= 4) {
      try {
        const row = {
          material: cols[0],
          serialNumber: cols[1],
          folio: cols[2],
          fechaRecibo: parseDate(cols[3])
        };
        
        if (row.serialNumber && row.serialNumber.length >= 8) {
          rows.push(row);
        }
      } catch (e) {
        console.warn(`Fila ignorada por error: ${line} - ${e.message}`);
      }
    }
  }
  
  return rows;
}

function generateWorkingDateTime(baseDate, fase, previousDateTime = null) {
  const workStart = 8;
  const workEnd = 17;
  
  let targetDate = new Date(baseDate);
  
  if (previousDateTime) {
    targetDate = new Date(previousDateTime);
    targetDate.setMinutes(targetDate.getMinutes() + Math.random() * 60 + 15);
  } else {
    const randomHour = workStart + Math.random() * (workEnd - workStart);
    targetDate.setHours(Math.floor(randomHour), Math.floor((randomHour % 1) * 60), 0, 0);
  }
  
  if (targetDate.getHours() < workStart) {
    targetDate.setHours(workStart, 0, 0, 0);
  } else if (targetDate.getHours() >= workEnd) {
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(workStart, 0, 0, 0);
  }
  
  return targetDate;
}

async function findCSVFiles(dir = '.', depth = 2) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile() && /\.(csv|txt|prn)$/i.test(item)) {
        files.push(fullPath);
      } else if (stat.isDirectory() && depth > 0 && !item.startsWith('.') && item !== 'node_modules') {
        const subFiles = await findCSVFiles(fullPath, depth - 1);
        files.push(...subFiles);
      }
    }
  } catch (error) {
    console.warn(`No se pudo leer directorio ${dir}: ${error.message}`);
  }
  
  return files;
}

function previewFileContent(filePath) {
  try {
    const content = readTextSmart(filePath);
    const rows = parseRowsFromContent(content);
    
    if (rows.length === 0) {
      return { success: false, message: 'No se detectaron filas válidas en el archivo.' };
    }
    
    return {
      success: true,
      totalRows: rows.length,
      firstRow: rows[0],
      uniqueMaterials: [...new Set(rows.map(r => r.material))],
      uniqueFolios: [...new Set(rows.map(r => r.folio))],
      previewRows: rows.slice(0, 5)
    };
  } catch (error) {
    return { success: false, message: `Error al leer el archivo: ${error.message}` };
  }
}

// ------------------ Función para Procesar Módems a Empaque ------------------

async function procesarModemsAEmpaque() {
  try {
    console.log('\n📦 PROCESADOR DE MÓDEMS A EMPAQUE 📦\n');
    
    await loadInquirer();
    
    console.log('🔌 Conectando a la base de datos...');
    await prisma.$connect();
    console.log('✅ Conexión establecida\n');

    console.log('📚 Cargando datos...');
    const usuarios = await prisma.user.findMany({ 
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    const estados = await prisma.estado.findMany();
    const estadoMap = {};
    estados.forEach(e => { estadoMap[e.nombre] = e.id; });
    
    const modemsEnRetest = await prisma.modem.findMany({
      where: {
        faseActual: 'RETEST',
        estadoActualId: estadoMap['RETEST'],
        registros: {
          none: {
            fase: 'EMPAQUE'
          }
        }
      },
      include: {
        lote: {
          select: { numero: true }
        },
        sku: {
          select: { nombre: true }
        }
      }
    });

    if (modemsEnRetest.length === 0) {
      console.log('❌ No se encontraron módems en RETEST sin registro de EMPAQUE');
      return;
    }

    console.log(`✅ Encontrados ${modemsEnRetest.length} módems en RETEST sin empaque\n`);

    const modemsGroupedByLote = modemsEnRetest.reduce((acc, modem) => {
      const loteNum = modem.lote.numero;
      if (!acc[loteNum]) {
        acc[loteNum] = { count: 0, sku: modem.sku.nombre };
      }
      acc[loteNum].count++;
      return acc;
    }, {});

    console.log('📊 Resumen por lote:');
    Object.entries(modemsGroupedByLote).forEach(([loteNum, info]) => {
      console.log(`   📦 Lote ${loteNum}: ${info.count} módems (${info.sku})`);
    });

    const { tipoOperacion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'tipoOperacion',
        message: '¿Qué operación deseas realizar?',
        choices: [
          { name: `📦 Procesar TODOS los ${modemsEnRetest.length} módems a EMPAQUE`, value: 'todos' },
          { name: '🎯 Seleccionar lote específico', value: 'lote' },
          { name: '🔢 Especificar cantidad exacta', value: 'cantidad' },
          { name: '❌ Cancelar operación', value: 'cancelar' }
        ]
      }
    ]);

    if (tipoOperacion === 'cancelar') {
      console.log('❌ Operación cancelada');
      return;
    }

    let modemsAProcesar = [];
    
    if (tipoOperacion === 'todos') {
      modemsAProcesar = modemsEnRetest;
    } else if (tipoOperacion === 'lote') {
      const { loteSeleccionado } = await inquirer.prompt([
        {
          type: 'list',
          name: 'loteSeleccionado',
          message: 'Selecciona el lote a procesar:',
          choices: Object.entries(modemsGroupedByLote).map(([loteNum, info]) => ({
            name: `Lote ${loteNum} - ${info.count} módems (${info.sku})`,
            value: loteNum
          }))
        }
      ]);
      
      modemsAProcesar = modemsEnRetest.filter(m => m.lote.numero === loteSeleccionado);
    } else if (tipoOperacion === 'cantidad') {
      const { cantidad } = await inquirer.prompt([
        {
          type: 'number',
          name: 'cantidad',
          message: `¿Cuántos módems procesar? (máximo ${modemsEnRetest.length}):`,
          validate: (input) => {
            if (input > 0 && input <= modemsEnRetest.length) return true;
            return `Debe ser un número entre 1 y ${modemsEnRetest.length}`;
          }
        }
      ]);
      
      modemsAProcesar = modemsEnRetest.slice(0, cantidad);
    }

    const usuariosEmpaque = usuarios.filter(u => u.rol === 'UE' || u.rol === 'UA');
    let userId;
    
    if (usuariosEmpaque.length === 0) {
      console.log('⚠️ No hay usuarios con rol UE (Empaque) o UA disponibles');
      const { selectedUserId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedUserId',
          message: 'Selecciona un usuario:',
          choices: usuarios.map(u => ({ 
            name: `${u.nombre} (${u.userName}) - ${u.rol}`, 
            value: u.id 
          }))
        }
      ]);
      userId = selectedUserId;
    } else if (usuariosEmpaque.length === 1) {
      userId = usuariosEmpaque[0].id;
      console.log(`👤 Usuario seleccionado: ${usuariosEmpaque[0].nombre} (${usuariosEmpaque[0].userName})`);
    } else {
      const { selectedUserId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedUserId',
          message: 'Selecciona el usuario responsable del empaque:',
          choices: usuariosEmpaque.map(u => ({ 
            name: `${u.nombre} (${u.userName}) - ${u.rol}`, 
            value: u.id 
          }))
        }
      ]);
      userId = selectedUserId;
    }

    console.log(`\n📋 Resumen de la operación:`);
    console.log(`   - Módems a procesar: ${modemsAProcesar.length}`);
    console.log(`   - Usuario responsable: ${usuarios.find(u => u.id === userId)?.nombre}`);
    console.log(`   - Acción: Crear registro EMPAQUE y actualizar estado`);
    
    const { confirmar } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmar',
        message: '¿Confirmas procesar estos módems a EMPAQUE?',
        default: true
      }
    ]);

    if (!confirmar) {
      console.log('❌ Operación cancelada');
      return;
    }

    await procesarModemsAEmpaqueReal(modemsAProcesar, userId, estadoMap);
    
  } catch (error) {
    console.error('❌ Error durante el procesamiento:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function procesarModemsAEmpaqueReal(modems, userId, estadoMap) {
  console.log('\n⏳ Iniciando procesamiento a EMPAQUE...');
  
  const estadoEmpaqueId = estadoMap['EMPAQUE'] || estadoMap['RETEST'];
  const batchSize = 50;
  let procesados = 0;
  let fallidos = 0;
  
  for (let i = 0; i < modems.length; i += batchSize) {
    const batch = modems.slice(i, i + batchSize);
    console.log(`   Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(modems.length/batchSize)}...`);
    
    for (const modem of batch) {
      try {
        const now = new Date();
        
        await prisma.$transaction(async (tx) => {
          await tx.registro.create({
            data: {
              sn: modem.sn,
              fase: 'EMPAQUE',
              estado: 'SN_OK',
              userId: userId,
              loteId: modem.loteId,
              modemId: modem.id,
              createdAt: now,
            }
          });
          
          await tx.modem.update({
            where: { id: modem.id },
            data: {
              faseActual: 'EMPAQUE',
              estadoActualId: estadoEmpaqueId,
              updatedAt: now,
            }
          });
        });
        
        procesados++;
      } catch (error) {
        fallidos++;
        console.error(`   ❌ Error procesando módem ${modem.sn}: ${error.message}`);
      }
    }
    
    const progreso = Math.min(i + batchSize, modems.length);
    console.log(`   ✅ Progreso: ${progreso}/${modems.length} (${Math.round(progreso/modems.length*100)}%)`);
  }
  
  console.log('\n🎉 ¡Procesamiento completado!');
  console.log('📊 Resumen:');
  console.log(`   ✅ Módems procesados exitosamente: ${procesados}`);
  console.log(`   ❌ Módems fallidos: ${fallidos}`);
  console.log(`   🎯 Nueva fase: EMPAQUE`);
  console.log(`   📝 Registros creados: ${procesados}`);
}

// ------------------ Función de Importación ------------------

async function importInteractive() {
  try {
    console.log('\n🌟 IMPORTADOR INTERACTIVO DE MÓDEMS 🌟\n');
    
    await loadInquirer();
    
    console.log('🔌 Conectando a la base de datos...');
    await prisma.$connect();
    console.log('✅ Conexión establecida\n');

    console.log('📚 Cargando datos de la base...');
    const skus = await prisma.catalogoSKU.findMany({ orderBy: { nombre: 'asc' }});
    const usuarios = await prisma.user.findMany({ 
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    const estados = await prisma.estado.findMany();
    const estadoMap = {};
    estados.forEach(e => { estadoMap[e.nombre] = e.id; });
    
    console.log(`✅ SKUs: ${skus.length}, Usuarios: ${usuarios.length}, Estados: ${estados.length}\n`);

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
        message: 'Selecciona el archivo a importar:',
        choices: [
          ...files.map(f => ({ name: f, value: f })),
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
    const preview = previewFileContent(selectedFile);
    
    if (!preview.success) {
      console.error(`❌ ${preview.message}`);
      return;
    }
    
    console.log(`\n📊 Datos detectados:`);
    console.log(`   - Total de filas: ${preview.totalRows}`);
    console.log(`   - Materiales: ${preview.uniqueMaterials.join(', ')}`);
    console.log(`   - Folios: ${preview.uniqueFolios.join(', ')}`);
    console.log(`\n📑 Primeras ${preview.previewRows.length} filas:`);
    preview.previewRows.forEach((row, i) => {
      console.log(`   ${i+1}. Material: ${row.material}, SN: ${row.serialNumber}, Folio: ${row.folio}, Fecha: ${row.fechaRecibo.toLocaleDateString()}`);
    });

    const { continuar } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continuar',
        message: '¿Deseas continuar con la importación?',
        default: true
      }
    ]);

    if (!continuar) {
      console.log('❌ Importación cancelada por el usuario');
      return;
    }

    let skuId;
    const material = preview.uniqueMaterials[0];
    const materialSku = MATERIAL_TO_SKU[material];
    
    if (materialSku) {
      const matchingSku = skus.find(s => s.id === materialSku.id);
      if (matchingSku) {
        const { usarSkuDetectado } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'usarSkuDetectado',
            message: `✅ Se detectó SKU automáticamente: ${matchingSku.nombre} (Material: ${material}). ¿Usarlo?`,
            default: true
          }
        ]);
        
        if (usarSkuDetectado) {
          skuId = matchingSku.id;
          console.log(`🎯 SKU seleccionado: ${matchingSku.nombre} (ID: ${skuId})`);
        }
      }
    }
    
    if (!skuId) {
      const { selectedSkuId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedSkuId',
          message: 'Selecciona el SKU manualmente:',
          choices: skus.map(s => ({ 
            name: `${s.nombre} - Material: ${s.skuItem || 'N/A'}`, 
            value: s.id 
          }))
        }
      ]);
      skuId = selectedSkuId;
    }
    
    const usuariosUA = usuarios.filter(u => u.rol === 'UA');
    let userId;
    
    if (usuariosUA.length > 0) {
      if (usuariosUA.length === 1) {
        userId = usuariosUA[0].id;
        console.log(`👤 Usuario seleccionado automáticamente: ${usuariosUA[0].nombre} (${usuariosUA[0].userName})`);
      } else {
        const { selectedUserId } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedUserId',
            message: 'Selecciona el usuario responsable (UA):',
            choices: usuariosUA.map(u => ({ 
              name: `${u.nombre} (${u.userName})`, 
              value: u.id 
            }))
          }
        ]);
        userId = selectedUserId;
      }
    } else {
      console.log('⚠️ No hay usuarios con rol UA disponibles');
      const { selectedUserId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedUserId',
          message: 'Selecciona otro usuario:',
          choices: usuarios.map(u => ({ 
            name: `${u.nombre} (${u.userName}) - ${u.rol}`, 
            value: u.id 
          }))
        }
      ]);
      userId = selectedUserId;
    }
    
    const suggestedLoteNumero = preview.uniqueFolios[0] || `L${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
    
    const { loteNumero, tipoLote, prioridad } = await inquirer.prompt([
      {
        type: 'input',
        name: 'loteNumero',
        message: 'Número de lote:',
        default: suggestedLoteNumero,
        validate: (input) => input.trim().length > 0 ? true : 'El número de lote no puede estar vacío'
      },
      {
        type: 'list',
        name: 'tipoLote',
        message: 'Tipo de lote:',
        choices: ['ENTRADA', 'SALIDA'],
        default: 'ENTRADA'
      },
      {
        type: 'list',
        name: 'prioridad',
        message: 'Prioridad del lote:',
        choices: [
          { name: 'Alta (3)', value: 3 },
          { name: 'Normal (2)', value: 2 },
          { name: 'Baja (1)', value: 1 }
        ],
        default: 2
      }
    ]);
    
    const existingLote = await prisma.lote.findUnique({
      where: { numero: loteNumero }
    });
    
    if (existingLote) {
      const { usarExistente } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'usarExistente',
          message: `⚠️ El lote "${loteNumero}" ya existe. ¿Deseas agregar módems a este lote?`,
          default: true
        }
      ]);
      
      if (!usarExistente) {
        console.log('❌ Importación cancelada. Elige otro número de lote.');
        return;
      }
    }
    
    console.log(`\n📋 Resumen de la importación:`);
    console.log(`   - Archivo: ${path.basename(selectedFile)}`);
    console.log(`   - Módems a importar: ${preview.totalRows}`);
    console.log(`   - SKU: ${skus.find(s => s.id === skuId)?.nombre}`);
    console.log(`   - Lote: ${loteNumero} (${existingLote ? 'existente' : 'nuevo'})`);
    console.log(`   - Usuario: ${usuarios.find(u => u.id === userId)?.nombre}`);
    
    const { confirmarImportacion } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmarImportacion',
        message: '¿Estás seguro de proceder con la importación?',
        default: true
      }
    ]);
    
    if (!confirmarImportacion) {
      console.log('❌ Importación cancelada por el usuario');
      return;
    }
    
    console.log('\n⏳ Iniciando importación de datos...');
    await procesarImportacion(selectedFile, skuId, userId, loteNumero, tipoLote, prioridad, estadoMap);
    
  } catch (err) {
    console.error('❌ Error durante la importación:', err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function procesarImportacion(filePath, skuId, userId, loteNumero, tipoLote, prioridad, estadoMap) {
  try {
    console.log(`📦 Configurando lote: ${loteNumero}...`);
    const lote = await prisma.lote.upsert({
      where: { numero: loteNumero },
      update: {
        updatedAt: new Date()
      },
      create: {
        numero: loteNumero,
        skuId: skuId,
        tipoLote: tipoLote,
        esScrap: false,
        estado: 'EN_PROCESO',
        prioridad: prioridad,
        responsableId: userId,
      },
    });
    console.log(`✅ Lote configurado: ${lote.numero} (ID: ${lote.id})`);
    
    console.log('📖 Leyendo y procesando archivo...');
    const content = readTextSmart(filePath);
    const rows = parseRowsFromContent(content);
    
    const uniqueRows = [];
    const seenSerials = new Set();
    
    for (const row of rows) {
      if (!seenSerials.has(row.serialNumber)) {
        seenSerials.add(row.serialNumber);
        uniqueRows.push(row);
      } else {
        console.warn(`⚠️ Número de serie duplicado ignorado: ${row.serialNumber}`);
      }
    }
    
    console.log(`📊 Módems únicos a procesar: ${uniqueRows.length}/${rows.length}`);
    
    const estadoRetestId = estadoMap['RETEST'] || estadoMap['REGISTRO'] || Object.values(estadoMap)[0];
    const fases = ['REGISTRO', 'TEST_INICIAL', 'ENSAMBLE', 'RETEST'];
    
    let creados = 0;
    let actualizados = 0;
    let fallidos = 0;
    const batchSize = 50;
    
    console.log(`🔄 Procesando en lotes de ${batchSize} módems...`);
    
    for (let i = 0; i < uniqueRows.length; i += batchSize) {
      const batch = uniqueRows.slice(i, i + batchSize);
      console.log(`   Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueRows.length/batchSize)} - Procesando ${batch.length} módems...`);
      
      for (const item of batch) {
        try {
          const existingModem = await prisma.modem.findUnique({
            where: { sn: item.serialNumber }
          });
          
          let modem;
          if (existingModem) {
            modem = await prisma.modem.update({
              where: { sn: item.serialNumber },
              data: {
                skuId: skuId,
                estadoActualId: estadoRetestId,
                faseActual: 'RETEST',
                loteId: lote.id,
                responsableId: userId,
                updatedAt: new Date(),
              }
            });
            actualizados++;
          } else {
            modem = await prisma.modem.create({
              data: {
                sn: item.serialNumber,
                skuId: skuId,
                estadoActualId: estadoRetestId,
                faseActual: 'RETEST',
                loteId: lote.id,
                responsableId: userId,
                createdAt: generateWorkingDateTime(item.fechaRecibo, 'REGISTRO'),
              }
            });
            creados++;
          }
          
          if (!existingModem) {
            let lastDateTime = null;
            for (const [idx, fase] of fases.entries()) {
              const fechaFase = idx === 0
                ? generateWorkingDateTime(item.fechaRecibo, fase)
                : generateWorkingDateTime(item.fechaRecibo, fase, lastDateTime);
                
              await prisma.registro.create({
                data: {
                  sn: item.serialNumber,
                  fase: fase,
                  estado: 'SN_OK',
                  userId: userId,
                  loteId: lote.id,
                  modemId: modem.id,
                  createdAt: fechaFase,
                },
              });
              lastDateTime = fechaFase;
            }
            
            await prisma.modem.update({
              where: { id: modem.id },
              data: { updatedAt: lastDateTime },
            });
          }
          
        } catch (e) {
          fallidos++;
          console.error(`   ❌ Error procesando SN ${item.serialNumber}: ${e.message}`);
        }
      }
      
      const procesados = Math.min(i + batchSize, uniqueRows.length);
      console.log(`   ✅ Progreso: ${procesados}/${uniqueRows.length} (${Math.round(procesados/uniqueRows.length*100)}%)`);
    }
    
    await prisma.lote.update({
      where: { id: lote.id },
      data: { 
        estado: 'COMPLETADO',
        updatedAt: new Date()
      },
    });
    
    console.log('\n🎉 ¡Importación completada exitosamente!');
    console.log('📊 Resumen final:');
    console.log(`   📦 Lote: ${lote.numero}`);
    console.log(`   📱 Módems creados: ${creados}`);
    console.log(`   🔄 Módems actualizados: ${actualizados}`);
    console.log(`   ❌ Módems fallidos: ${fallidos}`);
    console.log(`   ✅ Total procesados: ${creados + actualizados}`);
    console.log(`   🎯 Estado final: RETEST`);
    console.log(`   🏁 Estado del lote: COMPLETADO`);
    
  } catch (error) {
    console.error('❌ Error durante el procesamiento:', error);
    throw error;
  }
}

// ------------------ Menú Principal ------------------

async function menuPrincipal() {
  try {
    await loadInquirer();
    
    console.log('\n🌟 SISTEMA DE GESTIÓN DE MÓDEMS 🌟\n');
    
    const { opcion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'opcion',
        message: 'Selecciona una opción:',
        choices: [
          { name: '📥 Importar módems desde archivo CSV', value: 'importar' },
          { name: '📦 Procesar módems a EMPAQUE', value: 'empaque' },
          { name: '❌ Salir', value: 'salir' }
        ]
      }
    ]);
    
    switch (opcion) {
      case 'importar':
        await importInteractive();
        break;
      case 'empaque':
        await procesarModemsAEmpaque();
        break;
      case 'salir':
        console.log('👋 ¡Hasta luego!');
        break;
    }
    
  } catch (error) {
    console.error('❌ Error en el menú principal:', error);
  }
}

// ------------------ Ejecución Principal ------------------

if (require.main === module) {
  console.time('⏱ sistema_gestion');
  menuPrincipal()
    .then(() => { 
      console.timeEnd('⏱ sistema_gestion'); 
      console.log('\n✨ Proceso completado exitosamente');
      process.exit(0); 
    })
    .catch((e) => { 
      console.error('💥 Error fatal:', e); 
      process.exit(1); 
    });
}

module.exports = { 
  importInteractive, 
  procesarImportacion, 
  parseRowsFromContent, 
  readTextSmart,
  procesarModemsAEmpaque,
  menuPrincipal
};
