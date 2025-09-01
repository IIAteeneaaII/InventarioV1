const loteService = require('../services/loteService');

// Crear un nuevo lote para un SKU
exports.crearLote = async (req, res) => {
  try {
    const { skuId, responsableId } = req.body;
    const lote = await loteService.crearLote(skuId, responsableId);
    res.json(lote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Asignar un módem (SN) a un lote en registro
exports.asignarModemALote = async (req, res) => {
  try {
    const { loteId, sn, skuId, responsableId } = req.body;
    const modem = await loteService.asignarModemALote(loteId, sn, skuId, responsableId);
    res.json(modem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Terminar el registro de un lote
exports.terminarRegistroLote = async (req, res) => {
  try {
    const { loteId } = req.body;
    const lote = await loteService.terminarRegistroLote(loteId);
    res.json(lote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Listar lotes listos para empaque
exports.lotesParaEmpaque = async (req, res) => {
  try {
    const lotes = await loteService.lotesParaEmpaque();
    res.json(lotes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Registrar empaque de un módem en lote
exports.registrarEmpaque = async (req, res) => {
  try {
    const { loteId, sn } = req.body;
    const modem = await loteService.registrarEmpaque(loteId, sn);
    res.json(modem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Pausar o imprimir lote en empaque
exports.pausarOImprimirLote = async (req, res) => {
  try {
    const { loteId, accion } = req.body; // accion: 'PAUSADO' o 'COMPLETADO'
    const lote = await loteService.pausarOImprimirLote(loteId, accion);
    res.json(lote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Obtener lotes activos (placeholder)
 */
exports.obtenerLotesActivos = async (req, res) => {
  try {
    // Lógica temporal para evitar errores. Devuelve un array vacío.
    res.status(200).json({ success: true, data: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Obtener lotes de scrap activos (placeholder)
 */
exports.obtenerLotesScrapActivos = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Obtener modems por lote (placeholder)
 */
exports.obtenerModemsPorLote = async (req, res) => {
  try {
    const { loteId } = req.params;
    res.status(200).json({ success: true, message: `Datos para lote ${loteId}`, data: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};