import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Contraseña dummy para todos
  const hashedPassword = await bcrypt.hash('Password#123', 10);

  // Usuarios base requeridos
  const usuarios = [
    { nombre: 'Administrador Principal', userName: 'admin', email: 'admin@ram.com', rol: 'UAI' },
    { nombre: 'Almacen', userName: 'Almacen', email: 'almacen@ram.com', rol: 'UA' },
    { nombre: 'Visualizador', userName: 'Visual', email: 'visual@ram.com', rol: 'UV' },
    { nombre: 'Registro', userName: 'Registro', email: 'registro@ram.com', rol: 'UReg' },
    { nombre: 'TestInicial', userName: 'Testini', email: 'testinicial@ram.com', rol: 'UTI' },
    { nombre: 'Retest', userName: 'Retest', email: 'retest@ram.com', rol: 'UR' },
    { nombre: 'Cosmetica', userName: 'Cosmetica', email: 'cosmetica@ram.com', rol: 'UC' },
    { nombre: 'Empaque', userName: 'Empaque', email: 'empaque@ram.com', rol: 'UE' },
    { nombre: 'Ensamble', userName: 'Ensamble', email: 'ensamble@ram.com', rol: 'UEN' },
  ];

  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { userName: u.userName },
      update: {},
      create: {
        nombre: u.nombre,
        userName: u.userName,
        email: u.email,
        password: hashedPassword,
        rol: u.rol,
        activo: true
      }
    });
    console.log(`Usuario ${u.userName} creado o existente`);
  }

  console.log('🎉 Seed de usuarios completado');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
