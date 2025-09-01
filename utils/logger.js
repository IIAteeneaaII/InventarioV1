const { createLogger, format, transports } = require('winston');
const fs = require('fs');
const path = require('path');

// Asegura que la carpeta logs exista
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'simod-backend' },
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    // Se eliminó el transporte de combined.log para reducir espacio en disco
  ],
});

module.exports = logger;