require("dotenv").config();

// ESTA FUNCIÓN USA LA API HTTP DE BREVO (PUERTO 443)
// Render NO puede bloquear el puerto 443 (HTTPS) porque es tráfico web.
// Así esquivamos el bloqueo de los puertos SMTP (25, 465, 587).

const sendEmail = async (to, subject, text) => {
  const url = "https://api.brevo.com/v3/smtp/email";

  const options = {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.EMAIL_PASS, // Aquí va la API KEY (xkeysib...)
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_USER, name: "Gestión Docentes" },
      to: [{ email: to }],
      subject: subject,
      textContent: text,
    }),
  };

  try {
    // Usamos fetch nativo de Node.js (disponible en v18+)
    const response = await fetch(url, options);

    if (response.ok) {
      console.log(`✅ Email enviado a ${to} vía API HTTP (Bypass exitoso)`);
    } else {
      const errorData = await response.json();
      console.error(`❌ Error API Brevo:`, errorData);
    }
  } catch (error) {
    console.error("❌ Fallo de red (HTTP):", error.message);
  }
};

module.exports = sendEmail;
