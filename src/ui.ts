export const PLATFORM_UI = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chit — Agent Platform for Trading</title>
    <style>
      :root { --ink: #1a1a1a; --muted: #666; --line: #eee; --accent: #1c7ed6; }
      * { box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; margin: 0; color: var(--ink); background: #fff; }
      header { border-bottom: 1px solid var(--line); padding: 1rem 1.5rem; display: flex; align-items: baseline; gap: 1.5rem; flex-wrap: wrap; }
      header h1 { font-size: 1.25rem; margin: 0; }
      header nav { display: flex; gap: .25rem; }
      header nav button { border: none; background: none; padding: .4rem .8rem; cursor: pointer; border-radius: 6px; font-size: .95rem; color: var(--muted); }
      header nav button.active { background: #e7f1fb; color: var(--accent); font-weight: 600; }
      main { max-width: 960px; margin: 1.5rem auto; padding: 0 1rem; }
      .panel { display: none; }
      .panel.active { display: block; }
      form { display: flex; gap: .5rem; margin: 1rem 0; flex-wrap: wrap; }
      input, select { padding: .5rem; border: 1px solid #ccc; border-radius: 4px; }
      input[type=url], input[name=url] { flex: 1; min-width: 16rem; }
      button { padding: .5rem .9rem; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #fff; }
      button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--line); vertical-align: middle; font-size: .9rem; }
      th { color: var(--muted); font-weight: 600; }
      .bar { background: #eee; height: 8px; border-radius: 4px; overflow: hidden; min-width: 110px; }
      .bar > div { background: #2f9e44; height: 100%; transition: width .3s; }
      .badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .72rem; }
      .done { background: #d3f9d8; color: #2b8a3e; }
      .pending, .queued { background: #fff3bf; color: #862e9c; }
      .active, .resuming, .retrying { background: #d0ebff; color: #1c7ed6; }
      .paused, .stalled { background: #ffe8cc; color: #e8590c; }
      .failed, .cancelled { background: #ffc9c9; color: #c92a2a; }
      .running { background: #d0ebff; color: #1c7ed6; }
      .stopped { background: #ffe8cc; color: #e8590c; }
      .error { background: #ffc9c9; color: #c92a2a; }
      .empty { color: #888; padding: 2rem 0; }
      .err { color: #c92a2a; margin: .5rem 0; }
      .bytes { font-size: .8rem; color: var(--muted); white-space: nowrap; }
      .muted { color: var(--muted); font-size: .85rem; }
      .mono { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; }
      a { color: var(--accent); }
      .actions button { margin-right: .25rem; padding: .25rem .6rem; font-size: .8rem; }
    </style>
  </head>
  <body>
    <header>
      <h1>Chit — Agent Platform for Trading</h1>
      <nav>
        <button data-tab="sessions" class="active">Sessions</button>
        <button data-tab="downloads">Downloads</button>
        <button data-tab="polyarb">Polyarb</button>
      </nav>
      <span class="muted"><a href="/api/docs/html" target="_blank">API docs</a></span>
    </header>

    <main>
      <section id="panel-sessions" class="panel active">
        <h2>Sessions</h2>
        <p class="muted">Every agent, download and scan is a resumable Continue session. Interrupt anything and it picks up from its last checkpoint.</p>
        <div id="serr" class="err"></div>
        <table>
          <thead><tr><th>App</th><th>Status</th><th>Progress</th><th>Step</th><th>Actions</th></tr></thead>
          <tbody id="srows"></tbody>
        </table>
        <p id="sempty" class="empty">No sessions yet.</p>
      </section>

      <section id="panel-downloads" class="panel">
        <h2>Download Box</h2>
        <p class="muted">Paste a URL — this machine downloads it in the background with Range-based resume.</p>
        <form id="dadd">
          <input type="url" id="durl" placeholder="https://example.com/file.zip" required />
          <input type="text" id="dname" placeholder="filename (optional)" style="max-width: 14rem" />
          <button type="submit" class="primary">Download</button>
        </form>
        <div id="derr" class="err"></div>
        <table>
          <thead><tr><th>File</th><th>Status</th><th>Progress</th><th></th></tr></thead>
          <tbody id="drows"></tbody>
        </table>
        <p id="dempty" class="empty">No jobs yet. Add a URL above.</p>
      </section>

      <section id="panel-polyarb" class="panel">
        <h2>Polyarb — Polymarket arbitrage scanner</h2>
        <p class="muted">Scan Polymarket for within-market and cross-market mispricings. Sim mode is offline and deterministic; live mode reads the real gamma API (read-only, no orders).</p>
        <form id="pstart">
          <select id="pmode">
            <option value="sim">sim</option>
            <option value="live">live</option>
          </select>
          <input type="number" id="piter" value="10" min="1" max="100000" style="width: 6rem" title="iterations" />
          <input type="number" id="pmin" value="0.5" step="0.1" min="0" style="width: 6rem" title="min return %" />
          <input type="text" id="pseed" placeholder="seed (optional)" style="max-width: 10rem" />
          <input type="text" id="psession" placeholder="resume session id (optional)" class="mono" style="min-width: 14rem" />
          <button type="submit" class="primary">Start scan</button>
        </form>
        <div id="perr" class="err"></div>
        <table>
          <thead><tr><th>Scan</th><th>Mode</th><th>Status</th><th>Iterations</th><th>Found</th><th>Started</th><th></th></tr></thead>
          <tbody id="prows"></tbody>
        </table>
        <p id="pempty" class="empty">No scans yet.</p>
      </section>
    </main>

    <script>
      const fmtBytes = (n) => {
        if (n == null) return '';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KiB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MiB';
        return (n / 1073741824).toFixed(2) + ' GiB';
      };
      const badge = (s) => '<span class="badge ' + s + '">' + s + '</span>';
      const api = async (url, opts) => {
        const res = await fetch(url, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
        return data;
      };
      document.querySelectorAll('header nav button').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('header nav button').forEach((b) => b.classList.remove('active'));
          document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
        });
      });

      // ---- Sessions tab ----
      const srows = document.getElementById('srows');
      const sempty = document.getElementById('sempty');
      const serr = document.getElementById('serr');
      const sAction = (id, verb) => api('/api/sessions/' + id + '/' + verb, { method: 'POST' }).catch((e) => { serr.textContent = e.message; });
      const sButtons = (s) => {
        let html = '';
        const run = ['active', 'queued', 'stalled', 'retrying', 'resuming'];
        if (run.indexOf(s.status) >= 0) html += '<button onclick="sAction(\'' + s.id + '\',\'pause\')">Pause</button> ';
        if (s.status === 'paused' || s.status === 'stalled') html += '<button onclick="sAction(\'' + s.id + '\',\'resume\')">Resume</button> ';
        if (s.status === 'stalled') html += '<button onclick="sAction(\'' + s.id + '\',\'retry\')">Retry</button> ';
        if (s.status !== 'done' && s.status !== 'cancelled' && s.status !== 'failed') html += '<button onclick="sAction(\'' + s.id + '\',\'cancel\')">Cancel</button> ';
        return html;
      };
      async function refreshSessions() {
        try {
          const data = await api('/api/sessions?limit=100');
          const sessions = data.sessions || [];
          sempty.style.display = sessions.length ? 'none' : 'block';
          srows.innerHTML = sessions.map((s) => {
            const pct = Math.round((s.progress || 0) * 100);
            const app = (s.metadata && (s.metadata.app || s.metadata.filename)) || 'session';
            return '<tr>' +
              '<td>' + app + '<div class="bytes mono">' + s.id.slice(0, 8) + '&hellip;</div></td>' +
              '<td>' + badge(s.status) + '</td>' +
              '<td><div class="bar"><div style="width:' + pct + '%"></div></div></td>' +
              '<td>' + s.currentStep + (s.totalSteps ? '/' + s.totalSteps : '') + '</td>' +
              '<td class="actions">' + sButtons(s) + '</td>' +
            '</tr>';
          }).join('');
          serr.textContent = '';
        } catch (e) { serr.textContent = "Can't reach sessions: " + e; }
      }
      window.sAction = sAction;

      // ---- Downloads tab ----
      const drows = document.getElementById('drows');
      const dempty = document.getElementById('dempty');
      const derr = document.getElementById('derr');
      const dAction = (id, verb) => api('/downloads/jobs/' + id + '/' + verb, { method: 'POST' }).catch((e) => { derr.textContent = e.message; });
      const dButtons = (job) => {
        const s = job.session.status;
        let html = '';
        const run = ['active', 'queued', 'stalled', 'retrying', 'resuming'];
        if (run.indexOf(s) >= 0) html += '<button onclick="dAction(\'' + job.session.id + '\',\'pause\')">Pause</button> ';
        if (s === 'paused' || s === 'stalled') html += '<button onclick="dAction(\'' + job.session.id + '\',\'resume\')">Resume</button> ';
        if (s === 'stalled') html += '<button onclick="dAction(\'' + job.session.id + '\',\'retry\')">Retry</button> ';
        if (s !== 'done' && s !== 'cancelled' && s !== 'failed') html += '<button onclick="dAction(\'' + job.session.id + '\',\'cancel\')">Cancel</button> ';
        if (job.file.done) html += '<a href="/downloads/files/' + encodeURIComponent(job.file.filename) + '">Open</a>';
        return html;
      };
      async function refreshDownloads() {
        try {
          const data = await api('/downloads/jobs');
          const jobs = data.jobs || [];
          dempty.style.display = jobs.length ? 'none' : 'block';
          drows.innerHTML = jobs.map((job) => {
            const s = job.session.status;
            const offset = job.file.offset || 0;
            const length = job.file.length;
            const pct = length ? Math.min(100, Math.round(offset / length * 100)) : 0;
            const bytes = (job.file.done ? job.file.size : offset) + ' / ' + (length ? fmtBytes(length) : '?');
            return '<tr>' +
              '<td>' + job.file.filename + '<div class="bytes">' + bytes + '</div></td>' +
              '<td>' + badge(s) + '</td>' +
              '<td><div class="bar"><div style="width:' + pct + '%"></div></div></td>' +
              '<td class="actions">' + dButtons(job) + '</td>' +
            '</tr>';
          }).join('');
          derr.textContent = '';
        } catch (e) { derr.textContent = "Can't reach downloads: " + e; }
      }
      window.dAction = dAction;
      document.getElementById('dadd').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = { url: document.getElementById('durl').value };
        const name = document.getElementById('dname').value.trim();
        if (name) body.filename = name;
        try {
          await api('/downloads/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          document.getElementById('durl').value = '';
          document.getElementById('dname').value = '';
          refreshDownloads();
        } catch (err) { derr.textContent = err.message; }
      });

      // ---- Polyarb tab ----
      const prows = document.getElementById('prows');
      const pempty = document.getElementById('pempty');
      const perr = document.getElementById('perr');
      async function refreshPolyarb() {
        try {
          const data = await api('/polyarb/scans');
          const scans = data.scans || [];
          pempty.style.display = scans.length ? 'none' : 'block';
          prows.innerHTML = scans.map((scan) => {
            const short = scan.id.slice(0, 8);
            const stop = scan.status === 'running'
              ? '<button onclick="pStop(\'' + scan.id + '\')">Stop</button> '
              : '';
            return '<tr>' +
              '<td class="mono">' + short + '</td>' +
              '<td>' + scan.mode + '</td>' +
              '<td>' + badge(scan.status) + '</td>' +
              '<td>' + scan.iterations + '</td>' +
              '<td>' + scan.found + '</td>' +
              '<td>' + new Date(scan.startedAt).toLocaleTimeString() + '</td>' +
              '<td class="actions">' + stop + '</td>' +
            '</tr>';
          }).join('');
          perr.textContent = '';
        } catch (e) { perr.textContent = "Can't reach polyarb: " + e; }
      }
      window.pStop = (id) => api('/polyarb/scans/' + id + '/stop', { method: 'POST' }).then(refreshPolyarb).catch((e) => { perr.textContent = e.message; });
      document.getElementById('pstart').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          mode: document.getElementById('pmode').value,
          iterations: Number(document.getElementById('piter').value),
          minReturn: Number(document.getElementById('pmin').value) / 100,
        };
        const seed = document.getElementById('pseed').value.trim();
        if (seed) body.seed = Number(seed);
        const sessionId = document.getElementById('psession').value.trim();
        if (sessionId) body.sessionId = sessionId;
        try {
          await api('/polyarb/scans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          refreshPolyarb();
        } catch (err) { perr.textContent = err.message; }
      });

      refreshSessions();
      refreshDownloads();
      refreshPolyarb();
      setInterval(refreshSessions, 2000);
      setInterval(refreshDownloads, 1500);
      setInterval(refreshPolyarb, 2000);
    </script>
  </body>
</html>`;
