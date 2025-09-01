import { validarTransicionFase } from '../services/modemService.js';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';
const prisma = new PrismaClient();

export async function actualizarFaseModem(req, res) {
  const { modemId, nuevaFase, estadoNuevo } = req.body;
  const userId = req.session?.userId || 'anon';
  const sessionId = req.sessionID;

  if (!modemId || !nuevaFase) {
    return res.status(400).json({ message: 'Faltan parámetros requeridos.' });
  }

  try {
    const modem = await prisma.modem.findUnique({
      where: { id: modemId }
    });

    if (!modem) {
      logger.warn({
        operation: 'actualizarFaseModem',
        user_id: userId,
        session_id: sessionId,
        modem_id: modemId,
        message: 'Modem no encontrado',
        status: 404
      });
      return res.status(404).json({ message: 'Modem no encontrado' });
    }

    // Validar transición antes de actualizar (pasa userId si tu lógica lo requiere)
    await validarTransicionFase(modem.faseActual, nuevaFase, estadoNuevo, userId);

    // Actualizar fase
    const updatedModem = await prisma.modem.update({
      where: { id: modemId },
      data: {
        faseActual: nuevaFase,
        estado: estadoNuevo || modem.estado,
        updatedAt: new Date()
      }
    });

    logger.info({
      operation: 'transicion_fase_modem',
      user_id: userId,
      session_id: sessionId,
      modem_id: modemId,
      from_state: modem.faseActual,
      to_state: nuevaFase,
      estado_anterior: modem.estado,
      estado_nuevo: estadoNuevo || modem.estado,
      timestamp: new Date().toISOString(),
      metadata: {
        motivo: 'Transición solicitada por usuario',
        body: req.body
      }
    });

    res.json({ message: 'Fase actualizada correctamente', modem: updatedModem });
  } catch (error) {
    logger.error({
      operation: 'actualizarFaseModem',
      user_id: userId,
      session_id: sessionId,
      modem_id: modemId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(400).json({ message: error.message });
  }
}

export async function iniciarProcesoModem(req, res) {
  const { sn, skuId } = req.body;
  const userId = req.session?.userId || 'anon';
  const sessionId = req.sessionID;

  if (!sn || !skuId) {
    return res.status(400).json({ message: 'Faltan parámetros requeridos.' });
  }

  try {
    // Define los valores iniciales según tu flujo
    const estadoInicial = 'REGISTRO';
    const faseInicial = 'REGISTRO';

    // Crea el módem
    const nuevoModem = await prisma.modem.create({
      data: {
        sn,
        skuId,
        estado: estadoInicial,
        faseActual: faseInicial,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    logger.info({
      operation: 'iniciar_proceso_modem',
      user_id: userId,
      session_id: sessionId,
      modem_id: nuevoModem.id,
      estado: estadoInicial,
      fase: faseInicial,
      timestamp: new Date().toISOString(),
      metadata: {
        motivo: 'Inicio de proceso de módem',
        body: req.body
      }
    });

    res.status(201).json({ message: 'Módem creado e iniciado en el proceso', modem: nuevoModem });
  } catch (error) {
    logger.error({
      operation: 'iniciarProcesoModem',
      user_id: userId,
      session_id: sessionId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(400).json({ message: error.message });
  }
}
