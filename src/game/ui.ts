export const GAME_UI = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>It's Cak — a text game baked on the live market</title>
    <style>
      :root {
        --bg: #14110c;
        --fg: #d9cba4;
        --dim: #8a7f66;
        --gold: #e6b450;
        --green: #7fc97f;
        --red: #d1665c;
        --line: #2a241b;
      }
      html { -webkit-text-size-adjust: 100%; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font: 16px/1.65 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        touch-action: manipulation;
      }
      button, input { font: inherit; }
      button { touch-action: manipulation; }
      #app { max-width: 780px; margin: 0 auto; padding: 28px 20px 110px; }
      a { color: var(--gold); }
      .muted { color: var(--dim); }
      .mono { font-family: inherit; }

      /* home / title screen */
      .home .ascii {
        color: var(--gold);
        line-height: 1.35;
        font-size: 13px;
        margin: 12px 0 6px;
        overflow-x: auto;
      }
      .home .tag { color: var(--dim); margin-bottom: 28px; }
      .menu { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 24px; }
      .menu .item {
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        color: var(--green);
        font: inherit;
        padding: 4px 0;
        cursor: pointer;
      }
      .menu .item:hover { color: var(--gold); }
      .menu .item.dim { color: var(--dim); cursor: default; }
      .market-form { border: 1px dashed var(--line); padding: 12px 14px; margin: 4px 0 12px; }
      .market-form label { display: block; margin: 6px 0; color: var(--dim); font-size: 14px; }
      .market-form input {
        width: 100%;
        margin-top: 2px;
        background: #1b1710;
        border: 1px solid var(--line);
        color: var(--fg);
        font: inherit;
        padding: 6px 8px;
        outline: none;
      }
      .market-form input:focus { border-color: var(--gold); }
      .hint { color: var(--dim); font-size: 14px; margin: 4px 0; }

      /* saved list */
      .saved h3 { font-weight: 600; letter-spacing: .06em; text-transform: uppercase; font-size: 14px; color: var(--dim); margin: 28px 0 8px; }
      .srow {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid #1f1a12;
        font-size: 15px;
      }
      .srow .loc { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .srow .moves { color: var(--dim); font-size: 13px; }
      .srow button, .row button {
        background: none;
        border: 1px solid var(--line);
        color: var(--gold);
        font: inherit;
        font-size: 13px;
        padding: 2px 10px;
        cursor: pointer;
      }
      .srow button:hover, .row button:hover { border-color: var(--gold); }

      /* play terminal */
      .play { display: none; }
      .tbar {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--bg);
        border-bottom: 1px solid var(--line);
        padding: 8px 0;
        display: flex;
        gap: 18px;
        align-items: center;
        font-size: 13px;
        color: var(--dim);
      }
      .tbar .brand { color: var(--gold); }
      .pill {
        display: inline-block;
        border: 1px solid var(--line);
        padding: 0 8px;
        border-radius: 999px;
        font-size: 12px;
        color: var(--dim);
      }
      .pill.playing { color: var(--green); border-color: #3f5a3f; }
      .pill.legend { color: var(--gold); border-color: #6b5527; }
      .pill.ended { color: var(--red); border-color: #6b3a34; }
      .pill.cancelled { color: var(--dim); }
      .prog { display: inline-block; width: 110px; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
      .prog span { display: block; height: 100%; background: var(--gold); width: 0; }

      .screen { padding: 18px 0 10px; min-height: 42vh; }
      .line { margin: 0 0 6px; white-space: pre-wrap; animation: rise .3s ease-out both; }
      .line.loc { color: var(--gold); letter-spacing: .1em; text-transform: uppercase; font-size: 13px; }
      .line.purse { color: var(--gold); }
      .line.plate { color: var(--dim); font-size: 14px; }
      .line.win { color: var(--green); }
      .line.lose { color: var(--red); }
      .line.rule { color: var(--line); }

      .choice {
        display: block;
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        color: var(--green);
        font: inherit;
        padding: 6px 0;
        min-height: 44px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .choice:hover { color: var(--gold); }

      .row { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; }

      .prompt {
        position: sticky;
        bottom: 0;
        z-index: 3;
        display: flex;
        gap: 10px;
        align-items: center;
        background: var(--bg);
        border-top: 1px solid var(--line);
        padding: 12px 0 calc(12px + env(safe-area-inset-bottom, 0px));
        margin-top: 8px;
      }
      .prompt .caret { color: var(--gold); font-weight: 700; }
      .prompt input {
        flex: 1;
        min-width: 0;
        background: none;
        border: none;
        color: var(--fg);
        font: inherit;
        font-size: 16px;
        outline: none;
      }
      .prompt .cursor {
        display: inline-block;
        width: 9px;
        height: 1.15em;
        background: var(--gold);
        animation: blink 1s steps(1) infinite;
        vertical-align: text-bottom;
      }

      .err {
        display: none;
        color: var(--red);
        border: 1px solid var(--red);
        padding: 8px 12px;
        margin: 12px 0;
      }
      footer { color: var(--dim); font-size: 13px; margin-top: 40px; }

      @keyframes blink { 50% { opacity: 0; } }
      @keyframes rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

      @media (max-width: 640px) {
        body { font-size: 15px; }
        #app { padding: 18px 14px 130px; }
        .home .ascii { font-size: 9px; }
        .menu .item { min-height: 44px; }
        .tbar { gap: 8px; flex-wrap: wrap; padding: 8px 0; }
        .tbar .prog { display: none; }
        .srow { flex-wrap: wrap; gap: 6px 10px; padding: 8px 0; }
        .srow .loc { flex: 1 1 100%; }
        .srow button, .row button { padding: 8px 12px; }
        .choice { padding: 8px 0; }
        .prompt { padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
      }
    </style>
  </head>
  <body>
    <main id="app">
      <section id="home" class="home">
        <pre class="ascii">###################################################
#                                                 #
#    I T ' S   C A K                             #
#    a text game baked on the live market        #
#                                                 #
###################################################</pre>
        <div class="tag">a tiny cake's quest &middot; each move is a checkpoint &middot; trade the windows, chase the Grand Bake</div>
        <div class="menu">
          <button class="item" id="begin">1. begin a new story</button>
          <button class="item" id="beginMarketToggle">2. play the market</button>
          <div id="marketForm" class="market-form" style="display:none">
            <label>feed url (optional)
              <input id="mktUrl" placeholder="https://host/path/markets.json" />
            </label>
            <label>seed (optional)
              <input id="mktSeed" type="number" placeholder="a number" />
            </label>
            <button class="item" id="beginMarket">begin trading</button>
          </div>
          <button class="item" id="beginCryptoToggle">3. invest in crypto</button>
          <div id="cryptoForm" class="market-form" style="display:none">
            <label>seed (optional)
              <input id="cryptoSeed" type="number" placeholder="a number" />
            </label>
            <label class="check"><input id="cryptoLive" type="checkbox" /> use live CoinGecko prices</label>
            <button class="item" id="beginCryptoGo">begin trading</button>
          </div>
          <button class="item" id="beginMillionToggle">4. answer the millionaire questions</button>
          <div id="millionForm" class="market-form" style="display:none">
            <label>seed (optional)
              <input id="millionSeed" type="number" placeholder="a number" />
            </label>
            <button class="item" id="beginMillionGo">take the hot seat</button>
          </div>
          <button class="item dim" id="helpItem">?. help</button>
        </div>
        <div id="hintBox" class="hint" style="display:none">
          on the play screen, type a choice's number or its word — <span class="mono">yes</span>, <span class="mono">no</span>, <span class="mono">pass</span>, <span class="mono">lock</span>, or for crypto <span class="mono">buy</span>/<span class="mono">sell</span>, or for trivia <span class="mono">fifty</span>, <span class="mono">phone</span>, <span class="mono">audience</span>, <span class="mono">walk</span> — and press Enter. <span class="mono">q</span> saves &amp; quits, <span class="mono">a</span> abandons, <span class="mono">?</span> shows help.
        </div>
        <div id="saved" class="saved">
          <h3>saved games</h3>
          <div id="savedEmpty" class="hint" style="display:block">none yet</div>
          <div id="savedRows"></div>
        </div>
      </section>

      <section id="play" class="play">
        <div class="tbar">
          <span class="brand">cak://</span><span id="playId"></span>
          <span id="playStatus" class="pill">ready</span>
          <span id="playMoves"></span>
          <span class="prog"><span id="bar"></span></span>
        </div>
        <div id="scene" class="screen" aria-live="polite"></div>
        <div class="prompt">
          <span class="caret">&gt;</span>
          <input id="input" autocomplete="off" spellcheck="false" placeholder="type a number or command, then Enter" />
          <span class="cursor"></span>
        </div>
      </section>

      <div id="err" class="err"></div>
      <footer>It's Cak &middot; built on the Ollyba trading agent &middot; <a href="/">dashboard</a></footer>
    </main>

    <script>
      var $ = function (id) { return document.getElementById(id); };
      var home = $('home'), saved = $('saved'), play = $('play'), err = $('err'), scene = $('scene');
      var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
      var fmt = function (n) { return (n == null || isNaN(n)) ? '0.00' : Number(n).toFixed(2); };
      var api = async function (url, opts) {
        var res = await fetch(url, opts);
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
        return data;
      };
      var KEY = 'cak:last';
      var current = null;
      var ended = false;
      var lineN = 0;
      var lastHist = 0;
      var input = $('input');

      function showError(e) {
        err.style.display = 'block';
        err.textContent = e && e.message ? e.message : String(e);
        play.style.display = 'none';
        home.style.display = 'block';
      }

      function line(text, cls) {
        lineN += 1;
        var delay = (lineN * 40) + 'ms';
        scene.innerHTML += '<div class="line ' + (cls || '') + '" style="animation-delay:' + delay + '">' + esc(text) + '</div>';
        if (typeof scene.scrollIntoView === 'function') scene.scrollIntoView();
      }

      function badge(status, outcome) {
        if (status === 'cancelled') return { cls: 'cancelled', label: 'abandoned' };
        if (outcome === 'win') return { cls: 'legend', label: 'legend' };
        if (outcome) return { cls: 'ended', label: 'ended' };
        return { cls: 'playing', label: 'playing' };
      }

      function choices(g) {
        if (!g.choices || !g.choices.length) return;
        line('choose:', 'muted');
        scene.innerHTML += g.choices.map(function (c) {
          return '<button class="choice" data-choice="' + c.index + '">' + c.index + '. ' + esc(c.label) + '</button>';
        }).join('');
        scene.querySelectorAll('button[data-choice]').forEach(function (b) {
          b.addEventListener('click', function () { act(Number(b.dataset.choice)); });
        });
      }

      function terminalButtons(g) {
        scene.innerHTML += '<div class="row">' +
          '<button id="again">r &mdash; begin again</button>' +
          '<button id="toHome">n &mdash; saved games</button></div>';
        $('again').onclick = async function () {
          try {
            var body = null;
            if (g.kind === 'market') {
              body = JSON.stringify({ kind: 'market', seed: Number($('mktSeed').value) || undefined });
            } else if (g.kind === 'crypto') {
              body = JSON.stringify({ kind: 'crypto', seed: Number($('cryptoSeed').value) || undefined, mode: $('cryptoLive') && $('cryptoLive').checked ? 'live' : 'sim' });
            } else if (g.kind === 'million') {
              body = JSON.stringify({ kind: 'million', seed: Number($('millionSeed').value) || undefined });
            }
            var d = await api('/game/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body });
            localStorage.setItem(KEY, d.game.id);
            open(d.game.id);
          } catch (e2) { showError(e2); }
        };
        $('toHome').onclick = showHome;
      }

      function renderStory(g) {
        line('[' + g.nodeTitle + ']', 'loc');
        if (!g.outcome) {
          line(g.text, 'prose');
          var inv = g.inventory && g.inventory.length ? g.inventory.map(function (i) { return i.label; }).join(', ') : 'none yet';
          line('ingredients: ' + inv, 'plate');
          choices(g);
        } else {
          var win = g.outcome === 'win';
          line('--------------------------------------------', 'rule');
          line(win ? 'the legend is complete' : 'the journey ends here', win ? 'win' : 'lose');
          line(g.text, 'prose');
          if (g.inventory && g.inventory.length) line('kept: ' + g.inventory.map(function (i) { return i.label; }).join(', '), 'plate');
          line('press r to begin again, or n for saved games', 'muted');
          terminalButtons(g);
        }
      }

      function renderMarket(g) {
        var m = g.market;
        line('round ' + (m.phase !== 'end' ? m.round + 1 : m.round) + ' of ' + m.rounds, 'muted');
        line('purse  ' + fmt(m.purse) + '   (goal ' + fmt(m.startPurse * 1.15) + ')', 'purse');
        if (!g.outcome) {
          line(g.text, 'prose');
          if (m.phase === 'play' && m.yesPrice !== null && m.noPrice !== null) {
            var quote = 'yes   $' + fmt(m.yesPrice) + '     no   $' + fmt(m.noPrice);
            if (m.bestReturn !== null) quote += '     pair locks +' + (m.bestReturn * 100).toFixed(2) + '%';
            line(quote, 'plate');
          }
        } else {
          var win = g.outcome === 'win';
          line('--------------------------------------------', 'rule');
          line(win ? 'the grand bake is won' : 'the market closes', win ? 'win' : 'lose');
          line(g.text, 'prose');
          line('arbs ' + m.arbs + '   bets ' + m.gambles + '   wins ' + m.wins + '   losses ' + m.losses + '   passes ' + m.passes, 'plate');
          if (m.ending === 'grand' && m.name) line('the legend of ' + m.name + ' is told across the ovenlands', 'win');
          line('press r to trade again, or n for saved games', 'muted');
          terminalButtons(g);
        }
        var hist = m.history || [];
        for (var i = lastHist; i < hist.length; i += 1) {
          var h = hist[i];
          line('  ' + h.round + '. ' + h.action + ' &mdash; ' + h.question + '   ' + (h.result >= 0 ? '+' : '') + fmt(h.result) + ' &rarr; ' + fmt(h.purseAfter), h.result >= 0 ? 'win' : 'lose');
        }
        lastHist = Math.max(lastHist, hist.length);
        if (!g.outcome) choices(g);
      }

      function renderCrypto(g) {
        var c = g.crypto;
        line('round ' + (c.phase !== 'end' ? c.round + 1 : c.round) + ' of ' + c.rounds, 'muted');
        line('wallet  ' + fmt(c.purse) + '   (goal ' + fmt(c.startPurse * 1.15) + ')', 'purse');
        if (!g.outcome && c.coin) {
          line(c.coin.symbol + ' — ' + c.coin.name, 'loc');
          var ch = c.coin.change >= 0 ? '+' : '';
          line('$' + fmt(c.coin.price) + '   (' + ch + (c.coin.change * 100).toFixed(2) + '% vs last check)', 'plate');
          if (c.holding) {
            var h = c.holding;
            line('holding  ' + h.shares.toFixed(4) + ' ' + h.symbol + ' @ $' + fmt(h.entryPrice) + '  (cost $' + fmt(h.cost) + (h.unrealized >= 0 ? ', unrealized +$' : ', unrealized -$') + fmt(Math.abs(h.unrealized)) + ')', 'purse');
          }
          line(g.text, 'prose');
        } else if (!g.outcome) {
          line(g.text, 'prose');
        } else {
          var win = g.outcome === 'win';
          line('--------------------------------------------', 'rule');
          line(win ? 'the grand bake is won' : 'the market closes', win ? 'win' : 'lose');
          line(g.text, 'prose');
          line('buys ' + c.buys + '   sells ' + c.sells + '   wins ' + c.wins + '   losses ' + c.losses + '   passes ' + c.passes, 'plate');
          if (c.ending === 'grand' && c.name) line('the legend of ' + c.name + ' is told across the ovenlands', 'win');
          line('press r to trade again, or n for saved games', 'muted');
          terminalButtons(g);
        }
        var hist = c.history || [];
        for (var i = lastHist; i < hist.length; i += 1) {
          var h2 = hist[i];
          line('  ' + h2.round + '. ' + h2.action + ' ' + h2.coin + ' @ $' + fmt(h2.price) + '   ' + (h2.result >= 0 ? '+' : '') + fmt(h2.result) + ' &rarr; ' + fmt(h2.purseAfter), h2.result >= 0 ? 'win' : 'lose');
        }
        lastHist = Math.max(lastHist, hist.length);
        if (!g.outcome) choices(g);
      }

      function renderMillion(g) {
        var m = g.million;
        line('question ' + (m.phase !== 'end' ? m.round + 1 : m.round) + ' of ' + m.rounds, 'muted');
        var floorNote = m.safeFloor > 0 ? '   (safe floor $' + fmt(m.safeFloor) + ')' : '';
        line('bank  $' + fmt(m.bank) + (m.playingFor !== null ? '   playing for $' + fmt(m.playingFor) : '') + floorNote, 'purse');
        if (!g.outcome && m.phase === 'play' && m.question) {
          line(g.text, 'prose');
          var lives = [];
          lives.push(m.lives.fifty ? '50/50 used' : '50/50');
          lives.push(m.lives.phone ? 'phone used' : 'phone a friend');
          lives.push(m.lives.audience ? 'audience used' : 'ask the audience');
          line('lives: ' + lives.join('   '), 'plate');
          if (m.hint) {
            line(m.hint.text, m.hint.kind === 'fifty' ? 'win' : 'plate');
          }
        } else if (!g.outcome && m.phase === 'bake') {
          line(g.text, 'prose');
        } else {
          var win = g.outcome === 'win';
          line('--------------------------------------------', 'rule');
          line(win ? 'the grand bake is won' : 'the hot seat dims', win ? 'win' : 'lose');
          line(g.text, 'prose');
          line('right ' + m.corrects + '   wrong ' + m.wrongs + '   walks ' + m.walks + '   won $' + fmt(m.won), 'plate');
          if (m.ending === 'grand' && m.name) line('the legend of ' + m.name + ' is told across the ovenlands', 'win');
          line('press r to take the hot seat again, or n for saved games', 'muted');
          terminalButtons(g);
        }
        var hist = m.history || [];
        for (var i = lastHist; i < hist.length; i += 1) {
          var h3 = hist[i];
          if (h3.action === 'Correct') {
            line('  Q' + h3.round + '. correct — ' + h3.answer + '   +$' + fmt(h3.tier) + ' &rarr; bank $' + fmt(h3.bankAfter), 'win');
          } else if (h3.action === 'Wrong') {
            line('  Q' + h3.round + '. wrong — ' + h3.answer + '   drops to $' + fmt(h3.bankAfter), 'lose');
          } else if (h3.action === 'Walked') {
            line('  Q' + h3.round + '. walked away with $' + fmt(h3.bankAfter), 'purse');
          } else {
            line('  Q' + h3.round + '. used ' + h3.action.toLowerCase(), 'plate');
          }
        }
        lastHist = Math.max(lastHist, hist.length);
        if (!g.outcome) choices(g);
      }

      function renderGame(g, keep) {
        current = g;
        ended = g.outcome !== null;
        var b = badge(g.status, g.outcome);
        $('playStatus').className = 'pill ' + b.cls;
        $('playStatus').textContent = b.label;
        $('playId').textContent = g.id.slice(0, 8) + '..';
        if (g.kind === 'market') {
          var m = g.market;
          $('playMoves').textContent = 'round ' + (m.phase !== 'end' ? m.round + 1 : m.round) + '/' + m.rounds;
        } else if (g.kind === 'crypto') {
          var c = g.crypto;
          $('playMoves').textContent = 'round ' + (c.phase !== 'end' ? c.round + 1 : c.round) + '/' + c.rounds;
        } else if (g.kind === 'million') {
          var mi = g.million;
          $('playMoves').textContent = 'q ' + (mi.phase !== 'end' ? mi.round + 1 : mi.round) + '/' + mi.rounds;
        } else {
          $('playMoves').textContent = 'move ' + g.moves;
        }
        $('bar').style.width = Math.round(g.progress * 100) + '%';
        if (!keep) {
          scene.innerHTML = '';
          lineN = 0;
          lastHist = 0;
        }
        if (g.kind === 'market') { renderMarket(g); return; }
        if (g.kind === 'crypto') { renderCrypto(g); return; }
        if (g.kind === 'million') { renderMillion(g); return; }
        renderStory(g);
      }

      async function act(idx) {
        if (ended || !current) return;
        if (input) input.value = '';
        if (input && input.focus) input.focus();
        try {
          var d = await api('/game/' + current.id + '/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choice: idx }) });
          renderGame(d.game, true);
        } catch (e) { showError(e); }
      }

      async function open(id) {
        try {
          var d = await api('/game/' + id);
          home.style.display = 'none';
          err.style.display = 'none';
          play.style.display = 'block';
          renderGame(d.game, false);
        } catch (e) { showError(e); }
      }

      function showHome() {
        current = null;
        ended = false;
        play.style.display = 'none';
        err.style.display = 'none';
        home.style.display = 'block';
        refreshSaved();
      }

      async function refreshSaved() {
        try {
          var data = await api('/game');
          var games = data.games || [];
          $('savedEmpty').style.display = games.length ? 'none' : 'block';
          $('savedRows').innerHTML = games.map(function (g) {
            var statusCls = g.status === 'done' ? 'ended' : g.status === 'cancelled' ? 'cancelled' : 'playing';
            var label = g.outcome ? (g.outcome === 'win' ? 'legend' : 'ended') : (g.status === 'cancelled' ? 'abandoned' : 'in progress');
            var kindBadge = g.kind === 'market' ? '[market] ' : g.kind === 'crypto' ? '[crypto] ' : g.kind === 'million' ? '[million] ' : '';
            return '<div class="srow"><span class="loc">' + esc(g.nodeTitle) + '</span>' +
              '<span class="muted">' + kindBadge + '</span>' +
              '<span class="moves">' + esc(g.moves) + '</span>' +
              '<span class="pill ' + statusCls + '">' + esc(label) + '</span>' +
              '<button data-continue="' + esc(g.id) + '">' + (g.outcome ? 'replay' : 'continue') + '</button></div>';
          }).join('');
          $('savedRows').querySelectorAll('button[data-continue]').forEach(function (b) {
            b.addEventListener('click', function () { open(b.dataset.continue); });
          });
        } catch (e) { showError(e); }
      }

      function helpText() {
        line('commands: a number picks that choice; for the market try "yes", "no", "pass", "lock"; for crypto try "buy", "sell", "pass"; for trivia try "fifty", "phone", "audience", "walk"; q saves &amp; quits; a abandons; r or n on the end screen; ? this help.', 'plate');
      }

      function handleInput(raw) {
        var v = String(raw == null ? '' : raw).trim().toLowerCase();
        if (!v) return;
        if (ended) {
          if (v === 'r' || v === 'again') { $('again').onclick(); return; }
          if (v === 'n' || v === 'home' || v === 'h') { showHome(); return; }
          helpText();
          return;
        }
        if (v === 'q' || v === 'quit') { quit(); return; }
        if (v === 'a' || v === 'abandon') { abandon(); return; }
        if (v === 'h' || v === '?' || v === 'help') { helpText(); return; }
        if (current && current.kind === 'market') {
          if (v === 'lock' || v === 'arb' || v === 'arbitrage') { act(0); return; }
          if (v === 'yes' || v === 'buy yes') { act(1); return; }
          if (v === 'no' || v === 'buy no') { act(2); return; }
          if (v === 'pass') { act(3); return; }
        }
        if (current && current.kind === 'crypto') {
          if (v === 'buy') { act(0); return; }
          if (v === 'sell') { act(1); return; }
          if (v === 'pass' || v === 'hold') { act(2); return; }
        }
        if (current && current.kind === 'million') {
          if (v === 'fifty' || v === '5050' || v === '50/50') { act(4); return; }
          if (v === 'phone' || v === 'friend') { act(5); return; }
          if (v === 'audience' || v === 'ask') { act(6); return; }
          if (v === 'walk' || v === 'cash' || v === 'cash out') { act(7); return; }
        }
        var n = Number(v);
        if (Number.isInteger(n) && current && current.choices && n >= 0 && n < current.choices.length) { act(n); return; }
        line('unknown command — type a number, or "?" for help', 'muted');
      }

      async function quit() {
        if (!current) return showHome();
        try { await api('/game/' + current.id + '/pause', { method: 'POST' }); showHome(); } catch (e) { showError(e); }
      }
      async function abandon() {
        if (!current) return showHome();
        try { await api('/game/' + current.id + '/abandon', { method: 'POST' }); showHome(); } catch (e) { showError(e); }
      }

      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') handleInput(input.value);
      });

      $('begin').addEventListener('click', async function () {
        try {
          var d = await api('/game/new', { method: 'POST' });
          localStorage.setItem(KEY, d.game.id);
          open(d.game.id);
        } catch (e) { showError(e); }
      });

      $('beginMarketToggle').addEventListener('click', function () {
        $('marketForm').style.display = $('marketForm').style.display === 'none' ? 'block' : 'none';
      });

      $('beginMarket').addEventListener('click', async function () {
        try {
          var body = { kind: 'market' };
          var url = $('mktUrl').value.trim();
          if (url) body.sourceUrl = url;
          var seed = Number($('mktSeed').value);
          if (Number.isInteger(seed) && seed >= 0) body.seed = seed;
          var d = await api('/game/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          localStorage.setItem(KEY, d.game.id);
          open(d.game.id);
        } catch (e) { showError(e); }
      });

      $('beginCryptoToggle').addEventListener('click', function () {
        $('cryptoForm').style.display = $('cryptoForm').style.display === 'none' ? 'block' : 'none';
      });

      $('beginCryptoGo').addEventListener('click', async function () {
        try {
          var body = { kind: 'crypto', mode: $('cryptoLive') && $('cryptoLive').checked ? 'live' : 'sim' };
          var seed = Number($('cryptoSeed').value);
          if (Number.isInteger(seed) && seed >= 0) body.seed = seed;
          var d = await api('/game/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          localStorage.setItem(KEY, d.game.id);
          open(d.game.id);
        } catch (e) { showError(e); }
      });

      $('beginMillionToggle').addEventListener('click', function () {
        $('millionForm').style.display = $('millionForm').style.display === 'none' ? 'block' : 'none';
      });

      $('beginMillionGo').addEventListener('click', async function () {
        try {
          var body = { kind: 'million' };
          var seed = Number($('millionSeed').value);
          if (Number.isInteger(seed) && seed >= 0) body.seed = seed;
          var d = await api('/game/new', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          localStorage.setItem(KEY, d.game.id);
          open(d.game.id);
        } catch (e) { showError(e); }
      });

      $('helpItem').addEventListener('click', function () {
        $('hintBox').style.display = $('hintBox').style.display === 'none' ? 'block' : 'none';
      });

      setInterval(async function () {
        if (!current || ended) return;
        if (typeof document.hidden !== 'undefined' && document.hidden) return;
        try {
          var d = await api('/game/' + current.id);
          var ng = d.game;
          var nm = ng.kind === 'market' ? ng.market.round + ':' + ng.market.purse : ng.kind === 'million' ? ng.million.round + ':' + ng.million.bank : ng.kind === 'crypto' ? ng.crypto.round + ':' + ng.crypto.purse : String(ng.moves);
          var om = current.kind === 'market' ? current.market.round + ':' + current.market.purse : current.kind === 'million' ? current.million.round + ':' + current.million.bank : current.kind === 'crypto' ? current.crypto.round + ':' + current.crypto.purse : String(current.moves);
          if (ng.outcome !== current.outcome || nm !== om) renderGame(ng, true);
        } catch (e) { /* silent */ }
      }, 5000);

      showHome();
      var last = localStorage.getItem(KEY);
      if (last) open(last).catch(function () { showHome(); });
    </script>
  </body>
</html>`;
