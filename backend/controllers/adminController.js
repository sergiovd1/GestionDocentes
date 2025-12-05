const pool = require("../config/db");
const fs = require("fs");
const csv = require("csv-parser");
const bcrypt = require("bcrypt");
const sendEmail = require("../utils/emailSender");

// Carga la vista principal del Admin
const getAdminPanel = async (req, res) => {
  try {
    const [asuntos] = await pool.query(`
      SELECT a.*, d.nombre, d.tipo_funcionario, d.antiguedad_centro, d.nota_oposicion 
      FROM asunto_propio a 
      JOIN docente d ON a.docente_siglas = d.siglas 
      WHERE a.estado = 'pendiente' 
      ORDER BY 
        FIELD(d.tipo_funcionario, 'Carrera', 'En prácticas', 'Interino'),
        d.antiguedad_centro ASC,
        d.nota_oposicion DESC
    `);

    const [horario] = await pool.query("SELECT 1 FROM horario LIMIT 1");

    res.render("admin.html", { asuntos, tieneHorario: horario.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error cargando panel admin");
  }
};

// --- ALGORITMO DE GUARDIAS (CORREGIDO: CANDIDATOS LIBRES) ---
const generateGuardia = async (req, res) => {
  const { siglas, fecha, hueco, grupo, aula, motivo } = req.body;
  const mapDia = ["", "1un", "2ar", "3ie", "4ue", "5ie", ""];
  const diaCodigo = mapDia[new Date(fecha).getDay()];

  if (!diaCodigo) return res.send("Fin de semana no lectivo");

  try {
    // 1. Determinar qué clases se pierden
    let clasesAfectadas = [];
    if (hueco) {
      clasesAfectadas.push({
        hueco: parseInt(hueco),
        grupo: grupo,
        aula: aula,
      });
    } else {
      const [clasesDB] = await pool.query(
        "SELECT * FROM horario WHERE docente = ? AND dia_semana = ? AND tipo = 'LEC'",
        [siglas, diaCodigo]
      );
      clasesAfectadas = clasesDB;
    }

    // Info del docente ausente (para comparar departamento)
    const [[ausente]] = await pool.query(
      "SELECT departamento_id FROM docente WHERE siglas = ?",
      [siglas]
    );

    for (const clase of clasesAfectadas) {
      // 2. BUSCAR CANDIDATOS DISPONIBLES
      // Definición: Docentes que NO tienen ninguna actividad registrada en ese día y hora.
      // (Si tienen 'GUARDIA', 'LEC' o 'CHL' en el CSV, están ocupados y se excluyen).

      const [candidatos] = await pool.query(
        `
                SELECT d.siglas as docente, d.departamento_id, d.guardias_realizadas 
                FROM docente d
                WHERE d.siglas NOT IN (
                    SELECT h.docente 
                    FROM horario h 
                    WHERE h.dia_semana = ? AND h.hueco = ?
                )
            `,
        [diaCodigo, clase.hueco]
      );

      let elegido = null;

      if (candidatos.length > 0) {
        // 3. APLICAR JERARQUÍA ESTRICTA
        for (const cand of candidatos) {
          cand.prioridad = 3; // Prioridad base (Cualquiera libre)

          // Prioridad 1: Mismo Departamento
          if (ausente && cand.departamento_id === ausente.departamento_id) {
            cand.prioridad = 1;
          }
          // Prioridad 2: Mismo Grupo (Solo si no es del mismo Dpto)
          else if (clase.grupo) {
            // Comprobamos si el candidato da clase a ese grupo en CUALQUIER otro momento de la semana
            const [coincide] = await pool.query(
              "SELECT id FROM horario WHERE docente = ? AND grupo = ? LIMIT 1",
              [cand.docente, clase.grupo]
            );
            if (coincide.length > 0) {
              cand.prioridad = 2;
            }
          }
        }

        // ORDENAR:
        // 1º Prioridad (1 > 2 > 3)
        // 2º Desempate: Menos guardias realizadas
        candidatos.sort((a, b) => {
          if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
          return a.guardias_realizadas - b.guardias_realizadas;
        });

        elegido = candidatos[0];
      }

      // 4. REGISTRAR
      const cubre = elegido ? elegido.docente : "SIN CUBRIR";

      await pool.query(
        `
                INSERT INTO guardia_asignada (fecha, hueco, ausente_siglas, cubre_siglas, grupo, aula, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
        [
          fecha,
          clase.hueco,
          siglas,
          cubre,
          clase.grupo || "S/G",
          clase.aula || "S/A",
          motivo,
        ]
      );

      // Actualizar contador del elegido
      if (elegido) {
        await pool.query(
          "UPDATE docente SET guardias_realizadas = guardias_realizadas + 1 WHERE siglas = ?",
          [cubre]
        );
      }
    }
    res.redirect("/cuadrante?fecha=" + fecha);
  } catch (err) {
    res.send("Error: " + err.message);
  }
};

// --- CARGA DE PROFESORES ---
const uploadProfesores = async (req, res) => {
  if (!req.file) return res.redirect("/admin");

  const results = [];
  const errors = [];
  const validRows = [];

  const cleanKey = (key) => (key ? key.trim().replace(/^\ufeff/, "") : "");
  const getValue = (row, ...options) => {
    const keys = Object.keys(row);
    for (const opt of options) {
      const foundKey = keys.find(
        (k) => cleanKey(k).toLowerCase() === opt.toLowerCase()
      );
      if (foundKey && row[foundKey]) return row[foundKey].trim();
    }
    return null;
  };

  const formatDateForDB = (dateStr) => {
    if (!dateStr) return "2024-01-01";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split("/");
    if (parts.length === 3)
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(
        2,
        "0"
      )}`;
    return null;
  };

  fs.createReadStream(req.file.path, { encoding: "utf8" })
    .pipe(csv({ separator: ";" }))
    .on("data", (row) => results.push(row))
    .on("end", async () => {
      try {
        results.forEach((r, index) => {
          const rowNum = index + 2;
          const siglas = getValue(r, "Siglas", "Codigo", "Usuario");
          const nombre = getValue(r, "Nombre");
          const email = getValue(r, "Email");
          const tipoRaw = getValue(r, "Tipo", "Funcionario") || "Interino";
          const antiguedadRaw = getValue(r, "Antiguedad", "Fecha");

          if (!siglas) errors.push(`Fila ${rowNum}: Falta 'Siglas'.`);
          if (!nombre) errors.push(`Fila ${rowNum}: Falta 'Nombre'.`);

          const fechaFormateada = formatDateForDB(antiguedadRaw);
          if (!fechaFormateada)
            errors.push(`Fila ${rowNum}: Fecha incorrecta.`);

          if (errors.length === 0) {
            validRows.push({
              siglas,
              nombre,
              email,
              tipo: tipoRaw,
              dpto: getValue(r, "Departamento_id", "Dpto") || 1,
              antiguedad: fechaFormateada,
              nota: getValue(r, "Nota") || 0,
            });
          }
        });

        if (errors.length > 0) {
          fs.unlinkSync(req.file.path);
          const errorMsg = `Errores en CSV:\n` + errors.slice(0, 5).join("\n");
          return res.redirect(
            "/admin/configuracion?msg=" + encodeURIComponent(errorMsg)
          );
        }

        let importados = 0;
        for (const docente of validRows) {
          const tempPass = Math.random().toString(36).slice(-8);
          const hash = await bcrypt.hash(tempPass, 10);

          await pool.query(
            `
                    INSERT INTO docente (siglas, codigo, nombre, email, password, temp_password, departamento_id, tipo_funcionario, antiguedad_centro, nota_oposicion)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                    nombre=VALUES(nombre), email=VALUES(email), departamento_id=VALUES(departamento_id),
                    tipo_funcionario=VALUES(tipo_funcionario), antiguedad_centro=VALUES(antiguedad_centro), nota_oposicion=VALUES(nota_oposicion)
                `,
            [
              docente.siglas,
              docente.siglas,
              docente.nombre,
              docente.email,
              hash,
              docente.dpto,
              docente.tipo,
              docente.antiguedad,
              docente.nota,
            ]
          );

          if (docente.email) {
            await sendEmail(
              docente.email,
              "Credenciales",
              `Usuario: ${docente.siglas}\nClave: ${tempPass}`
            );
          }
          importados++;
        }

        fs.unlinkSync(req.file.path);
        res.redirect(
          "/admin/configuracion?msg=" +
            encodeURIComponent(`Importados ${importados} docentes.`)
        );
      } catch (err) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.send("Error procesando CSV: " + err.message);
      }
    });
};

// --- CARGA DE HORARIO ---
const uploadHorario = async (req, res) => {
  if (!req.file) return res.redirect("/admin");
  const results = [];
  const cleanKey = (key) => key.trim().replace(/^\ufeff/, "");
  const getValue = (row, ...options) => {
    const keys = Object.keys(row);
    for (const opt of options) {
      const foundKey = keys.find(
        (k) => cleanKey(k).toLowerCase() === opt.toLowerCase()
      );
      if (foundKey && row[foundKey]) return row[foundKey].trim();
    }
    return null;
  };

  fs.createReadStream(req.file.path, { encoding: "utf8" })
    .pipe(csv({ separator: ";" }))
    .on("data", (row) => results.push(row))
    .on("end", async () => {
      try {
        if (results.length > 0) {
          await pool.query("DELETE FROM horario");
          for (const r of results) {
            const docente = getValue(r, "Docente", "Codigo");
            if (!docente) continue;

            await pool.query(
              `
                        INSERT INTO horario (docente, dia_semana, hueco, modulo, grupo, aula, tipo)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), grupo = VALUES(grupo), aula = VALUES(aula), tipo = VALUES(tipo)
                    `,
              [
                docente,
                getValue(r, "Día", "Dia") || "",
                parseInt(getValue(r, "Hueco", "Hora")) || 0,
                getValue(r, "Módulo", "Asignatura"),
                getValue(r, "Grupo"),
                getValue(r, "Aula"),
                getValue(r, "Tipo") || "LEC",
              ]
            );
          }
        }
        fs.unlinkSync(req.file.path);
        res.redirect("/horario?msg=Horario cargado correctamente");
      } catch (err) {
        res.send("Error cargando horario: " + err.message);
      }
    });
};

// Gestión de Asuntos Propios
const approveAsunto = async (req, res) => {
  const [[config]] = await pool.query(
    "SELECT valor FROM configuracion WHERE clave = 'max_asuntos_propios_dia'"
  );
  const max = parseInt(config?.valor || 2);
  const [[solicitud]] = await pool.query(
    "SELECT fecha, docente_siglas FROM asunto_propio WHERE id = ?",
    [req.params.id]
  );

  const [[conteo]] = await pool.query(
    "SELECT COUNT(*) as c FROM asunto_propio WHERE fecha = ? AND estado = 'aprobado'",
    [solicitud.fecha]
  );
  if (conteo.c >= max) return res.send("Límite diario alcanzado.");

  await pool.query(
    "UPDATE asunto_propio SET estado = 'aprobado' WHERE id = ?",
    [req.params.id]
  );

  const [[docente]] = await pool.query(
    "SELECT email FROM docente WHERE siglas = ?",
    [solicitud.docente_siglas]
  );
  await sendEmail(
    docente.email,
    "Asunto Aprobado",
    `Tu solicitud para el ${solicitud.fecha} ha sido aprobada.`
  );

  res.redirect("/admin");
};

const rejectAsunto = async (req, res) => {
  await pool.query(
    "UPDATE asunto_propio SET estado = 'rechazado' WHERE id = ?",
    [req.params.id]
  );
  const [[solicitud]] = await pool.query(
    "SELECT docente_siglas, fecha FROM asunto_propio WHERE id = ?",
    [req.params.id]
  );
  const [[docente]] = await pool.query(
    "SELECT email FROM docente WHERE siglas = ?",
    [solicitud.docente_siglas]
  );
  await sendEmail(
    docente.email,
    "Asunto Rechazado",
    `Tu solicitud para el ${solicitud.fecha} ha sido rechazada.`
  );
  res.redirect("/admin");
};

const getConfigPage = async (req, res) => {
  try {
    const [docentes] = await pool.query(
      "SELECT * FROM docente ORDER BY nombre ASC"
    );
    let departamentos = [];
    try {
      [departamentos] = await pool.query("SELECT * FROM departamento");
    } catch (e) {}
    res.render("configuracion.html", {
      user: req.session.user,
      docentes,
      departamentos,
    });
  } catch (err) {
    res.send("Error config");
  }
};

const createUser = async (req, res) => {
  const { siglas, nombre, email, password, departamento_id, tipo, es_admin } =
    req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const isAdmin = es_admin === "on" ? 1 : 0;
    await pool.query(
      `
            INSERT INTO docente (siglas, codigo, nombre, email, password, departamento_id, tipo_funcionario, es_admin, temp_password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `,
      [siglas, siglas, nombre, email, hash, departamento_id || 1, tipo, isAdmin]
    );
    res.redirect("/admin/configuracion?msg=Usuario creado");
  } catch (err) {
    res.send("Error creando usuario: " + err.message);
  }
};

const deleteUser = async (req, res) => {
  if (parseInt(req.params.id) === req.session.user.id)
    return res.send("No puedes borrarte a ti mismo.");
  try {
    const siglas = req.body.siglas_borrar;
    if (siglas) {
      await pool.query("DELETE FROM horario WHERE docente = ?", [siglas]);
      await pool.query("DELETE FROM asunto_propio WHERE docente_siglas = ?", [
        siglas,
      ]);
      await pool.query(
        "DELETE FROM guardia_asignada WHERE ausente_siglas = ? OR cubre_siglas = ?",
        [siglas, siglas]
      );
    }
    await pool.query("DELETE FROM docente WHERE id = ?", [req.params.id]);
    res.redirect("/admin/configuracion?msg=Usuario eliminado");
  } catch (err) {
    res.send("Error borrando usuario");
  }
};

const deleteHorario = async (req, res) => {
  await pool.query("DELETE FROM horario");
  res.redirect("/admin?msg=Horario eliminado");
};

const configLimite = async (req, res) => {
  const { limite } = req.body;
  await pool.query(
    `INSERT INTO configuracion (clave, valor) VALUES ('max_asuntos_propios_dia', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
    [limite]
  );
  res.redirect("/admin/configuracion?msg=Límite actualizado");
};

const addClase = async (req, res) => {
  const { docente, dia, hueco, grupo, aula, tipo } = req.body;
  await pool.query(
    `INSERT INTO horario (docente, dia_semana, hueco, grupo, aula, tipo) VALUES (?, ?, ?, ?, ?, ?)`,
    [docente, dia, hueco, grupo, aula, tipo]
  );
  res.redirect("/horario");
};

const deleteClase = async (req, res) => {
  await pool.query("DELETE FROM horario WHERE id = ?", [req.params.id]);
  res.redirect("/horario");
};

module.exports = {
  getAdminPanel,
  uploadProfesores,
  uploadHorario,
  generateGuardia,
  approveAsunto,
  rejectAsunto,
  getConfigPage,
  createUser,
  deleteUser,
  deleteHorario,
  configLimite,
  addClase,
  deleteClase,
};
