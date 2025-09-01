/**
 * Función utilitaria para convertir valores BigInt a Number
 * @param {Object|Array|BigInt} obj - Objeto, Array o BigInt a convertir
 * @returns {Object|Array|Number} - Datos con BigInt convertidos a Number
 */
exports.replaceBigIntWithNumber = function(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => exports.replaceBigIntWithNumber(item));
  }
  
  if (typeof obj === 'object') {
    const result = {};
    Object.keys(obj).forEach(key => {
      result[key] = exports.replaceBigIntWithNumber(obj[key]);
    });
    return result;
  }
  
  return obj;
};