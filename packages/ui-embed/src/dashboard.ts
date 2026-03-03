export const dashboardHtml = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XupaStack Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f; color: #e8e8e8; min-height: 100vh;
      display: flex; flex-direction: column;
    }
    header {
      background: #1a1a1a; border-bottom: 1px solid #2a2a2a;
      padding: 16px 24px; display: flex; align-items: center; gap: 12px;
    }
    header h1 { font-size: 18px; font-weight: 600; color: #fff; }
    header .badge {
      background: #22c55e22; color: #22c55e; border: 1px solid #22c55e44;
      border-radius: 99px; font-size: 11px; padding: 2px 8px; font-weight: 500;
    }
    main { flex: 1; padding: 32px 24px; max-width: 720px; }
    .card {
      background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px;
      padding: 24px; margin-bottom: 24px;
    }
    .card h2 { font-size: 14px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; color: #aaa; margin-bottom: 6px; }
    .field input, .field textarea, .field select {
      width: 100%; background: #111; border: 1px solid #333; border-radius: 6px;
      padding: 8px 12px; color: #e8e8e8; font-size: 14px; font-family: inherit;
    }
    .field input:focus, .field textarea:focus { outline: none; border-color: #555; }
    .field textarea { min-height: 80px; resize: vertical; }
    .row { display: flex; gap: 12px; }
    .row .field { flex: 1; }
    .toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; }
    .toggle input[type=checkbox] { width: 16px; height: 16px; accent-color: #3b82f6; }
    .toggle span { font-size: 14px; }
    .btn {
      background: #3b82f6; color: #fff; border: none; border-radius: 6px;
      padding: 10px 20px; font-size: 14px; font-weight: 500; cursor: pointer;
      transition: background 0.15s;
    }
    .btn:hover { background: #2563eb; }
    .btn:disabled { background: #333; color: #666; cursor: not-allowed; }
    .btn-danger { background: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    .status { font-size: 13px; padding: 10px 14px; border-radius: 6px; margin-top: 12px; display: none; }
    .status.ok { background: #052e16; border: 1px solid #16a34a44; color: #4ade80; }
    .status.error { background: #2d0a0a; border: 1px solid #ef444444; color: #f87171; }
    #token-wrap { margin-bottom: 16px; }
    .mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; }
    .endpoint-list { list-style: none; }
    .endpoint-list li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #222; font-size: 13px; }
    .endpoint-list li:last-child { border-bottom: none; }
    .endpoint-list .method { font-weight: 600; color: #60a5fa; width: 40px; flex-shrink: 0; }
    .check { color: #22c55e; }
    .cross { color: #ef4444; }
  </style>
</head>
<body>
  <header>
    <h1>XupaStack</h1>
    <span class="badge">Self-Host</span>
    <span id="status-indicator" style="margin-left:auto;font-size:13px;color:#888">Loading…</span>
  </header>

  <main>
    <!-- Token input -->
    <div id="token-wrap" class="card">
      <h2>Admin Token</h2>
      <div class="field">
        <label>Enter your ADMIN_TOKEN to manage this gateway</label>
        <input type="password" id="admin-token" placeholder="Paste your admin token…">
      </div>
      <button class="btn" onclick="loadConfig()">Load Config</button>
    </div>

    <!-- Config editor (hidden until loaded) -->
    <div id="config-card" class="card" style="display:none">
      <h2>Gateway Config</h2>

      <div class="field">
        <label>Upstream Host</label>
        <input type="url" id="upstream-host" placeholder="https://xyz.supabase.co">
      </div>

      <div class="field">
        <label>Allowed Origins (one per line, or * for wildcard)</label>
        <textarea id="allowed-origins" rows="3" placeholder="*"></textarea>
      </div>

      <div class="row">
        <div class="field">
          <label>Rate Limit (req/min)</label>
          <input type="number" id="rate-limit" min="1" max="10000" value="100">
        </div>
        <div class="field">
          <label>Enabled Services</label>
          <select id="enabled-services" multiple size="6">
            <option value="rest">REST (/rest/v1/)</option>
            <option value="auth">Auth (/auth/v1/)</option>
            <option value="storage">Storage (/storage/v1/)</option>
            <option value="functions">Functions (/functions/v1/)</option>
            <option value="graphql">GraphQL (/graphql/v1/)</option>
            <option value="realtime">Realtime (WebSocket)</option>
          </select>
        </div>
      </div>

      <div class="field" style="margin-top:4px">
        <label class="toggle">
          <input type="checkbox" id="allow-credentials">
          <span>Allow Credentials (sets Access-Control-Allow-Credentials: true)</span>
        </label>
      </div>
      <div class="field">
        <label class="toggle">
          <input type="checkbox" id="strict-mode">
          <span>Strict Mode (enforce origin allowlist + HMAC for server-to-server)</span>
        </label>
      </div>
      <div class="field">
        <label class="toggle">
          <input type="checkbox" id="rewrite-location" checked>
          <span>Rewrite Location Headers (redirect safety)</span>
        </label>
      </div>

      <div style="margin-top:20px;display:flex;gap:10px">
        <button class="btn" onclick="saveConfig()">Save Config</button>
        <button class="btn btn-danger" onclick="clearToken()">Lock</button>
      </div>
      <div id="save-status" class="status"></div>
    </div>

    <!-- Health check -->
    <div class="card">
      <h2>Endpoint Health</h2>
      <button class="btn" onclick="runHealthCheck()">Run Check</button>
      <ul id="health-list" class="endpoint-list" style="margin-top:16px"></ul>
    </div>
  </main>

  <script>
    let adminToken = '';

    async function loadConfig() {
      adminToken = document.getElementById('admin-token').value.trim();
      if (!adminToken) return;

      try {
        const res = await fetch('/__xupastack/api/config', {
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        if (res.status === 401) { alert('Invalid admin token'); return; }
        if (res.status === 404) {
          // No config yet – show empty editor
          document.getElementById('config-card').style.display = '';
          document.getElementById('token-wrap').style.display = 'none';
          document.getElementById('status-indicator').textContent = 'No config yet';
          return;
        }
        const cfg = await res.json();
        populateForm(cfg);
        document.getElementById('config-card').style.display = '';
        document.getElementById('token-wrap').style.display = 'none';
        document.getElementById('status-indicator').textContent = 'Config loaded';
      } catch (e) {
        alert('Error loading config: ' + e.message);
      }
    }

    function populateForm(cfg) {
      document.getElementById('upstream-host').value = cfg.upstreamHost || '';
      document.getElementById('allowed-origins').value = (cfg.allowedOrigins || ['*']).join('\\n');
      document.getElementById('rate-limit').value = cfg.rateLimitPerMin || 100;
      document.getElementById('allow-credentials').checked = !!cfg.allowCredentials;
      document.getElementById('strict-mode').checked = !!cfg.strictMode;
      document.getElementById('rewrite-location').checked = cfg.rewriteLocationHeaders !== false;

      const sel = document.getElementById('enabled-services');
      const enabled = cfg.enabledServices || ['rest','auth','storage','functions','graphql','realtime'];
      for (const opt of sel.options) {
        opt.selected = enabled.includes(opt.value);
      }
    }

    function readForm() {
      const origins = document.getElementById('allowed-origins').value
        .split('\\n').map(s => s.trim()).filter(Boolean);
      const sel = document.getElementById('enabled-services');
      const services = [...sel.options].filter(o => o.selected).map(o => o.value);

      return {
        upstreamHost: document.getElementById('upstream-host').value.trim(),
        allowedOrigins: origins.length ? origins : ['*'],
        allowCredentials: document.getElementById('allow-credentials').checked,
        enabledServices: services,
        rateLimitPerMin: parseInt(document.getElementById('rate-limit').value, 10) || 100,
        strictMode: document.getElementById('strict-mode').checked,
        rewriteLocationHeaders: document.getElementById('rewrite-location').checked,
      };
    }

    async function saveConfig() {
      const cfg = readForm();
      const statusEl = document.getElementById('save-status');
      try {
        const res = await fetch('/__xupastack/api/config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + adminToken
          },
          body: JSON.stringify(cfg)
        });
        if (res.ok) {
          showStatus(statusEl, 'Config saved successfully', 'ok');
        } else {
          const body = await res.json();
          showStatus(statusEl, 'Error: ' + JSON.stringify(body), 'error');
        }
      } catch (e) {
        showStatus(statusEl, 'Network error: ' + e.message, 'error');
      }
    }

    function clearToken() {
      adminToken = '';
      document.getElementById('admin-token').value = '';
      document.getElementById('config-card').style.display = 'none';
      document.getElementById('token-wrap').style.display = '';
    }

    async function runHealthCheck() {
      const list = document.getElementById('health-list');
      list.innerHTML = '<li>Checking…</li>';

      const endpoints = [
        { label: 'Health', path: '/__xupastack/health' },
        { label: 'REST', path: '/rest/v1/' },
        { label: 'Auth', path: '/auth/v1/' },
        { label: 'Storage', path: '/storage/v1/' },
      ];

      const results = await Promise.allSettled(
        endpoints.map(e =>
          fetch(e.path, { method: 'GET', signal: AbortSignal.timeout(5000) })
            .then(r => ({ ...e, status: r.status, ok: r.status < 500 }))
            .catch(err => ({ ...e, status: 0, ok: false, err: err.message }))
        )
      );

      list.innerHTML = results.map((r, i) => {
        const data = r.status === 'fulfilled' ? r.value : { ...endpoints[i], ok: false, status: 0 };
        const icon = data.ok ? '<span class="check">✓</span>' : '<span class="cross">✗</span>';
        return \`<li>\${icon} <span class="method">\${data.label}</span> <span style="color:#666">\${data.path}</span> <span style="margin-left:auto;color:\${data.ok ? '#4ade80' : '#f87171'}">\${data.status || 'error'}</span></li>\`;
      }).join('');
    }

    function showStatus(el, msg, type) {
      el.textContent = msg;
      el.className = 'status ' + type;
      el.style.display = '';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    // Auto-check health on load
    fetch('/__xupastack/health').then(r => {
      document.getElementById('status-indicator').textContent = r.ok ? '● Online' : '○ Offline';
      document.getElementById('status-indicator').style.color = r.ok ? '#22c55e' : '#ef4444';
    }).catch(() => {
      document.getElementById('status-indicator').textContent = '○ Offline';
      document.getElementById('status-indicator').style.color = '#ef4444';
    });
  </script>
</body>
</html>`;
