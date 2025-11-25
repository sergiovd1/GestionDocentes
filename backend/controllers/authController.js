const bcrypt = require("bcrypt");
const pool = require("../config/db");
const sendEmail = require("../utils/emailSender");

// Lógica para iniciar sesión
const login = async (req, res) => {
  const { siglas, password } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM docente WHERE siglas = ?", [
      siglas,
    ]);

    if (rows.length > 0 && (await bcrypt.compare(password, rows[0].password))) {
      req.session.user = rows[0];
      if (rows[0].temp_password) return res.redirect("/cambiar-password");
      return res.redirect(rows[0].es_admin ? "/admin" : "/docente");
    }
    res.render("login.html", { error: "Usuario o contraseña incorrectos" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error de servidor");
  }
};

// Cerrar sesión
const logout = (req, res) => {
  req.session.destroy();
  res.redirect("/login");
};

// --- ¡ESTA ES LA FUNCIÓN QUE TE FALTABA O FALLABA! ---
const changePassword = async (req, res) => {
  if (req.body.p1 !== req.body.p2)
    return res.send("Las contraseñas no coinciden");

  const hash = await bcrypt.hash(req.body.p1, 10);

  await pool.query(
    "UPDATE docente SET password = ?, temp_password = 0 WHERE id = ?",
    [hash, req.session.user.id]
  );
  req.session.user.temp_password = 0;

  res.redirect(req.session.user.es_admin ? "/admin" : "/docente");
};

// Recuperar contraseña
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM docente WHERE email = ?", [
      email,
    ]);
    if (rows.length === 0) {
      return res.render("login.html", {
        error: "No existe ningún usuario con ese email.",
      });
    }

    const tempPass = Math.random().toString(36).slice(-8);
    const hash = await bcrypt.hash(tempPass, 10);

    await pool.query(
      "UPDATE docente SET password = ?, temp_password = 1 WHERE email = ?",
      [hash, email]
    );

    await sendEmail(
      email,
      "Recuperación de Contraseña",
      `Tu nueva contraseña temporal es: ${tempPass}\nPor favor, cámbiala al entrar.`
    );

    res.render("login.html", {
      error: "¡Correo enviado! Revisa tu bandeja de entrada.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error enviando el correo");
  }
};

module.exports = { login, logout, changePassword, forgotPassword };
