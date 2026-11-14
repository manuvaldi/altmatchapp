/**
 * AltMatch — Frontend de la aplicación.
 * Datos estáticos precargados desde public/data/snapshot.json.
 * Sin dependencias externas.
 */

import { nombreAnonimo } from './names.js';

let snapshot = null;
const VIEWS = ['resumen', 'clasificacion', 'jornadas', 'calendario', 'equipo'];
let currentView = VIEWS[0];

/* ========================================================================
   Toast
   ======================================================================== */

let toastTimer = null;
function showToast(message, ms = 3500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), ms);
}

window.showToast = showToast;

/* ========================================================================
   Instalación PWA
   ======================================================================== */

let deferredPrompt = null;

async function requestInstallation() {
  if (!deferredPrompt) {
    if (esIOS) {
      showToast('Pulsa Compartir ⬆︎ y luego «Añadir a pantalla de inicio»', 6000);
    } else {
      showToast('Usa el menú del navegador → «Instalar aplicación»', 6000);
    }
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') showToast('✓ Aplicación instalada');
  deferredPrompt = null;
  const btn = document.getElementById('btn-install');
  if (btn) btn.style.display = 'none';
}
window.requestInstallation = requestInstallation;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  const btn = document.getElementById('btn-install');
  if (btn) btn.style.display = 'grid';
});

// iOS/iPadOS (Safari) no soporta beforeinstallprompt: se muestra el botón igualmente,
// con instrucciones manuales (Compartir → Añadir a pantalla de inicio).
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const yaInstalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (esIOS && !yaInstalada) {
  const mostrarEnIOS = () => {
    const btn = document.getElementById('btn-install');
    if (btn) btn.style.display = 'grid';
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mostrarEnIOS);
  } else {
    mostrarEnIOS();
  }
}

window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('btn-install');
  if (btn) btn.style.display = 'none';
  deferredPrompt = null;
});

/* ========================================================================
   Service Worker
   ======================================================================== */

async function registerServiceWorker() {
  if (!navigator.serviceWorker) return;

  // Si ya había un SW controlando la página, un cambio de control significa que
  // se ha instalado una versión nueva: recargamos una vez para no seguir con el
  // HTML/JS/CSS antiguos que venían de la caché.
  const hadController = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || recargando) return;
    recargando = true;
    location.reload();
  });

  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    console.log('✓ Service Worker registrado');

    // Escuchar mensajes del SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type } = event.data;
      if (type === 'CACHE_UPDATED') {
        showToast('📦 Datos actualizados. Recarga para verlos.');
      }
    });

    // Controlar updates
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('⚙️ Nueva versión disponible. Recarga para actualizar.');
        }
      });
    });
  } catch (err) {
    console.warn('Service Worker falló:', err.message);
  }
}

function refreshCache() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
    showToast('❌ Service Worker no disponible');
    return;
  }

  const btn = document.getElementById('btn-refresh');
  if (btn) btn.disabled = true;
  showToast('🔄 Refrescando datos...');

  const channel = new MessageChannel();
  channel.port1.onmessage = async (event) => {
    if (btn) btn.disabled = false;
    const { type, error } = event.data;
    if (type === 'REFRESH_SUCCESS') {
      try {
        snapshot = await loadSnapshot();
        render();
        showView(currentView);
        showToast('✓ Datos actualizados');
      } catch (err) {
        showToast(`❌ ${err.message}`);
      }
    } else {
      showToast(`❌ Error: ${error || 'fallo al refrescar'}`);
    }
  };

  navigator.serviceWorker.controller.postMessage(
    { type: 'REFRESH_CACHE', url: 'data/snapshot.json' },
    [channel.port2],
  );
}

window.refreshCache = refreshCache;

/* ========================================================================
   Estado y datos
   ======================================================================== */

async function loadSnapshot() {
  const res = await fetch('data/snapshot.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} al cargar los datos`);
  const data = await res.json();
  if (!data || !Array.isArray(data.rounds)) throw new Error('Los datos recibidos están incompletos');
  return data;
}

async function init() {
  registerServiceWorker();
  try {
    snapshot = await loadSnapshot();
    render();
    setupNavigation();
    updateFooter();
    const initial = location.hash.replace('#', '');
    showView(VIEWS.includes(initial) ? initial : 'resumen');
    window.addEventListener('hashchange', () => {
      const view = location.hash.replace('#', '');
      if (VIEWS.includes(view) && view !== currentView) showView(view);
    });
  } catch (err) {
    console.error('Error al inicializar:', err);
    document.getElementById('view-resumen').innerHTML = `
      <div class="state">
        <div class="state__icon">⚠️</div>
        <h2>No se pueden cargar los datos</h2>
        <p>${err.message}</p>
        <p><small>Verifica la conexión o recarga la página.</small></p>
      </div>
    `;
  }
}

/* ========================================================================
   Navegación
   ======================================================================== */

function setupNavigation() {
  for (const view of VIEWS) {
    const tab = document.querySelector(`[data-tab="${view}"]`);
    if (tab) {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        showView(view);
      });
    }
  }
}

window.showView = showView;

function showView(view) {
  if (!VIEWS.includes(view)) return;
  currentView = view;

  // Ocultar vistas
  for (const v of VIEWS) {
    const el = document.getElementById(`view-${v}`);
    el.hidden = v !== view;
  }

  // Marcar tab activo
  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.setAttribute('aria-current', tab.dataset.tab === view ? 'page' : 'false');
  }

  // Renderizar vista
  const el = document.getElementById(`view-${view}`);
  switch (view) {
    case 'resumen':
      renderResumen(el);
      break;
    case 'clasificacion':
      renderClasificacion(el);
      break;
    case 'calendario':
      renderCalendario(el);
      break;
    case 'jornadas':
      renderJornadas(el);
      break;
    case 'equipo':
      renderEquipo(el);
      break;
  }

  // URL compartible
  history.replaceState(null, '', view === 'resumen' ? location.pathname : `#${view}`);
}

/* ========================================================================
   Renderizado — Utilidades
   ======================================================================== */

function escudo(crest, alt = '', cls = '') {
  if (!crest) {
    return `<div class="crest ${cls} crest--empty" title="${alt || 'Sin escudo'}" aria-label="${alt}">${iniciales(alt)}</div>`;
  }
  return `<div class="crest ${cls}" title="${alt}" aria-label="${alt}"><img src="data/crests/${crest}" alt="" decoding="async" loading="lazy"
    onerror="this.parentNode.classList.add('crest--empty');this.parentNode.textContent='${iniciales(alt)}'" /></div>`;
}

/** "C.F. MADRID RIO ..." -> "MR" */
function iniciales(nombre) {
  return (nombre || '?')
    .replace(/['’][^'’]*['’]/g, ' ')
    .split(/[^A-Za-zÁÉÍÓÚÑ]+/)
    .filter((w) => w && !/^(c|f|cd|cf|ad|de|del|la|el|los|las)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/**
 * Nombre de equipo listo para pintar. Los nombres de este grupo son casi
 * idénticos salvo la letra del final ("... 'B'" vs "... 'C'"), así que se
 * resalta ese sufijo para distinguirlos de un vistazo.
 * Devuelve HTML (con <span class="team-suffix">), no texto plano.
 */
const SUFIJO_EQUIPO = /\s*(['"‘’“”])([A-Z0-9]{1,3})\1\s*$/;
function nombreEquipoHTML(nombre) {
  const m = String(nombre || '').match(SUFIJO_EQUIPO);
  if (!m) return String(nombre || '');
  const base = String(nombre).slice(0, m.index).trimEnd();
  const sufijo = `${m[1]}${m[2]}${m[1]}`;
  return `${base} <span class="team-suffix">${sufijo}</span>`;
}

function fecha(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  const date = new Date(y, parseInt(m) - 1, dia);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(/\s+/g, ' ');
}

/** "2026-11-21" -> "Sáb 21 nov" (compacto: cabe junto a la hora en una línea) */
function fechaCompacta(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  const date = new Date(y, parseInt(m) - 1, dia);
  if (isNaN(date.getTime())) return d;
  const s = date
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '')
    .replace(/\s+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function findTeam(id) {
  return (snapshot.standings?.rows || []).find((t) => t.teamId === id) || {
    teamId: id,
    name: 'Equipo desconocido',
  };
}

function dotForm(letter) {
  const tipo = { G: 'G', E: 'E', P: 'P' }[letter] || '';
  return `<div class="dot dot--${tipo}">${tipo}</div>`;
}

function formHTML(arr) {
  return `<div class="form">${(arr || []).slice(-6).map(dotForm).join('')}</div>`;
}

/* ========================================================================
   Renderizado — Sección Resumen
   ======================================================================== */

function renderResumen(container) {
  const { team, standings, rounds } = snapshot;
  const ourTeam = standings?.rows?.find((r) => r.teamId === team.id);

  // Próximo partido
  let nextMatch = null;
  for (const round of rounds) {
    for (const m of round.matches) {
      if ((m.home.id === team.id || m.away.id === team.id) && !m.played) {
        nextMatch = { ...m, round: round.round, roundDate: round.date };
        break;
      }
    }
    if (nextMatch) break;
  }

  // Últimos resultados
  const recentMatches = [];
  for (let i = rounds.length - 1; i >= 0 && recentMatches.length < 5; i--) {
    for (const m of rounds[i].matches) {
      if ((m.home.id === team.id || m.away.id === team.id) && m.played) {
        recentMatches.unshift({ ...m, round: rounds[i].round });
        break;
      }
    }
  }

  let html = '';

  // Próximo
  if (nextMatch) {
    const isHome = nextMatch.home.id === team.id;
    const opponent = isHome ? nextMatch.away : nextMatch.home;
    const oppTeam = findTeam(opponent.id);
    const oppCrest = opponent.crest || oppTeam.crest;

    html += `
      <div class="section">
        <div class="next">
          <div class="next__top">
            <span class="next__tag">🎯 Próximo partido</span>
          </div>
          <div class="next__when">
            <span class="next__when-day">${fechaCompacta(nextMatch.date)}</span>
            <span class="next__when-sep" aria-hidden="true">·</span>
            <span class="next__when-time">${nextMatch.time || 'Hora por confirmar'}</span>
          </div>
          <div class="next__teams">
            <div class="next__side ${isHome ? 'next__side--us' : ''}">
              ${escudo(team.crest, team.name, 'next__side--us')}
              <div class="next__name">${nombreEquipoHTML(team.name)}</div>
              <div class="next__us-tag ${isHome ? '' : 'is-ghost'}">Local</div>
            </div>
            <div class="next__vs">vs</div>
            <div class="next__side">
              ${escudo(oppCrest, opponent.name)}
              <div class="next__name">${nombreEquipoHTML(opponent.name)}</div>
              <div class="next__us-tag ${!isHome ? '' : 'is-ghost'}">Local</div>
            </div>
          </div>
          <div class="next__meta">
            <div class="meta">
              <span class="meta__label">Jornada</span>
              <span class="meta__value">${nextMatch.round} / ${snapshot.group.totalRounds}</span>
            </div>
            <div class="meta">
              <span class="meta__label">Estadio</span>
              <span class="meta__value" style="font-size: .78rem;">${nextMatch.venue || '—'}</span>
            </div>
            <div class="meta">
              <span class="meta__label">Árbitro</span>
              <span class="meta__value" style="font-size: .78rem;">${nextMatch.referee || 'Sin asignar'}</span>
            </div>
          </div>
          <div class="next__actions">
            <button class="btn" onclick="showView('calendario')">Ver calendario</button>
          </div>
        </div>
      </div>
    `;
  }

  // Posición actual (misma cabecera que la tarjeta de próximo partido)
  html += `
    <div class="section">
      <div class="next">
        <div class="next__top">
          <span class="next__tag">📊 Posición actual</span>
        </div>
        ${
          ourTeam
            ? `
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: center;">
            <div style="text-align: center;">
              <div style="font-size: 2.5rem; font-weight: 900; color: var(--brand);">#${ourTeam.position}</div>
              <div style="font-size: .72rem; color: var(--text-faint); margin-top: .2rem;">de ${snapshot.group.totalTeams}</div>
            </div>
            <div>
              <div style="font-size: .82rem; margin-bottom: .8rem;">
                <strong style="color: var(--brand); font-size: 1.1rem;">${ourTeam.points}</strong> puntos
                <span style="color: var(--text-soft);">(${ourTeam.won}G-${ourTeam.drawn}E-${ourTeam.lost}P)</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; font-size: .76rem;">
                <div><span style="color: var(--text-faint);">Jugados</span> <strong>${ourTeam.played}</strong></div>
                <div><span style="color: var(--text-faint);">Goles F</span> <strong>${ourTeam.goalsFor}</strong></div>
                <div><span style="color: var(--text-faint);">Goles C</span> <strong>${ourTeam.goalsAgainst}</strong></div>
              </div>
              <div style="margin-top: .6rem;">${formHTML(ourTeam.form)}</div>
            </div>
          </div>
        `
            : `<div class="empty">Clasificación no disponible ahora mismo.
                 <button class="btn" style="margin-left:.5rem" onclick="refreshCache()">Reintentar</button></div>`
        }
      </div>
    </div>
  `;

  // Últimos partidos
  if (recentMatches.length > 0) {
    html += `
      <div class="section">
        <div class="section__head">
          <h2 class="section__title">📅 Últimos resultados</h2>
        </div>
        <div class="matches">
          ${recentMatches.map((m) => matchRowHTML(m)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

/* ========================================================================
   Renderizado — Clasificación
   ======================================================================== */

function renderClasificacion(container) {
  const { standings, team } = snapshot;

  if (!standings || !standings.rows?.length) {
    container.innerHTML = `
      <div class="state" style="margin-top: 1rem;">
        <div class="state__icon">📊</div>
        <h2>Clasificación no disponible</h2>
        <p>La RFFM no devolvió la clasificación en la última actualización.
           Los partidos y el calendario siguen disponibles.</p>
        <p style="margin-top: 1rem;">
          <button class="btn btn--primary" onclick="refreshCache()">🔄 Volver a intentarlo</button>
        </p>
      </div>`;
    return;
  }

  const html = `
    <div class="section">
      <div class="section__head">
        <h2 class="section__title">Clasificación</h2>
        <div class="section__hint">Jornada ${standings.round} · ${formatDate(standings.date)}</div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="standings">
            <thead>
              <tr>
                <th class="col-pos">Pos</th>
                <th class="col-team">Equipo</th>
                <th class="hide-sm">PJ</th>
                <th>V</th>
                <th>E</th>
                <th>D</th>
                <th class="col-dg hide-sm">DG</th>
                <th class="col-pts">Pts</th>
                <th class="col-form hide-sm">Forma</th>
              </tr>
            </thead>
            <tbody>
              ${standings.rows
                .map((row) => {
                  const isUs = row.teamId === team.id;
                  return `
                <tr ${isUs ? 'class="is-us"' : ''}>
                  <td class="col-pos">${row.position}</td>
                  <td class="col-team">
                    <div class="col-team-inner">
                      ${escudo(row.crest, row.name)}
                      <span class="team-name">${nombreEquipoHTML(row.name)}</span>
                    </div>
                  </td>
                  <td class="hide-sm">${row.played}</td>
                  <td>${row.won}</td>
                  <td>${row.drawn}</td>
                  <td>${row.lost}</td>
                  <td class="col-dg hide-sm">${row.goalsFor}:${row.goalsAgainst}</td>
                  <td class="col-pts">${row.points}</td>
                  <td class="col-form hide-sm">${formHTML(row.form)}</td>
                </tr>
              `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      <p style="margin-top: .8rem; font-size: .76rem; color: var(--text-faint);">
        Datos de la <a href="${snapshot.source.calendar}" target="_blank" rel="noopener">RFFM</a>
      </p>
    </div>
  `;

  container.innerHTML = html;
}

/* ========================================================================
   Fila de partido: local arriba, visitante abajo (orden real del partido)
   ======================================================================== */

function matchRowHTML(m) {
  const us = snapshot.team.id;
  const isHome = m.home.id === us;
  const played = !!(m.played && m.score);
  const link = played && m.acta;

  let scoreHTML;
  if (played) {
    const ourGoals = isHome ? m.score.home : m.score.away;
    const theirGoals = isHome ? m.score.away : m.score.home;
    const cls = ourGoals > theirGoals ? 'win' : ourGoals < theirGoals ? 'loss' : 'draw';
    scoreHTML = `<div class="match__score-val match__score-val--${cls}">${m.score.home}–${m.score.away}</div>`;
  } else {
    scoreHTML = `<div class="match__score-val match__score-val--pending">vs</div>`;
  }

  const side = (t, local) => {
    const crest = t.crest || findTeam(t.id).crest;
    return `
      <div class="match__team ${t.id === us ? 'match__team--us' : ''}">
        ${escudo(crest, t.name)}
        <span class="match__team-name">${nombreEquipoHTML(t.name)}</span>
        <span class="match__loc">${local ? 'L' : 'V'}</span>
      </div>`;
  };

  const tag = link ? 'a' : 'div';
  const attrs = link ? `href="${m.acta}" target="_blank" rel="noopener"` : '';
  return `
    <${tag} class="match" ${attrs}>
      <div class="match__date">
        <span class="match__day">${isHome ? '🏠' : '✈️'}</span>
        <span class="match__time">${m.time || '--:--'}</span>
      </div>
      <div class="match__teams">
        ${side(m.home, true)}
        ${side(m.away, false)}
      </div>
      <div class="match__score">${scoreHTML}</div>
    </${tag}>`;
}

/**
 * Variante de matchRowHTML para Jornadas: añade un badge "⭐" o "✓" en el nombre
 * del equipo ganador (si el partido está jugado). Llamada sólo desde renderJornadas.
 */
function matchRowWithWinner(m) {
  const us = snapshot.team.id;
  const isHome = m.home.id === us;
  const played = !!(m.played && m.score);
  const link = played && m.acta;

  let scoreHTML;
  if (played) {
    const ourGoals = isHome ? m.score.home : m.score.away;
    const theirGoals = isHome ? m.score.away : m.score.home;
    const cls = ourGoals > theirGoals ? 'win' : ourGoals < theirGoals ? 'loss' : 'draw';
    scoreHTML = `<div class="match__score-val match__score-val--${cls}">${m.score.home}–${m.score.away}</div>`;
  } else {
    scoreHTML = `<div class="match__score-val match__score-val--pending">vs</div>`;
  }

  // Determina quién ganó (si el partido está jugado)
  let ganador = null;
  if (played) {
    const homeGoals = m.score.home;
    const awayGoals = m.score.away;
    if (homeGoals > awayGoals) ganador = m.home.id;
    else if (awayGoals > homeGoals) ganador = m.away.id;
    // Si es empate, ganador sigue siendo null
  }

  const side = (t, local) => {
    const crest = t.crest || findTeam(t.id).crest;
    const badge = ganador && ganador === t.id ? '&nbsp;<span class="match__team-badge">⭐</span>' : '';
    return `
      <div class="match__team ${t.id === us ? 'match__team--us' : ''}">
        ${escudo(crest, t.name)}
        <span class="match__team-name">${nombreEquipoHTML(t.name)}${badge}</span>
        <span class="match__loc">${local ? 'L' : 'V'}</span>
      </div>`;
  };

  const tag = link ? 'a' : 'div';
  const attrs = link ? `href="${m.acta}" target="_blank" rel="noopener"` : '';
  return `
    <${tag} class="match" ${attrs}>
      <div class="match__date">
        <span class="match__day">${isHome ? '🏠' : '✈️'}</span>
        <span class="match__time">${m.time || '--:--'}</span>
      </div>
      <div class="match__teams">
        ${side(m.home, true)}
        ${side(m.away, false)}
      </div>
      <div class="match__score">${scoreHTML}</div>
    </${tag}>`;
}

/* ========================================================================
   Renderizado — Calendario
   ======================================================================== */

function renderCalendario(container) {
  const { rounds, team } = snapshot;

  if (!rounds || !rounds.length) {
    container.innerHTML = '<div class="empty">Sin datos de calendario</div>';
    return;
  }

  const nextRound = rounds.find((r) => r.matches.some((m) => (m.home.id === team.id || m.away.id === team.id) && !m.played))?.round;

  let html = `
    <div class="section">
      <div class="section__head">
        <h2 class="section__title">Calendario y resultados</h2>
        <div class="section__hint">${rounds.length} jornadas</div>
      </div>
      <div class="rounds">
  `;

  for (const round of rounds) {
    const ourMatches = round.matches.filter((m) => m.home.id === team.id || m.away.id === team.id);

    // Badge de estado: si ya se jugó, se muestra el resultado (verde/ámbar/rojo)
    let badge = 'future';
    let badgeLabel = 'Próxima';
    if (ourMatches.length > 0 && ourMatches.every((m) => m.played && m.score)) {
      const { goalsFor, goalsAgainst } = ourMatches.reduce(
        (acc, m) => {
          const local = m.home.id === team.id;
          acc.goalsFor += local ? m.score.home : m.score.away;
          acc.goalsAgainst += local ? m.score.away : m.score.home;
          return acc;
        },
        { goalsFor: 0, goalsAgainst: 0 },
      );
      if (goalsFor > goalsAgainst) {
        badge = 'won';
        badgeLabel = '✓ Ganado';
      } else if (goalsFor < goalsAgainst) {
        badge = 'lost';
        badgeLabel = '✕ Perdido';
      } else {
        badge = 'drawn';
        badgeLabel = '= Empatado';
      }
    } else if (ourMatches.length > 0 && round.round === nextRound) {
      badge = 'next';
      badgeLabel = 'Siguiente';
    }

    html += `<div class="round">`;
    const ourTime = ourMatches.find((m) => m.time)?.time || null;
    html += `
      <div class="round__head">
        <div>
          <div class="round__title">Jornada ${round.round}</div>
          <div class="round__date">${formatDate(round.date)}${ourTime ? `, ${ourTime}` : ''}</div>
        </div>
        <div class="round__state round__state--${badge}">${badgeLabel}</div>
      </div>
    `;

    if (ourMatches.length > 0) {
      html += `<div class="matches">`;
      for (const m of ourMatches) html += matchRowHTML(m);
      html += `</div>`;
    } else {
      html += `<div class="empty" style="padding: .6rem .8rem;">Ningún partido en esta jornada</div>`;
    }

    html += `</div>`;
  }

  html += `</div></div>`;

  container.innerHTML = html;
}

/* ========================================================================
   Renderizado — Jornadas (todas los partidos de la jornada elegida)
   ======================================================================== */

let jornadaElegida = null;

function renderJornadas(container) {
  const { rounds, team } = snapshot;
  if (!rounds || !rounds.length) {
    container.innerHTML = '<div class="empty">Sin datos de jornadas</div>';
    return;
  }

  // Jornada por defecto: la que tiene nuestro próximo partido; si no, la última
  if (jornadaElegida === null || !rounds.some((r) => r.round === jornadaElegida)) {
    const next = rounds.find((r) =>
      r.matches.some((m) => (m.home.id === team.id || m.away.id === team.id) && !m.played),
    );
    jornadaElegida = next ? next.round : rounds.at(-1).round;
  }

  const round = rounds.find((r) => r.round === jornadaElegida);
  const allPlayed = round.matches.length > 0 && round.matches.every((m) => m.played);

  const chips = rounds
    .map((r) => {
      const isSel = r.round === jornadaElegida;
      const jugada = r.matches.length > 0 && r.matches.every((m) => m.played);
      return `<button class="round-chip${isSel ? ' is-selected' : ''}${jugada ? ' is-played' : ''}"
        aria-pressed="${isSel}" onclick="seleccionarJornada(${r.round})">${r.round}</button>`;
    })
    .join('');

  container.innerHTML = `
    <div class="section">
      <div class="section__head">
        <h2 class="section__title">Jornadas</h2>
        <div class="section__hint">
          ${round.matches.length} partidos · ${allPlayed ? '✓ jugada' : 'pendiente'}
        </div>
      </div>
      <div class="round-picker" role="group" aria-label="Elegir jornada">${chips}</div>
      <div class="round">
        <div class="round__head">
          <div>
            <div class="round__title">Jornada ${round.round}</div>
            <div class="round__date">${formatDate(round.date)}</div>
          </div>
          <div class="round__state round__state--${allPlayed ? 'played' : round.round === jornadaElegida ? 'next' : 'future'}">
            ${allPlayed ? '✓ Jugada' : 'Pendiente'}
          </div>
        </div>
        <div class="matches">
          ${round.matches.map((m) => matchRowWithWinner(m)).join('')}
        </div>
      </div>
    </div>
  `;
}

window.seleccionarJornada = (roundNumber) => {
  jornadaElegida = roundNumber;
  renderJornadas(document.getElementById('view-jornadas'));
};

/* ========================================================================
   Renderizado — Equipo
   ======================================================================== */

function renderEquipo(container) {
  const { team, teamInfo } = snapshot;

  let html = `
    <div class="section">
      <div class="card team-card">
        <div class="team-card__head">
          <div class="team-card__crest">
            ${team.crest ? `<img src="data/crests/${team.crest}" alt="" decoding="async" loading="lazy" />` : '✦'}
          </div>
          <div>
            <div class="team-card__name">${team.name}</div>
            <div class="team-card__club">${team.club}</div>
          </div>
        </div>

        ${
          teamInfo
            ? `
        <div style="display: grid; gap: .9rem;">
          ${
            teamInfo.category
              ? `<div>
            <span class="meta__label">Categoría</span>
            <span class="meta__value">${teamInfo.category}</span>
          </div>`
              : ''
          }
          ${
            teamInfo.address
              ? `<div>
            <span class="meta__label">Domicilio</span>
            <span class="meta__value" style="font-size: .8rem; line-height: 1.4;">${teamInfo.address}</span>
          </div>`
              : ''
          }
          ${
            teamInfo.email
              ? `<div>
            <span class="meta__label">Email de contacto</span>
            <span class="meta__value"><a href="mailto:${teamInfo.email}">${teamInfo.email}</a></span>
          </div>`
              : ''
          }
          ${
            teamInfo.website
              ? `<div>
            <span class="meta__label">Web</span>
            <span class="meta__value"><a href="https://${teamInfo.website}" target="_blank" rel="noopener">${teamInfo.website}</a></span>
          </div>`
              : ''
          }
          ${
            teamInfo.kit && teamInfo.kit.length > 0
              ? `<div>
            <span class="meta__label">Equipación</span>
            <div class="kit">
              ${(teamInfo.kitDesign || [])
                .map(
                  (k) => `
              <div style="display: flex; gap: .35rem; align-items: center;">
                ${k.shirtColors.map((c) => `<div class="swatch" style="background: ${c};"></div>`).join('')}
              </div>
            `,
                )
                .join('')}
            </div>
          </div>`
              : ''
          }
        </div>
      `
            : ''
        }
      </div>
    </div>
  `;

  if (teamInfo?.delegates && teamInfo.delegates.length > 0) {
    html += `
      <div class="section">
        <h2 class="section__title">Delegado(s)</h2>
        <div class="card">
          <div class="chips" style="padding: .8rem;">
            ${teamInfo.delegates.map((d) => `<div class="chip">${d}</div>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  if (teamInfo?.players && teamInfo.players.length > 0) {
    html += `
      <div class="section">
        <h2 class="section__title">Plantilla (${teamInfo.players.length} jugadores)</h2>
        <div class="card">
          <div class="players">
            ${teamInfo.players.map((p) => `<div class="player"><span class="player__num">#</span><span>${nombreAnonimo(p.name)}</span></div>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

/* ========================================================================
   Renderizado — Encabezado
   ======================================================================== */

function render() {
  const { team, competition, group, season, standings } = snapshot;

  // Hero
  const heroCrest = document.getElementById('hero-crest');
  if (team.crest) {
    heroCrest.innerHTML = `<img src="data/crests/${team.crest}" alt="" decoding="async" loading="lazy" />`;
    heroCrest.querySelector('img').addEventListener('error', () => {
      heroCrest.innerHTML = `<span class="initials">${iniciales(team.name)}</span>`;
    });
  } else {
    heroCrest.innerHTML = `<span class="initials">${iniciales(team.name)}</span>`;
  }
  document.getElementById('hero-eyebrow').textContent = competition.name;
  document.getElementById('hero-title').textContent = team.name;
  document.getElementById('hero-season').textContent = `${season.name}`;

  // Stats (dos chips de una sola línea; la diferencia ya aparece en Clasificación)
  let stats = '';
  if (standings) {
    const ourTeam = standings.rows.find((r) => r.teamId === team.id);
    if (ourTeam) {
      stats += `
        <div class="stat">
          <span class="stat__label">Posición</span>
          <span class="stat__value">${ourTeam.position}º<small>/${group.totalTeams}</small></span>
        </div>
        <div class="stat">
          <span class="stat__label">Puntos</span>
          <span class="stat__value">${ourTeam.points}</span>
          <span class="stat__sub">${ourTeam.won}G–${ourTeam.drawn}E–${ourTeam.lost}P</span>
        </div>
      `;
    }
  }

  if (!stats) {
    stats = `
      <div class="stat">
        <span class="stat__label">Jornadas</span>
        <span class="stat__value">${group.totalRounds}</span>
      </div>
      <div class="stat">
        <span class="stat__label">Equipos</span>
        <span class="stat__value">${group.totalTeams}</span>
      </div>
    `;
  }

  document.getElementById('hero-stats').innerHTML = stats;

  // Links de pie
  document.getElementById('link-calendario').href = snapshot.source.calendar;
  document.getElementById('link-clasificacion').href = snapshot.source.calendar + '#clasificacion';
  document.getElementById('link-ficha').href = snapshot.source.team;
}

function updateFooter() {
  const date = new Date(snapshot.generatedAt);
  const formatter = new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  document.getElementById('updated').textContent = `Actualizado: ${formatter.format(date)}`;
}

/* ========================================================================
   Inicialización
   ======================================================================== */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
