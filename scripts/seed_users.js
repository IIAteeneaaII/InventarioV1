const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  // Contraseña dummy para todos
  const hashedPassword = await bcrypt.hash('Password#123', 10);

  // Usuarios base requeridos con tus correos reales
  const usuarios = [
    { nombre: 'Registro', userName: 'Registro', email: 'registroram756@gmail.com', rol: 'UReg' },
    { nombre: 'Test Inicial', userName: 'Testini', email: 'testinicialram@gmail.com', rol: 'UTI' },
    { nombre: 'Cosmetica', userName: 'Cosmetica', email: 'cosmeticaram78@gmail.com', rol: 'UC' },
    { nombre: 'Limpieza', userName: 'Limpieza', email: 'limpiezaram27@gmail.com', rol: 'UL' },
    { nombre: 'Retest', userName: 'Retest', email: 'retestram@gmail.com', rol: 'UR' },
    { nombre: 'Ensamble', userName: 'Ensamble', email: 'ramensamble@gmail.com', rol: 'UEN' },
    { nombre: 'Empaque', userName: 'Empaque', email: 'empaqueram@gmail.com', rol: 'UE' },

    // UAI (usuarios administrativos)
    { nombre: 'Usuario UAI 1', userName: 'agomez', email: 'agomez_nextgen@outlook.com', rol: 'UAI' },
    { nombre: 'Usuario UAI 2', userName: 'acorrea', email: 'acorrea_nextgen@outlook.com', rol: 'UAI' },
    { nombre: 'Usuario UAI 3', userName: 'alopez', email: 'alopez_nextgen@outlook.com', rol: 'UAI' },
    { nombre: 'Usuario UAI 4', userName: 'nextgenit15', email: 'nextgenit15@outlook.com', rol: 'UAI' },
    { nombre: 'Usuario UAI 5', userName: 'totalplay', email: 'totalplay@ramelectronics.com.mx', rol: 'UAI' },
  ];

  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { email: u.email },   // validamos por email
      update: {},                  // si existe lo skipea
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

  console.log('Seed de usuarios completado');
}

main()
  .catch(e => console.error('Error en seed:', e))
  .finally(async () => await prisma.$disconnect());
