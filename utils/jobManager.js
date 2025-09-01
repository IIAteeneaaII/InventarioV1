const cron = require('node-cron');
const jobMap = new Map(); // Guardar trabajos por usuario y tipo ('morning', etc.)

/**
 * Crea o actualiza una tarea programada para un usuario.
 * @param {number} userId - ID del usuario.
 * @param {string} type - Tipo ('morning', 'afternoon', 'night').
 * @param {number} hour - Hora en formato 24h (ej: 8, 13, 21).
 */
function createOrUpdateJob(userId, type, hour) {
  const jobKey = `${userId}-${type}`;

  // Si ya existe, detener y eliminar
  if (jobMap.has(jobKey)) {
    const existingJob = jobMap.get(jobKey);
    existingJob.stop();
    jobMap.delete(jobKey);
  }

  // Crear cron task a la hora especificada todos los días
  const task = cron.schedule(`0 ${hour} * * *`, () => {
    console.log(`Ejecutando tarea de ${type} para usuario ${userId} a las ${hour}:00`);
    // Aquí podrías enviar notificación o realizar alguna acción
  });

  jobMap.set(jobKey, task);
}

/**
 * Carga todas las tareas programadas (idealmente desde DB).
 * Por ahora solo muestra mensaje.
 */
async function loadAllJobs() {
  console.log('Cargando tareas programadas...');

  //Consultar desde DB todos los usuarios y sus horas
  // Por ejemplo:
  // const users = await prisma.user.findMany();
  // users.forEach(u => {
  //   createOrUpdateJob(u.id, 'morning', u.morningHour);
  //   createOrUpdateJob(u.id, 'afternoon', u.afternoonHour);
  //   createOrUpdateJob(u.id, 'night', u.nightHour);
  // });

  console.log('Tareas programadas cargadas.');
}

module.exports = {
  createOrUpdateJob,
  loadAllJobs,
};
