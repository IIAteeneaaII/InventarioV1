// Mejora para el procesamiento de CSV con forzado de mayúsculas
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
    // Intentar tratar como lista simple de SNs
    console.log('🔍 Intentando procesar como lista simple de números de serie...');
    
    const rows = [];
    for (const line of lines) {
      const sn = line.trim().toUpperCase(); // Forzar mayúsculas
      if (sn.length >= 6) {
        rows.push({
          material: 'UNKNOWN',
          serialNumber: sn,
          folio: `F${Date.now()}`,
          fechaRecibo: new Date()
        });
      }
    }
    
    if (rows.length > 0) {
      console.log(`✅ Se procesaron ${rows.length} números de serie como lista simple`);
      return rows;
    }
    
    console.error('❌ No se pudo detectar la columna de número de serie');
    return [];
  }
  
  const dataLines = lines.slice(structure.dataStartIndex);
  const rows = [];
  let processedCount = 0;
  let skippedCount = 0;
  
  console.log(`🔄 Procesando ${dataLines.length} líneas de datos...`);
  
  // Procesar en paralelo para archivos grandes
  const batchSize = 1000;
  
  for (let i = 0; i < dataLines.length; i += batchSize) {
    const batch = dataLines.slice(i, i + batchSize);
    
    // Procesar este lote
    for (const line of batch) {
      try {
        const cols = parseCSVLine(line, delimiter);
        
        if (cols.length >= Math.max(structure.serialCol + 1, structure.materialCol + 1)) {
          // Forzar mayúsculas en el número de serie
          const serialNumber = cols[structure.serialCol]?.trim().toUpperCase();
          
          if (serialNumber && serialNumber.length >= 6) {
            // Resto del código para construir el objeto row
            let material = 'UNKNOWN';
            
            if (structure.materialCol >= 0 && cols[structure.materialCol]) {
              material = cols[structure.materialCol].trim();
            } else {
              // Intentar deducir material del serial
              const serialUpper = serialNumber;
              if (serialUpper.includes('4857') || serialUpper.match(/^[A-F0-9]{16}$/)) {
                if (serialUpper.startsWith('4857')) {
                  material = '79735'; // X6 por defecto para este patrón
                }
              }
            }
            
            let fechaRecibo;
            try {
              fechaRecibo = structure.fechaCol >= 0 ? parseDate(cols[structure.fechaCol]?.trim() || '') : new Date();
            } catch (e) {
              fechaRecibo = new Date();
            }
            
            const row = {
              material: material,
              serialNumber: serialNumber, // Ya en mayúsculas
              folio: structure.folioCol >= 0 ? cols[structure.folioCol]?.trim().toUpperCase() || `F${Date.now()}${i}` : `F${Date.now()}${i}`,
              fechaRecibo: fechaRecibo
            };
            
            rows.push(row);
            processedCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      } catch (e) {
        skippedCount++;
      }
    }
    
    // Mostrar progreso
    const progreso = Math.min(i + batchSize, dataLines.length);
    console.log(`   ✅ Progreso de análisis: ${progreso}/${dataLines.length} (${Math.round(progreso/dataLines.length*100)}%)`);
  }
  
  console.log(`✅ Procesamiento completado:`);
  console.log(`   📊 Filas procesadas: ${processedCount}`);
  console.log(`   ⚠️ Filas omitidas: ${skippedCount}`);
  
  return rows;
}