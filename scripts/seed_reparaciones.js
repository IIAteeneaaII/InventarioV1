const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedCodigosReparacion() {
  console.log('🔧 Insertando códigos de reparación...');

  // Códigos de Reparación - Nivel 1 (N001-N016)
  const codigosReparacion = [
    // Nivel 1 - Reparaciones Básicas
    { codigo: 'N001', descripcion: 'Equipo OK (Sin reparación)', activo: true },
    { codigo: 'N002', descripcion: 'Limpieza general del equipo', activo: true },
    { codigo: 'N003', descripcion: 'Reemplazo de carcasa', activo: true },
    { codigo: 'N004', descripcion: 'Reemplazo de conectores externos', activo: true },
    { codigo: 'N005', descripcion: 'Reemplazo de botones', activo: true },
    { codigo: 'N006', descripcion: 'Reemplazo de antena', activo: true },
    { codigo: 'N007', descripcion: 'Reemplazo de fuente de poder', activo: true },
    { codigo: 'N008', descripcion: 'Reemplazo de LEDs indicadores', activo: true },
    { codigo: 'N009', descripcion: 'Reparación de ventilación', activo: true },
    { codigo: 'N010', descripcion: 'Reemplazo de etiquetas', activo: true },
    { codigo: 'N011', descripcion: 'Secado por humedad', activo: true },
    { codigo: 'N012', descripcion: 'Enfriamiento y ventilación adicional', activo: true },
    { codigo: 'N013', descripcion: 'Reemplazo de memoria', activo: true },
    { codigo: 'N014', descripcion: 'Actualización de firmware', activo: true },
    { codigo: 'N015', descripcion: 'Reconfiguración de software', activo: true },
    { codigo: 'N016', descripcion: 'Pruebas y calibración final', activo: true },
    
    // Nivel 2 - Soldadura y Componentes (SC1-SC3)
    { codigo: 'SC1', descripcion: 'Soldadura de componentes básicos', activo: true },
    { codigo: 'SC2', descripcion: 'Soldadura de conectores internos', activo: true },
    { codigo: 'SC3', descripcion: 'Reparación de circuito impreso', activo: true }
  ];

  for (const codigo of codigosReparacion) {
    await prisma.codigoReparacion.upsert({
      where: { codigo: codigo.codigo },
      update: {},
      create: codigo
    });
  }

  console.log(`✅ Insertados ${codigosReparacion.length} códigos de reparación`);
}

async function seedCodigosDano() {
  console.log('🔍 Insertando códigos de daño...');

  // Códigos de Daño (D000-D025, B001-B002)
  const codigosDano = [
    // Códigos D000-D025
    { codigo: 'D000', descripcion: 'Sin daño aparente', nivelRep: 'NA', scrap: 'NA', activo: true },
    { codigo: 'D001', descripcion: 'Daño en carcasa', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D002', descripcion: 'Daño en conectores externos', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D003', descripcion: 'Daño en pantalla/display', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D004', descripcion: 'Daño en botones', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D005', descripcion: 'Daño en antena', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D006', descripcion: 'Daño en fuente de poder', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D007', descripcion: 'Daño en LED indicadores', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D008', descripcion: 'Daño en ventilación', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D009', descripcion: 'Daño en etiquetas', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D010', descripcion: 'Daño por humedad', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D011', descripcion: 'Daño por sobrecalentamiento', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D012', descripcion: 'Daño en circuito impreso', nivelRep: 'NIVEL_2', scrap: 'SC3', activo: true },
    { codigo: 'D013', descripcion: 'Daño en capacitores', nivelRep: 'NIVEL_2', scrap: 'SC1', activo: true },
    { codigo: 'D014', descripcion: 'Daño en resistencias', nivelRep: 'NIVEL_2', scrap: 'SC1', activo: true },
    { codigo: 'D015', descripcion: 'Daño en transistores', nivelRep: 'NIVEL_2', scrap: 'SC1', activo: true },
    { codigo: 'D016', descripcion: 'Daño en conectores internos', nivelRep: 'NIVEL_2', scrap: 'SC2', activo: true },
    { codigo: 'D017', descripcion: 'Daño en memoria', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D018', descripcion: 'Daño en procesador', nivelRep: 'NIVEL_2', scrap: 'SC3', activo: true },
    { codigo: 'D019', descripcion: 'Daño en firmware/software', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D020', descripcion: 'Daño por cortocircuito', nivelRep: 'NIVEL_2', scrap: 'SC3', activo: true },
    { codigo: 'D021', descripcion: 'Daño por sobrevoltaje', nivelRep: 'NIVEL_2', scrap: 'SC3', activo: true },
    { codigo: 'D022', descripcion: 'Daño en soldaduras', nivelRep: 'NIVEL_2', scrap: 'SC1', activo: true },
    { codigo: 'D023', descripcion: 'Daño por corrosión', nivelRep: 'NIVEL_2', scrap: 'SC2', activo: true },
    { codigo: 'D024', descripcion: 'Daño en chasis metálico', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    { codigo: 'D025', descripcion: 'Otros daños no especificados', nivelRep: 'NIVEL_1', scrap: 'NA', activo: true },
    
    // Códigos de bloque
    { codigo: 'B001', descripcion: 'Bloque de daños múltiples', nivelRep: 'NIVEL_2', scrap: 'SC3', activo: true },
    { codigo: 'B002', descripcion: 'Bloque de daños críticos', nivelRep: 'NIVEL_2', scrap: 'SC3', activo: true }
  ];

  for (const codigo of codigosDano) {
    await prisma.codigoDano.upsert({
      where: { codigo: codigo.codigo },
      update: {},
      create: codigo
    });
  }

  console.log(`✅ Insertados ${codigosDano.length} códigos de daño`);
}

async function seedReparaciones() {
  try {
    console.log('🔧 Iniciando seed del sistema de reparaciones...');
    
    await seedCodigosReparacion();
    await seedCodigosDano();
    
    // Establecer relaciones entre códigos de daño y reparación
    console.log('🔗 Estableciendo relaciones entre códigos...');
    
    // Obtener códigos de reparación
    const codigosRep = await prisma.codigoReparacion.findMany();
    const codigosReparacionMap = {};
    codigosRep.forEach(c => { codigosReparacionMap[c.codigo] = c.id; });
    
    // Mapeo específico de códigos de daño a códigos de reparación
    const relaciones = [
      // Reparaciones de Nivel 1
      { dano: 'D001', reparacion: 'N003' }, // Daño carcasa -> Reemplazo carcasa
      { dano: 'D002', reparacion: 'N004' }, // Daño conectores -> Reemplazo conectores
      { dano: 'D004', reparacion: 'N005' }, // Daño botones -> Reemplazo botones  
      { dano: 'D005', reparacion: 'N006' }, // Daño antena -> Reemplazo antena
      { dano: 'D006', reparacion: 'N007' }, // Daño fuente -> Reemplazo fuente
      { dano: 'D007', reparacion: 'N008' }, // Daño LEDs -> Reemplazo LEDs
      { dano: 'D008', reparacion: 'N009' }, // Daño ventilación -> Reparación ventilación
      { dano: 'D009', reparacion: 'N010' }, // Daño etiquetas -> Reemplazo etiquetas
      { dano: 'D010', reparacion: 'N011' }, // Humedad -> Secado
      { dano: 'D011', reparacion: 'N012' }, // Sobrecalentamiento -> Enfriamiento
      { dano: 'D017', reparacion: 'N013' }, // Daño memoria -> Reemplazo memoria
      { dano: 'D019', reparacion: 'N014' }, // Firmware -> Actualización firmware
      { dano: 'D024', reparacion: 'N003' }, // Chasis -> Reemplazo carcasa
      { dano: 'D025', reparacion: 'N016' }, // Otros -> Calibración
      
      // Reparaciones de Nivel 2 (Soldadura)
      { dano: 'D012', reparacion: 'SC3' }, // Circuito impreso -> Reparación circuito
      { dano: 'D013', reparacion: 'SC1' }, // Capacitores -> Soldadura básica
      { dano: 'D014', reparacion: 'SC1' }, // Resistencias -> Soldadura básica
      { dano: 'D015', reparacion: 'SC1' }, // Transistores -> Soldadura básica
      { dano: 'D016', reparacion: 'SC2' }, // Conectores internos -> Soldadura conectores
      { dano: 'D018', reparacion: 'SC3' }, // Procesador -> Reparación circuito
      { dano: 'D020', reparacion: 'SC3' }, // Cortocircuito -> Reparación circuito
      { dano: 'D021', reparacion: 'SC3' }, // Sobrevoltaje -> Reparación circuito
      { dano: 'D022', reparacion: 'SC1' }, // Soldaduras -> Soldadura básica
      { dano: 'D023', reparacion: 'SC2' }, // Corrosión -> Soldadura conectores
      { dano: 'B001', reparacion: 'SC3' }, // Múltiples -> Reparación circuito
      { dano: 'B002', reparacion: 'SC3' }  // Críticos -> Reparación circuito
    ];
    
    // Aplicar las relaciones
    for (const rel of relaciones) {
      const codigoRepId = codigosReparacionMap[rel.reparacion];
      if (codigoRepId) {
        await prisma.codigoDano.updateMany({
          where: { codigo: rel.dano },
          data: { codigoRepId }
        });
      }
    }
    
    console.log(`✅ Establecidas ${relaciones.length} relaciones entre códigos`);
    console.log('✅ Seed del sistema de reparaciones completado');
    
  } catch (error) {
    console.error('❌ Error en seed de reparaciones:', error);
    throw error;
  }
}

// Solo ejecutar si es llamado directamente
if (require.main === module) {
  seedReparaciones()
    .catch(e => {
      console.error('❌ Error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedReparaciones };