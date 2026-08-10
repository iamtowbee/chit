export const PLATFORM_UI = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chit — Agent for Trading</title>
    <style>
      :root { --ink: #1a1a1a; --muted: #666; --line: #eee; --accent: #1c7ed6; }
      * { box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; margin: 0; color: var(--ink); background: #fff; }
      header { border-bottom: 1px solid var(--line); padding: 1rem 1.5rem; display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: .5rem; }
      header h1 { font-size: 1.25rem; margin: 0; }
      main { max-width: 860px; margin: 1.5rem auto; padding: 0 1rem; }
      form { display: flex; gap: .5rem; margin: 1rem 0; flex-wrap: wrap; }
      input, select { padding: .5rem; border: 1px solid #ccc; border-radius: 4px; }
      input[type=url] { flex: 1; min-width: 16rem; }
      button { padding: .5rem .9rem; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #fff; }
      button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: .5rem; border-bottom: 1px solid var(--line); vertical-align: middle; font-size: .9rem; }
      th { color: var(--muted); font-weight: 600; }
      .bar { background: #eee; height: 8px; border-radius: 4px; overflow: hidden; min-width: 110px; }
      .bar > div { background: #2f9e44; height: 100%; transition: width .3s; }
      .badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; font-size: .72rem; }
      .done { background: #d3f9d8; color: #2b8a3e; }
      .download { background: #fff3bf; color: #862e9c; }
      .scan { background: #d0ebff; color: #1c7ed6; }
      .running { background: #d0ebff; color: #1c7ed6; }
      .stopped { background: #ffe8cc; color: #e8590c; }
      .error { background: #ffc9c9; color: #c92a2a; }
      .empty { color: #888; padding: 2rem 0; }
      .err { color: #c92a2a; margin: .5rem 0; }
      .muted { color: var(--muted); font-size: .85rem; }
      .mono { font-family: ui-monospace, Menlo, monospace; font-size: .78rem; }
      a { color: var(--accent); }
      .actions button { margin-right: .25rem; padding: .25rem .6rem; font-size: .8rem; }
      .steps { display: flex; gap: .75rem; margin: 1rem 0 .25rem; font-size: .85rem; }
      .steps .step { color: var(--muted); }
      .steps .step.done { color: #2b8a3e; }
      .steps .step.active { color: var(--accent); font-weight: 600; }
    </style>
  </head>
  <body>
    <header>
      <h1>Chit — Agent for Trading</h1>
      <span class="muted"><a href="/api/docs/html" target="_blank">API docs</a></span>
    </header>

    <main>
      <p class="muted">One agent, one job, one session: it <b>downloads</b> the market/data file
      (Range-resumable), <b>scans</b> it for arbitrage (within-market and cross-market), and
      <b>reports</b> the opportunities. Stop it any time — it resumes from the exact byte or
      iteration, because every heartbeat is a checkpoint.</p>

      <form id="start">
        <input type="url" id="url" placeholder="https://example.com/markets.json (data source)" required />
        <input type="text" id="name" placeholder="filename (optional)" style="max-width: 12rem" />
        <select id="mode">
          <option value="sim">sim</option>
          <option value="live">live</option>
        </select>
        <input type="number" id="iter" value="10" min="1" max="100000" style="width: 5.5rem" title="scan iterations" />
        <input type="number" id="min" value="0.5" step="0.1" min="0" style="width: 5.5rem" title="min return %" />
        <input type="text" id="seed" placeholder="seed (optional)" style="max-width: 8rem" />
        <input type="text" id="session" placeholder="resume session id (optional)" class="mono" style="min-width: 12rem" />
        <button type="submit" class="primary">Run agent</button>
      </form>
      <div id="err" class="err"></div>

      <div class="steps">
        <span id="s-download" class="step">1. Download</span>
        <span id="s-scan" class="step">2. Scan</span>
        <span id="s-report" class="step">3. Report</span>
      </div>

      <table>
        <thead><tr><th>File</th><th>Stage</th><th>Progress</th><th>Found</th><th>Iterations</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
      <p id="empty" class="empty">No agent runs yet. Give it a data source above.</p>
    </main>

    <script>
      const rows = document.getElementById('rows');
      const empty = document.getElementById('empty');
      const err = document.getElementById('err');
      const stepEls = { download: document.getElementById('s-download'), scan: document.getElementById('s-scan'), report: document.getElementById('s-report') };
      const fmt = (n) => {
        if (n == null) return '';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KiB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MiB';
        return (n / 1073741824).toFixed(2) + ' GiB';
      };
      const api = async (url, opts) => {
        const res = await fetch(url, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
        return data;
      };
      const markSteps = (runs) => {
        const anyRunning = runs.some((r) => r.status === 'running');
        if (!anyRunning) {
          stepEls.download.classList.remove('active', 'done');
          stepEls.scan.classList.remove('active', 'done');
          stepEls.report.classList.remove('active', 'done');
          return;
        }
        const run = runs.find((r) => r.status === 'running');
        stepEls.download.classList.toggle('active', run.stage === 'download');
        stepEls.scan.classList.toggle('active', run.stage === 'scan');
        stepEls.report.classList.toggle('active', run.stage === 'done');
        stepEls.download.classList.toggle('done', run.stage === 'scan' || run.stage === 'done');
        stepEls.scan.classList.toggle('done', run.stage === 'done');
      };
      async function refresh() {
        try {
          const data = await api('/agent/runs');
          const runs = data.runs || [];
          empty.style.display = runs.length ? 'none' : 'block';
          markSteps(runs);
          rows.innerHTML = runs.map((run) => {
            const stage = run.status === 'running' ? run.stage : run.status;
            const stop = run.status === 'running'
              ? '<button onclick="stop(\'' + run.id + '\')">Stop</button> '
              : '';
            const file = run.status === 'done' || run.bytes > 0
              ? '<a href="/files/' + encodeURIComponent(run.filename) + '">File</a>'
              : '';
            const stageLabel = run.status === 'running'
              ? (run.stage === 'download' ? 'downloading ' + fmt(run.bytes) : 'scanning ' + run.iterations + ' iters')
              : run.status;
            return '<tr>' +
              '<td>' + run.filename + '<div class="bytes mono">' + run.sessionId.slice(0, 8) + '&hellip;</div></td>' +
              '<td><span class="badge ' + stage + '">' + stageLabel + '</span></td>' +
              '<td>' + (run.status === 'running' ? (run.stage === 'download' ? fmt(run.bytes) : '') : '') + '</td>' +
              '<td>' + run.found + '</td>' +
              '<td>' + run.iterations + '</td>' +
              '<td class="actions">' + stop + file + '</td>' +
            '</tr>';
          }).join('');
          err.textContent = '';
        } catch (e) { err.textContent = "Can't reach the agent: " + e; }
      }
      window.stop = (id) => api('/agent/runs/' + id + '/stop', { method: 'POST' }).then(refresh).catch((e) => { err.textContent = e.message; });
      document.getElementById('start').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
          sourceUrl: document.getElementById('url').value,
          mode: document.getElementById('mode').value,
          iterations: Number(document.getElementById('iter').value),
          minReturn: Number(document.getElementById('min').value) / 100,
        };
        const name = document.getElementById('name').value.trim();
        if (name) body.filename = name;
        const seed = document.getElementById('seed').value.trim();
        if (seed) body.seed = Number(seed);
        const sessionId = document.getElementById('session').value.trim();
        if (sessionId) body.sessionId = sessionId;
        try {
          await api('/agent/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          document.getElementById('url').value = '';
          refresh();
        } catch (e2) { err.textContent = e2.message; }
      });
      refresh();
      setInterval(refresh, 1200);
    </script>
  </body>
</html>`;
