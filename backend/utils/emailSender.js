require("dotenv").config();
const nodemailer = require("nodemailer");

// Configuración básica para enviar correos con Gmail
// Usamos las variables de entorno para no dejar las contraseñas a la vista
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Función simple para enviar un email
// Solo le pasas el destino, asunto y el texto
const sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });
    console.log(`Correo enviado a ${to}`);
  } catch (error) {
    console.error("Falló el envío de correo:", error);
    // No lanzamos error para que el programa no se pare si falla un email
  }
};

module.exports = sendEmail;
