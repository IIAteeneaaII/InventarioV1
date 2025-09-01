const logger = require('../utils/logger');

// Lista de rutas que no queremos registrar
const ignorePaths = [
  '/api/test',
  '/js/',
  '/css/',
  '/img/',
  '/favicon.ico'
];

// Lista de tipos de operaciones de baja importancia
const lowImportanceOperations = [
  'GET /api/registros',
  'GET /seleccionlote',
  'GET /formato_',
  'GET /visualizador',
  'GET /historial'
];

function loggerMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    // Verificar si debemos ignorar esta ruta
    const shouldIgnore = ignorePaths.some(path => req.originalUrl.includes(path));
    
    // Verificar si es una operación de baja importancia
    const operation = req.method + ' ' + req.originalUrl;
    const isLowImportance = lowImportanceOperations.some(op => operation.startsWith(op));
    
    // Solo registrar si no es una ruta ignorada y no es de baja importancia, o si hay un error
    if ((!shouldIgnore && !isLowImportance) || res.statusCode >= 400) {
      logger.info({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        operation: operation,
        user_id: req.session?.userId || 'anon',
        session_id: req.sessionID,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        ip: req.ip,
        metadata: {
          params: req.params,
          query: req.query,
          // Solo incluir el body en operaciones POST/PUT que no sean autenticación
          body: (req.method === 'POST' || req.method === 'PUT') ? 
                (req.originalUrl.includes('/auth/') ? { secure: true } : req.body) : 
                undefined
        }
      });
    }
  });
  
  next();
}

module.exports = loggerMiddleware;