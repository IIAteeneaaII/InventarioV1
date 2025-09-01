import { PrismaClient, Rol } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const skus = await prisma.catalogoSKU.findMany();
  if (!skus.length) {
    console.error("No hay SKUs creados. Inserta al menos uno en la tabla CatalogoSKU primero.");
    return;
  }

// Lista de todos los roles existentes en el sistema
  const todosLosRoles = ['UReg', 'UE', 'UTI', 'UC', 'ULL', 'UV', 'UR', 'UAI'];


  // Lista de vistas por SKU (el nombre base, sin carpeta)
  const vistasSKU = [
    { skuId: 1, nombreVista: '4KM37_69746' },
    { skuId: 2, nombreVista: '4KM36BLANCO_69360' },
    { skuId: 3, nombreVista: '4KM36AZUL_81809' },
    { skuId: 4, nombreVista: 'EXTENDERAP_72608' },
    { skuId: 5, nombreVista: 'EXTENDEHUAWEI_67278' },
    { skuId: 6, nombreVista: 'APEH7_80333' },
    { skuId: 7, nombreVista: '4KALEXA_72488' },
    { skuId: 8, nombreVista: 'V5SMALL_72676' },
    { skuId: 9, nombreVista: 'V5_66262' },
    { skuId: 10, nombreVista: 'FIBERHOME_69643' },
    { skuId: 11, nombreVista: 'ZTE_69644' },
    { skuId: 12, nombreVista: 'X6_76735' },
    { skuId: 13, nombreVista: 'FIBEREXTENDER_74487' },
    { skuId: 14, nombreVista: 'SOUNDBOX_69358' },
  ];

  for (const { skuId, nombreVista } of vistasSKU) {
    for (const rol of todosLosRoles) {
      // Determina la carpeta según el rol
      let carpeta = '';
      if (rol === 'UReg') {
        carpeta = 'formato_registro';
      } else if (rol === 'UE') {
        carpeta = 'formato_empaque';
      } else {
        carpeta = 'formato_general';
      }

      const vistaCompleta = `${carpeta}/${nombreVista}`;

      await prisma.vistaPorSKU.upsert({
        where: {
          skuId_rol: {
            skuId,
            rol,
          },
        },
        update: {
          vista: vistaCompleta,
        },
        create: {
          skuId,
          rol,
          vista: vistaCompleta,
        },
      });
    }
  }

  console.log('✅ Tabla VistaPorSKU poblada con todas las vistas por SKU y rol.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });