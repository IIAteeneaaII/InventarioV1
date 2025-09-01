// desactivar_optimizacion.js
// Script para desactivar los triggers de optimización en caso de problemas
const { PrismaClient } = require('@prisma/client');

async function desactivarOptimizacion() {
  const prisma = new PrismaClient();
  
  try {
    console.log('======================================');
    console.log('DESACTIVANDO TRIGGERS DE OPTIMIZACIÓN');
    console.log('======================================');
    
    // Eliminar los triggers y funciones
    const comandos = [
      'DROP TRIGGER IF EXISTS auto_limpiar_registros ON "Registro"',
      'DROP TRIGGER IF EXISTS filtrar_logs ON "Log"',
      'DROP FUNCTION IF EXISTS limpiar_registros_intermedios() CASCADE',
      'DROP FUNCTION IF EXISTS filtrar_logs_no_importantes() CASCADE'
    ];
    
    // Ejecutar cada comando por separado
    for (let i = 0; i < comandos.length; i++) {
      try {
        await prisma.$executeRawUnsafe(comandos[i]);
        console.log(`✅ Comando ${i+1}/${comandos.length} ejecutado correctamente`);
      } catch (error) {
        console.error(`❌ Error en comando ${i+1}/${comandos.length}:`);
        console.error(error.message);
      }
    }
    
    // Verificar que los triggers se han eliminado
    const result = await prisma.$queryRaw`
      SELECT 
        trigger_name
      FROM 
        information_schema.triggers 
      WHERE 
        trigger_name IN ('auto_limpiar_registros', 'filtrar_logs')
    `;
    
    if (result.length === 0) {
      console.log('\n✅ Los triggers se han eliminado correctamente.');
    } else {
      console.log(`\n⚠️ Hay ${result.length} trigger(s) que no se pudieron eliminar.`);
      console.table(result);
    }
    
    console.log('\n======================================');
    console.log('OPTIMIZACIÓN DESACTIVADA');
    console.log('======================================');
    
  } catch (error) {
    console.error('❌ Error al desactivar la optimización:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar la función
desactivarOptimizacion()
  .catch(error => {
    console.error('Error general:', error);
    process.exit(1);
  });
