export const PLATFORM_UI = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chit — Agent for Trading</title>
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
        --green: #16a34a;
        --amber: #d97706;
        --red: #dc2626;
        --shadow: 0 1px 2px rgba(15, 23, 42, .05), 0 8px 24px rgba(15, 23, 42, .06);
        --radius: 14px;
      }
      * { box-sizing: border-box; }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        margin: 0; color: var(--ink); background: var(--bg);
        background-image: radial-gradient(1100px 400px at 15% -8%, #eef0ff 0%, rgba(238,240,255,0) 55%),
                          radial-gradient(900px 380px at 95% -10%, #e0f7ff 0%, rgba(224,247,255,0) 55%);
      }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

      header { max-width: 1080px; margin: 0 auto; padding: 22px 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .brand { display: flex; align-items: center; gap: 12px; }
      .logo { width: 38px; height: 38px; border-radius: 11px; background: var(--grad); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 19px; box-shadow: 0 6px 16px rgba(79,70,229,.35); }
      .brand h1 { font-size: 18px; margin: 0; letter-spacing: -.01em; }
      .brand p { margin: 1px 0 0; font-size: 12.5px; color: var(--muted); }
      .head-actions { display: flex; align-items: center; gap: 10px; font-size: 13px; }
      .pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: #fff; border: 1px solid var(--line); color: var(--muted); font-size: 12.5px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px rgba(22,163,74,.18); }
      .dot.off { background: #cbd5e1; box-shadow: none; }

      main { max-width: 1080px; margin: 0 auto; padding: 18px 20px 60px; }

      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0; }
      .stat { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow); }
      .stat .k { font-size: 11.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 600; }
      .stat .v { font-size: 24px; font-weight: 700; margin-top: 3px; letter-spacing: -.02em; }
      .stat .v small { font-size: 13px; color: var(--muted); font-weight: 500; }
      @media (max-width: 760px) { .stats { grid-template-columns: repeat(2, 1fr); } }

      .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px 20px; margin-bottom: 16px; }
      .card h2 { margin: 0 0 14px; font-size: 15px; display: flex; align-items: center; gap: 8px; }
      .card h2 svg { width: 17px; height: 17px; color: var(--accent); }

      form { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; }
      .field { display: flex; flex-direction: column; gap: 5px; }
      .field label { font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
      .field.full { grid-column: 1 / -1; }
      input, select {
        padding: 9px 11px; border: 1px solid #d7dee9; border-radius: 9px; font-size: 13.5px;
        background: #fbfcfe; color: var(--ink); outline: none; transition: border-color .15s, box-shadow .15s; width: 100%;
      }
      input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,70,229,.14); background: #fff; }
      .run-row { display: flex; gap: 10px; grid-column: 1 / -1; }
      .run-row input { flex: 1; }
      button { font-size: 13.5px; font-weight: 600; border-radius: 9px; padding: 9px 16px; cursor: pointer; border: 1px solid #d7dee9; background: #fff; color: var(--ink); transition: transform .05s, box-shadow .15s, background .15s; }
      button:hover { background: #f6f8fc; }
      button:active { transform: translateY(1px); }
      button.primary { background: var(--grad); border: none; color: #fff; box-shadow: 0 6px 16px rgba(79,70,229,.3); }
      button.primary:hover { filter: brightness(1.06); }
      button.small { padding: 4px 10px; font-size: 12px; border-radius: 7px; }
      button.danger { color: var(--red); }
      button.ghost { background: transparent; border-color: transparent; color: var(--muted); }
      .err { color: var(--red); font-size: 13px; margin-top: 10px; min-height: 0; }
      .hint { font-size: 12.5px; color: var(--muted); margin: 8px 0 0; }

      .stepper { display: flex; align-items: center; justify-content: center; gap: 0; margin: 6px 0 18px; }
      .step { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--muted); font-weight: 600; }
      .step .n { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12.5px; background: #eef1f7; border: 1px solid var(--line); transition: all .25s; }
      .step.active { color: var(--accent); }
      .step.active .n { background: var(--grad); color: #fff; border-color: transparent; box-shadow: 0 4px 12px rgba(79,70,229,.35); }
      .step.done { color: var(--green); }
      .step.done .n { background: #dcfce7; color: var(--green); border-color: #bbf7d0; }
      .connector { width: 52px; height: 2px; background: var(--line); margin: 0 12px; border-radius: 2px; }
      .connector.on { background: var(--green); }

      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; padding: 6px 10px; border-bottom: 1px solid var(--line); }
      td { padding: 12px 10px; border-bottom: 1px solid var(--line); font-size: 13.5px; vertical-align: middle; }
      tr:last-child td { border-bottom: none; }
      tbody tr { cursor: pointer; transition: background .12s; }
      tbody tr:hover { background: #f8fafd; }
      tbody tr.running { background: linear-gradient(90deg, rgba(79,70,229,.05), transparent 70%); }
      .file-cell .f { font-weight: 600; font-size: 13.5px; }
      .file-cell .s { font-size: 11.5px; color: var(--muted); margin-top: 1px; }
      .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
      .badge.done { background: #dcfce7; color: #15803d; }
      .badge.download { background: #e0f2fe; color: #0369a1; }
      .badge.scan { background: #ede9fe; color: #6d28d9; }
      .badge.running { background: #ede9fe; color: #6d28d9; }
      .badge.stopped { background: #ffedd5; color: #c2410c; }
      .badge.error { background: #fee2e2; color: #b91c1c; }
      .pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.1s ease-in-out infinite; }
      @keyframes pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
      .actions { white-space: nowrap; }
      .actions button { margin-right: 6px; }
      .empty { text-align: center; color: var(--muted); padding: 34px 0 26px; font-size: 13.5px; }
      .empty .big { font-size: 15px; color: #94a3b8; margin-bottom: 6px; font-weight: 600; }

      .detail { display: none; }
      .detail.open { display: block; }
      .detail-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
      .detail-head h2 { margin: 0; font-size: 15px; display: flex; align-items: center; gap: 10px; }
      .kvgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 14px; }
      .kv { background: #f8fafd; border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; }
      .kv .k { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
      .kv .v { font-size: 14px; font-weight: 600; margin-top: 2px; }
      @media (max-width: 760px) { .kvgrid { grid-template-columns: repeat(2, 1fr); } }
      .progress { height: 8px; background: #eef1f7; border-radius: 999px; overflow: hidden; margin: 4px 0 14px; }
      .progress > div { height: 100%; background: var(--grad); border-radius: 999px; transition: width .4s; width: 0; }
      .progress.indet > div { width: 40% !important; animation: slide 1.4s ease-in-out infinite; }
      @keyframes slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
      .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      details.json { border: 1px solid var(--line); border-radius: 10px; background: #0f172a; color: #e2e8f0; font-size: 12.5px; }
      details.json summary { cursor: pointer; padding: 9px 12px; color: #94a3b8; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
      details.json pre { margin: 0; padding: 0 14px 12px; overflow: auto; max-height: 260px; }
      footer { max-width: 1080px; margin: 0 auto; padding: 0 20px 34px; color: #94a3b8; font-size: 12px; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">
        <div class="logo">C</div>
        <div>
          <h1>Chit</h1>
          <p>Agent for Trading</p>
        </div>
      </div>
      <div class="head-actions">
        <span class="pill"><span class="dot" id="statusDot"></span><span id="statusText">connecting&hellip;</span></span>
        <span class="pill"><a href="/api/docs/html" target="_blank">API docs</a></span>
      </div>
    </header>

    <main>
      <div class="stats">
        <div class="stat"><div class="k">Sessions</div><div class="v" id="statSessions">&ndash;</div></div>
        <div class="stat"><div class="k">Agent runs</div><div class="v" id="statRuns">&ndash;</div></div>
        <div class="stat"><div class="k">Opportunities</div><div class="v" id="statFound">&ndash;</div></div>
        <div class="stat"><div class="k">Best return</div><div class="v" id="statReturn"><small>never found</small></div></div>
      </div>

      <div class="card">
        <h2>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16h16"/><path d="M7 14l4-4 3 3 5-6"/></svg>
          Run an agent
        </h2>
        <form id="start">
          <div class="field full">
            <label for="url">Data source URL</label>
            <input type="url" id="url" placeholder="https://example.com/markets.json — downloaded, then scanned for arbitrage" required />
          </div>
          <div class="field"><label for="name">Filename</label><input type="text" id="name" placeholder="markets.json (optional)" /></div>
          <div class="field"><label for="mode">Mode</label>
            <select id="mode"><option value="sim">sim</option><option value="live">live</option></select>
          </div>
          <div class="field"><label for="iter">Iterations</label><input type="number" id="iter" value="10" min="1" max="100000" /></div>
          <div class="field"><label for="min">Min return</label><input type="number" id="min" value="0.5" step="0.1" min="0" /> <small class="hint" style="margin:0">%</small></div>
          <div class="field"><label for="seed">Seed</label><input type="text" id="seed" placeholder="optional" /></div>
          <div class="field"><label for="session">Resume session</label><input type="text" id="session" placeholder="paste a session id (optional)" class="mono" /></div>
          <div class="run-row">
            <button type="submit" class="primary">Run agent</button>
          </div>
        </form>
        <div class="err" id="err"></div>
      </div>

      <div class="stepper" id="stepper">
        <span class="step" id="s-download"><span class="n">1</span>Download</span>
        <span class="connector" id="c-1"></span>
        <span class="step" id="s-scan"><span class="n">2</span>Scan</span>
        <span class="connector" id="c-2"></span>
        <span class="step" id="s-report"><span class="n">3</span>Report</span>
      </div>

      <div class="card">
        <h2>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
          Runs
        </h2>
        <table>
          <thead><tr><th>File</th><th>Stage</th><th>Progress</th><th>Found</th><th>Iterations</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
        <div class="empty" id="empty">
          <div class="big">No runs yet</div>
          <div>Paste a data source above and hit Run — the agent downloads, scans and reports in one resumable session.</div>
        </div>
      </div>

      <div class="card detail" id="detail">
        <div class="detail-head">
          <h2 id="detailTitle">Run</h2>
          <button class="ghost small" id="detailClose">Close</button>
        </div>
        <div class="progress" id="detailBar"><div></div></div>
        <div class="kvgrid" id="detailGrid"></div>
        <div class="detail-actions" id="detailActions"></div>
        <details class="json"><summary>Session state</summary><pre id="detailJson"></pre></details>
      </div>
    </main>

    <footer>
      <span>One agent &middot; one session &middot; resume from the exact byte or iteration.</span>
      <span class="mono">GET /agent/runs &middot; POST /agent/runs/:id/stop</span>
    </footer>

    <script>
      const $ = (id) => document.getElementById(id);
      const rows = $('rows'), empty = $('empty'), err = $('err');
      const detail = $('detail'), detailGrid = $('detailGrid'), detailActions = $('detailActions'), detailJson = $('detailJson'), detailTitle = $('detailTitle'), detailBar = $('detailBar');
      const steps = { download: $('s-download'), scan: $('s-scan'), report: $('s-report') };
      const connectors = { download: $('c-1'), scan: $('c-2') };
      let selectedId = null;

      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const fmt = (n) => {
        if (n == null || isNaN(n)) return '';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KiB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MiB';
        return (n / 1073741824).toFixed(2) + ' GiB';
      };
      const pct = (n) => (Math.round((n || 0) * 100)) + '%';
      const api = async (url, opts) => {
        const res = await fetch(url, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
        return data;
      };
      const badge = (stage, status) => {
        const cls = status === 'running' ? stage : status;
        const running = status === 'running' ? '<span class="pulse"></span>' : '';
        const label = status === 'running'
          ? (stage === 'download' ? 'downloading' : 'scanning')
          : status;
        return '<span class="badge ' + cls + '">' + running + esc(label) + '</span>';
      };

      function markSteps(runs) {
        const run = runs.find((r) => r.status === 'running') || null;
        for (const k of ['download', 'scan', 'report']) {
          steps[k].classList.remove('active', 'done');
        }
        connectors.download.classList.remove('on');
        connectors.scan.classList.remove('on');
        if (!run) return;
        if (run.stage === 'download') steps.download.classList.add('active');
        if (run.stage === 'scan') { steps.download.classList.add('done'); connectors.download.classList.add('on'); steps.scan.classList.add('active'); }
        if (run.stage === 'done') { steps.download.classList.add('done'); steps.scan.classList.add('done'); connectors.download.classList.add('on'); connectors.scan.classList.add('on'); steps.report.classList.add('done'); }
      }

      async function renderDetail() {
        if (!selectedId) { detail.classList.remove('open'); return; }
        try {
          const d = await api('/api/sessions/' + selectedId);
          const s = d.session || {};
          const data = s.data || {};
          detailTitle.innerHTML = esc(data.file && data.file.filename ? data.file.filename : selectedId.slice(0, 8) + '&hellip;') + ' ' + badge(s.status === 'done' ? 'done' : 'done', s.status === 'done' ? 'done' : 'running');
          const bar = detailBar.querySelector('div');
          if (s.status === 'done' || s.status === 'failed' || s.status === 'cancelled') {
            detailBar.classList.remove('indet');
            bar.style.width = pct(s.progress);
          } else {
            detailBar.classList.add('indet');
          }
          const kv = (k, v) => '<div class="kv"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
          detailGrid.innerHTML =
            kv('Status', esc(s.status)) +
            kv('Progress', esc(pct(s.progress)) + ' &middot; step ' + esc(s.currentStep)) +
            kv('Opportunities', esc(data.opportunitiesFound != null ? data.opportunitiesFound : (data.opportunities != null ? data.opportunities : '&ndash;'))) +
            kv('Best return', data.bestReturn != null ? (data.bestReturn * 100).toFixed(2) + '%' : '&ndash;') +
            kv('File bytes', fmt(data.file && data.file.bytes)) +
            kv('Checkpoints', esc(s.checkpoints ? s.checkpoints.length : 0)) +
            kv('Mode', esc(data.mode || data.agent || '&ndash;')) +
            kv('Session', '<span class="mono">' + esc(selectedId.slice(0, 12)) + '&hellip;</span>');
          const file = data.file && data.file.filename;
          detailActions.innerHTML =
            '<button id="resumeBtn">Resume this session</button>' +
            (file ? '<button id="openFile">Open file</button>' : '') +
            (s.status === 'active' || s.status === 'paused' || s.status === 'pending' || s.status === 'queued' ? '<button class="danger" id="pauseBtn">Pause</button>' : '');
          detailJson.textContent = JSON.stringify(s, null, 2);
          const r = document.getElementById('resumeBtn');
          if (r) r.onclick = () => { $('session').value = selectedId; $('url').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
          const of = document.getElementById('openFile');
          if (of) of.onclick = () => { window.open('/files/' + encodeURIComponent(file), '_blank'); };
          const pb = document.getElementById('pauseBtn');
          if (pb) pb.onclick = async () => { try { await api('/api/sessions/' + selectedId + '/pause', { method: 'POST' }); refresh(); } catch (e) { err.textContent = e.message; } };
          detail.classList.add('open');
        } catch (e) {
          detail.classList.remove('open');
        }
      }

      async function refresh() {
        try {
          const data = await api('/agent/runs');
          const runs = data.runs || [];
          const rawMetrics = await api('/api/metrics').catch(() => null);
          const metrics = (rawMetrics && rawMetrics.metrics) || {};
          const listRes = await api('/api/sessions?limit=1').catch(() => null);
          const sessionCount = listRes && listRes.pagination ? listRes.pagination.total : null;
          const found = runs.reduce((a, r) => a + (r.found || 0), 0);
          const best = await (async () => {
            const done = runs.filter((r) => r.status === 'done');
            if (done.length === 0) return null;
            const d = await api('/api/sessions/' + done[0].sessionId).catch(() => null);
            const b = d && d.session && d.session.data && d.session.data.bestReturn;
            return b != null ? b : null;
          })();

          $('statusDot').classList.remove('off');
          $('statusText').textContent = 'connected';
          $('statSessions').textContent = sessionCount != null ? sessionCount : (metrics.created != null ? metrics.created : runs.length);
          $('statRuns').textContent = runs.length;
          $('statFound').textContent = found;
          const bestEl = $('statReturn');
          bestEl.innerHTML = best != null ? (best * 100).toFixed(2) + '%' : '<small>never found</small>';

          empty.style.display = runs.length ? 'none' : 'block';
          markSteps(runs);
          rows.innerHTML = runs.map((run) => {
            const progress = run.status === 'running'
              ? (run.stage === 'download' ? fmt(run.bytes) : 'iter ' + Math.min(run.iterations, Math.max(1, Math.round(run.found / Math.max(1, (run.found || 1))))))
              : '';
            return '<tr class="' + (run.status === 'running' ? 'running' : '') + '" data-id="' + run.id + '">' +
              '<td class="file-cell"><div class="f">' + esc(run.filename) + '</div><div class="s mono">' + esc(run.sessionId.slice(0, 8)) + '&hellip;</div></td>' +
              '<td>' + badge(run.stage, run.status) + '</td>' +
              '<td class="mono">' + esc(progress) + '</td>' +
              '<td>' + esc(run.found) + '</td>' +
              '<td>' + esc(run.iterations) + '</td>' +
              '<td class="actions" style="text-align:right">' +
                (run.status === 'running' ? '<button class="small danger" data-action="stop" data-id="' + run.id + '">Stop</button>' : '') +
                '<button class="small" data-action="details" data-id="' + run.id + '">Details</button>' +
              '</td></tr>';
          }).join('');
          rows.querySelectorAll('tr').forEach((tr) => {
            tr.addEventListener('click', (ev) => {
              const btn = ev.target.closest('button[data-action]');
              if (btn) {
                if (btn.dataset.action === 'stop') stop(btn.dataset.id);
                return;
              }
              selectedId = runs.find((r) => r.id === tr.dataset.id).sessionId;
              renderDetail();
            });
          });
          err.textContent = '';
        } catch (e) {
          $('statusDot').classList.add('off');
          $('statusText').textContent = 'offline';
          err.textContent = "Can't reach the agent: " + e.message;
        }
        if (selectedId) renderDetail();
      }

      async function stop(id) {
        try { await api('/agent/runs/' + id + '/stop', { method: 'POST' }); refresh(); }
        catch (e) { err.textContent = e.message; }
      }

      $('detailClose').addEventListener('click', () => { selectedId = null; detail.classList.remove('open'); });
      $('start').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          sourceUrl: $('url').value,
          mode: $('mode').value,
          iterations: Number($('iter').value),
          minReturn: Number($('min').value) / 100,
        };
        const name = $('name').value.trim(); if (name) body.filename = name;
        const seed = $('seed').value.trim(); if (seed) body.seed = Number(seed);
        const sessionId = $('session').value.trim(); if (sessionId) body.sessionId = sessionId;
        try {
          await api('/agent/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          $('url').value = ''; $('session').value = '';
          refresh();
        } catch (e2) { err.textContent = e2.message; }
      });

      refresh();
      setInterval(refresh, 1500);
    </script>
  </body>
</html>`;
