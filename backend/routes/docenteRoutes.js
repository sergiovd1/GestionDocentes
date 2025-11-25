const express = require("express");
const router = express.Router();
const docenteController = require("../controllers/docenteController");
const { requireLogin } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.get("/", requireLogin, docenteController.getDocentePanel);
router.post("/solicitar-asunto", requireLogin, docenteController.requestAsunto);
router.post(
  "/subir-material/:id",
  requireLogin,
  upload.single("pdf"),
  docenteController.uploadMaterial
);

module.exports = router;
