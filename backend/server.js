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

app.get("/fix-db", async (req, res) => {
  try {
    // 1. Tabla DEPARTAMENTO
    await pool.query(`
            CREATE TABLE IF NOT EXISTS departamento (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE
            )
        `);
    // Insertamos el general para que no falle la FK
    await pool.query(
      `INSERT IGNORE INTO departamento (id, nombre) VALUES (1, 'General')`
    );

    // 2. Tabla CONFIGURACION
    await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                clave VARCHAR(50) PRIMARY KEY,
                valor VARCHAR(255)
            )
        `);
    await pool.query(
      `INSERT IGNORE INTO configuracion (clave, valor) VALUES ('max_asuntos_propios_dia', '2')`
    );

    // 3. Tabla DOCENTE (La que te daba error)
    await pool.query(`
            CREATE TABLE IF NOT EXISTS docente (
                id INT AUTO_INCREMENT PRIMARY KEY,
                siglas VARCHAR(20) UNIQUE NOT NULL,
                codigo VARCHAR(20),
                nombre VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                password VARCHAR(255),
                temp_password BOOLEAN DEFAULT 0,
                es_admin BOOLEAN DEFAULT 0,
                departamento_id INT DEFAULT 1,
                tipo_funcionario VARCHAR(50) DEFAULT 'Interino',
                antiguedad_centro DATE DEFAULT '2024-01-01',
                nota_oposicion DECIMAL(5,2) DEFAULT 0.00,
                guardias_realizadas INT DEFAULT 0,
                FOREIGN KEY (departamento_id) REFERENCES departamento(id)
            )
        `);

    // 4. Tabla HORARIO
    await pool.query(`
            CREATE TABLE IF NOT EXISTS horario (
                id INT AUTO_INCREMENT PRIMARY KEY,
                docente VARCHAR(20) NOT NULL,
                dia_semana VARCHAR(10) NOT NULL,
                hueco INT NOT NULL,
                modulo VARCHAR(100),
                grupo VARCHAR(50),
                aula VARCHAR(50),
                tipo VARCHAR(20) DEFAULT 'LEC',
                CONSTRAINT unique_horario UNIQUE (docente, dia_semana, hueco)
            )
        `);

    // 5. Tabla ASUNTOS PROPIOS
    await pool.query(`
            CREATE TABLE IF NOT EXISTS asunto_propio (
                id INT AUTO_INCREMENT PRIMARY KEY,
                docente_siglas VARCHAR(20) NOT NULL,
                fecha DATE NOT NULL,
                estado ENUM('pendiente', 'aprobado', 'rechazado') DEFAULT 'pendiente',
                material_pdf VARCHAR(255)
            )
        `);

    // 6. Tabla GUARDIAS ASIGNADAS
    await pool.query(`
            CREATE TABLE IF NOT EXISTS guardia_asignada (
                id INT AUTO_INCREMENT PRIMARY KEY,
                fecha DATE NOT NULL,
                hueco INT NOT NULL,
                ausente_siglas VARCHAR(50),
                cubre_siglas VARCHAR(50),
                grupo VARCHAR(100),
                aula VARCHAR(100),
                realizada BOOLEAN DEFAULT NULL,
                observaciones TEXT
            )
        `);

    res.send(
      "<h1>¡Tablas Creadas!</h1><p>La base de datos ya tiene la estructura correcta.</p><p>Ahora ve a: <a href='/init-admin'>Crear Usuario Admin</a></p>"
    );
  } catch (e) {
    res.send("Error fatal creando tablas: " + e.message);
  }
});

// ================= ARRANQUE =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
