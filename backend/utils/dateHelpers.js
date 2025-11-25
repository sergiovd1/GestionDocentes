// Esta función es clave para la regla de "1 día por trimestre"
// Le pasas una fecha y te dice si es del 1º, 2º o 3º trimestre escolar
const getTrimestre = (fecha) => {
  const mes = new Date(fecha).getMonth(); // Recuerda: 0 es Enero, 11 es Diciembre

  // De Septiembre (8) a Diciembre (11) -> Primer Trimestre
  if (mes >= 8 && mes <= 11) return 1;

  // De Enero (0) a Marzo (2) -> Segundo Trimestre
  if (mes >= 0 && mes <= 2) return 2;

  // El resto (Abril a Junio) -> Tercer Trimestre
  return 3;
};

module.exports = { getTrimestre };
