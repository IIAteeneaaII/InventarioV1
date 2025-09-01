import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed SIMOD (SKU + lote de prueba)...');

  // 1. Crear SKU base
  const sku = await prisma.catalogoSKU.upsert({
    where: { nombre: 'Fiberhome X-10' },
    update: {},
    create: {
      id: 15,
      nombre: 'Fiberhome X-10',
      descripcion: 'SKU de prueba para importación'
    }
  });
  console.log(`✅ SKU Fiberhome X-10 creado o existente (ID: ${sku.id})`);

  // 2. Obtener responsable (admin) para asignar lote
  const responsable = await prisma.user.findUnique({
    where: { userName: 'admin' }
  });

  if (!responsable) {
    console.log('❌ No se encontró el usuario admin. No se creó el lote de prueba.');
  } else {
    // 3. Crear lote de prueba
    const lote = await prisma.lote.upsert({
      where: { numero: 'LOTE-PRUEBA-001' },
      update: {},
      create: {
        numero: 'LOTE-PRUEBA-001',
        skuId: sku.id,
        estado: 'EN_PROCESO',
        prioridad: 5,
        responsableId: responsable.id
      }
    });
    console.log(`✅ Lote de prueba creado o existente (ID: ${lote.id})`);
  }

  console.log('🎉 Seed completado exitosamente (SKU + lote de prueba).');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
