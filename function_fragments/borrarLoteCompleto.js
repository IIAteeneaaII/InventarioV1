// Función para borrar lotes completos con todos sus registros
async function borrarLoteCompleto(prismaClient, inquirerModule) {
  try {
    const prisma = prismaClient;
    const inquirer = inquirerModule;
    
    console.log('\n🗑️ BORRAR LOTE COMPLETO CON REGISTROS 🗑️\n');
    
    console.log('🔌 Conectando a la base de datos...');
    await prisma.$connect();
    console.log('✅ Conexión establecida\n');

    // Obtener todos los lotes (solo activos - no eliminados)
    console.log('📚 Cargando lotes disponibles...');
    const lotes = await prisma.lote.findMany({
      where: {
        deletedAt: null  // Solo lotes activos
      },
      include: {
        _count: {
          select: {
            modems: true
          }
        },
        sku: {
          select: {
            nombre: true
          }
        },
        responsable: {
          select: {
            nombre: true
          }
        }
      },
      orderBy: [
        { createdAt: 'desc' },
        { numero: 'asc' }
      ]
    });

    if (lotes.length === 0) {
      console.log('❌ No se encontraron lotes en el sistema');
      return;
    }

    console.log(`✅ Se encontraron ${lotes.length} lotes en el sistema\n`);

    // Mostrar opciones de lotes
    const loteChoices = lotes.map(lote => ({
      name: `🏷️ ${lote.numero} | SKU: ${lote.sku?.nombre || 'N/A'} | Módems: ${lote._count.modems} | Responsable: ${lote.responsable?.nombre || 'N/A'} | Estado: ${lote.estado} | Fecha: ${lote.createdAt.toLocaleDateString()}`,
      value: lote.id,
      short: lote.numero
    }));

    const { loteId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'loteId',
        message: 'Selecciona el lote a borrar:',
        choices: [
          ...loteChoices,
          { name: '↩️ Volver al menú principal', value: 'volver' }
        ],
        pageSize: 15
      }
    ]);

    if (loteId === 'volver') {
      return;
    }

    // Obtener detalles del lote seleccionado
    const loteSeleccionado = lotes.find(l => l.id === loteId);
    
    console.log(`\n📋 Detalles del lote seleccionado:`);
    console.log(`   🏷️ Número: ${loteSeleccionado.numero}`);
    console.log(`   📦 SKU: ${loteSeleccionado.sku?.nombre || 'N/A'}`);
    console.log(`   📊 Total de módems: ${loteSeleccionado._count.modems}`);
    console.log(`   👤 Responsable: ${loteSeleccionado.responsable?.nombre || 'N/A'}`);
    console.log(`   📅 Fecha creación: ${loteSeleccionado.createdAt.toLocaleString()}`);
    console.log(`   🔄 Estado: ${loteSeleccionado.estado}`);
    console.log(`   📝 Tipo: ${loteSeleccionado.tipoLote}`);

    // Obtener estadísticas detalladas
    if (loteSeleccionado._count.modems > 0) {
      console.log('\n📊 Distribución de módems por fase:');
      const distribucionFases = await prisma.modem.groupBy({
        by: ['faseActual'],
        where: {
          loteId: loteId,
          deletedAt: null  // Solo módems activos
        },
        _count: true
      });

      distribucionFases.forEach(item => {
        console.log(`   - ${item.faseActual}: ${item._count} módems`);
      });

      // Contar registros asociados
      const totalRegistros = await prisma.registro.count({
        where: {
          loteId: loteId
        }
      });

      console.log(`\n📝 Total de registros asociados: ${totalRegistros}`);
    }

    // Confirmación de borrado
    console.log('\n⚠️ ADVERTENCIA: Esta acción es IRREVERSIBLE ⚠️');
    console.log('Se borrarán:');
    console.log(`   • ${loteSeleccionado._count.modems} módems del lote`);
    console.log('   • Todos los registros asociados a estos módems');
    console.log('   • El lote completo');

    const { confirmarBorrado } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmarBorrado',
        message: '¿Estás SEGURO de que deseas borrar este lote completo?',
        default: false
      }
    ]);

    if (!confirmarBorrado) {
      console.log('❌ Operación cancelada. No se ha borrado nada.');
      return;
    }

    // Confirmación adicional para lotes con muchos módems
    if (loteSeleccionado._count.modems > 100) {
      const { confirmarBorradoMasivo } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmarBorradoMasivo',
          message: `⚠️ El lote tiene ${loteSeleccionado._count.modems} módems. ¿Confirmas el borrado masivo?`,
          default: false
        }
      ]);

      if (!confirmarBorradoMasivo) {
        console.log('❌ Operación cancelada. No se ha borrado nada.');
        return;
      }
    }

    // Solicitar escribir el número del lote para confirmar
    const { confirmacionTexto } = await inquirer.prompt([
      {
        type: 'input',
        name: 'confirmacionTexto',
        message: `Para confirmar, escribe el número del lote "${loteSeleccionado.numero}":`,
        validate: (input) => {
          if (input.trim() === loteSeleccionado.numero) {
            return true;
          }
          return `Debes escribir exactamente: ${loteSeleccionado.numero}`;
        }
      }
    ]);

    // Proceder con el borrado
    console.log('\n🗑️ Iniciando proceso de borrado...');
    let modemsEliminados = 0;
    let registrosEliminados = 0;

    try {
      // Usar transacción para asegurar consistencia
      await prisma.$transaction(async (tx) => {
        // 1. Contar y eliminar todos los registros del lote
        const registrosCount = await tx.registro.count({
          where: { loteId: loteId }
        });

        if (registrosCount > 0) {
          await tx.registro.deleteMany({
            where: { loteId: loteId }
          });
          registrosEliminados = registrosCount;
          console.log(`   ✅ Eliminados ${registrosEliminados} registros`);
        }

        // 2. Primero limpiar referencias a loteSalida
        await tx.modem.updateMany({
          where: { loteSalidaId: loteId },
          data: { loteSalidaId: null }
        });

        // 3. En lugar de eliminar módems físicamente, usar borrado lógico
        const modemsCount = await tx.modem.count({
          where: { loteId: loteId }
        });

        if (modemsCount > 0) {
          // Usar borrado lógico para evitar problemas con triggers
          await tx.modem.updateMany({
            where: { loteId: loteId },
            data: { 
              deletedAt: new Date(),
              updatedAt: new Date()
            }
          });
          modemsEliminados = modemsCount;
          console.log(`   ✅ Marcados como eliminados ${modemsEliminados} módems (borrado lógico)`);
        }

        // 4. Marcar el lote como eliminado (borrado lógico)
        await tx.lote.update({
          where: { id: loteId },
          data: {
            deletedAt: new Date(),
            updatedAt: new Date()
          }
        });
        
        console.log(`   ✅ Marcado como eliminado lote: ${loteSeleccionado.numero} (borrado lógico)`);
      }, {
        timeout: 300000, // 5 minutos timeout para lotes grandes
        maxWait: 60000   // 1 minuto de espera máxima
      });

      console.log('\n🎉 ¡Borrado completado exitosamente!');
      console.log('📊 Resumen:');
      console.log(`   🗑️ Lote eliminado: ${loteSeleccionado.numero}`);
      console.log(`   📦 Módems eliminados: ${modemsEliminados}`);
      console.log(`   📝 Registros eliminados: ${registrosEliminados}`);

      // Mostrar estadísticas del sistema después del borrado
      const resumenSistema = await prisma.lote.count();
      const totalModems = await prisma.modem.count();
      
      console.log('\n📊 Estado actual del sistema:');
      console.log(`   🏷️ Total de lotes: ${resumenSistema}`);
      console.log(`   📦 Total de módems: ${totalModems}`);

    } catch (error) {
      console.error('❌ Error durante el borrado:', error);
      console.error('⚠️ La transacción fue revertida. No se eliminó nada.');
      throw error;
    }

  } catch (error) {
    console.error('❌ Error en el proceso de borrado:', error);
  }
}

module.exports = {
  borrarLoteCompleto
};