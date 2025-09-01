const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const logService = require('../services/logService');

/**
 * Renderiza la vista del inventario de cosméticos.
 */
exports.renderInventario = async (req, res) => {
  try {
    // Primero obtenemos todos los SKUs del catálogo
    const todosLosSKUs = await prisma.catalogoSKU.findMany({
      orderBy: {
        nombre: 'asc'
      }
    });
    
    console.log('Total de SKUs en catálogo:', todosLosSKUs.length);
    
    // Luego obtenemos los registros de inventario existentes
    const inventario = await prisma.inventarioCosmetico.findMany({
      include: {
        sku: true,
      },
      orderBy: [
        { sku: { nombre: 'asc' } },
        { tipoInsumo: 'asc' }
      ]
    });

    console.log('Datos de inventario cargados:', inventario.length, 'registros');
    
    // Crear un objeto con todos los SKUs para la vista
    const inventarioCompleto = {};
    
    // Primero inicializamos todos los SKUs con cantidades en cero
    todosLosSKUs.forEach(sku => {
      inventarioCompleto[sku.nombre] = {
        skuId: sku.id,
        nombre: sku.nombre,
        skuItem: sku.skuItem,
        CAPUCHONES: 0,
        BASES: 0,
        TAPAS: 0,
      };
    });
    
    // Luego actualizamos las cantidades de los que tienen registros
    inventario.forEach(item => {
      if (inventarioCompleto[item.sku.nombre]) {
        inventarioCompleto[item.sku.nombre][item.tipoInsumo] = item.cantidad;
      }
    });

    res.render('cosmetica_inventario', {
      user: req.user,
      inventario: inventarioCompleto,
      page_name: 'cosmetica'
    });
  } catch (error) {
    console.error('Error al renderizar inventario de cosmética:', error);
    res.status(500).render('error', { message: 'Error al cargar el inventario' });
  }
};

/**
 * Registra un movimiento (entrada/salida) de insumos.
 */
exports.registrarMovimiento = async (req, res) => {
  const { skuId, tipoInsumo, tipoMovimiento, cantidad } = req.body;
  const userId = req.user.id;

  if (!skuId || !tipoInsumo || !tipoMovimiento || !cantidad) {
    return res.status(400).json({ success: false, message: 'Todos los campos son requeridos.' });
  }

  const cantidadNum = parseInt(cantidad, 10);
  if (isNaN(cantidadNum) || cantidadNum <= 0) {
    return res.status(400).json({ success: false, message: 'La cantidad debe ser un número positivo.' });
  }

  try {
    const inventarioItem = await prisma.inventarioCosmetico.findUnique({
      where: { skuId_tipoInsumo: { skuId: parseInt(skuId), tipoInsumo } },
      include: { sku: true }
    });

    // Si no existe el registro para este SKU y tipo de insumo, verificar que el SKU existe
    if (!inventarioItem) {
      const skuExists = await prisma.catalogoSKU.findUnique({
        where: { id: parseInt(skuId) }
      });
      
      if (!skuExists) {
        return res.status(404).json({ success: false, message: 'El SKU seleccionado no existe.' });
      }
      
      if (tipoMovimiento === 'SALIDA') {
        return res.status(400).json({ success: false, message: `No hay stock de ${tipoInsumo} para este SKU.` });
      }
      
      // Si es ENTRADA y el SKU existe, crear nuevo registro en inventario
      const [nuevoRegistro, nuevoInventario] = await prisma.$transaction([
        prisma.registroInsumo.create({
          data: { tipoMovimiento, tipoInsumo, cantidad: cantidadNum, skuId: parseInt(skuId), responsableId: userId }
        }),
        prisma.inventarioCosmetico.create({
          data: { skuId: parseInt(skuId), tipoInsumo, cantidad: cantidadNum }
        })
      ]);
      
      await logService.registrarAccion({
        accion: `NUEVO_INSUMO_COSMETICO`,
        entidad: 'InventarioCosmetico',
        detalle: `SKU ID: ${skuId}, Insumo: ${tipoInsumo}, Cantidad inicial: ${cantidadNum}`,
        userId
      });
      
      return res.status(201).json({ 
        success: true, 
        message: 'Nuevo insumo registrado exitosamente.', 
        data: nuevoInventario 
      });
    }

    // Verificar stock para SALIDA
    if (tipoMovimiento === 'SALIDA' && inventarioItem.cantidad < cantidadNum) {
      return res.status(400).json({ success: false, message: `Stock insuficiente. Stock actual de ${tipoInsumo} para ${inventarioItem.sku.nombre}: ${inventarioItem.cantidad}.` });
    }

    const updateOperation = tipoMovimiento === 'ENTRADA' ? { increment: cantidadNum } : { decrement: cantidadNum };

    const [, inventarioActualizado] = await prisma.$transaction([
      prisma.registroInsumo.create({
        data: { tipoMovimiento, tipoInsumo, cantidad: cantidadNum, skuId: parseInt(skuId), responsableId: userId }
      }),
      prisma.inventarioCosmetico.update({
        where: { skuId_tipoInsumo: { skuId: parseInt(skuId), tipoInsumo } },
        data: { cantidad: updateOperation }
      })
    ]);

    await logService.registrarAccion({
      accion: `MOVIMIENTO_COSMETICO_${tipoMovimiento}`,
      entidad: 'InventarioCosmetico',
      detalle: `SKU ID: ${skuId}, Insumo: ${tipoInsumo}, Cantidad: ${cantidadNum}`,
      userId
    });

    res.status(200).json({ success: true, message: 'Movimiento registrado exitosamente.', data: inventarioActualizado });
  } catch (error) {
    console.error('Error al registrar movimiento de cosmética:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
};

/**
 * Renderiza la vista del inventario de cosméticos en modo de solo lectura para administradores.
 */
exports.renderInventarioSoloLectura = async (req, res) => {
  try {
    // Primero obtenemos todos los SKUs del catálogo
    const todosLosSKUs = await prisma.catalogoSKU.findMany({
      orderBy: {
        nombre: 'asc'
      }
    });
    
    console.log('Total de SKUs en catálogo (vista admin):', todosLosSKUs.length);
    
    // Luego obtenemos los registros de inventario existentes
    const inventario = await prisma.inventarioCosmetico.findMany({
      include: {
        sku: true,
      },
      orderBy: [
        { sku: { nombre: 'asc' } },
        { tipoInsumo: 'asc' }
      ]
    });

    console.log('Datos de inventario cargados (vista admin):', inventario.length, 'registros');
    
    // Crear un objeto con todos los SKUs para la vista
    const inventarioCompleto = {};
    
    // Primero inicializamos todos los SKUs con cantidades en cero
    todosLosSKUs.forEach(sku => {
      inventarioCompleto[sku.nombre] = {
        skuId: sku.id,
        nombre: sku.nombre,
        skuItem: sku.skuItem,
        CAPUCHONES: 0,
        BASES: 0,
        TAPAS: 0,
      };
    });
    
    // Luego actualizamos las cantidades de los que tienen registros
    inventario.forEach(item => {
      if (inventarioCompleto[item.sku.nombre]) {
        inventarioCompleto[item.sku.nombre][item.tipoInsumo] = item.cantidad;
      }
    });

    res.render('cosmetica_inventario_admin', {
      user: req.user,
      inventario: inventarioCompleto,
      page_name: 'cosmetica_admin'
    });
  } catch (error) {
    console.error('Error al renderizar inventario de cosmética (vista admin):', error);
    res.status(500).render('error', { message: 'Error al cargar el inventario' });
  }
};
