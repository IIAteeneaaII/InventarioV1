// aplicar_optimizacion.js
// Script para aplicar manualmente los triggers de optimización de escalabilidad
// Versión: 2.0 (2025-08-18)
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function aplicarOptimizacion() {
  const prisma = new PrismaClient();
  
  try {
    console.log('======================================');
    console.log('APLICANDO TRIGGERS DE OPTIMIZACIÓN');
    console.log('======================================');
    
    // Definir comandos SQL individuales para mejor manejo de errores
    const commands = [
      // Primero eliminamos cualquier trigger/función existente
      'DROP TRIGGER IF EXISTS auto_limpiar_registros ON "Registro"',
      'DROP TRIGGER IF EXISTS filtrar_logs ON "Log"',
      'DROP FUNCTION IF EXISTS limpiar_registros_intermedios() CASCADE',
      'DROP FUNCTION IF EXISTS filtrar_logs_no_importantes() CASCADE',
      
      // Crear función para limpiar registros intermedios
      `CREATE FUNCTION limpiar_registros_intermedios() RETURNS TRIGGER AS 
      $function$
      BEGIN
        -- Si el registro insertado es de fase EMPAQUE
        IF NEW."fase" = 'EMPAQUE' THEN
          -- Eliminar registros intermedios, preservando REGISTRO y EMPAQUE
          DELETE FROM "Registro" 
          WHERE "modemId" = NEW."modemId" 
          AND "fase" IN ('TEST_INICIAL', 'ENSAMBLE', 'RETEST')
          AND "id" != NEW."id";
          
          -- Registrar la limpieza
          INSERT INTO "Log" (
              "accion", "entidad", "detalle", "userId", "createdAt"
          )
          VALUES (
              'LIMPIEZA_REGISTROS_INTERMEDIOS',
              'Modem',
              'Limpieza automática de registros intermedios para modemId: ' || NEW."modemId",
              NEW."userId",
              NOW()
          );
        END IF;
        
        RETURN NEW;
      END;
      $function$ LANGUAGE plpgsql`,
      
      // Crear trigger para limpiar registros
      `CREATE TRIGGER auto_limpiar_registros
      AFTER INSERT ON "Registro"
      FOR EACH ROW
      EXECUTE FUNCTION limpiar_registros_intermedios()`,
      
      // Crear función para filtrar logs no importantes
      `CREATE FUNCTION filtrar_logs_no_importantes() RETURNS TRIGGER AS 
      $function$
      BEGIN
        -- Si es un log de acciones que no son importantes, cancelar la inserción
        IF NEW."accion" IN (
            'CONSULTA', 
            'VISUALIZACIÓN', 
            'NAVEGACIÓN',
            'DEBUG_FASE',
            'TRANSICION_FASE'
        ) THEN
            RETURN NULL; -- No insertar el log
        END IF;
        
        -- Para otros logs, permitir la inserción
        RETURN NEW;
      END;
      $function$ LANGUAGE plpgsql`,
      
      // Crear trigger para filtrar logs
      `CREATE TRIGGER filtrar_logs
      BEFORE INSERT ON "Log"
      FOR EACH ROW
      EXECUTE FUNCTION filtrar_logs_no_importantes()`,
      
      // Añadir comentarios a los triggers
      `COMMENT ON TRIGGER auto_limpiar_registros ON "Registro" IS 'Trigger para eliminar registros intermedios cuando un módem llega a EMPAQUE'`,
      `COMMENT ON TRIGGER filtrar_logs ON "Log" IS 'Trigger para filtrar logs de baja importancia'`
    ];
    
    // Aplicar cada comando por separado
    console.log(`Aplicando ${commands.length} comandos SQL...`);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      try {
        await prisma.$executeRawUnsafe(command);
        console.log(`✅ Comando ${i+1}/${commands.length} aplicado correctamente`);
      } catch (cmdError) {
        console.error(`❌ Error en comando ${i+1}/${commands.length}:`);
        console.error(cmdError.message || cmdError);
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
    
    const ratio = registrosCount / (modemsCount || 1);
    
    console.log(`- Módems: ${modemsCount}`);
    console.log(`- Registros: ${registrosCount}`);
    console.log(`- Logs: ${logsCount}`);
    console.log(`- Promedio de registros por módem: ${ratio.toFixed(2)}`);
    
    console.log('\n======================================');
    console.log('OPTIMIZACIÓN COMPLETADA');
    console.log('======================================');
  } catch (error) {
    console.error('Error durante la aplicación de la optimización:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar la función principal
aplicarOptimizacion();
