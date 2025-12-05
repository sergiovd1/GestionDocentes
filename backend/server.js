require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");

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

app.get("/fix-db", async (req, res) => {
  try {
    // 1. Crear tablas si no existen (para asegurar estructura básica)
    await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                clave VARCHAR(50) PRIMARY KEY,
                valor VARCHAR(255)
            )
        `);
    // Insertamos configuración por defecto si no existe
    await pool.query(
      `INSERT IGNORE INTO configuracion (clave, valor) VALUES ('max_asuntos_propios_dia', '2')`
    );

    await pool.query(`
            CREATE TABLE IF NOT EXISTS guardia_asignada (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fecha DATE,
                hueco INT,
                ausente_siglas VARCHAR(50),
                cubre_siglas VARCHAR(50),
                grupo VARCHAR(100),
                aula VARCHAR(100),
                realizada BOOLEAN DEFAULT NULL,
                observaciones TEXT
            )
        `);

    // 2. Arreglar columna ENUM a VARCHAR (para evitar error de tildes/datos truncados)
    try {
      await pool.query(
        `ALTER TABLE docente MODIFY COLUMN tipo_funcionario VARCHAR(50) DEFAULT 'Interino'`
      );
    } catch (e) {
      console.log("Aviso: tipo_funcionario ya estaba bien o error menor");
    }

    // 3. AÑADIR LA COLUMNA FALTANTE ... (código que ya tenías)
    try {
      await pool.query(
        `ALTER TABLE docente ADD COLUMN guardias_realizadas INT DEFAULT 0`
      );
    } catch (e) {
      // ... (código que ya tenías)
    }

    // =====================================================
    // 4. CREAR SUPER ADMIN (ADM / 1234) <-- AÑADE ESTO
    // =====================================================
    try {
      const passwordHash = await bcrypt.hash("1234", 10);

      // Usamos INSERT ... ON DUPLICATE KEY UPDATE para que si ya existe, solo actualice la contraseña
      await pool.query(
        `
            INSERT INTO docente 
            (siglas, codigo, nombre, email, password, es_admin, departamento_id, tipo_funcionario, temp_password, antiguedad_centro)
            VALUES 
            ('ADM', 'ADM', 'Administrador Sistema', 'admin@sistema.com', ?, 1, 1, 'Carrera', 0, '2000-01-01')
            ON DUPLICATE KEY UPDATE password = VALUES(password), es_admin = 1;
        `,
        [passwordHash]
      );

      console.log(">>> Usuario ADM creado o actualizado correctamente.");
    } catch (e) {
      console.log("Error creando usuario ADM: " + e.message);
    }
    // =====================================================

    res.send(
      "<h1>Mantenimiento Completado</h1><p>La base de datos ha sido actualizada: se han creado tablas faltantes, ajustado tipos de datos y añadido la columna <b>guardias_realizadas</b>.</p><p><a href='/admin'>Volver al Panel Admin</a></p>"
    );
  } catch (e) {
    res.send("Error crítico en mantenimiento: " + e.message);
  }
});

// ================= ARRANQUE =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
