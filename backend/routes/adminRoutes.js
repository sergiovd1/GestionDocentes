const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { requireAdmin } = require("../middleware/auth"); // Usamos requireAdmin directamente
const upload = require("../middleware/upload");

// Panel principal
router.get("/", requireAdmin, adminController.getAdminPanel);

// Cargas CSV
router.post(
  "/cargar-profesores",
  requireAdmin,
  upload.single("csv"),
  adminController.uploadProfesores
);
router.post(
  "/cargar-horario",
  requireAdmin,
  upload.single("csv"),
  adminController.uploadHorario
);
router.post("/borrar-horario", requireAdmin, adminController.deleteHorario);

// Guardias
router.post("/nueva-falta", requireAdmin, adminController.generateGuardia); // Ojo, en server.js estaba en /nueva-falta, aquí lo ponemos bajo /admin/nueva-falta o lo mapeamos luego en server.js

// Asuntos Propios
router.post("/aprobar-asunto/:id", requireAdmin, adminController.approveAsunto);
router.post("/rechazar-asunto/:id", requireAdmin, adminController.rejectAsunto);
router.post("/configurar-limite", requireAdmin, adminController.configLimite);

// Gestión Usuarios
router.get("/configuracion", requireAdmin, adminController.getConfigPage);
router.post("/crear-usuario", requireAdmin, adminController.createUser);
router.post("/borrar-usuario/:id", requireAdmin, adminController.deleteUser);

// Gestión Horario Manual
router.post("/borrar-clase/:id", requireAdmin, adminController.deleteClase);
router.post("/anadir-clase", requireAdmin, adminController.addClase);

module.exports = router;
