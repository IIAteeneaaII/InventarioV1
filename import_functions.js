// import_functions.js - Importar todas las funciones

// Importar funciones originales
const { 
  importInteractive, 
  procesarImportacion, 
  parseRowsFromContent, 
  readTextSmart,
  procesarModemsAEmpaque,
  procesarRegistroAEmpaque,
  menuPrincipal,
  previewFileOnly,
  importarEntradaYSalida,
  procesarImportacionEntradaYSalida,
} = require('./import_prn_x6_final.js');

// Importar nuevas funciones
const {
  procesarSNsEnLotes,
  getEstadoWithCache,
  createBatchRegistros,
  cambiarFaseDesdeCsv,
  procesarMultiplesCSV,
  parseRowsOptimizado
} = require('./function_fragments/nuevas_funciones.js');

// Re-exportar todas las funciones
module.exports = {
  // Funciones originales
  importInteractive, 
  procesarImportacion, 
  parseRowsFromContent, 
  readTextSmart,
  procesarModemsAEmpaque,
  procesarRegistroAEmpaque,
  menuPrincipal,
  previewFileOnly,
  importarEntradaYSalida,
  procesarImportacionEntradaYSalida,
  
  // Nuevas funciones
  procesarSNsEnLotes,
  getEstadoWithCache,
  createBatchRegistros,
  cambiarFaseDesdeCsv,
  procesarMultiplesCSV,
  parseRowsOptimizado
};