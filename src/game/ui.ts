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

      .premise { text-align: center; padding: 30px 10px 26px; }
      .premise .cake { font-size: 46px; line-height: 1; margin-bottom: 14px; }
      .premise h2 { margin: 0 0 8px; font-size: 24px; letter-spacing: -.02em; }
      .premise p { margin: 0 auto 22px; max-width: 520px; color: var(--muted); font-size: 14.5px; line-height: 1.6; }
      .big-btn { font-size: 15px; font-weight: 700; border-radius: 11px; padding: 12px 26px; cursor: pointer; border: none; background: var(--warm); color: #fff; box-shadow: 0 8px 20px rgba(217,119,6,.35); }
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
      button { font-size: 13px; font-weight: 600; border-radius: 9px; padding: 8px 15px; cursor: pointer; border: 1px solid #d7dee9; background: #fff; color: var(--ink); transition: transform .05s, background .15s; }
      button:hover { background: #f6f8fc; }
      button:active { transform: translateY(1px); }
      button.primary { background: var(--grad); border: none; color: #fff; box-shadow: 0 6px 16px rgba(79,70,229,.3); }
      button.primary:hover { filter: brightness(1.06); }
      button.danger { color: var(--red); }
      button.ghost { background: transparent; border-color: transparent; color: var(--muted); }
      .empty { text-align: center; color: var(--muted); padding: 20px 0 8px; font-size: 13.5px; }

      .meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
      .meta .status { font-size: 12.5px; color: var(--muted); display: flex; align-items: center; gap: 8px; }
      .node { text-align: center; padding: 26px 8px 10px; }
      .node .eyebrow { font-size: 11.5px; text-transform: uppercase; letter-spacing: .12em; color: var(--accent); font-weight: 700; }
      .node h2 { margin: 8px 0 14px; font-size: 26px; letter-spacing: -.02em; }
      .node .prose { max-width: 560px; margin: 0 auto 24px; font-size: 15.5px; line-height: 1.75; color: #1e293b; }
      .choices { display: flex; flex-direction: column; gap: 10px; max-width: 520px; margin: 0 auto; }
      .choices button { font-size: 14.5px; padding: 13px 18px; border-radius: 12px; border: 1px solid #d7dee9; background: #fbfcfe; text-align: left; }
      .choices button:hover { border-color: var(--accent); background: #f3f4ff; }

      .progress { height: 8px; background: #eef1f7; border-radius: 999px; overflow: hidden; margin: 18px 0 0; }
      .progress > div { height: 100%; background: var(--grad); border-radius: 999px; transition: width .5s; }

      .inv { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 18px 0 4px; }
      .inv .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: 12.5px; font-weight: 600; }
      .foot-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 18px; }
      .end { text-align: center; padding: 22px 10px 10px; }
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
          <h2>It's Cak</h2>
          <p>
            You are Cak, a small frosted cake with legs and a big ambition. Tonight is the
            Grand Bake: gather Sugar Dust, a Whispering Berry, and a Spark of Yeast-Fire,
            and you may choose your own name. Every step is saved as a Continue checkpoint
            on the Chit platform &mdash; quit anytime, and resume the exact scene later.
          </p>
          <button class="big-btn" id="begin">Begin the journey</button>
        </div>
      </div>

      <div class="card saved" id="saved" style="display:none">
        <h3>Saved games</h3>
        <table>
          <thead><tr><th>Scene</th><th>Moves</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
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
      <span>It's Cak &mdash; powered by the Chit Continue session runtime. Your progress is checkpointed after every move.</span>
      <span class="mono">POST /game/new &middot; POST /game/:id/act</span>
    </footer>

    <script>
      const $ = (id) => document.getElementById(id);
      const home = $('home'), saved = $('saved'), play = $('play'), err = $('err');
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
            const badgeCls = g.status === 'done' ? 'done' : g.status === 'cancelled' ? 'cancelled' : 'playing';
            const label = g.outcome ? (g.outcome === 'win' ? 'legend' : g.outcome) : (g.status === 'cancelled' ? 'abandoned' : 'in progress');
            return '<tr>' +
              '<td>' + esc(g.nodeTitle) + '</td>' +
              '<td class="mono">' + esc(g.moves) + '</td>' +
              '<td><span class="badge ' + badgeCls + '">' + esc(label) + '</span></td>' +
              '<td style="text-align:right"><button data-continue="' + esc(g.id) + '">' + (g.outcome ? 'Replay scene' : 'Continue') + '</button></td>' +
              '</tr>';
          }).join('');
          $('savedRows').querySelectorAll('button[data-continue]').forEach((b) => {
            b.addEventListener('click', () => open(b.dataset.continue));
          });
        } catch (e) { showError(e); }
      }

      function badge(status, outcome) {
        if (outcome === 'win') return { cls: 'done', label: 'legend' };
        if (outcome === 'lose') return { cls: 'cancelled', label: 'ended' };
        if (status === 'paused' || status === 'stalled') return { cls: 'playing', label: 'paused' };
        return { cls: 'playing', label: 'playing' };
      }

      function renderGame(g) {
        current = g;
        ended = g.outcome !== null;
        const b = badge(g.status, g.outcome);
        $('playStatus').className = 'badge ' + b.cls;
        $('playStatus').textContent = b.label;
        $('playId').textContent = g.id.slice(0, 8) + '…';
        $('playMoves').textContent = 'move ' + g.moves;
        $('bar').querySelector('div').style.width = Math.round(g.progress * 100) + '%';
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
        $('scene').querySelectorAll('button[data-choice]').forEach((b) => {
          b.addEventListener('click', async () => {
            try {
              const d = await api('/game/' + current.id + '/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choice: Number(b.dataset.choice) }) });
              renderGame(d.game);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (e2) { showError(e2); }
          });
        });
        $('quit').onclick = async () => {
          try { const d = await api('/game/' + current.id + '/pause', { method: 'POST' }); showHome(); } catch (e2) { showError(e2); }
        };
        $('abandon').onclick = async () => {
          try { const d = await api('/game/' + current.id + '/abandon', { method: 'POST' }); showHome(); } catch (e2) { showError(e2); }
        };
      }

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

      setInterval(() => {
        if (current && !ended) { open(current.id); }
      }, 4000);

      showHome();
      const last = localStorage.getItem(KEY);
      if (last) open(last).catch(() => showHome());
    </script>
  </body>
</html>`;
