const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // o el SMTP que uses (Gmail, Outlook, tu empresa, etc.)
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendRecoveryEmail(to, code) {
  await transporter.sendMail({
    from: '"Tu App de Hábitos" <no-reply@tuapp.com>',
    to,
    subject: 'Código para restablecer tu contraseña',
    html: `
      <h1>Recuperación de contraseña</h1>
      <p>Tu código de verificación es:</p>
      <h2 style="color: #2e86de;">${code}</h2>
      <p>Este código expirará en 10 minutos.</p>
    `,
  });
}

module.exports = { sendRecoveryEmail };
