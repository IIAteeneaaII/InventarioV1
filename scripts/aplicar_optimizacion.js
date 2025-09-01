// aplicar_optimizacion.js
// Script para aplicar manualmente los triggers de optimización de escalabilidad
// Versión: 1.1 (2025-08-18)
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Función para dividir el SQL en comandos individuales
function splitSqlCommands(sql) {
  // Dividir por punto y coma seguido de nueva línea
  const commands = [];
  let currentCommand = '';
  let inFunction = false;
  
  // Dividir el SQL línea por línea
  const lines = sql.split('\n');
  
  for (const line of lines) {
    // Ignorar comentarios y líneas vacías
    if (line.trim().startsWith('--') || line.trim() === '') {
      continue;
    }
    
    // Detectar inicio de función
    if (line.includes('FUNCTION') && line.includes('$$')) {
      inFunction = true;
    }
    
    // Detectar final de función
    if (line.includes('$$ LANGUAGE') && inFunction) {
      inFunction = false;
      currentCommand += line + '\n';
      commands.push(currentCommand.trim());
      currentCommand = '';
      continue;
    }
    
    // Detectar comandos completos (si no estamos dentro de una función)
    if (line.trim().endsWith(';') && !inFunction) {
      currentCommand += line + '\n';
      commands.push(currentCommand.trim());
      currentCommand = '';
    } else {
      currentCommand += line + '\n';
    }
  }
  
  // Filtrar comandos vacíos
  return commands.filter(cmd => cmd.trim() !== '');
}

async function aplicarOptimizacion() {
  const prisma = new PrismaClient();
  
  try {
    console.log('======================================');
    console.log('APLICANDO TRIGGERS DE OPTIMIZACIÓN');
    console.log('======================================');
    
    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'optimizacion_v2.sql');
    console.log(`Leyendo archivo: ${sqlPath}`);
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Dividir el SQL en comandos individuales
    const commands = splitSqlCommands(sqlContent);
    
    if (commands.length === 0) {
      console.log('⚠️ No se encontraron comandos SQL en el archivo.');
      console.log('Usando comandos predefinidos como respaldo...');
      
      // Comandos predefinidos como respaldo
      commands.push(
        // Función para limpiar registros intermedios
        `CREATE OR REPLACE FUNCTION limpiar_registros_intermedios()
RETURNS TRIGGER AS $$
DECLARE
    v_modem_id INTEGER;
BEGIN
    -- Si el registro insertado es de fase EMPAQUE
    IF TG_OP = 'INSERT' AND NEW."fase" = 'EMPAQUE' THEN
        -- Eliminar SOLO registros intermedios, preservando REGISTRO y EMPAQUE
        DELETE FROM "Registro" 
        WHERE "modemId" = NEW."modemId" 
        AND "fase" IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST')
        AND "id" != NEW."id";
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql`,

        // Drop trigger si existe
        `DROP TRIGGER IF EXISTS auto_limpiar_registros ON "Registro"`,
        
        // Crear trigger para limpiar registros
        `CREATE TRIGGER auto_limpiar_registros
AFTER INSERT ON "Registro"
FOR EACH ROW
EXECUTE FUNCTION limpiar_registros_intermedios()`,

        // Función para filtrar logs
        `CREATE OR REPLACE FUNCTION filtrar_logs_no_importantes()
RETURNS TRIGGER AS $$
BEGIN
    -- Si es un log de acciones que no son importantes, cancelar la inserción
    IF TG_OP = 'INSERT' AND NEW."accion" IN ('CONSULTA', 'VISUALIZACIÓN', 'NAVEGACIÓN', 'DEBUG_FASE', 'TRANSICION_FASE') THEN
        RETURN NULL; -- No insertar el log
    END IF;
    
    -- Para otros logs, permitir la inserción
    RETURN NEW;
END;
$$ LANGUAGE plpgsql`,

        // Drop trigger si existe
        `DROP TRIGGER IF EXISTS filtrar_logs ON "Log"`,
        
        // Crear trigger para filtrar logs
        `CREATE TRIGGER filtrar_logs
BEFORE INSERT ON "Log"
FOR EACH ROW
EXECUTE FUNCTION filtrar_logs_no_importantes()`
      );
    }
    
    // Aplicar cada comando por separado
    console.log(`Aplicando ${commands.length} comandos SQL...`);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      try {
        await prisma.$executeRawUnsafe(command);
        console.log(`✅ Comando ${i+1}/${commands.length} aplicado correctamente`);
      } catch (cmdError) {
        console.error(`❌ Error en comando ${i+1}/${commands.length}:`);
        console.error(cmdError);
        // Continuar con el siguiente comando
      }
    }
    
    console.log('\nEfecto en la base de datos:');
    
    // Contar registros
    const [modemsCount, registrosCount, logsCount] = await Promise.all([
      prisma.modem.count(),
      prisma.registro.count(),
      prisma.log.count()
    ]);
    
    console.log(`- Módems: ${modemsCount}`);
    console.log(`- Registros: ${registrosCount}`);
    console.log(`- Logs: ${logsCount}`);
    
    if (modemsCount > 0) {
      console.log(`- Promedio de registros por módem: ${(registrosCount / modemsCount).toFixed(2)}`);
    }
    
    console.log('\n======================================');
    console.log('OPTIMIZACIÓN COMPLETADA');
    console.log('======================================');
    
  } catch (error) {
    console.error('❌ Error al aplicar los triggers:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar la función
aplicarOptimizacion()
  .catch(error => {
    console.error('Error general:', error);
    process.exit(1);
  });
