/**
 * Anonimizado de nombres de jugadores.
 *
 * La plantilla se publica en internet (GitHub Pages), así que los apellidos de
 * los niños se enmascaran tanto en pantalla como en `data/snapshot.json`.
 * De cada palabra se conservan las 2 primeras letras y el resto pasa a X,
 * manteniendo el nombre de pila tal cual va tras la coma:
 *
 *   "ALFARO BARQUIN, IÑIGO"        -> "ALXXXXX BAXXXXXX, IÑIGO"
 *   "DE LA FUENTE SIMEONOV, AARON" -> "DE LA FUXXXXX SIXXXXXXX, AARON"
 *
 * La función es idempotente: aplicarla sobre un nombre ya enmascarado lo deja
 * igual, así que el frontend puede usarla aunque los datos ya vengan anonimizados.
 */

/** Partículas que se dejan tal cual (no identifican a nadie) */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'da', 'di', 'do', 'dos', 'van', 'von']);

/** "ALXXXXX" ya está enmascarado: 2 letras + sólo X */
const YA_ENMASCARADO = /^[A-ZÁÉÍÓÚÜÑ]{2}X+$/;

/** Enmascara una palabra (o cada trozo de un apellido compuesto con guion) */
function enmascararPalabra(palabra) {
  return palabra
    .split('-')
    .map((trozo) => {
      if (PARTICULAS.has(trozo.toLowerCase()) || trozo.length < 3) return trozo;
      if (YA_ENMASCARADO.test(trozo)) return trozo;
      return trozo.slice(0, 2) + 'X'.repeat(trozo.length - 1);
    })
    .join('-');
}

/**
 * @param {string} nombre  "APELLIDOS, NOMBRE"
 * @returns {string}       "APXXXXXX, NOMBRE"
 */
export function nombreAnonimo(nombre) {
  const original = (nombre || '').trim();
  if (!original) return '';

  const coma = original.indexOf(',');
  const apellidos = coma === -1 ? original : original.slice(0, coma);
  const pila = coma === -1 ? '' : original.slice(coma);

  const palabras = apellidos.split(/\s+/).filter(Boolean);
  if (!palabras.length) return original;

  // Sin coma no sabemos dónde acaban los apellidos: se respeta la última palabra.
  const aEnmascarar = coma === -1 ? palabras.slice(0, -1) : palabras;
  const intactas = coma === -1 ? palabras.slice(-1) : [];

  return [...aEnmascarar.map(enmascararPalabra), ...intactas].join(' ') + pila;
}
