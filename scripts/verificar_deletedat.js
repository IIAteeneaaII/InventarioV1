// Script para verificar la configuración del borrado lógico
// Ejecutar con: node scripts/verificar_deletedat.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Verificando columna deletedAt en tabla Modem...');

  try {
    // 1. Verificar estructura de la tabla Modem
    const query = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Modem' 
      ORDER BY ordinal_position;
    `;
    
    console.log('Estructura de la tabla Modem:');
    query.forEach(col => console.log(`- ${col.column_name}: ${col.data_type}`));

    // 2. Verificar si la columna deletedAt existe
    const deletedAtCol = query.find(col => col.column_name === 'deletedAt');
    if (deletedAtCol) {
      console.log('\n✅ La columna deletedAt existe en la tabla Modem');
    } else {
      console.log('\n❌ La columna deletedAt NO existe en la tabla Modem');
    }

    // 3. Probar borrado lógico
    console.log('\nProbando borrado lógico con un modem existente...');
    
    // Buscar un modem para probar
    const modem = await prisma.modem.findFirst({
      where: { deletedAt: null },
      select: { id: true, sn: true }
    });
    
    if (!modem) {
      console.log('No se encontraron modems disponibles para pruebas.');
      return;
    }
    
    console.log(`Modem encontrado para prueba: ID ${modem.id}, SN: ${modem.sn}`);
    
    // Intentar "eliminar" el modem (debería activar borrado lógico)
    try {
      await prisma.modem.delete({ where: { id: modem.id } });
      console.log('Se eliminó el modem (debería ser borrado lógico)');
      
      // Verificar si el modem todavía existe con deletedAt
      const modemDespues = await prisma.$queryRaw`
        SELECT id, sn, "deletedAt", "estadoActualId"
        FROM "Modem"
        WHERE id = ${modem.id}
      `;
      
      if (modemDespues.length > 0) {
        const m = modemDespues[0];
        console.log('✅ Borrado lógico confirmado:');
        console.log(`- Modem ID: ${m.id}`);
        console.log(`- SN: ${m.sn}`);
        console.log(`- deletedAt: ${m.deletedAt}`);
        console.log(`- estadoActualId: ${m.estadoActualId}`);
        
        // Restaurar el modem para futuras pruebas
        await prisma.$executeRaw`
          UPDATE "Modem"
          SET "deletedAt" = NULL
          WHERE id = ${modem.id}
        `;
        console.log('\nModem restaurado para futuras pruebas.');
      } else {
        console.log('❌ El modem fue eliminado físicamente, el borrado lógico no funcionó.');
      }
    } catch (error) {
      console.error('Error al intentar eliminar el modem:', error.message);
    }
  } catch (error) {
    console.error('Error durante la verificación:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
