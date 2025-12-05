const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Me aseguro de que la carpeta 'uploads' exista antes de intentar guardar nada
// Si no existe, la creo yo mismo para evitar errores tontos
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración simple de Multer: guardar en esa carpeta
const upload = multer({ dest: uploadDir });

module.exports = upload;
