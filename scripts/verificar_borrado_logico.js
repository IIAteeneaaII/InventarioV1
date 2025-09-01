// Script para probar el borrado lógico de Modems
// Ejecutar con: node scripts/verificar_borrado_logico.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Verificando implementación de borrado lógico...');

  try {
    // 1. Obtener un modem existente para pruebas
    const modem = await prisma.modem.findFirst({
      where: { deletedAt: null },
      select: { id: true, sn: true, faseActual: true }
    });

    if (!modem) {
      console.log('No se encontraron modems disponibles para probar.');
      return;
    }

    console.log(`Modem seleccionado para prueba: ID ${modem.id}, SN: ${modem.sn}, Fase: ${modem.faseActual}`);

    // 2. Intentar eliminar el modem (debería activar el trigger de borrado lógico)
    console.log('Intentando eliminar el modem (borrado lógico)...');
    
    await prisma.modem.delete({
      where: { id: modem.id }
    });

    // 3. Verificar que el modem ahora tiene deletedAt establecido
    const modemDespues = await prisma.modem.findFirst({
      where: { 
        id: modem.id,
        deletedAt: { not: null }  // Buscamos específicamente con deletedAt establecido
      },
      select: { id: true, sn: true, faseActual: true, deletedAt: true, estadoActualId: true }
    });

    if (modemDespues) {
      console.log('✅ Borrado lógico implementado correctamente:');
      console.log(`- Modem ID: ${modemDespues.id}`);
      console.log(`- Serial: ${modemDespues.sn}`);
      console.log(`- Marcado como eliminado: ${modemDespues.deletedAt}`);
      console.log(`- Estado ID: ${modemDespues.estadoActualId}`);

      // 4. Verificar el log generado
      const log = await prisma.log.findFirst({
        where: {
          accion: 'BORRADO_LOGICO',
          entidad: 'MODEM',
          detalle: { contains: `${modem.id}` }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (log) {
        console.log('✅ Log de borrado lógico registrado correctamente:');
        console.log(`- Detalle: ${log.detalle}`);
        console.log(`- Creado: ${log.createdAt}`);
      } else {
        console.log('❌ No se encontró registro de log para el borrado lógico');
      }

      // 5. Restaurar el modem para dejarlo como estaba (opcional)
      console.log('Restaurando el modem a su estado original...');
      await prisma.$executeRaw`UPDATE "Modem" SET "deletedAt" = NULL WHERE id = ${modem.id}`;
      console.log('Modem restaurado correctamente.');
    } else {
      console.log('❌ El borrado lógico no funcionó correctamente. El modem no se encuentra con deletedAt establecido.');
      
      // Verificar si el modem fue eliminado físicamente
      const existeAun = await prisma.modem.findUnique({
        where: { id: modem.id }
      });
      
      if (!existeAun) {
        console.log('⚠️ ADVERTENCIA: El modem fue eliminado físicamente de la base de datos.');
      }
    }

  } catch (error) {
    console.error('Error durante la prueba:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
