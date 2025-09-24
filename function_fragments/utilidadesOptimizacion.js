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

// Caché para evitar consultas repetidas
const cacheEstados = new Map();
const cacheLotes = new Map();

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