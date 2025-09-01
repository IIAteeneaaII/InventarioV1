const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Registrar una acción en el log
exports.registrarAccion = async (logData) => {
  try {
    const nuevoLog = await prisma.log.create({
      data: logData
    });
    return nuevoLog;
  } catch (error) {
    console.error('Error al registrar acción en log:', error);
    // No lanzamos el error para que no interrumpa el flujo principal
    return null;
  }
};

// Obtener logs por usuario
exports.obtenerLogsPorUsuario = async (userId, limite = 100) => {
  try {
    const logs = await prisma.log.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limite
    });
    return logs;
  } catch (error) {
    console.error('Error al obtener logs por usuario:', error);
    throw error;
  }
};

// Obtener logs por entidad
exports.obtenerLogsPorEntidad = async (entidad, limite = 100) => {
  try {
    const logs = await prisma.log.findMany({
      where: { entidad },
      include: {
        user: {
          select: { userName: true, rol: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limite
    });
    return logs;
  } catch (error) {
    console.error('Error al obtener logs por entidad:', error);
    throw error;
  }
};

// Obtener logs por acción
exports.obtenerLogsPorAccion = async (accion, limite = 100) => {
  try {
    const logs = await prisma.log.findMany({
      where: { accion },
      include: {
        user: {
          select: { userName: true, rol: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limite
    });
    return logs;
  } catch (error) {
    console.error('Error al obtener logs por acción:', error);
    throw error;
  }
};

// Obtener logs por filtros combinados
exports.obtenerLogsConFiltros = async (filtros, limite = 100) => {
  try {
    const { userId, entidad, accion, fechaDesde, fechaHasta } = filtros;
    
    // Construir condición where
    const where = {};
    
    if (userId) where.userId = parseInt(userId);
    if (entidad) where.entidad = entidad;
    if (accion) where.accion = accion;
    
    // Filtro de fechas
    if (fechaDesde || fechaHasta) {
      where.createdAt = {};
      
      if (fechaDesde) {
        where.createdAt.gte = new Date(fechaDesde);
      }
      
      if (fechaHasta) {
        where.createdAt.lte = new Date(fechaHasta);
      }
    }
    
    const logs = await prisma.log.findMany({
      where,
      include: {
        user: {
          select: { userName: true, rol: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limite
    });
    
    return logs;
  } catch (error) {
    console.error('Error al obtener logs con filtros:', error);
    throw error;
  }
};