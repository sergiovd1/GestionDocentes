const pool = require("../config/db");
const { getTrimestre } = require("../utils/dateHelpers");

// Helper para obtener la fecha de hoy en formato YYYY-MM-DD (Hora Local)
const getTodayDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split("T")[0];
};

const getDocentePanel = async (req, res) => {
  if (req.session.user.es_admin) return res.redirect("/admin");
  const [asuntos] = await pool.query(
    "SELECT * FROM asunto_propio WHERE docente_siglas = ? ORDER BY fecha DESC",
    [req.session.user.siglas]
  );
  const [horario] = await pool.query("SELECT 1 FROM horario LIMIT 1");
  res.render("docente.html", {
    user: req.session.user,
    asuntos,
    tieneHorario: horario.length > 0,
  });
};

const requestAsunto = async (req, res) => {
  const { fecha } = req.body;
  const siglas = req.session.user.siglas;

  const trim = getTrimestre(fecha);
  let startMonth, endMonth;
  if (trim === 1) {
    startMonth = 9;
    endMonth = 12;
  } else if (trim === 2) {
    startMonth = 1;
    endMonth = 3;
  } else {
    startMonth = 4;
    endMonth = 6;
  }

  const year = new Date(fecha).getFullYear();
  const [existentes] = await pool.query(
    `
        SELECT COUNT(*) as count FROM asunto_propio 
        WHERE docente_siglas = ? AND MONTH(fecha) BETWEEN ? AND ? AND YEAR(fecha) = ? AND estado != 'rechazado'
    `,
    [siglas, startMonth, endMonth, year]
  );

  if (existentes[0].count >= 1) {
    return res.send(
      `<script>alert("Error: Ya has solicitado un día en este trimestre."); window.location.href="/docente";</script>`
    );
  }

  await pool.query(
    "INSERT INTO asunto_propio (docente_siglas, fecha) VALUES (?, ?)",
    [siglas, fecha]
  );
  res.redirect("/docente");
};

const uploadMaterial = async (req, res) => {
  if (!req.file) return res.redirect("/docente");
  await pool.query(
    "UPDATE asunto_propio SET material_pdf = ? WHERE id = ? AND docente_siglas = ?",
    [req.file.path, req.params.id, req.session.user.siglas]
  );
  res.redirect("/docente");
};

// --- AQUÍ ESTABA EL ERROR: Faltaba definir y pasar las horas ---
const getHorario = async (req, res) => {
  try {
    const { docente, grupo, aula, tipo } = req.query;

    // 1. Definimos los 13 huecos
    const huecos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const diasCodigos = ["1un", "2ar", "3ie", "4ue", "5ie"];

    // 2. Definimos las horas reales para mostrar en la tabla
    const horasReales = [
      "08:15",
      "09:15",
      "10:15",
      "11:45",
      "12:45",
      "13:45",
      "14:45", // Hueco 7 (Recreo/Cambio)
      "15:30",
      "16:30",
      "17:30",
      "18:30",
      "19:30",
      "20:30",
    ];

    let sql = "SELECT * FROM horario WHERE 1=1";
    const params = [];

    if (!req.session.user.es_admin && !docente && !grupo && !aula) {
      sql += " AND docente = ?";
      params.push(req.session.user.siglas);
    } else {
      if (docente) {
        sql += " AND docente = ?";
        params.push(docente);
      }
      if (grupo) {
        sql += " AND grupo = ?";
        params.push(grupo);
      }
      if (aula) {
        sql += " AND aula = ?";
        params.push(aula);
      }
      if (tipo) {
        sql += " AND tipo = ?";
        params.push(tipo);
      }
    }

    sql += " ORDER BY hueco ASC, dia_semana ASC";
    const [horario] = await pool.query(sql, params);

    const [profes] = await pool.query(
      "SELECT DISTINCT docente FROM horario ORDER BY docente"
    );
    const [grupos] = await pool.query(
      "SELECT DISTINCT grupo FROM horario WHERE grupo IS NOT NULL ORDER BY grupo"
    );
    const [aulas] = await pool.query(
      "SELECT DISTINCT aula FROM horario WHERE aula IS NOT NULL ORDER BY aula"
    );

    // 3. PASAMOS LAS VARIABLES A LA VISTA
    res.render("horario.html", {
      horario,
      profes,
      grupos,
      aulas,
      query: req.query,
      user: req.session.user,
      huecos, // <--- Importante
      diasCodigos, // <--- Importante
      horasReales, // <--- Importante (Aquí fallaba antes)
    });
  } catch (e) {
    console.error(e);
    res.send("Error cargando horario");
  }
};

const getCuadrante = async (req, res) => {
  const fecha = req.query.fecha || getTodayDate();

  const [guardias] = await pool.query(
    `
        SELECT g.*, d1.nombre as ausente_nom, d2.nombre as cubre_nom 
        FROM guardia_asignada g
        LEFT JOIN docente d1 ON g.ausente_siglas = d1.siglas
        LEFT JOIN docente d2 ON g.cubre_siglas = d2.siglas
        WHERE g.fecha = ?
        ORDER BY g.hueco ASC
    `,
    [fecha]
  );

  // Mapeo para el cuadrante también (opcional, pero estético)
  const horasMap = {
    1: "08:15",
    2: "09:15",
    3: "10:15",
    4: "11:45",
    5: "12:45",
    6: "13:45",
    7: "14:45",
    8: "15:30",
    9: "16:30",
    10: "17:30",
    11: "18:30",
    12: "19:30",
    13: "20:30",
  };
  guardias.forEach((g) => (g.hora_real = horasMap[g.hueco]));

  res.render("cuadrante.html", { guardias, fecha, user: req.session.user });
};

const updateGuardia = async (req, res) => {
  if (!req.session.user.es_admin) return res.status(403).send("No permitido");
  const { realizada, observaciones } = req.body;
  await pool.query(
    "UPDATE guardia_asignada SET realizada = ?, observaciones = ? WHERE id = ?",
    [realizada, observaciones, req.params.id]
  );
  res.redirect("back");
};

module.exports = {
  getDocentePanel,
  requestAsunto,
  uploadMaterial,
  getHorario,
  getCuadrante,
  updateGuardia,
};
