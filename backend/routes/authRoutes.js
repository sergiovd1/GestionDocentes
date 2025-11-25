const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { requireLogin } = require("../middleware/auth");

// Definición de rutas
router.get("/login", (req, res) => res.render("login.html"));
router.post("/login", authController.login);
router.get("/logout", authController.logout);

// Rutas protegidas de cambio de contraseña
router.get("/cambiar-password", requireLogin, (req, res) =>
  res.render("cambiar-password.html")
);
router.post("/cambiar-password", authController.changePassword);

module.exports = router;
