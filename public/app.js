/**
 * AltMatch — Frontend de la aplicación.
 * Datos estáticos precargados desde public/data/snapshot.json.
 * Sin dependencias externas.
 */

let snapshot = null;
const VIEWS = ['resumen', 'clasificacion', 'calendario', 'equipo'];
let currentView = VIEWS[0];

/* ========================================================================
   Estado y datos
   ======================================================================== */

async function loadSnapshot() {
  const url = `data/snapshot.json?v=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al cargar snapshot`);
  const data = await res.json();
  if (!data) throw new Error('Snapshot vacío');
  return data;
}

async function init() {
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
    return `<div class="crest ${cls} crest--empty" title="${alt || 'Sin escudo'}" aria-label="${alt}">✦</div>`;
  }
  return `<div class="crest ${cls}" title="${alt}" aria-label="${alt}"><img src="data/crests/${crest}" alt="" decoding="async" loading="lazy" /></div>`;
}

function fecha(d) {
  if (!d) return '—';
  const [y, m, dia] = d.split('-');
  const date = new Date(y, parseInt(m) - 1, dia);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(/\s+/g, ' ');
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
  return snapshot.standings.rows.find((t) => t.teamId === id) || {
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
  const ourTeam = standings.rows.find((r) => r.teamId === team.id);

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
      <div class="next">
        <div class="next__top">
          <span class="next__tag">🎯 Próximo partido</span>
          <span class="next__when">${fecha(nextMatch.date)}<br><strong>${nextMatch.time || 'Horario TBD'}</strong></span>
        </div>
        <div class="next__teams">
          <div class="next__side ${isHome ? 'next__side--us' : ''}">
            ${escudo(team.crest, team.name, 'next__side--us')}
            <div class="next__name">${team.name}</div>
            ${isHome ? '<div class="next__us-tag">Local</div>' : ''}
          </div>
          <div class="next__vs">vs</div>
          <div class="next__side">
            ${escudo(oppCrest, opponent.name)}
            <div class="next__name">${opponent.name}</div>
            ${!isHome ? '<div class="next__us-tag">Local</div>' : ''}
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
    `;
  }

  // Posición actual
  html += `
    <div class="section">
      <div class="section__head">
        <h2 class="section__title">📊 Posición actual</h2>
      </div>
      <div class="card" style="padding: 1rem;">
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
            : '<div class="empty">Sin datos de clasificación</div>'
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
          ${recentMatches
            .map((m) => {
              const isHome = m.home.id === team.id;
              const opponent = isHome ? m.away : m.home;
              const oppTeam = findTeam(opponent.id);
              const oppCrest = opponent.crest || oppTeam.crest;
              const gf = m.score.home;
              const gc = m.score.away;
              const weScore = isHome ? gf : gc;
              const theyScore = isHome ? gc : gf;
              const result = weScore > theyScore ? 'win' : weScore < theyScore ? 'loss' : 'draw';

              return `
                <a href="#" class="match" onclick="showView('calendario'); return false;">
                  <div class="match__date">
                    <span class="match__day">J${m.round}</span>
                    <span class="match__time">${fecha(m.date)}</span>
                  </div>
                  <div class="match__teams">
                    <div class="match__team match__team--us ${result === 'win' ? 'match__team--win' : result === 'loss' ? 'match__team--lose' : ''}">
                      <span class="match__team-name">${team.name}</span>
                    </div>
                    <div class="match__team match__team--op ${result === 'loss' ? 'match__team--win' : result === 'win' ? 'match__team--lose' : ''}">
                      <span class="match__team-name">${opponent.name}</span>
                    </div>
                  </div>
                  <div class="match__score">
                    <div class="match__score-val match__score-val--${result}">${weScore}–${theyScore}</div>
                    ${result === 'win' ? '<div class="match__badge">✓ Victoria</div>' : result === 'loss' ? '<div class="match__badge">✗ Derrota</div>' : '<div class="match__badge">= Empate</div>'}
                  </div>
                </a>
              `;
            })
            .join('')}
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

  if (!standings) {
    container.innerHTML = '<div class="empty">Sin datos de clasificación</div>';
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
                      <span class="team-name">${row.name}</span>
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

    // Badge de estado
    let badge = 'future';
    let badgeLabel = 'Próxima';
    if (ourMatches.length > 0 && ourMatches.every((m) => m.played)) {
      badge = 'played';
      badgeLabel = '✓ Jugada';
    } else if (ourMatches.length > 0 && round.round === nextRound) {
      badge = 'next';
      badgeLabel = 'Siguiente';
    }

    html += `<div class="round">`;
    html += `
      <div class="round__head">
        <div>
          <div class="round__title">Jornada ${round.round}</div>
          <div class="round__date">${formatDate(round.date)}</div>
        </div>
        <div class="round__state round__state--${badge}">${badgeLabel}</div>
      </div>
    `;

    if (ourMatches.length > 0) {
      html += `<div class="matches">`;
      for (const m of ourMatches) {
        const isHome = m.home.id === team.id;
        const opponent = isHome ? m.away : m.home;
        const oppTeam = findTeam(opponent.id);
        const oppCrest = opponent.crest || oppTeam.crest;

        let score = '—';
        let scoreCls = 'pending';
        if (m.played && m.score) {
          const gf = m.score.home;
          const gc = m.score.away;
          const weScore = isHome ? gf : gc;
          const theyScore = isHome ? gc : gf;
          score = `${weScore}–${theyScore}`;
          scoreCls = weScore > theyScore ? 'win' : weScore < theyScore ? 'loss' : 'draw';
        }

        html += `
          <a href="${m.acta || '#'}" ${m.acta ? 'target="_blank" rel="noopener"' : 'onclick="return false;"'} class="match">
            <div class="match__date">
              <span class="match__day">${isHome ? '🏠' : '✈️'}</span>
              <span class="match__time">${m.time || 'TBD'}</span>
            </div>
            <div class="match__teams">
              <div class="match__team match__team--us">
                ${escudo(snapshot.team.crest, snapshot.team.name)}
                <span class="match__team-name">${snapshot.team.name}</span>
              </div>
              <div class="match__team">
                ${escudo(oppCrest, opponent.name)}
                <span class="match__team-name">${opponent.name}</span>
              </div>
            </div>
            <div class="match__score">
              <div class="match__score-val match__score-val--${scoreCls}">${score}</div>
              ${m.venue ? `<div class="match__badge">${m.venue.split('-')[0]}</div>` : ''}
            </div>
          </a>
        `;
      }
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
            ${teamInfo.players.map((p) => `<div class="player"><span class="player__num">#</span><span>${p.name}</span></div>`).join('')}
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
  document.getElementById('hero-crest').innerHTML = team.crest ? `<img src="data/crests/${team.crest}" alt="" decoding="async" loading="lazy" />` : '✦';
  document.getElementById('hero-eyebrow').textContent = competition.name;
  document.getElementById('hero-title').textContent = team.name;
  document.getElementById('hero-season').textContent = `${season.name}`;

  // Stats
  let stats = '';
  if (standings) {
    const ourTeam = standings.rows.find((r) => r.teamId === team.id);
    if (ourTeam) {
      stats += `
        <div class="stat">
          <span class="stat__label">Posición</span>
          <span class="stat__value">#${ourTeam.position}<small>/${group.totalTeams}</small></span>
        </div>
        <div class="stat">
          <span class="stat__label">Puntos</span>
          <span class="stat__value">${ourTeam.points}</span>
          <span class="stat__sub">${ourTeam.won}G–${ourTeam.drawn}E–${ourTeam.lost}P</span>
        </div>
        <div class="stat">
          <span class="stat__label">Diferencia</span>
          <span class="stat__value">${ourTeam.goalsFor}-${ourTeam.goalsAgainst}</span>
          <span class="stat__sub">${ourTeam.goalsFor - ourTeam.goalsAgainst > 0 ? '+' : ''}${ourTeam.goalsFor - ourTeam.goalsAgainst}</span>
        </div>
      `;
    }
  }

  if (!stats) {
    stats = `
      <div class="stat">
        <span class="stat__label">${group.name}</span>
        <span class="stat__value" style="font-size: .9rem;">${group.totalRounds} jornadas</span>
      </div>
      <div class="stat">
        <span class="stat__label">Total equipos</span>
        <span class="stat__value">${group.totalTeams}</span>
      </div>
      <div class="stat">
        <span class="stat__label">Temporada</span>
        <span class="stat__value" style="font-size: .85rem;">${season.name}</span>
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
