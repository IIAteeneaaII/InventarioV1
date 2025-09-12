// import_prn_x6.js — Versión con menú interactivo y función de empaque
// Ejecuta: node import_prn_x6_final.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

// Mapeo de materiales a SKUs basado en seed.js
const MATERIAL_TO_SKU = {
  '72676': { id: 8, nombre: 'V5SMALL' },
  '66262': { id: 9, nombre: 'V5' },
  '69643': { id: 10, nombre: 'FIBERHOME' },
  '79735': { id: 12, nombre: 'X6' },
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

// ------------------ Funciones de Utilidad Mejoradas ------------------

function readTextSmart(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Si hay problemas de encoding, intentar con latin1
  const sample = content.slice(0, 2000);
  const unknownCount = (sample.match(/\uFFFD/g) || []).length;
  if (unknownCount > 5) {
    content = fs.readFileSync(filePath, 'latin1');
  }
  
  // Limpiar BOM si existe
  content = content.replace(/^\uFEFF/, '');
  
  return content;
}

function detectDelimiter(content) {
  const sample = content.slice(0, 5000);
  const delimiters = [',', ';', '\t', '|', ' '];
  let bestDelim = ',';
  let maxCount = 0;
  
  for (const delim of delimiters) {
    const regex = delim === ' ' ? /\s{2,}/g : new RegExp(`\\${delim}`, 'g');
    const count = (sample.match(regex) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelim = delim;
    }
  }
  
  console.log(`🔍 Delimitador detectado: "${bestDelim}" (${maxCount} ocurrencias)`);
  return bestDelim;
}

function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"' && (i === 0 || line[i-1] === delimiter || line[i-1] === ' ')) {
      inQuotes = true;
    } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i+1] === delimiter || line[i+1] === ' ')) {
      inQuotes = false;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
      i++;
      continue;
    } else if (!inQuotes && char === ' ' && delimiter === ' ') {
      // Para espacios múltiples como delimitador
      while (i < line.length && line[i] === ' ') {
        i++;
      }
      if (current.trim()) {
        result.push(current.trim());
        current = '';
      }
      continue;
    } else {
      current += char;
    }
    i++;
  }
  
  if (current.trim()) {
    result.push(current.trim());
  }
  
  return result.map(field => field.replace(/^["']|["']$/g, ''));
}

function parseDate(dateStr) {
  const months = { 
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  
  const s = dateStr.trim().toLowerCase();
  
  // Formato DD-MMM-YY (ej: 01-ene-24)
  let m = s.match(/^(\d{1,2})-([a-záéíóúñ]{3})-(\d{2,4})$/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon3 = m[2].normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const month = months[mon3];
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    
    if (month != null) {
      return new Date(year, month, day);
    }
  }
  
  // Formato DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  
  // Formato YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    return new Date(year, month, day);
  }
  
  throw new Error(`Formato de fecha no reconocido: "${dateStr}"`);
}

function detectCSVStructure(lines, delimiter) {
  if (lines.length === 0) return null;
  
  // Analizar primera línea para detectar headers
  const firstLineCols = parseCSVLine(lines[0], delimiter);
  const hasHeader = firstLineCols.some(col => 
    /material|serie|serial|folio|recibo|fecha|sn|number|entrada|salida|proceso/i.test(col.trim())
  );
  
  console.log(`📊 Headers detectados: ${hasHeader ? 'Sí' : 'No'}`);
  console.log(`📊 Columnas en primera línea: ${firstLineCols.length}`);
  console.log(`📊 Columnas: [${firstLineCols.map(c => `"${c}"`).join(', ')}]`);
  
  // Analizar estructura de datos
  const dataStartIndex = hasHeader ? 1 : 0;
  const sampleLines = lines.slice(dataStartIndex, Math.min(dataStartIndex + 5, lines.length));
  
  let materialCol = -1, serialCol = -1, folioCol = -1, fechaCol = -1;
  let salidaCol = -1, entradaCol = -1;
  
  if (hasHeader) {
    firstLineCols.forEach((col, idx) => {
      const c = col.toLowerCase();
      if (/material/i.test(c)) materialCol = idx;
      else if (/serie|serial|sn/i.test(c)) serialCol = idx;
      else if (/folio/i.test(c)) folioCol = idx;
      else if (/fecha|recibo|date/i.test(c)) fechaCol = idx;
      else if (/entrada/i.test(c)) entradaCol = idx;
      else if (/salida/i.test(c)) salidaCol = idx;
    });
    
    // Si no encontramos serial pero sí entrada/salida, usar entrada como serial
    if (serialCol === -1 && entradaCol >= 0) {
      serialCol = entradaCol;
      console.log(`🔄 Usando columna "Entrada" como número de serie`);
    }
  } else {
    // Detectar por posición y contenido típico
    if (sampleLines.length > 0) {
      const sampleCols = parseCSVLine(sampleLines[0], delimiter);
      
      sampleCols.forEach((col, idx) => {
        // Material: números de 5-6 dígitos
        if (/^\d{5,6}$/.test(col) && materialCol === -1) {
          materialCol = idx;
        }
        // Serial: cadenas alfanuméricas largas (incluyendo hex)
        else if (/^[A-F0-9]{12,}$/i.test(col) && serialCol === -1) {
          serialCol = idx;
        }
        // Folio: puede ser alfanumérico
        else if (/^[A-Z0-9\-_]{3,}$/i.test(col) && folioCol === -1 && idx !== serialCol) {
          folioCol = idx;
        }
        // Fecha: patrones de fecha
        else if (/\d{1,2}[-\/]\w{3}[-\/]\d{2,4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2}/.test(col) && fechaCol === -1) {
          fechaCol = idx;
        }
      });
    }
  }
  
  console.log(`📋 Estructura detectada:`);
  console.log(`   Material: columna ${materialCol}`);
  console.log(`   Serial: columna ${serialCol}`);
  console.log(`   Folio: columna ${folioCol}`);
  console.log(`   Fecha: columna ${fechaCol}`);
  console.log(`   Entrada: columna ${entradaCol}`);
  console.log(`   Salida: columna ${salidaCol}`);
  
  return {
    hasHeader,
    dataStartIndex,
    materialCol,
    serialCol,
    folioCol,
    fechaCol,
    totalCols: firstLineCols.length,
    entradaCol,
    salidaCol
  };
}

function parseRowsFromContent(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) {
    console.log('⚠️ No se encontraron líneas válidas en el archivo');
    return [];
  }
  
  console.log(`📄 Total de líneas: ${lines.length}`);
  
  const delimiter = detectDelimiter(content);
  const structure = detectCSVStructure(lines, delimiter);
  
  if (!structure) {
    console.error('❌ No se pudo detectar la estructura del archivo');
    return [];
  }
  
  if (structure.serialCol === -1) {
    console.error('❌ No se pudo detectar la columna de número de serie');
    console.log('💡 Estructura encontrada:', structure);
    console.log('💡 Muestra de datos:');
    const sampleLines = lines.slice(structure.dataStartIndex, structure.dataStartIndex + 3);
    sampleLines.forEach((line, i) => {
      const cols = parseCSVLine(line, delimiter);
      console.log(`   Línea ${i+1}: [${cols.map(c => `"${c}"`).join(', ')}]`);
    });
    return [];
  }
  
  const dataLines = lines.slice(structure.dataStartIndex);
  const rows = [];
  let processedCount = 0;
  let skippedCount = 0;
  
  console.log(`🔄 Procesando ${dataLines.length} líneas de datos...`);
  
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    try {
      const cols = parseCSVLine(line, delimiter);
      
      if (cols.length >= Math.max(structure.serialCol + 1, structure.materialCol + 1)) {
        const serialNumber = cols[structure.serialCol]?.trim();
        
        if (serialNumber && serialNumber.length >= 6) {
          // Intentar extraer material del nombre del archivo o usar UNKNOWN
          let material = 'UNKNOWN';
          
          // Si no hay columna de material, intentar deducirlo del contexto
          if (structure.materialCol === -1) {
            // Buscar en el serial si contiene patrones conocidos
            const serialUpper = serialNumber.toUpperCase();
            if (serialUpper.includes('4857') || serialUpper.match(/^[A-F0-9]{16}$/)) {
              // Patrón típico de V5 o X6
              if (serialUpper.startsWith('4857')) {
                material = '79735'; // X6 por defecto para este patrón
              }
            }
          } else {
            material = cols[structure.materialCol]?.trim() || 'UNKNOWN';
          }
          
          let fechaRecibo;
          try {
            fechaRecibo = structure.fechaCol >= 0 ? parseDate(cols[structure.fechaCol]?.trim() || '') : new Date();
          } catch (e) {
            fechaRecibo = new Date(); // Fecha por defecto si no se puede parsear
          }
          
          const row = {
            material: material,
            serialNumber: serialNumber,
            folio: structure.folioCol >= 0 ? cols[structure.folioCol]?.trim() || `F${Date.now()}${i}` : `F${Date.now()}${i}`,
            fechaRecibo: fechaRecibo
          };
          
          rows.push(row);
          processedCount++;
          
          // Para archivos con columnas Entrada/Salida, procesar también la salida si existe
          if (structure.salidaCol >= 0 && cols[structure.salidaCol]?.trim() && 
              cols[structure.salidaCol].trim() !== serialNumber) {
            const salidaSerial = cols[structure.salidaCol].trim();
            if (salidaSerial.length >= 6) {
              const salidaRow = {
                material: material,
                serialNumber: salidaSerial,
                folio: structure.folioCol >= 0 ? cols[structure.folioCol]?.trim() || `F${Date.now()}${i}S` : `F${Date.now()}${i}S`,
                fechaRecibo: fechaRecibo
              };
              rows.push(salidaRow);
              processedCount++;
            }
          }
        } else {
          skippedCount++;
          if (skippedCount <= 5) {
            console.warn(`⚠️ Línea ${i + 1} ignorada - Serial inválido: "${serialNumber}"`);
          }
        }
      } else {
        skippedCount++;
        if (skippedCount <= 5) {
          console.warn(`⚠️ Línea ${i + 1} ignorada - Columnas insuficientes: ${cols.length}`);
        }
      }
    } catch (e) {
      skippedCount++;
      if (skippedCount <= 5) {
        console.warn(`⚠️ Línea ${i + 1} ignorada - Error: ${e.message}`);
      }
    }
  }
  
  console.log(`✅ Procesamiento completado:`);
  console.log(`   📊 Filas procesadas: ${processedCount}`);
  console.log(`   ⚠️ Filas omitidas: ${skippedCount}`);
  
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
      
      if (stat.isFile() && /\.(csv|txt|prn|tsv)$/i.test(item)) {
        files.push(fullPath);
      } else if (stat.isDirectory() && depth > 0 && !item.startsWith('.') && item !== 'node_modules') {
        const subFiles = await findCSVFiles(fullPath, depth - 1);
        files.push(...subFiles);
      }
    }
  } catch (error) {
    console.warn(`No se pudo leer directorio ${dir}: ${error.message}`);
  }
  
  return files.sort();
}

function previewFileContent(filePath) {
  try {
    console.log(`🔍 Analizando archivo: ${path.basename(filePath)}`);
    const content = readTextSmart(filePath);
    const rows = parseRowsFromContent(content);
    
    if (rows.length === 0) {
      return { 
        success: false, 
        message: 'No se detectaron filas válidas en el archivo. Verifique el formato y contenido.' 
      };
    }
    
    const uniqueMaterials = [...new Set(rows.map(r => r.material))];
    const uniqueFolios = [...new Set(rows.map(r => r.folio))];
    const dateRange = {
      min: new Date(Math.min(...rows.map(r => r.fechaRecibo))),
      max: new Date(Math.max(...rows.map(r => r.fechaRecibo)))
    };
    
    return {
      success: true,
      totalRows: rows.length,
      firstRow: rows[0],
      uniqueMaterials,
      uniqueFolios: uniqueFolios.slice(0, 5), // Limitar para no saturar la salida
      dateRange,
      previewRows: rows.slice(0, 3)
    };
  } catch (error) {
    return { 
      success: false, 
      message: `Error al leer el archivo: ${error.message}` 
    };
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

    console.log(`📁 Archivos encontrados: ${files.length}`);
    files.forEach(f => console.log(`   - ${f}`));

    const { filePath } = await inquirer.prompt([
      {
        type: 'list',
        name: 'filePath',
        message: 'Selecciona el archivo a importar:',
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
    const preview = previewFileContent(selectedFile);
    
    if (!preview.success) {
      console.error(`❌ ${preview.message}`);
      return;
    }
    
    console.log(`\n📊 Datos detectados:`);
    console.log(`   - Total de filas: ${preview.totalRows}`);
    console.log(`   - Materiales únicos: ${preview.uniqueMaterials.length}`);
    console.log(`   - Materiales: ${preview.uniqueMaterials.join(', ')}`);
    console.log(`   - Folios (primeros 5): ${preview.uniqueFolios.join(', ')}`);
    console.log(`   - Rango de fechas: ${preview.dateRange.min.toLocaleDateString()} - ${preview.dateRange.max.toLocaleDateString()}`);
    console.log(`\n📑 Vista previa (primeras ${preview.previewRows.length} filas):`);
    preview.previewRows.forEach((row, i) => {
      console.log(`   ${i+1}. Material: ${row.material}, SN: ${row.serialNumber}, Folio: ${row.folio}, Fecha: ${row.fechaRecibo.toLocaleDateString()}`);
    });

    const { continuar } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continuar',
        message: '¿Los datos se ven correctos y deseas continuar?',
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
    let duplicateCount = 0;
    
    for (const row of rows) {
      if (!seenSerials.has(row.serialNumber)) {
        seenSerials.add(row.serialNumber);
        uniqueRows.push(row);
      } else {
        duplicateCount++;
        console.warn(`⚠️ Número de serie duplicado ignorado: ${row.serialNumber}`);
      }
    }
    
    console.log(`📊 Análisis de duplicados:`);
    console.log(`   - Total leído: ${rows.length}`);
    console.log(`   - Duplicados encontrados: ${duplicateCount}`);
    console.log(`   - Únicos a procesar: ${uniqueRows.length}`);
    
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

// ------------------ Función de Importación de Entrada y Salida ------------------

async function importarEntradaYSalida() {
  try {
    console.log('\n📥📦 IMPORTADOR DE ENTRADA Y SALIDA 📥📦\n');
    
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
        choices: files.map(f => ({ name: `📄 ${path.basename(f)} (${f})`, value: f }))
      }
    ]);

    console.log(`\n📂 Analizando archivo: ${path.basename(filePath)}`);
    const content = readTextSmart(filePath);
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length === 0) {
      console.log('❌ Archivo vacío');
      return;
    }

    const delimiter = detectDelimiter(content);
    const structure = detectCSVStructure(lines, delimiter);
    
    if (!structure || structure.entradaCol === -1 || structure.salidaCol === -1) {
      console.error('❌ No se pudieron detectar las columnas de Entrada y Salida');
      return;
    }

    console.log('📊 Procesando datos de entrada y salida...');
    const dataLines = lines.slice(structure.dataStartIndex);
    
    const entradas = [];
    const salidas = [];
    const relaciones = new Map(); // Para relacionar entrada con salida
    
    for (let i = 0; i < dataLines.length; i++) {
      try {
        const cols = parseCSVLine(dataLines[i], delimiter);
        
        if (cols.length >= Math.max(structure.entradaCol + 1, structure.salidaCol + 1)) {
          const entradaSN = cols[structure.entradaCol]?.trim();
          const salidaSN = cols[structure.salidaCol]?.trim();
          
          let fechaEntrada, fechaSalida;
          
          // Procesar fechas si existen
          try {
            // Fecha de entrada (columna 1 - "Fecha Entrada")
            if (cols.length > 1 && cols[1]) {
              fechaEntrada = parseDate(cols[1]);
            } else {
              fechaEntrada = new Date();
            }
            
            // Fecha de salida (columna 4 - "Fecha Salida")
            if (cols.length > 4 && cols[4]) {
              fechaSalida = parseDate(cols[4]);
            } else {
              fechaSalida = new Date();
            }
          } catch (e) {
            fechaEntrada = new Date();
            fechaSalida = new Date();
          }
          
          if (entradaSN && entradaSN.length >= 6) {
            entradas.push({
              sn: entradaSN,
              fecha: fechaEntrada,
              linea: i + 1
            });
          }
          
          if (salidaSN && salidaSN.length >= 6) {
            salidas.push({
              sn: salidaSN,
              fecha: fechaSalida,
              linea: i + 1
            });
            
            // Relacionar entrada con salida si están en la misma línea
            if (entradaSN && entradaSN.length >= 6) {
              relaciones.set(entradaSN, salidaSN);
            }
          }
        }
      } catch (e) {
        console.warn(`⚠️ Error en línea ${i + 1}: ${e.message}`);
      }
    }
    
    console.log(`\n📊 Análisis de datos:`);
    console.log(`   📥 Entradas detectadas: ${entradas.length}`);
    console.log(`   📦 Salidas detectadas: ${salidas.length}`);
    console.log(`   🔗 Relaciones entrada→salida: ${relaciones.size}`);
    
    // Encontrar módems que están en proceso (entrada sin salida correspondiente)
    const entradasSinSalida = entradas.filter(entrada => !relaciones.has(entrada.sn));
    const salidasSinEntrada = salidas.filter(salida => 
      !Array.from(relaciones.values()).includes(salida.sn)
    );
    
    console.log(`   🔄 En proceso (entrada sin salida): ${entradasSinSalida.length}`);
    console.log(`   ⚠️ Salidas sin entrada correspondiente: ${salidasSinEntrada.length}`);

    const { tipoImportacion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'tipoImportacion',
        message: '¿Qué deseas importar?',
        choices: [
          { name: `📥 Solo ENTRADAS (${entradas.length} módems) → Estado REGISTRO`, value: 'entradas' },
          { name: `📦 Solo SALIDAS (${salidas.length} módems) → Estado EMPAQUE`, value: 'salidas' },
          { name: `🔄 PROCESO COMPLETO (crear entradas + actualizar salidas)`, value: 'completo' },
          { name: `⚠️ Solo módems EN PROCESO (${entradasSinSalida.length} módems)`, value: 'proceso' },
          { name: '❌ Cancelar', value: 'cancelar' }
        ]
      }
    ]);

    if (tipoImportacion === 'cancelar') {
      console.log('❌ Importación cancelada');
      return;
    }

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

    // Configurar lote
    const suggestedLoteNumero = `${path.basename(filePath, '.csv')}_${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
    
    const { loteNumero } = await inquirer.prompt([
      {
        type: 'input',
        name: 'loteNumero',
        message: 'Número de lote:',
        default: suggestedLoteNumero,
        validate: (input) => input.trim().length > 0 ? true : 'El número de lote no puede estar vacío'
      }
    ]);

    console.log(`\n📋 Resumen de la importación:`);
    console.log(`   - Archivo: ${path.basename(filePath)}`); // Corregido: filePath en lugar de selectedFile
    console.log(`   - Tipo: ${tipoImportacion}`);
    console.log(`   - SKU: ${skus.find(s => s.id === skuId)?.nombre}`);
    console.log(`   - Lote: ${loteNumero}`);
    console.log(`   - Usuario: ${usuarios.find(u => u.id === userId)?.nombre}`);
    
    if (tipoImportacion === 'entradas') {
      console.log(`   📥 Solo se crearán ${entradas.length} módems en REGISTRO`);
    } else if (tipoImportacion === 'salidas') {
      console.log(`   📦 Se buscarán y actualizarán ${salidas.length} módems a EMPAQUE`);
    } else if (tipoImportacion === 'completo') {
      console.log(`   🔄 Se crearán ${entradas.length} módems en REGISTRO`);
      console.log(`   🔄 Se actualizarán ${salidas.length} módems a EMPAQUE`);
    } else if (tipoImportacion === 'proceso') {
      console.log(`   ⚠️ Solo se crearán ${entradasSinSalida.length} módems en REGISTRO (en proceso)`);
    }
    
    const { confirmar } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmar',
        message: '¿Confirmas proceder con la importación?',
        default: true
      }
    ]);

    if (!confirmar) {
      console.log('❌ Importación cancelada');
      return;
    }

    await procesarImportacionEntradaYSalida(
      tipoImportacion, 
      entradas, 
      salidas, 
      relaciones,
      skuId, 
      userId, 
      loteNumero, 
      estadoMap
    );

  } catch (error) {
    console.error('❌ Error durante la importación:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ------------------ Función de Procesamiento de Entrada y Salida ------------------

async function procesarImportacionEntradaYSalida(tipo, entradas, salidas, relaciones, skuId, userId, loteNumero, estadoMap) {
  try {
    console.log('\n⏳ Iniciando procesamiento...');
    
    // Verificar si el lote ya existe
    let lote = await prisma.lote.findUnique({
      where: { numero: loteNumero }
    });

    if (lote) {
      console.log(`⚠️ El lote ${loteNumero} ya existe. Usando lote existente.`);
    } else {
      // Crear lote nuevo
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
      console.log(`✅ Lote creado: ${lote.numero}`);
    }

    let procesados = 0;
    let fallidos = 0;
    const batchSize = 50;

    if (tipo === 'entradas') {
      console.log('\n📥 Procesando solo ENTRADAS (REGISTRO)...');
      
      for (let i = 0; i < entradas.length; i += batchSize) {
        const batch = entradas.slice(i, i + batchSize);
        console.log(`   Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(entradas.length/batchSize)}...`);
        
        for (const entrada of batch) {
          try {
            await prisma.$transaction(async (tx) => {
              // Verificar si ya existe el módem
              const existingModem = await tx.modem.findUnique({
                where: { sn: entrada.sn }
              });

              if (!existingModem) {
                // Crear módem en REGISTRO
                const modem = await tx.modem.create({
                  data: {
                    sn: entrada.sn,
                    skuId: skuId,
                    estadoActualId: estadoMap['REGISTRO'] || estadoMap['RETEST'],
                    faseActual: 'REGISTRO',
                    loteId: lote.id,
                    responsableId: userId,
                    createdAt: entrada.fecha,
                  }
                });

                // Crear registro de REGISTRO
                await tx.registro.create({
                  data: {
                    sn: entrada.sn,
                    fase: 'REGISTRO',
                    estado: 'SN_OK',
                    userId: userId,
                    loteId: lote.id,
                                        modemId: modem.id,
                    createdAt: entrada.fecha,
                  }
                });

                procesados++;
              } else {
                console.log(`   ⚠️ Módem ${entrada.sn} ya existe, omitiendo...`);
              }
            });
          } catch (error) {
            fallidos++;
            if (fallidos <= 5) {
              console.error(`   ❌ Error procesando entrada ${entrada.sn}: ${error.message}`);
            }
          }
        }
      }
    } else if (tipo === 'salidas') {
      console.log('\n📦 Procesando SALIDAS (buscar por SN de entrada y actualizar a EMPAQUE)...');
      let noEncontrados = 0;
      
      for (let i = 0; i < salidas.length; i += batchSize) {
        const batch = salidas.slice(i, i + batchSize);
        console.log(`   Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(salidas.length/batchSize)}...`);
        
        for (const salida of batch) {
          try {
            await prisma.$transaction(async (tx) => {
              // Buscar el módem por SN de entrada que corresponde a esta salida
              const entradaSN = Array.from(relaciones.entries())
                .find(([entrada, salidaSN]) => salidaSN === salida.sn)?.[0];

              if (entradaSN) {
                // Buscar el módem por SN de entrada
                const modem = await tx.modem.findUnique({
                  where: { sn: entradaSN }
                });

                if (modem) {
                  // Crear las fases intermedias necesarias antes de EMPAQUE
                  const fases = ['TEST_INICIAL', 'ENSAMBLE', 'RETEST', 'EMPAQUE'];
                  let lastDateTime = modem.createdAt || new Date();
                  
                  for (const fase of fases) {
                    // Calcular fecha para esta fase (30 minutos después de la anterior)
                    const fechaFase = new Date(lastDateTime.getTime() + 30 * 60000);
                    
                    // Si es la última fase (EMPAQUE), usar la fecha de salida real
                    const fechaFinal = fase === 'EMPAQUE' ? salida.fecha : fechaFase;
                    
                    // Actualizar módem a la fase actual
                    await tx.modem.update({
                      where: { id: modem.id },
                      data: {
                        faseActual: fase,
                        estadoActualId: fase === 'EMPAQUE' ? 
                          (estadoMap['EMPAQUE'] || estadoMap['RETEST']) : 
                          (estadoMap['RETEST'] || estadoMap['REGISTRO']),
                        updatedAt: fechaFinal,
                      }
                    });
                    
                    // Crear registro para esta fase
                    await tx.registro.create({
                      data: {
                        sn: entradaSN,
                        fase: fase,
                        estado: 'SN_OK',
                        userId: userId,
                        loteId: lote.id,
                        modemId: modem.id,
                        createdAt: fechaFinal,
                      }
                    });
                    
                    lastDateTime = fechaFinal;
                  }
                  
                  procesados++;
                } else {
                  noEncontrados++;
                  if (noEncontrados <= 5) {
                    console.warn(`   ⚠️ No se encontró módem con SN de entrada: ${entradaSN} para salida: ${salida.sn}`);
                  }
                }
              } else {
                noEncontrados++;
                if (noEncontrados <= 5) {
                  console.warn(`   ⚠️ No se encontró relación entrada→salida para: ${salida.sn}`);
                }
              }
            });
          } catch (error) {
            fallidos++;
            if (fallidos <= 5) {
              console.error(`   ❌ Error procesando salida ${salida.sn}: ${error.message}`);
            }
          }
        }
      }
    } else if (tipo === 'completo') {
      console.log('\n🔄 Procesando FLUJO COMPLETO (ENTRADA → EMPAQUE)...');
      
      // Primero procesar las entradas como REGISTRO
      console.log('\n📥 Paso 1: Creando módems en REGISTRO...');
      for (let i = 0; i < entradas.length; i += batchSize) {
        const batch = entradas.slice(i, i + batchSize);
        console.log(`   Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(entradas.length/batchSize)}...`);
        
        for (const entrada of batch) {
          try {
            await prisma.$transaction(async (tx) => {
              // Verificar si ya existe
              const existingModem = await tx.modem.findUnique({
                where: { sn: entrada.sn }
              });

              if (!existingModem) {
                // Crear módem en REGISTRO
                const modem = await tx.modem.create({
                  data: {
                    sn: entrada.sn,
                    skuId: skuId,
                    estadoActualId: estadoMap['REGISTRO'] || estadoMap['RETEST'],
                    faseActual: 'REGISTRO',
                    loteId: lote.id,
                    responsableId: userId,
                    createdAt: entrada.fecha,
                  }
                });

                // Crear registro de REGISTRO
                await tx.registro.create({
                  data: {
                    sn: entrada.sn,
                    fase: 'REGISTRO',
                    estado: 'SN_OK',
                    userId: userId,
                    loteId: lote.id,
                    modemId: modem.id,
                    createdAt: entrada.fecha,
                  }
                });

                procesados++;
              }
            });
          } catch (error) {
            fallidos++;
            if (fallidos <= 5) {
              console.error(`   ❌ Error procesando entrada ${entrada.sn}: ${error.message}`);
            }
          }
        }
      }

      // Luego procesar las salidas y actualizar a EMPAQUE
      console.log('\n📦 Paso 2: Actualizando módems a EMPAQUE...');
      let empacados = 0;
      let noEncontrados = 0;
      
      for (let i = 0; i < salidas.length; i += batchSize) {
        const batch = salidas.slice(i, i + batchSize);
        console.log(`   Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(salidas.length/batchSize)}...`);
        
        for (const salida of batch) {
          try {
            await prisma.$transaction(async (tx) => {
              // Buscar el módem por SN de entrada que corresponde a esta salida
              const entradaSN = Array.from(relaciones.entries())
                .find(([entrada, salidaSN]) => salidaSN === salida.sn)?.[0];

              if (entradaSN) {
                // Buscar el módem por SN de entrada
                const modem = await tx.modem.findUnique({
                  where: { sn: entradaSN }
                });

                if (modem) {
                  // Crear las fases intermedias necesarias antes de EMPAQUE
                  const fases = ['TEST_INICIAL', 'ENSAMBLE', 'RETEST', 'EMPAQUE'];
                  let lastDateTime = modem.createdAt || new Date();
                  
                  for (const fase of fases) {
                    // Calcular fecha para esta fase (30 minutos después de la anterior)
                    const fechaFase = new Date(lastDateTime.getTime() + 30 * 60000);
                    
                    // Si es la última fase (EMPAQUE), usar la fecha de salida real
                    const fechaFinal = fase === 'EMPAQUE' ? salida.fecha : fechaFase;
                    
                    // Actualizar módem a la fase actual
                    await tx.modem.update({
                      where: { id: modem.id },
                      data: {
                        faseActual: fase,
                        estadoActualId: fase === 'EMPAQUE' ? 
                          (estadoMap['EMPAQUE'] || estadoMap['RETEST']) : 
                          (estadoMap['RETEST'] || estadoMap['REGISTRO']),
                        updatedAt: fechaFinal,
                      }
                    });
                    
                    // Crear registro para esta fase
                    await tx.registro.create({
                      data: {
                        sn: entradaSN,
                        fase: fase,
                        estado: 'SN_OK',
                        userId: userId,
                        loteId: lote.id,
                        modemId: modem.id,
                        createdAt: fechaFinal,
                      }
                    });
                    
                    lastDateTime = fechaFinal;
                  }
                  
                  empacados++;
                } else {
                  noEncontrados++;
                  if (noEncontrados <= 5) {
                    console.warn(`   ⚠️ No se encontró módem con SN de entrada: ${entradaSN} para salida: ${salida.sn}`);
                  }
                }
              } else {
                noEncontrados++;
                if (noEncontrados <= 5) {
                  console.warn(`   ⚠️ No se encontró relación entrada→salida para: ${salida.sn}`);
                }
              }
            });
          } catch (error) {
            fallidos++;
            if (fallidos <= 5) {
              console.error(`   ❌ Error procesando salida ${salida.sn}: ${error.message}`);
            }
          }
        }
      }
      
      console.log(`   📦 Módems actualizados a EMPAQUE: ${empacados}`);
      console.log(`   ⚠️ Módems no encontrados: ${noEncontrados}`);
      
    } else if (tipo === 'proceso') {
      console.log('\n⚠️ Procesando solo módems EN PROCESO (entrada sin salida)...');
      
      const entradasSinSalida = entradas.filter(e => !relaciones.has(e.sn));
      
      for (let i = 0; i < entradasSinSalida.length; i += batchSize) {
        const batch = entradasSinSalida.slice(i, i + batchSize);
        console.log(`   Lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(entradasSinSalida.length/batchSize)}...`);
        
        for (const entrada of batch) {
          try {
            await prisma.$transaction(async (tx) => {
              // Verificar si ya existe
              const existingModem = await tx.modem.findUnique({
                where: { sn: entrada.sn }
              });

              if (!existingModem) {
                // Crear módem en REGISTRO (en proceso)
                const modem = await tx.modem.create({
                  data: {
                    sn: entrada.sn,
                    skuId: skuId,
                    estadoActualId: estadoMap['REGISTRO'] || estadoMap['RETEST'],
                    faseActual: 'REGISTRO',
                    loteId: lote.id,
                    responsableId: userId,
                    createdAt: entrada.fecha,
                  }
                });

                // Crear registro de REGISTRO
                await tx.registro.create({
                  data: {
                    sn: entrada.sn,
                    fase: 'REGISTRO',
                    estado: 'SN_OK',
                    userId: userId,
                    loteId: lote.id,
                    modemId: modem.id,
                    createdAt: entrada.fecha,
                  }
                });

                procesados++;
              }
            });
          } catch (error) {
            fallidos++;
            if (fallidos <= 5) {
              console.error(`   ❌ Error procesando entrada ${entrada.sn}: ${error.message}`);
            }
          }
        }
      }
    }

    await prisma.lote.update({
      where: { id: lote.id },
      data: { 
        estado: 'COMPLETADO',
        updatedAt: new Date()
      }
    });

    console.log('\n🎉 ¡Procesamiento completado!');
    console.log('📊 Resumen:');
    console.log(`   ✅ Registros procesados: ${procesados}`);
    console.log(`   ❌ Registros fallidos: ${fallidos}`);
    console.log(`   📦 Lote: ${lote.numero}`);
    console.log(`   🏁 Estado del lote: COMPLETADO`);

    // Mostrar resumen por fase
    const resumenFases = await prisma.modem.groupBy({
      by: ['faseActual'],
      where: { loteId: lote.id },
      _count: { faseActual: true }
    });
    
    console.log('\n📊 Resumen por fase:');
    resumenFases.forEach(fase => {
      console.log(`   ${fase.faseActual}: ${fase._count.faseActual} módems`);
    });

    // Mostrar estadísticas adicionales si es flujo completo
    if (tipo === 'completo') {
      const totalEnRegistro = await prisma.modem.count({
        where: { 
          loteId: lote.id,
          faseActual: 'REGISTRO'
        }
      });
      
      const totalEnEmpaque = await prisma.modem.count({
        where: { 
          loteId: lote.id,
          faseActual: 'EMPAQUE'
        }
      });

      console.log('\n📈 Estadísticas del flujo:');
      console.log(`   📥 Módems que quedaron en REGISTRO: ${totalEnRegistro}`);
      console.log(`   📦 Módems que pasaron a EMPAQUE: ${totalEnEmpaque}`);
      const total = totalEnRegistro + totalEnEmpaque;
      if (total > 0) {
        console.log(`   🔄 Porcentaje de completitud: ${Math.round((totalEnEmpaque / total) * 100)}%`);
      }
    }

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
          { name: '📥📦 Importar ENTRADA y SALIDA desde CSV', value: 'entrada_salida' },
          { name: '📥 Importar módems desde archivo CSV (original)', value: 'importar' },
          { name: '📦 Procesar módems a EMPAQUE', value: 'empaque' },
          { name: '🔍 Vista previa de archivo', value: 'preview' },
          { name: '❌ Salir', value: 'salir' }
        ]
      }
    ]);
    
    switch (opcion) {
      case 'entrada_salida':
        await importarEntradaYSalida();
        await menuPrincipal();
        break;
      case 'importar':
        await importInteractive();
        await menuPrincipal();
        break;
      case 'empaque':
        await procesarModemsAEmpaque();
        await menuPrincipal();
        break;
      case 'preview':
        await previewFileOnly();
        await menuPrincipal();
        break;
      case 'salir':
        console.log('👋 ¡Hasta luego!');
        break;
    }
    
  } catch (error) {
    console.error('❌ Error en el menú principal:', error);
  }
}

async function previewFileOnly() {
  try {
    await loadInquirer();
    
    console.log('\n🔍 VISTA PREVIA DE ARCHIVO 🔍\n');
    
    const files = await findCSVFiles();
    
    if (files.length === 0) {
      console.log('❌ No se encontraron archivos CSV/TXT/PRN en el directorio');
      return;
    }

    const { filePath } = await inquirer.prompt([
      {
        type: 'list',
        name: 'filePath',
        message: 'Selecciona el archivo a previsualizar:',
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

    const preview = previewFileContent(selectedFile);
    
    if (!preview.success) {
      console.error(`❌ ${preview.message}`);
      return;
    }

    console.log(`\n📊 ANÁLISIS COMPLETO DEL ARCHIVO:`);
    console.log(`   📁 Archivo: ${path.basename(selectedFile)}`);
    console.log(`   📏 Tamaño: ${fs.statSync(selectedFile).size} bytes`);
    console.log(`   📊 Total de registros válidos: ${preview.totalRows}`);
    console.log(`   🔧 Materiales únicos: ${preview.uniqueMaterials.length}`);
    console.log(`   📋 Lista de materiales: ${preview.uniqueMaterials.join(', ')}`);
    console.log(`   📄 Folios (primeros 5): ${preview.uniqueFolios.join(', ')}`);
    console.log(`   📅 Rango de fechas: ${preview.dateRange.min.toLocaleDateString()} - ${preview.dateRange.max.toLocaleDateString()}`);
    
    console.log(`\n📑 MUESTRA DE DATOS (primeras ${preview.previewRows.length} filas):`);
    preview.previewRows.forEach((row, i) => {
      console.log(`   ${i+1}. Material: ${row.material}`);
      console.log(`      Serial: ${row.serialNumber}`);
      console.log(`      Folio: ${row.folio}`);
      console.log(`      Fecha: ${row.fechaRecibo.toLocaleDateString()}`);
      console.log('      ─────────────────────────────');
    });
    
    // Verificar materiales conocidos
    console.log(`\n🔍 ANÁLISIS DE MATERIALES:`);
    for (const material of preview.uniqueMaterials) {
      const knownSku = MATERIAL_TO_SKU[material];
      if (knownSku) {
        console.log(`   ✅ ${material} → ${knownSku.nombre} (reconocido)`);
      } else {
        console.log(`   ⚠️ ${material} → Material no reconocido`);
      }
    }

  } catch (error) {
    console.error('❌ Error durante la vista previa:', error);
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
  menuPrincipal,
  previewFileOnly,
  importarEntradaYSalida,
  procesarImportacionEntradaYSalida
};
