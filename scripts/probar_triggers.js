// probar_triggers.js
// Script para probar los triggers de optimización
const { PrismaClient, FaseProceso, EstadoRegistro } = require('@prisma/client');
const prisma = new PrismaClient();

async function probarTriggers() {
  try {
    console.log('======================================');
    console.log('PRUEBA DE TRIGGERS DE OPTIMIZACIÓN');
    console.log('======================================');
    
    // 1. Crear un registro de Log que debería ser filtrado
    console.log('\n1. Intentando crear un log que debería ser filtrado:');
    let logCreado = await prisma.log.create({
      data: {
        accion: 'CONSULTA', // Debería ser filtrado
        entidad: 'TEST',
        detalle: 'Este log debería ser filtrado por el trigger',
        userId: 1 // Asumimos que existe un usuario con ID 1
      }
    });
    
    console.log('Resultado:', logCreado ? 'Log creado (trigger no funcionó)' : 'Log no creado (trigger funcionó)');
    
    // 2. Crear un registro de Log que NO debería ser filtrado
    console.log('\n2. Intentando crear un log que NO debería ser filtrado:');
    logCreado = await prisma.log.create({
      data: {
        accion: 'CREAR_LOTE', // No debería ser filtrado
        entidad: 'TEST',
        detalle: 'Este log NO debería ser filtrado por el trigger',
        userId: 1 // Asumimos que existe un usuario con ID 1
      }
    });
    
    console.log('Resultado:', logCreado ? 'Log creado (trigger funcionó)' : 'Log no creado (trigger no funcionó)');
    
    // 3. Simular registro en fase EMPAQUE para limpiar registros intermedios
    console.log('\n3. Simulando registro en fase EMPAQUE para probar limpieza de registros intermedios:');
    
    // 3.1 Crear un modem de prueba si no existe
    let modem = await prisma.modem.findFirst();
    
    if (modem) {
      console.log(`Usando modem existente con ID ${modem.id}`);
      
      // 3.2 Crear registros intermedios
      console.log('Creando registros intermedios...');
      
      // Crear registro intermedio en fase TEST_INICIAL
      await prisma.registro.create({
        data: {
          sn: modem.sn,
          fase: FaseProceso.TEST_INICIAL,
          estado: EstadoRegistro.SN_OK,
          userId: 1,
          loteId: modem.loteId,
          modemId: modem.id
        }
      });
      
      // Crear registro intermedio en fase ENSAMBLE
      await prisma.registro.create({
        data: {
          sn: modem.sn,
          fase: FaseProceso.ENSAMBLE,
          estado: EstadoRegistro.SN_OK,
          userId: 1,
          loteId: modem.loteId,
          modemId: modem.id
        }
      });
      
      // Contar registros antes
      const registrosAntes = await prisma.registro.count({
        where: { modemId: modem.id }
      });
      
      console.log(`Registros antes: ${registrosAntes}`);
      
      // 3.3 Crear registro en fase EMPAQUE (debería activar el trigger)
      console.log('Creando registro en fase EMPAQUE (debería activar el trigger)...');
      await prisma.registro.create({
        data: {
          sn: modem.sn,
          fase: FaseProceso.EMPAQUE,
          estado: EstadoRegistro.SN_OK,
          userId: 1,
          loteId: modem.loteId,
          modemId: modem.id
        }
      });
      
      // 3.4 Contar registros después
      const registrosDespues = await prisma.registro.count({
        where: { modemId: modem.id }
      });
      
      console.log(`Registros después: ${registrosDespues}`);
      console.log(`Registros eliminados: ${registrosAntes - registrosDespues + 1}`); // +1 porque agregamos uno nuevo
      
      if (registrosAntes > registrosDespues) {
        console.log('✅ Trigger de limpieza funcionó correctamente');
      } else {
        console.log('❌ Trigger de limpieza no funcionó');
      }
    } else {
      console.log('No se encontraron modems para probar');
    }
    
    console.log('\n======================================');
    console.log('PRUEBA DE TRIGGERS COMPLETADA');
    console.log('======================================');
    
  } catch (error) {
    console.error('Error al probar triggers:', error);
  } finally {
    await prisma.$disconnect();
  }
}

probarTriggers().catch(console.error);
