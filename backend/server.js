require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

// 1. Importo la conexión a la BD (solo para la ruta de mantenimiento 'fix-db')
const pool = require("./config/db");

// 2. Importo Middlewares
const { requireLogin } = require("./middleware/auth");

// 3. Importo los Controladores (Para las rutas que están en la raíz)
const docenteController = require("./controllers/docenteController");
const adminController = require("./controllers/adminController");

// 4. Importo los Archivos de Rutas (Donde hemos movido la lógica)
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const docenteRoutes = require("./routes/docenteRoutes");

const app = express();

// --- CONFIGURACIÓN EXPRESS ---
app.use(express.urlencoded({ extended: true }));
// Ajusto la ruta estática para que apunte correctamente a frontend/views
app.use(express.static(path.join(__dirname, "../frontend/views")));
app.set("views", path.join(__dirname, "../frontend/views"));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secreto_dev",
    resave: false,
    saveUninitialized: false,
  })
);

// ================= RUTAS =================

// A. Rutas Modulares (Agrupadas por función)
// ------------------------------------------
app.use("/", authRoutes); // Login, Logout, Recuperar contraseña
app.use("/admin", adminRoutes); // Panel Admin, Cargas CSV, Configuración
app.use("/docente", docenteRoutes); // Panel Docente, Solicitar Asuntos

// B. Rutas Globales / Compartidas
// ------------------------------------------

// Ver Horario y Cuadrante
app.get("/horario", requireLogin, docenteController.getHorario);
app.get("/cuadrante", requireLogin, docenteController.getCuadrante);

// Acciones sobre el cuadrante
app.post(
  "/actualizar-guardia/:id",
  requireLogin,
  docenteController.updateGuardia
);

// Acción crítica: Generar una falta (Algoritmo)
// Se mantiene en /nueva-falta porque así lo llama tu formulario en admin.html
app.post("/nueva-falta", requireLogin, adminController.generateGuardia);

// Redirección inicial
app.get("/", (req, res) => res.redirect("/login"));

// ================= MANTENIMIENTO =================

// Ruta de utilidad para arreglar la base de datos si da error de 'ENUM'
app.get("/fix-db", async (req, res) => {
  try {
    // 1. Crear tablas si no existen (Configuración y Guardias)
    await pool.query(
      `CREATE TABLE IF NOT EXISTS configuracion (clave VARCHAR(50) PRIMARY KEY, valor VARCHAR(255))`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS guardia_asignada (id INT AUTO_INCREMENT PRIMARY KEY, fecha DATE, hueco INT, ausente_siglas VARCHAR(50), cubre_siglas VARCHAR(50), grupo VARCHAR(100), aula VARCHAR(100), realizada BOOLEAN DEFAULT NULL, observaciones TEXT)`
    );

    // 2. Arreglar la columna ENUM (para que acepte tildes y cualquier texto)
    try {
      await pool.query(
        `ALTER TABLE docente MODIFY COLUMN tipo_funcionario VARCHAR(50) DEFAULT 'Interino'`
      );
    } catch (e) {
      console.log("Aviso: tipo_funcionario ya estaba bien");
    }

    // 3. AÑADIR LA COLUMNA FALTANTE (guardias_realizadas) <--- ESTA ES LA CLAVE
    try {
      await pool.query(
        `ALTER TABLE docente ADD COLUMN guardias_realizadas INT DEFAULT 0`
      );
    } catch (e) {
      // Si el error es 1060 (Duplicate column name), significa que ya existe, lo ignoramos
      if (e.errno !== 1060)
        console.log("Error añadiendo columna: " + e.message);
    }

    res.send(
      "<h1>Base de datos reparada</h1><p>Se ha añadido la columna <b>guardias_realizadas</b> correctamente.</p><a href='/admin'>Volver al Admin</a>"
    );
  } catch (e) {
    res.send("Error mantenimiento: " + e.message);
  }
});

// ================= ARRANQUE =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
