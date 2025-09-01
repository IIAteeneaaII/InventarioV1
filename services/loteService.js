const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.crearLote = async (skuId, responsableId) => {
  // Genera un número de lote único (puedes mejorar la lógica)
  const numero = `L${Date.now()}-${skuId}`;
  return prisma.lote.create({
    data: {
      numero,
      skuId,
      responsableId,
      estado: 'EN_PROCESO'
    }
  });
};

exports.asignarModemALote = async (loteId, sn, skuId, responsableId) => {
  // Busca el estado REGISTRO
  const estado = await prisma.estado.findFirst({ where: { nombre: 'REGISTRO' } });
  return prisma.modem.create({
    data: {
      sn,
      skuId,
      loteId,
      responsableId,
      estadoActualId: estado.id,
      faseActual: 'REGISTRO'
    }
  });
};

exports.terminarRegistroLote = async (loteId) => {
  return prisma.lote.update({
    where: { id: loteId },
    data: { estado: 'COMPLETADO' }
  });
};

exports.lotesParaEmpaque = async () => {
  return prisma.lote.findMany({
    where: { estado: 'COMPLETADO' },
    include: { modems: true, sku: true }
  });
};

exports.registrarEmpaque = async (loteId, sn) => {
  // Busca el estado EMPAQUE
  const estado = await prisma.estado.findFirst({ where: { nombre: 'EMPAQUE' } });
  return prisma.modem.updateMany({
    where: { loteId, sn },
    data: {
      estadoActualId: estado.id,
      faseActual: 'EMPAQUE'
    }
  });
};

exports.pausarOImprimirLote = async (loteId, accion) => {
  // accion debe ser 'PAUSADO' o 'COMPLETADO'
  return prisma.lote.update({
    where: { id: loteId },
    data: { estado: accion }
  });
};