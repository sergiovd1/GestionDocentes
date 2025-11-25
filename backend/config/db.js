require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  // Esto es necesario para Aiven que exige SSL
  ssl: {
    rejectUnauthorized: false,
  },
});

// Pequeño test de conexión al arrancar
pool
  .getConnection()
  .then((conn) => {
    console.log("Conectado a la Base de Datos MySQL correctamente");
    conn.release();
  })
  .catch((err) => {
    console.error("Error conectando a la BD:", err.message);
  });

module.exports = pool;
