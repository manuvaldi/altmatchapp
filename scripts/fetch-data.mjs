#!/usr/bin/env node
/**
 * Descarga los datos de la RFFM y genera public/data/snapshot.json (+ escudos).
 *
 * La web es estática (GitHub Pages) y la API de la RFFM no envía cabeceras CORS,
 * así que el navegador no puede consultarla. En su lugar, este script descarga
 * todo en tiempo de "build" y deja un JSON congelado que la web consume.
 *
 * Uso: npm run fetch
 */

import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nombreAnonimo } from '../public/names.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const CREST_DIR = path.join(OUT_DIR, 'crests');

const API = 'https://www.rffm.es/api';
const IMG_BASE = 'https://appweb.rffm.es';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* HTTP con reintentos (la API de la RFFM falla de forma intermitente) */
/* ------------------------------------------------------------------ */

/* Rate limit global: la RFFM parece bloquear ráfagas de peticiones.
   Todas las peticiones pasan por fetchText, así que aquí garantizamos
   al menos MIN_INTERVAL ms entre una query y la siguiente. */
let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1000;
async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchText(url, { attempts = 5, binary = false } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await throttle();
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: binary ? '*/*' : 'application/json,text/html' },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (binary) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) throw new Error('respuesta vacía');
        return buf;
      }
      const text = await res.text();
      if (!text.trim()) throw new Error('respuesta vacía');
      return text;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(1200 * (i + 1) + Math.random() * 400);
    }
  }
  throw new Error(`Fallo al descargar ${url}: ${lastErr?.message}`);
}

/** La API devuelve literalmente `null` cuando no hay datos: lo tratamos como error reintentable. */
async function fetchJSON(url, opts = {}) {
  const text = await fetchText(url, opts);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no JSON de ${url}: ${text.slice(0, 80)}`);
  }
  if (data === null || data === undefined) throw new Error(`Sin datos en ${url}`);
  if (data?.estado !== undefined && String(data.estado) !== '1') {
    throw new Error(`estado=${data.estado} en ${url}`);
  }
  return data;
}

/** Igual que fetchJSON pero devuelve null en vez de lanzar (para datos opcionales). */
async function tryJSON(url, attempts = 4) {
  try {
    return await fetchJSON(url, { attempts });
  } catch (err) {
    console.warn(`  ⚠ ${err.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** "14/11/2026" -> "2026-11-14" */
function toISO(d) {
  if (!d) return null;
  const m = String(d).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Ruta de escudo de la RFFM -> nombre de fichero local. */
function crestFile(urlImg) {
  if (!urlImg) return null;
  const base = urlImg.split('?')[0].split('/').pop();
  return base ? base.replace(/[^\w.\-]/g, '_') : null;
}

/* ------------------------------------------------------------------ */
/* Programa principal                                                  */
/* ------------------------------------------------------------------ */

async function main() {
  const config = JSON.parse(await readFile(path.join(ROOT, 'config.json'), 'utf8'));
  const { temporada, competicion, grupo, equipo } = config;

  console.log('▶ AltMatch · descargando datos de la RFFM');
  console.log(`  temporada=${temporada} competicion=${competicion} grupo=${grupo} equipo=${equipo}`);

  /* --- 1. Metadatos: temporada, competición, grupo ------------------ */

  const [seasons, groups] = await Promise.all([
    tryJSON(`${API}/seasons`),
    tryJSON(`${API}/groups?competicion=${competicion}`),
  ]);

  const season = (seasons || []).find((s) => String(s.cod_temporada) === String(temporada));
  const groupMeta = (groups || []).find((g) => String(g.codigo) === String(grupo));
  const totalRounds = Number(groupMeta?.total_jornadas) || 11;

  /* --- 2. Resultados de todas las jornadas ------------------------- */

  const rounds = [];
  const crestUrls = new Map(); // fichero local -> URL original en appweb.rffm.es
  const rememberCrest = (urlImg) => {
    const file = crestFile(urlImg);
    if (file && !crestUrls.has(file)) crestUrls.set(file, urlImg.split('?')[0]);
    return file;
  };

  /** Normaliza la respuesta de /api/results a una jornada del snapshot. */
  const buildRound = (round, data) => {
    const matches = (data.partidos || []).map((m) => ({
      id: m.codacta,
      round,
      date: toISO(m.fecha),
      time: m.hora || null,
      venue: m.campojuego || null,
      referee: m.arbitro || null,
      played: m.estado === '1',
      score:
        m.estado === '1' && n(m.Goles_casa) !== null && n(m.Goles_visitante) !== null
          ? { home: n(m.Goles_casa), away: n(m.Goles_visitante) }
          : null,
      penalties:
        m.penaltis_casa !== '' && m.penaltis_visitante !== ''
          ? { home: n(m.penaltis_casa), away: n(m.penaltis_visitante) }
          : null,
      home: {
        id: m.CodEquipo_local,
        name: m.Nombre_equipo_local,
        crest: rememberCrest(m.url_img_local),
      },
      away: {
        id: m.CodEquipo_visitante,
        name: m.Nombre_equipo_visitante,
        crest: rememberCrest(m.url_img_visitante),
      },
      acta: m.codacta ? `https://www.rffm.es/acta-partido/${m.codacta}?temporada=${config.temporada}&competicion=${config.competicion}&grupo=${config.grupo}` : null,
    }));

    return {
      round,
      date: toISO(data.fecha_jornada),
      label: data.nombre_jornada_antiguo?.trim() || String(round),
      matches,
    };
  };

  // Primera pasada
  const missingRounds = [];
  for (let round = 1; round <= totalRounds; round++) {
    const data = await tryJSON(`${API}/results?idGroup=${grupo}&round=${round}`, 6);
    if (!data) {
      missingRounds.push(round);
      continue;
    }
    const jornada = buildRound(round, data);
    rounds.push(jornada);
    process.stdout.write(`  · jornada ${round}: ${jornada.matches.length} partidos\n`);
  }

  // Pasadas extra para las jornadas que la API no devolvió (falla de forma intermitente).
  // Cada jornada pendiente se reintenta varias veces con espera creciente entre ciclos.
  for (let cycle = 1; cycle <= 4 && missingRounds.length; cycle++) {
    console.log(`  ↻ ciclo ${cycle}: reintentando jornadas ${missingRounds.join(', ')}`);
    await sleep(4000 * cycle);
    for (const round of [...missingRounds]) {
      const data = await tryJSON(`${API}/results?idGroup=${grupo}&round=${round}`, 8);
      if (!data) continue;
      const jornada = buildRound(round, data);
      rounds.push(jornada);
      missingRounds.splice(missingRounds.indexOf(round), 1);
      process.stdout.write(`  · jornada ${round}: ${jornada.matches.length} partidos (recuperada en ciclo ${cycle})\n`);
    }
  }

  rounds.sort((a, b) => a.round - b.round);

  if (!rounds.length) throw new Error('No se pudo descargar ninguna jornada');

  const SNAPSHOT_PATH = path.join(OUT_DIR, 'snapshot.json');
  const prev = await readFile(SNAPSHOT_PATH, 'utf8').then(JSON.parse).catch(() => null);

  if (missingRounds.length) {
    console.warn(`\n⚠ Jornadas sin datos tras los reintentos: ${missingRounds.join(', ')}`);
  }

  /* La RFFM a veces deja una jornada devolviendo `null` durante horas (no es
     intermitencia: responde null una y otra vez). En ese caso reutilizamos la
     copia del snapshot anterior para esa jornada, en vez de abortar toda la
     actualización y dejar la web sin resultados nuevos ni clasificación. */
  const warnings = [];
  for (const round of [...missingRounds]) {
    const old = prev?.rounds?.find((r) => r.round === round);
    if (!old) continue;
    rounds.push(old);
    rounds.sort((a, b) => a.round - b.round);
    missingRounds.splice(missingRounds.indexOf(round), 1);
    warnings.push(`jornada ${round} reutilizada del snapshot anterior (la RFFM devolvió null)`);
    console.warn(`  ↺ jornada ${round}: sin datos en la RFFM, se reutiliza la copia anterior`);
  }

  /* --- 3. Clasificación (la API la "congela" en la última jornada jugada) --- */

  // Pedimos la última jornada: la API "recorta" hasta la última jornada con resultados.
  // Si devuelve null probamos otras jornadas (falla de forma intermitente).
  let standingsRaw = null;
  for (const round of [totalRounds, rounds.at(-1)?.round, 1, 2]) {
    if (!round) continue;
    standingsRaw = await tryJSON(`${API}/standings?idGroup=${grupo}&round=${round}`, 5);
    if (standingsRaw?.clasificacion?.length) break;
    standingsRaw = null;
  }
  for (const row of standingsRaw?.clasificacion || []) rememberCrest(row.url_img);
  const standings = standingsRaw
    ? {
        round: n(standingsRaw.jornada),
        date: toISO(standingsRaw.fecha_jornada),
        competition: standingsRaw.competicion,
        group: standingsRaw.grupo,
        rows: (standingsRaw.clasificacion || []).map((r) => ({
          position: n(r.posicion),
          teamId: r.codequipo,
          name: r.nombre,
          crest: crestFile(r.url_img),
          played: n(r.jugados),
          won: n(r.ganados),
          drawn: n(r.empatados),
          lost: n(r.perdidos),
          goalsFor: n(r.goles_a_favor),
          goalsAgainst: n(r.goles_en_contra),
          points: n(r.puntos),
          pointsSanctioned: n(r.puntos_sancion),
          form: (r.racha_partidos || []).map((f) => f.tipo).filter(Boolean),
          homePlayed: n(r.jugados_casa),
          homeWon: n(r.ganados_casa),
          homeDrawn: n(r.empatados_casa),
          homeLost: n(r.perdidos_casa),
          awayPlayed: n(r.jugados_fuera),
          awayWon: n(r.ganados_fuera),
          awayDrawn: n(r.empatados_fuera),
          awayLost: n(r.perdidos_fuera),
        })),
      }
    : null;

  /* --- 4. Ficha del equipo (plantilla, club, equipación) ----------- */

  let teamInfo = null;
  try {
    const html = await fetchText(config.fichaEquipo, { attempts: 3 });
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (m) {
      const t = JSON.parse(m[1])?.props?.pageProps?.team;
      if (t) {
        teamInfo = {
          name: t.nombre_equipo,
          club: t.nombre_club,
          category: t.categoria,
          crest: rememberCrest(t.escudo_club),
          website: t.portal_web || null,
          address: [t.domicilio_correspondencia, t.localidad_correspondencia, t.provincia_correspondencia]
            .filter(Boolean)
            .join(', '),
          email: t.email_correspondencia || null,
          kit: (t.equipaciones || []).map((k) => ({
            shirt: k.camiseta,
            shorts: k.pantalon,
            socks: k.medias,
          })),
          kitDesign: (t.equipacion1_diseno || []).map((k) => ({
            shirtColors: [k.color_camiseta1, k.color_camiseta2].filter(Boolean),
            shortsColors: [k.color_pantalon1, k.color_pantalon2].filter(Boolean),
            socksColors: [k.color_medias1, k.color_medias2].filter(Boolean),
          })),
          // Los apellidos de los niños no se publican: el JSON va anonimizado.
          players: (t.jugadores_equipo || []).map((p) => ({ id: p.cod_jugador, name: nombreAnonimo(p.nombre) })),
          delegates: (t.delegados_equipo || []).map((d) => d.nombre),
          coaches: (t.tecnicos_equipo || []).map((d) => d.nombre),
        };
      }
    }
  } catch (err) {
    console.warn(`  ⚠ ficha de equipo no disponible: ${err.message}`);
  }

  /* --- 5. Escudos en local ---------------------------------------- */

  // No se borra el directorio entero: los escudos de una jornada reutilizada
  // del snapshot anterior ya no tienen URL original conocida. Se borran sólo
  // los que el snapshot nuevo no referencia.
  const referenced = new Set(crestUrls.keys());
  for (const r of rounds) {
    for (const m of r.matches || []) {
      if (m.home?.crest) referenced.add(m.home.crest);
      if (m.away?.crest) referenced.add(m.away.crest);
    }
  }
  for (const row of standings?.rows || []) if (row.crest) referenced.add(row.crest);
  if (teamInfo?.crest) referenced.add(teamInfo.crest);

  await mkdir(CREST_DIR, { recursive: true });
  for (const file of await readdir(CREST_DIR).catch(() => [])) {
    if (!referenced.has(file)) await rm(path.join(CREST_DIR, file), { force: true });
  }

  let downloaded = 0;
  for (const [file, src] of crestUrls) {
    const dest = path.join(CREST_DIR, file);
    if (existsSync(dest)) continue;
    try {
      const buf = await fetchText(`${IMG_BASE}${src}`, { binary: true, attempts: 3 });
      await writeFile(dest, buf);
      downloaded++;
    } catch (err) {
      console.warn(`  ⚠ escudo ${file}: ${err.message}`);
    }
  }
  console.log(`  · escudos descargados: ${downloaded} (total ${crestUrls.size})`);

  /* --- 6. Snapshot final ------------------------------------------ */

  const competitionName =
    standings?.competition || rounds.find((r) => r.matches.length)?.matches?.[0]?.competition || null;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    season: {
      id: temporada,
      name: season?.nombre || temporada,
      start: season?.fecha_inicio || null,
      end: season?.fecha_fin || null,
    },
    competition: {
      id: competicion,
      name: competitionName || groupMeta?.nombre_delegacion || 'Competición',
    },
    group: {
      id: grupo,
      name: standings?.group || groupMeta?.nombre || `Grupo ${grupo}`,
      totalRounds,
      totalTeams: Number(groupMeta?.total_equipos) || standings?.rows?.length || 12,
    },
    team: {
      id: equipo,
      name: teamInfo?.name || 'C.F. MADRID RIO - ARGANZUELA \'C\'',
      club: teamInfo?.club || 'CDE MADRID RIO',
      crest: teamInfo?.crest || null,
    },
    standings,
    rounds,
    ...(warnings.length ? { warnings } : {}),
    teamInfo,
    source: {
      calendar: config.urlCalendario,
      team: config.fichaEquipo,
    },
  };

  /* --- 7. Validación: nunca publicar ni escribir datos a medias ------- */

  const problems = [];
  if (missingRounds.length) problems.push(`faltan las jornadas ${missingRounds.join(', ')}`);
  if (!standings) problems.push('no se pudo descargar la clasificación');
  if (!teamInfo) problems.push('no se pudo descargar la ficha del equipo');

  const score = (snap) => (snap?.rounds?.length || 0) + (snap?.standings?.rows?.length ? 1 : 0);

  if (problems.length) {
    console.warn(`\n⚠ Snapshot incompleto: ${problems.join('; ')}`);
    if (process.env.ALTMATCH_REQUIRE_COMPLETE) {
      throw new Error(`Snapshot incompleto: ${problems.join('; ')}`);
    }
    if (prev && score(prev) > score(snapshot)) {
      console.error(
        `✖ El snapshot guardado (${prev.rounds?.length || 0} jornadas${prev.standings ? ' + clasificación' : ''}) ` +
          `es más completo que el nuevo. No se sobrescribe; reintenta más tarde.`,
      );
      process.exit(2);
    }
    console.warn('  Se escribe de todos modos porque no hay uno mejor guardado.');
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');

  // Resumen por consola
  const ourMatches = rounds.flatMap((r) => r.matches).filter((m) => m.home.id === equipo || m.away.id === equipo);
  const played = ourMatches.filter((m) => m.played);
  const next = ourMatches.find((m) => !m.played);
  const row = standings?.rows?.find((r) => r.teamId === equipo);
  console.log(`\n✔ public/data/snapshot.json`);
  console.log(`  ${snapshot.team.name} · ${snapshot.competition.name} · ${snapshot.group.name} · ${snapshot.season.name}`);
  console.log(`  clasificación: ${row ? `${row.position}º con ${row.points} pts (${row.played} jugados)` : 'sin datos'}`);
  console.log(`  partidos jugados: ${played.length} · próximo: ${next ? `${next.date} ${next.time} vs ${next.home.id === equipo ? next.away.name : next.home.name}` : 'ninguno'}`);
}

main().catch((err) => {
  console.error('\n✖ Error:', err.message);
  process.exit(1);
});
