export const GAME_UI = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>It's Cak — a tiny cake's quest</title>
    <style>
      :root {
        --bg: #f4f6fb;
        --panel: #ffffff;
        --ink: #0f172a;
        --muted: #64748b;
        --line: #e5eaf2;
        --accent: #4f46e5;
        --accent-2: #06b6d4;
        --grad: linear-gradient(135deg, #4f46e5, #06b6d4);
        --warm: linear-gradient(135deg, #d97706, #eab308);
        --green: #16a34a;
        --red: #dc2626;
        --shadow: 0 1px 2px rgba(15, 23, 42, .05), 0 8px 24px rgba(15, 23, 42, .06);
        --radius: 16px;
      }
      * { box-sizing: border-box; }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        margin: 0; color: var(--ink); background: var(--bg);
        background-image: radial-gradient(1100px 420px at 12% -8%, #eef0ff 0%, rgba(238,240,255,0) 55%),
                          radial-gradient(900px 400px at 92% -12%, #e0f7ff 0%, rgba(224,247,255,0) 55%);
      }
      a { color: var(--accent); text-decoration: none; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

      header { max-width: 860px; margin: 0 auto; padding: 22px 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo { width: 38px; height: 38px; border-radius: 11px; background: var(--warm); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 19px; box-shadow: 0 6px 16px rgba(217,119,6,.35); }
      .brand h1 { font-size: 18px; margin: 0; letter-spacing: -.01em; }
      .brand p { margin: 1px 0 0; font-size: 12.5px; color: var(--muted); }
      .head-actions { display: flex; align-items: center; gap: 10px; font-size: 13px; }
      .pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: #fff; border: 1px solid var(--line); color: var(--muted); font-size: 12.5px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }

      main { max-width: 860px; margin: 0 auto; padding: 22px 20px 60px; }
      .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 26px 28px; margin-bottom: 16px; }

      .premise { text-align: center; padding: 20px 10px 16px; }
      .premise .cake { font-size: 44px; line-height: 1; margin-bottom: 12px; }
      .premise h2 { margin: 0 0 8px; font-size: 24px; letter-spacing: -.02em; }
      .premise h3 { margin: 0 0 8px; font-size: 19px; letter-spacing: -.01em; color: #0f172a; }
      .premise p { margin: 0 auto 18px; max-width: 540px; color: var(--muted); font-size: 14.5px; line-height: 1.6; }
      .premise.market { border-top: 1px solid var(--line); margin-top: 14px; }
      .premise .icon { width: 34px; height: 34px; margin: 0 auto 10px; color: var(--accent); display: block; }
      .mkt-form { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 14px; }
      .mkt-form input { padding: 9px 12px; border: 1px solid #d7dee9; border-radius: 9px; font-size: 13px; background: #fbfcfe; outline: none; width: 300px; max-width: 100%; }
      .mkt-form input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,70,229,.14); background: #fff; }
      .mkt-form input.seed { width: 110px; }
      .big-btn { font-size: 15px; font-weight: 700; border-radius: 11px; padding: 12px 26px; cursor: pointer; border: none; background: var(--warm); color: #fff; box-shadow: 0 8px 20px rgba(217,119,6,.35); }
      .big-btn.market { background: var(--grad); box-shadow: 0 8px 20px rgba(79,70,229,.35); }
      .big-btn:hover { filter: brightness(1.06); }
      .big-btn:active { transform: translateY(1px); }

      .saved h3 { margin: 0 0 12px; font-size: 14px; display: flex; align-items: center; gap: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; padding: 6px 10px; border-bottom: 1px solid var(--line); }
      td { padding: 11px 10px; border-bottom: 1px solid var(--line); font-size: 13.5px; vertical-align: middle; }
      tr:last-child td { border-bottom: none; }
      .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
      .badge.done { background: #dcfce7; color: #15803d; }
      .badge.cancelled { background: #f1f5f9; color: #64748b; }
      .badge.playing { background: #ede9fe; color: #6d28d9; }
      .badge.market { background: #e0f2fe; color: #0369a1; }
      .badge.win { background: #fef3c7; color: #b45309; }
      .badge.lose { background: #fee2e2; color: #b91c1c; }
      .badge.edge { background: #dcfce7; color: #15803d; }
      button { font-size: 13px; font-weight: 600; border-radius: 9px; padding: 8px 15px; cursor: pointer; border: 1px solid #d7dee9; background: #fff; color: var(--ink); transition: transform .05s, background .15s; }
      button:hover { background: #f6f8fc; }
      button:active { transform: translateY(1px); }
      button.primary { background: var(--grad); border: none; color: #fff; box-shadow: 0 6px 16px rgba(79,70,229,.3); }
      button.primary:hover { filter: brightness(1.06); }
      button.danger { color: var(--red); }
      button.ghost { background: transparent; border-color: transparent; color: var(--muted); }
      .empty { text-align: center; color: var(--muted); padding: 20px 0 8px; font-size: 13.5px; }

      .meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
      .meta .status { font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .node { text-align: center; padding: 22px 8px 10px; }
      .node .eyebrow { font-size: 11.5px; text-transform: uppercase; letter-spacing: .12em; color: var(--accent); font-weight: 700; }
      .node h2 { margin: 8px 0 14px; font-size: 25px; letter-spacing: -.02em; line-height: 1.2; }
      .node .prose { max-width: 560px; margin: 0 auto 20px; font-size: 15.5px; line-height: 1.75; color: #1e293b; }
      .choices { display: flex; flex-direction: column; gap: 10px; max-width: 520px; margin: 0 auto; }
      .choices button { font-size: 14.5px; padding: 13px 18px; border-radius: 12px; border: 1px solid #d7dee9; background: #fbfcfe; text-align: left; }
      .choices button:hover { border-color: var(--accent); background: #f3f4ff; }

      .mkt { max-width: 600px; margin: 0 auto; text-align: center; }
      .purse { font-size: 34px; font-weight: 800; letter-spacing: -.02em; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
      .purse small { font-size: 14px; color: var(--muted); font-weight: 500; -webkit-text-fill-color: var(--muted); }
      .quotes { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin: 14px 0 4px; }
      .quote { padding: 10px 18px; border-radius: 12px; background: #f8fafd; border: 1px solid var(--line); font-size: 13.5px; }
      .quote .q { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
      .quote .p { font-size: 19px; font-weight: 700; margin-top: 2px; }
      .quote .p.yes { color: var(--green); }
      .quote .p.no { color: var(--red); }
      .statrow { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin: 12px 0 0; }
      .statrow .chip { padding: 4px 11px; border-radius: 999px; background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 600; }
      .statrow .chip.good { background: #dcfce7; color: #15803d; }
      .statrow .chip.bad { background: #fee2e2; color: #b91c1c; }
      .hist { max-width: 560px; margin: 18px auto 0; text-align: left; }
      .hist h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 8px; }
      .hist .row { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; padding: 6px 2px; border-bottom: 1px dashed var(--line); }
      .hist .row:last-child { border-bottom: none; }
      .hist .row .pl { font-weight: 700; }
      .hist .row .pl.pos { color: var(--green); }
      .hist .row .pl.neg { color: var(--red); }

      .progress { height: 8px; background: #eef1f7; border-radius: 999px; overflow: hidden; margin: 18px 0 0; }
      .progress > div { height: 100%; background: var(--grad); border-radius: 999px; transition: width .5s; }

      .inv { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 18px 0 4px; }
      .inv .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: 12.5px; font-weight: 600; }
      .foot-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 18px; }
      .end { text-align: center; padding: 18px 10px 10px; }
      .end .trophy { font-size: 44px; line-height: 1; margin-bottom: 10px; }
      .end h2 { margin: 0 0 10px; font-size: 24px; letter-spacing: -.02em; }
      .end.win h2 { color: #b45309; }
      .end .prose { max-width: 540px; margin: 0 auto 20px; font-size: 15.5px; line-height: 1.75; color: #1e293b; }

      .err { color: var(--red); font-size: 13.5px; text-align: center; padding: 16px; }
      footer { max-width: 860px; margin: 0 auto; padding: 0 20px 34px; color: #94a3b8; font-size: 12px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">
        <div class="logo">C</div>
        <div>
          <h1>It's Cak</h1>
          <p>A tiny cake's quest to choose its own name</p>
        </div>
      </div>
      <div class="head-actions">
        <span class="pill"><a href="/">Chit dashboard</a></span>
        <span class="pill"><a href="/api/docs/html" target="_blank">API docs</a></span>
      </div>
    </header>

    <main>
      <div class="card" id="home">
        <div class="premise">
          <div class="cake">&#127854;</div>
          <h2>The story adventure</h2>
          <p>
            You are Cak, a small frosted cake with legs and a big ambition. Gather Sugar Dust,
            a Whispering Berry, and a Spark of Yeast-Fire to earn your name. Every step is
            saved as a Continue checkpoint on the Chit platform.
          </p>
          <button class="big-btn" id="begin">Begin the journey</button>
        </div>
        <div class="premise market">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16h16"/><path d="M7 14l4-4 3 3 5-6"/></svg>
          <h3>Play the market</h3>
          <p>
            Trade the windows the agent's detection engine finds: lock in real arbitrage
            edges, or gamble a single side while the market resolves. Reach the Grand Bake
            by growing 100 frostings past 115. A seeded simulation decides every outcome.
          </p>
          <div class="mkt-form">
            <input type="url" id="mktUrl" placeholder="snapshot URL (optional — sim mode used otherwise)" />
            <input type="number" class="seed" id="mktSeed" placeholder="seed" min="0" />
          </div>
          <button class="big-btn market" id="beginMarket">Play the market</button>
        </div>
      </div>

      <div class="card saved" id="saved" style="display:none">
        <h3>Saved games</h3>
        <table>
          <thead><tr><th>Scene</th><th>Kind</th><th>Moves</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody id="savedRows"></tbody>
        </table>
        <div class="empty" id="savedEmpty">No saved games yet &mdash; begin your journey above.</div>
      </div>

      <div class="card" id="play" style="display:none">
        <div class="meta">
          <span class="status"><span class="badge" id="playStatus">playing</span><span id="playMoves" class="mono"></span></span>
          <span class="status mono" id="playId"></span>
        </div>
        <div id="scene"></div>
        <div class="progress" id="bar"><div></div></div>
      </div>

      <div class="card err" id="err" style="display:none"></div>
    </main>

    <footer>
      <span>It's Cak &mdash; powered by the Chit Continue session runtime and the Ollyba detection engine.</span>
      <span class="mono">POST /game/new &middot; POST /game/:id/act</span>
    </footer>

    <script>
      const $ = (id) => document.getElementById(id);
      const home = $('home'), saved = $('saved'), play = $('play'), err = $('err');
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const fmt = (n) => (n == null || isNaN(n) ? '0.00' : Number(n).toFixed(2));
      const api = async (url, opts) => {
        const res = await fetch(url, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
        return data;
      };
      const KEY = 'cak:last';
      let current = null;
      let ended = false;

      function showError(e) {
        err.style.display = 'block';
        err.textContent = e && e.message ? e.message : String(e);
        play.style.display = 'none';
        home.style.display = 'block';
        saved.style.display = 'block';
      }

      async function refreshSaved() {
        try {
          const data = await api('/game');
          const games = data.games || [];
          $('savedEmpty').style.display = games.length ? 'none' : 'block';
          $('savedRows').innerHTML = games.map((g) => {
            const statusCls = g.status === 'done' ? 'done' : g.status === 'cancelled' ? 'cancelled' : 'playing';
            const label = g.outcome ? (g.outcome === 'win' ? 'legend' : 'ended') : (g.status === 'cancelled' ? 'abandoned' : 'in progress');
            const kindBadge = g.kind === 'market' ? '<span class="badge market">market</span> ' : '';
            return '<tr>' +
              '<td>' + esc(g.nodeTitle) + '</td>' +
              '<td>' + kindBadge + '</td>' +
              '<td class="mono">' + esc(g.moves) + '</td>' +
              '<td><span class="badge ' + statusCls + '">' + esc(label) + '</span></td>' +
              '<td style="text-align:right"><button data-continue="' + esc(g.id) + '">' + (g.outcome ? 'Replay scene' : 'Continue') + '</button></td>' +
              '</tr>';
          }).join('');
          $('savedRows').querySelectorAll('button[data-continue]').forEach((b) => {
            b.addEventListener('click', () => open(b.dataset.continue));
          });
        } catch (e) { showError(e); }
      }

      function badge(status, outcome, kind) {
        if (outcome === 'win') return { cls: 'win', label: 'legend' };
        if (outcome === 'lose') return { cls: 'lose', label: 'ended' };
        if (status === 'paused' || status === 'stalled') return { cls: 'playing', label: 'paused' };
        return { cls: kind === 'market' ? 'market' : 'playing', label: 'playing' };
      }

      function renderGame(g) {
        current = g;
        ended = g.outcome !== null;
        const b = badge(g.status, g.outcome, g.kind);
        $('playStatus').className = 'badge ' + b.cls;
        $('playStatus').textContent = b.label;
        $('playId').textContent = g.id.slice(0, 8) + '…';
        $('playMoves').textContent = (g.kind === 'market' ? 'round ' + (g.market.phase !== 'end' ? g.market.round + 1 : g.market.round) + ' / ' + g.market.rounds : 'move ' + g.moves);
        $('bar').querySelector('div').style.width = Math.round(g.progress * 100) + '%';
        if (g.kind === 'market') { renderMarket(g); return; }
        const inv = g.inventory.length
          ? '<div class="inv">' + g.inventory.map((i) => '<span class="chip">' + esc(i.label) + '</span>').join('') + '</div>'
          : '<div class="inv"><span class="chip" style="background:#f1f5f9;color:#64748b">no ingredients yet</span></div>';

        if (g.outcome) {
          const win = g.outcome === 'win';
          $('scene').innerHTML =
            '<div class="end ' + (win ? 'win' : '') + '">' +
            '<div class="trophy">' + (win ? '&#127867;' : '&#127873;') + '</div>' +
            '<h2>' + (win ? 'The legend is complete' : 'The journey ends here') + '</h2>' +
            '<div class="prose">' + esc(g.text) + '</div>' +
            inv +
            '<div class="foot-actions">' +
            '<button class="primary" id="again">Begin again</button>' +
            '<button class="ghost" id="toHome">Saved games</button>' +
            '</div></div>';
          $('again').onclick = async () => { try { const d = await api('/game/new', { method: 'POST' }); renderGame(d.game); } catch (e2) { showError(e2); } };
          $('toHome').onclick = showHome;
          return;
        }

        const choices = g.choices.map((c) => '<button data-choice="' + c.index + '">' + esc(c.label) + '</button>').join('');
        $('scene').innerHTML =
          '<div class="node">' +
          '<div class="eyebrow">Chapter ' + esc(Math.min(20, Math.floor(g.progress * 20) + 1)) + '</div>' +
          '<h2>' + esc(g.nodeTitle) + '</h2>' +
          '<div class="prose">' + esc(g.text) + '</div>' +
          inv +
          (choices ? '<div class="choices">' + choices + '</div>' : '') +
          '<div class="foot-actions">' +
          '<button class="ghost" id="quit">Save &amp; quit</button>' +
          '<button class="danger" id="abandon">Abandon run</button>' +
          '</div></div>';
        bindChoices();
        $('quit').onclick = quit;
        $('abandon').onclick = abandon;
      }

      function bindChoices() {
        $('scene').querySelectorAll('button[data-choice]').forEach((b) => {
          b.addEventListener('click', async () => {
            try {
              const d = await api('/game/' + current.id + '/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choice: Number(b.dataset.choice) }) });
              renderGame(d.game);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (e2) { showError(e2); }
          });
        });
      }

      function renderMarket(g) {
        const m = g.market;
        const stats =
          '<div class="statrow">' +
          '<span class="chip">purse <b class="mono">' + fmt(m.purse) + '</b></span>' +
          '<span class="chip good">arbs ' + m.arbs + '</span>' +
          '<span class="chip">bets ' + m.gambles + '</span>' +
          '<span class="chip good">wins ' + m.wins + '</span>' +
          '<span class="chip bad">losses ' + m.losses + '</span>' +
          '<span class="chip">passes ' + m.passes + '</span>' +
          '<span class="chip mono">' + esc(m.source) + '</span>' +
          '</div>';
        const history = m.history && m.history.length
          ? '<div class="hist"><h4>Ledger</h4>' + m.history.slice(-6).map((h) =>
              '<div class="row"><span>' + esc(h.round) + '. ' + esc(h.action) + ' &mdash; ' + esc(h.question) + '</span>' +
              '<span class="pl ' + (h.result >= 0 ? 'pos' : 'neg') + '">' + (h.result >= 0 ? '+' : '') + fmt(h.result) + ' &rarr; ' + fmt(h.purseAfter) + '</span></div>'
            ).join('') + '</div>'
          : '';
        const foot = '<div class="foot-actions">' + (g.outcome ? '' : '<button class="ghost" id="quit">Save &amp; quit</button>') + '<button class="danger" id="abandon">Abandon run</button></div>';

        if (g.outcome) {
          const win = g.outcome === 'win';
          $('scene').innerHTML =
            '<div class="end ' + (win ? 'win' : '') + '">' +
            '<div class="trophy">' + (win ? '&#127867;' : '&#127873;') + '</div>' +
            '<h2>' + (win ? 'The Grand Bake is won' : 'The market closes') + '</h2>' +
            '<div class="prose">' + esc(g.text) + '</div>' +
            stats + history +
            '<div class="foot-actions">' +
            '<button class="primary" id="again">Trade again</button>' +
            '<button class="ghost" id="toHome">Saved games</button>' +
            '</div></div>';
          $('again').onclick = async () => { try { const d = await api('/game/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'market', seed: Number($('mktSeed').value) || undefined }) }); renderGame(d.game); } catch (e2) { showError(e2); } };
          $('toHome').onclick = showHome;
          return;
        }

        const quotes = (m.yesPrice !== null && m.noPrice !== null && m.phase === 'play')
          ? '<div class="quotes">' +
            '<div class="quote"><div class="q">Yes</div><div class="p yes">$' + fmt(m.yesPrice) + '</div></div>' +
            '<div class="quote"><div class="q">No</div><div class="p no">$' + fmt(m.noPrice) + '</div></div>' +
            (m.bestReturn !== null ? '<div class="quote"><div class="q">Pair locks</div><div class="p" style="color:var(--green)">+' + (m.bestReturn * 100).toFixed(2) + '%</div></div>' : '') +
            '</div>'
          : '';
        const choices = g.choices.map((c) => '<button data-choice="' + c.index + '">' + esc(c.label) + '</button>').join('');

        $('scene').innerHTML =
          '<div class="node mkt">' +
          '<div class="eyebrow">Round ' + esc(m.round + 1) + ' of ' + esc(m.rounds) + '</div>' +
          '<div class="purse">' + fmt(m.purse) + ' <small>frostings</small></div>' +
          '<h2>' + esc(g.nodeTitle) + '</h2>' +
          '<div class="prose">' + esc(g.text) + '</div>' +
          quotes +
          (choices ? '<div class="choices">' + choices + '</div>' : '') +
          stats + history + foot +
          '</div>';
        bindChoices();
        if (!g.outcome) $('quit').onclick = quit;
        $('abandon').onclick = abandon;
      }

      const quit = async () => {
        try { await api('/game/' + current.id + '/pause', { method: 'POST' }); showHome(); } catch (e2) { showError(e2); }
      };
      const abandon = async () => {
        try { await api('/game/' + current.id + '/abandon', { method: 'POST' }); showHome(); } catch (e2) { showError(e2); }
      };

      async function open(id) {
        try {
          const d = await api('/game/' + id);
          home.style.display = 'none';
          saved.style.display = 'none';
          err.style.display = 'none';
          play.style.display = 'block';
          renderGame(d.game);
        } catch (e) { showError(e); }
      }

      function showHome() {
        current = null;
        play.style.display = 'none';
        err.style.display = 'none';
        home.style.display = 'block';
        saved.style.display = 'block';
        refreshSaved();
      }

      $('begin').addEventListener('click', async () => {
        try {
          const d = await api('/game/new', { method: 'POST' });
          localStorage.setItem(KEY, d.game.id);
          open(d.game.id);
        } catch (e) { showError(e); }
      });

      $('beginMarket').addEventListener('click', async () => {
        try {
          const body = { kind: 'market' };
          const url = $('mktUrl').value.trim();
          if (url) body.sourceUrl = url;
          const seed = Number($('mktSeed').value);
          if (Number.isInteger(seed) && seed >= 0) body.seed = seed;
          const d = await api('/game/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          localStorage.setItem(KEY, d.game.id);
          open(d.game.id);
        } catch (e) { showError(e); }
      });

      setInterval(() => {
        if (current && !ended) { open(current.id); }
      }, 4000);

      showHome();
      const last = localStorage.getItem(KEY);
      if (last) open(last).catch(() => showHome());
    </script>
  </body>
</html>`;
