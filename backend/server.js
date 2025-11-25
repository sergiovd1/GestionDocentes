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

app.get("/init-admin", async (req, res) => {
  const bcrypt = require("bcrypt");
  try {
    const hash = await bcrypt.hash("1234", 10);

    // Aseguramos que exista el departamento 1 (General) para no dar error
    await pool.query(
      `INSERT IGNORE INTO departamento (id, nombre) VALUES (1, 'General')`
    );

    // Insertamos el Admin
    await pool.query(
      `
            INSERT INTO docente (siglas, codigo, nombre, email, password, es_admin, departamento_id, tipo_funcionario, temp_password)
            VALUES ('ADM', 'ADM', 'Super Admin', 'admin@admin.com', ?, 1, 1, 'Carrera', 0)
            ON DUPLICATE KEY UPDATE password = VALUES(password), es_admin = 1
        `,
      [hash]
    );

    res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: green;">¡Administrador Creado!</h1>
                <p>Ya puedes iniciar sesión con:</p>
                <p>Usuario: <b>ADM</b></p>
                <p>Contraseña: <b>1234</b></p>
                <br>
                <a href="/login" style="padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">Ir al Login</a>
            </div>
        `);
  } catch (e) {
    res.send("Error creando admin: " + e.message);
  }
});

// ================= ARRANQUE =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
