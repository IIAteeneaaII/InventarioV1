// Este script intenta resolver los problemas con la columna userid/userId
// Ejecutar como: node scripts/resolver_problema_userid.js

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Comenzando proceso de corrección de userid/userId...');
    
    // 1. Obtener información de la estructura de la tabla
    console.log('Verificando estructura de tablas...');
    const tables = await prisma.$queryRaw`
      SELECT table_name, column_name 
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name IN ('Modem', 'Registro', 'Log')
      ORDER BY table_name, column_name;
    `;
    
    console.log('Estructura de tablas:');
    console.log(tables);

    // 2. Ejecutar comandos para regenerar el cliente Prisma
    console.log('\nRegenerando cliente Prisma...');
    await execPromise('npx prisma generate');
    
    console.log('\nProceso completado. Por favor reinicia el servidor.');
    
  } catch (error) {
    console.error('Error durante el proceso:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
