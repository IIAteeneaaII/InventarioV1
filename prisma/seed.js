const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();


async function main() {
  
  // Seed de CatalogoSKU
  const skuData = [
    { id: 3, nombre: "4KM36A", skuItem: "81809" },
    { id: 1, nombre: "4KM37", skuItem: "69746" },
    { id: 2, nombre: "4KM36B", skuItem: "69360" },
    { id: 4, nombre: "EXTENDERAP", skuItem: "72608" },
    { id: 5, nombre: "EXTENDERHUAWEI", skuItem: "67278" },
    { id: 6, nombre: "APEH7", skuItem: "80333" },
    { id: 7, nombre: "4KALEXA", skuItem: "73488" },
    { id: 8, nombre: "V5SMALL", skuItem: "72676" },
    { id: 9, nombre: "V5", skuItem: "66262" },
    { id: 10, nombre: "FIBERHOME", skuItem: "69643" },
    { id: 11, nombre: "ZTE", skuItem: "69644" },
    { id: 12, nombre: "X6", skuItem: "76735" },
    { id: 13, nombre: "FIBERHOMEEXTENDED", skuItem: "74497" },
    { id: 14, nombre: "SOUNDBOX", skuItem: "69358" },
  ];

  for (const item of skuData) {
    await prisma.catalogoSKU.upsert({
      where: { nombre: item.nombre },
      update: { skuItem: item.skuItem },
      create: {
        id: item.id,
        nombre: item.nombre,
        skuItem: item.skuItem
      }
    });
  }
  console.log('CatalogoSKU seed completado');

  // Seed de Estados/Fases principales (usa solo nombres en mayúsculas y subrayado)
  const estados = [
    { id: 0, nombre: "REGISTRO", codigoInterno: "REG" },
    { id: 1, nombre: "TEST_INICIAL", codigoInterno: "TI" },
    { id: 2, nombre: "ENSAMBLE", codigoInterno: "ENS" }, // Nuevo estado
    { id: 4, nombre: "RETEST", codigoInterno: "RET" }, // Se mantiene ID para consistencia
    { id: 5, nombre: "EMPAQUE", codigoInterno: "EMP" },
    { id: 6, nombre: "SCRAP", codigoInterno: "SCR" },
    { id: 7, nombre: "REPARACION", codigoInterno: "REP" },
  ];

  for (const estado of estados) {
    await prisma.estado.upsert({
      where: { id: estado.id },
      update: {},
      create: estado,
    });
  }
  console.log('Estados seed completado');

  // Obtener todos los estados y crear un mapa nombre -> id
  const estadosDb = await prisma.estado.findMany();
  const estadoMap = {};
  estadosDb.forEach(e => estadoMap[e.nombre] = e.id);

  // Seed de Transiciones permitidas usando los IDs de estado
  const transiciones = [];
  let idTrans = 1;
  // Flujo principal actualizado
  const flow = ["REGISTRO", "TEST_INICIAL", "ENSAMBLE", "RETEST", "EMPAQUE"];
  // Define los roles permitidos para cada transición
  const rolesPorTransicion = {
    "REGISTRO->TEST_INICIAL": "UA", // Almacén solamente
    "TEST_INICIAL->ENSAMBLE": "UTI,UA", // Nuevo flujo
    "ENSAMBLE->RETEST": "UEN,UA", // UEN es responsable de Ensamble
    "RETEST->EMPAQUE": "UR,UA",
    "EMPAQUE->SCRAP": "UE,UA",
    // Scrap y Reparacion pueden tener reglas propias
  };

  for (let i = 0; i < flow.length - 1; i++) {
    const from = flow[i];
    const to = flow[i + 1];
    const key = `${from}->${to}`;
    const roles = rolesPorTransicion[key] || "UA"; // Por defecto solo admin almacén

    // Completar
    transiciones.push({
      id: idTrans++,
      estadoDesdeId: estadoMap[from],
      estadoHaciaId: estadoMap[to],
      nombreEvento: `Completar ${from}`,
      rolesPermitidos: roles
    });

    // Scrap (permitir mandar a scrap desde cualquier estado excepto Empaque)
    if (from !== "EMPAQUE") {
      let rolesScrap = "UA,UTI,UR,UE,UReg"; // Se quita UV, UC, ULL, UEN
      if (from === "REGISTRO") rolesScrap = "UA";
      transiciones.push({
        id: idTrans++,
        estadoDesdeId: estadoMap[from],
        estadoHaciaId: estadoMap["SCRAP"],
        nombreEvento: `Rechazar ${from}`,
        rolesPermitidos: rolesScrap
      });
    }
    // Reparar (excepto desde Empaque)
    if (from !== "EMPAQUE") {
      transiciones.push({
        id: idTrans++,
        estadoDesdeId: estadoMap[from],
        estadoHaciaId: estadoMap["REPARACION"],
        nombreEvento: `Reparar ${from}`,
        rolesPermitidos: "UR,UTI,UA"
      });
    }
    // Reintegrar (excepto desde REGISTRO)
    if (from !== "REGISTRO") {
      transiciones.push({
        id: idTrans++,
        estadoDesdeId: estadoMap[from],
        estadoHaciaId: estadoMap[from],
        nombreEvento: `Reintegrar ${from}`,
        rolesPermitidos: "UR,UTI,UA"
      });
    }
  }
  // Transiciones desde Reparacion: regresar solo al estado de donde vino y a Scrap
  for (let i = 1; i < flow.length - 1; i++) {
    const from = flow[i];
    transiciones.push({
      id: idTrans++,
      estadoDesdeId: estadoMap["REPARACION"],
      estadoHaciaId: estadoMap[from],
      nombreEvento: `Regresar a ${from} desde Reparacion`,
      rolesPermitidos: "UR,UTI,UA"
    });
  }
  // Reparacion -> Scrap
  transiciones.push({
    id: idTrans++,
    estadoDesdeId: estadoMap["REPARACION"],
    estadoHaciaId: estadoMap["SCRAP"],
    nombreEvento: `Rechazar desde Reparacion`,
    rolesPermitidos: "UA"
  });

  // Limpia la tabla antes de insertar (opcional, recomendado)
  await prisma.transicionEstado.deleteMany({});

  for (const trans of transiciones) {
    if (trans.estadoDesdeId === undefined || trans.estadoHaciaId === undefined) {
      console.error('Transición con estado undefined:', trans);
      continue;
    }
    await prisma.transicionEstado.upsert({
      where: { estadoDesdeId_nombreEvento: { estadoDesdeId: trans.estadoDesdeId, nombreEvento: trans.nombreEvento } },
      update: {},
      create: {
        nombreEvento: trans.nombreEvento,
        rolesPermitidos: trans.rolesPermitidos,
        estadoDesde: { connect: { id: trans.estadoDesdeId } },
        estadoHacia: { connect: { id: trans.estadoHaciaId } },
      },
    });
  }
  console.log('Transiciones seed completado');

  // Crea o reemplaza la función obtener_transiciones_disponibles en la base de datos
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION obtener_transiciones_disponibles(
        p_modem_id INTEGER,
        p_user_id INTEGER
    )
    RETURNS TABLE(nombre_evento TEXT) AS $$
    DECLARE
        v_estado_actual_id INTEGER;
        v_rol_usuario TEXT;
    BEGIN
        -- Obtener el estado actual del módem
        SELECT m."estadoActualId" INTO v_estado_actual_id
        FROM "Modem" m WHERE m.id = p_modem_id;

        -- Obtener el rol del usuario
        SELECT u.rol::TEXT INTO v_rol_usuario
        FROM "User" u WHERE u.id = p_user_id;

        -- Devolver las transiciones disponibles según el estado y rol
        RETURN QUERY
        SELECT te."nombreEvento"
        FROM "TransicionEstado" te
        WHERE te."estadoDesdeId" = v_estado_actual_id
          AND (
            te."rolesPermitidos" IS NULL
            OR te."rolesPermitidos" ~ ('(^|,)' || v_rol_usuario || '(,|$)')
            OR v_rol_usuario = 'UA'
          );
    END;
    $$ LANGUAGE plpgsql;
  `);

}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });