/* ═══════════════════════════════════════════════════════════════════
   PLC GENERATOR — FRONTEND APP
   Vanilla JS SPA with hash-based routing
═══════════════════════════════════════════════════════════════════ */

'use strict';

// ─── API ──────────────────────────────────────────────────────────────────────
const API = {
  async call(method, path, data, isForm = false) {
    const opts = { method, headers: {} };
    if (data) {
      if (isForm) { opts.body = data; }
      else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    }
    const res = await fetch(`/api${path}`, opts);
    const json = await res.json().catch(() => ({ status: 'error', message: `HTTP ${res.status}` }));
    return json;
  },
  get:    (p) => API.call('GET', p),
  post:   (p, d) => API.call('POST', p, d),
  put:    (p, d) => API.call('PUT', p, d),
  del:    (p) => API.call('DELETE', p),
  upload: (p, fd) => API.call('POST', p, fd, true),
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
const Toast = {
  show(title, msg = '', type = 'info', duration = 4000) {
    const icons = { ok: '<i class="fa-solid fa-circle-check"></i>', err: '<i class="fa-solid fa-circle-xmark"></i>', warn: '<i class="fa-solid fa-triangle-exclamation"></i>', info: '<i class="fa-solid fa-circle-info"></i>' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>`;
    const c = document.getElementById('toast-container');
    c.appendChild(el);
    setTimeout(() => { el.classList.add('exiting'); setTimeout(() => el.remove(), 300); }, duration);
  },
  ok:   (t, m, d) => Toast.show(t, m, 'ok', d),
  err:  (t, m, d) => Toast.show(t, m, 'err', d),
  warn: (t, m, d) => Toast.show(t, m, 'warn', d),
  info: (t, m, d) => Toast.show(t, m, 'info', d),
};

// ─── MODAL ────────────────────────────────────────────────────────────────────
const Modal = {
  open(title, bodyHtml, footerHtml = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    document.getElementById('modal-backdrop').classList.add('open');
  },
  close() {
    document.getElementById('modal-backdrop').classList.remove('open');
  },
  confirm(title, msg, onOk, danger = true) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = msg;
    const okBtn = document.getElementById('confirm-ok');
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-accent'}`;
    okBtn.onclick = () => { Modal.closeConfirm(); onOk(); };
    document.getElementById('confirm-cancel').onclick = Modal.closeConfirm;
    document.getElementById('confirm-backdrop').classList.add('open');
  },
  closeConfirm() {
    document.getElementById('confirm-backdrop').classList.remove('open');
  }
};

// ─── CODE VIEWER ──────────────────────────────────────────────────────────────
const CodeViewer = {
  currentCode: '', currentFilename: '',
  show(title, code, filename = '') {
    this.currentCode = code; this.currentFilename = filename;
    document.getElementById('code-modal-title').textContent = title;
    document.getElementById('code-viewer').textContent = code;
    document.getElementById('code-backdrop').classList.add('open');
  },
  close() { document.getElementById('code-backdrop').classList.remove('open'); }
};

// ─── ROUTER ───────────────────────────────────────────────────────────────────
const Router = {
  current: '',
  routes: {},
  register(page, fn) { this.routes[page] = fn; },
  navigate(page) {
    location.hash = page;
    this.load(page);
  },
  load(page) {
    if (!this.routes[page]) page = 'dashboard';
    this.current = page;
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    document.getElementById('breadcrumb').textContent =
      page.charAt(0).toUpperCase() + page.slice(1).replace(/-/g, ' ');
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div></div>';
    this.routes[page]();
  },
  init() {
    const hash = location.hash.replace('#', '') || 'dashboard';
    this.load(hash);
    window.addEventListener('hashchange', () =>
      this.load(location.hash.replace('#', '') || 'dashboard'));
  }
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let STATE = {
  status: null, devices: [], models: {}, fbs: [],
  mappings: {}, tags: [], gateways: [], rs485: null
};

async function refreshStatus() {
  const r = await API.get('/status');
  if (r.status === 'success') {
    STATE.status = r.data;
    updateTopbar(r.data);
    (window.updateSidebarStatus || updateSidebarStatus)(r.data);
  }
}

function updateTopbar(d) {
  document.getElementById('topbar-stats').innerHTML = `
    <div class="ts-item"><span class="ts-val">${d.devices}</span><span class="ts-lbl">Devices</span></div>
    <div class="ts-item"><span class="ts-val">${d.meter_models}</span><span class="ts-lbl">Models</span></div>
    <div class="ts-item"><span class="ts-val">${d.tags}</span><span class="ts-lbl">Tags</span></div>
    <div class="ts-item"><span class="ts-val">${d.function_blocks}</span><span class="ts-lbl">FBs</span></div>
  `;
}

function updateSidebarStatus(d) {
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  dot.className = 'status-dot ok';
  lbl.textContent = `${d.devices} devs · ${d.meter_models} models`;
  // Update nav counts
  const nc = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  nc('nc-devices', d.devices);
  nc('nc-models', d.meter_models);
  nc('nc-fbs', d.function_blocks);
  nc('nc-tags', d.tags);
  document.getElementById('mini-stats').innerHTML = `
    <div class="mini-stat"><span class="mini-stat-val">${d.devices}</span><span class="mini-stat-lbl">Devices</span></div>
    <div class="mini-stat"><span class="mini-stat-val">${d.meter_models}</span><span class="mini-stat-lbl">Models</span></div>
    <div class="mini-stat"><span class="mini-stat-val">${d.tags}</span><span class="mini-stat-lbl">Tags</span></div>
    <div class="mini-stat"><span class="mini-stat-val">${d.function_blocks}</span><span class="mini-stat-lbl">FBs</span></div>
  `;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.assign(el, attrs);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'cls') el.className = v;
    else el.setAttribute(k, v);
  }
  children.flat().forEach(c => el.append(typeof c === 'string' ? c : c));
  return el;
}
const q = (s, ctx = document) => ctx.querySelector(s);
const qa = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const ce = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
const render = (html) => { document.getElementById('page-content').innerHTML = html; };

function commBadge(type) {
  if (type === 'RS485') return `<span class="tag tag-rs485"><i class="fa-solid fa-plug"></i> RS485</span>`;
  return `<span class="tag tag-gw"><i class="fa-solid fa-network-wired"></i> ${type}</span>`;
}
function modelBadge(m) {
  return m ? `<span class="tag tag-ok"><i class="fa-solid fa-check-circle"></i> ${m}</span>` : `<span class="tag tag-none"><i class="fa-solid fa-minus"></i> None</span>`;
}
function actionBtns(editFn, delFn) {
  return `<div class="btn-group">
    <button class="btn btn-xs btn-ghost btn-icon" onclick="${editFn}" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
    <button class="btn btn-xs btn-danger btn-icon" onclick="${delFn}" title="Delete"><i class="fa-solid fa-trash"></i></button>
  </div>`;
}
function dtBadge(dt) {
  const colors = {REAL:'blue',INT:'blue',BOOL:'green',DWORD:'purple',WORD:'purple',STRING:'amber'};
  const c = colors[dt] || 'blue';
  return `<span class="tag tag-${c === 'blue' ? 'rs485' : c === 'green' ? 'ok' : c === 'amber' ? 'warn' : 'gw'}">${dt}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('dashboard', async () => {
  await refreshStatus();
  const s = STATE.status || {};
  const warnDevs = s.devices_without_model || 0;

  render(`
    <div class="page-header">
      <div class="page-title-wrap">
        <div class="page-title"><i class="fa-solid fa-gauge-high"></i> System Dashboard
          <small>PLC & CODESYS Generator — Industrial Modbus Automation</small>
        </div>
      </div>
      <div class="page-actions">
        <button class="btn btn-accent" onclick="Router.navigate('import')"><i class="fa-solid fa-file-import"></i> Import CSV</button>
        <button class="btn btn-amber" onclick="Router.navigate('generate')"><i class="fa-solid fa-terminal"></i> Generate Code</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card c-amber" onclick="Router.navigate('devices')" style="cursor:pointer">
        <div class="stat-icon-wrap">
          <div class="stat-icon"><i class="fa-solid fa-microchip"></i></div>
          <span class="stat-trend">Configured</span>
        </div>
        <div class="stat-value">${s.devices || 0}</div>
        <div class="stat-label">Devices</div>
        <div class="stat-sub">${warnDevs ? `<span class="text-amber"><i class="fa-solid fa-triangle-exclamation"></i> ${warnDevs} without model</span>` : '<i class="fa-solid fa-check"></i> All configured'}</div>
      </div>
      <div class="stat-card c-cyan" onclick="Router.navigate('models')" style="cursor:pointer">
        <div class="stat-icon-wrap">
          <div class="stat-icon"><i class="fa-solid fa-layer-group"></i></div>
          <span class="stat-trend">Active</span>
        </div>
        <div class="stat-value">${s.meter_models || 0}</div>
        <div class="stat-label">Meter Models</div>
        <div class="stat-sub">Register maps defined</div>
      </div>
      <div class="stat-card c-green" onclick="Router.navigate('fbs')" style="cursor:pointer">
        <div class="stat-icon-wrap">
          <div class="stat-icon"><i class="fa-solid fa-cube"></i></div>
          <span class="stat-trend">Ready</span>
        </div>
        <div class="stat-value">${s.function_blocks || 0}</div>
        <div class="stat-label">Function Blocks</div>
        <div class="stat-sub">CODESYS FBs ready</div>
      </div>
      <div class="stat-card c-purple" onclick="Router.navigate('tags')" style="cursor:pointer">
        <div class="stat-icon-wrap">
          <div class="stat-icon"><i class="fa-solid fa-cloud-bolt"></i></div>
          <span class="stat-trend">SCADA</span>
        </div>
        <div class="stat-value">${s.tags || 0}</div>
        <div class="stat-label">Cloud Tags</div>
        <div class="stat-sub">SCADA / Cloud config</div>
      </div>
      <div class="stat-card c-amber" onclick="Router.navigate('mappings')" style="cursor:pointer">
        <div class="stat-icon-wrap">
          <div class="stat-icon"><i class="fa-solid fa-right-left"></i></div>
          <span class="stat-trend">Mapped</span>
        </div>
        <div class="stat-value">${s.pou_mappings || 0}</div>
        <div class="stat-label">POU Mappings</div>
        <div class="stat-sub">Variable assignments</div>
      </div>
      <div class="stat-card c-cyan" onclick="Router.navigate('comm')" style="cursor:pointer">
        <div class="stat-icon-wrap">
          <div class="stat-icon"><i class="fa-solid fa-network-wired"></i></div>
          <span class="stat-trend">TCP/IP</span>
        </div>
        <div class="stat-value">${s.gateways || 0}</div>
        <div class="stat-label">Gateways</div>
        <div class="stat-sub">TCP/Modbus gateways</div>
      </div>
    </div>

    ${warnDevs ? `<div class="alert alert-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${warnDevs} device(s) do not have a meter model assigned. 
      <a href="#devices" onclick="Router.navigate('devices')" style="color:var(--amber)">View Devices →</a></div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title"><i class="fa-solid fa-bolt-lightning"></i> Quick Actions</div>
        </div>
        <div class="panel-body">
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-outline" onclick="Router.navigate('import')"><i class="fa-solid fa-file-import"></i> Triple Sheet CSV Import</button>
            <button class="btn btn-outline" onclick="Router.navigate('generate')"><i class="fa-solid fa-terminal"></i> Generate All Code Files</button>
            <button class="btn btn-outline" onclick="Router.navigate('models')"><i class="fa-solid fa-layer-group"></i> Manage Meter Models</button>
            <button class="btn btn-outline" onclick="Router.navigate('fbs')"><i class="fa-solid fa-cube"></i> Manage Function Blocks</button>
            <button class="btn btn-outline" onclick="App.createBackup()"><i class="fa-solid fa-database"></i> Create Backup Now</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title"><i class="fa-solid fa-circle-info"></i> System Info</div>
        </div>
        <div class="panel-body" style="font-size:.8rem">
          <table style="width:100%">
            
            <tr><td class="muted" style="padding:5px 0">Data Dir</td><td class="mono" style="font-size:.72rem;color:var(--txt2)">${s.data_dir || '—'}</td></tr>
            <tr><td class="muted" style="padding:5px 0">Last Saved</td><td>${fmtDate(s.last_saved)}</td></tr>
            <tr><td class="muted" style="padding:5px 0">Gateways</td><td>${s.gateways || 0}</td></tr>
          </table>
        </div>
      </div>
    </div>
  `);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: DEVICES
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('devices', async () => {
  const r = await API.get('/devices');
  const models_r = await API.get('/meter-models');
  const gw_r = await API.get('/gateways');
  const devices = r.data || [];
  const modelNames = Object.keys(models_r.data || {});
  const gwNames = (gw_r.data || []).map(g => g.name);
  STATE.devices = devices;

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-microchip"></i> Devices <span style="font-size:.7rem;color:var(--txt2);font-family:var(--font-co)">(${devices.length})</span>
        <small>Modbus slave devices in the system</small>
      </div>
      <div class="page-actions">
        <button class="btn btn-accent" onclick="Devices.showAdd()">+ Add Device</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">⬡ Device Registry <span class="badge">${devices.length}</span></div>
        <div class="search-bar" style="margin:0">
          <input id="dev-search" placeholder="Search devices…" oninput="Devices.filter(this.value)" />
        </div>
      </div>
      <div class="table-wrap">
        <table id="devices-table">
          <thead>
            <tr>
              <th>#</th><th>Device Name</th><th>Unit ID</th><th>POU</th>
              <th>Meter Model</th><th>Communication</th><th>Array</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="devices-body">
            ${devices.length ? devices.map(d => Devices.row(d)).join('') :
              '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">⬡</div><h3>No devices yet</h3><p>Import a CSV or add manually</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `);

  Devices._models = modelNames;
  Devices._gateways = gwNames;
});

const Devices = {
  _models: [], _gateways: [],
  row: (d) => `
    <tr id="dev-row-${d.device_number}">
      <td class="mono">${d.device_number}</td>
      <td class="bold">${d.device_name}</td>
      <td class="mono">${d.unit_id}</td>
      <td class="mono" style="color:var(--blue)">${d.pou_name}</td>
      <td>${modelBadge(d.meter_model)}</td>
      <td>${commBadge(d.communication_type)}</td>
      <td class="muted mono" style="font-size:.7rem">${d.array_name}</td>
      <td>${actionBtns(`Devices.showEdit(${d.device_number})`, `Devices.del(${d.device_number},'${d.device_name}')`)}</td>
    </tr>`,
  filter(q) {
    const lq = q.toLowerCase();
    qa('#devices-body tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(lq) ? '' : 'none';
    });
  },
  form(d = {}) {
    const modelOpts = ['', ...this._models].map(m =>
      `<option value="${m}" ${d.meter_model === m ? 'selected' : ''}>${m || '— None —'}</option>`).join('');
    const commOpts = ['RS485', ...this._gateways].map(c =>
      `<option value="${c}" ${d.communication_type === c ? 'selected' : ''}>${c}</option>`).join('');
    return `
      <div class="form-grid cols-2">
        <div class="form-field"><label>Device Name <span class="req">*</span></label>
          <input id="f-name" value="${d.device_name || ''}" placeholder="Zone1_Meter1" /></div>
        <div class="form-field"><label>Unit ID (1-247) <span class="req">*</span></label>
          <input id="f-uid" type="number" min="1" max="247" value="${d.unit_id || 1}" /></div>
        <div class="form-field"><label>Array Name <span class="req">*</span></label>
          <input id="f-arr" value="${d.array_name || 'GVL.EM01'}" /></div>
        <div class="form-field"><label>POU Name <span class="req">*</span></label>
          <input id="f-pou" value="${d.pou_name || ''}" placeholder="EM01_PLC1" /></div>
        <div class="form-field"><label>Meter Model</label>
          <select id="f-model">${modelOpts}</select></div>
        <div class="form-field"><label>Communication Type</label>
          <select id="f-comm" onchange="Devices.toggleGw(this.value)">${commOpts}</select></div>
        <div class="form-field" id="gw-field" style="${d.communication_type && d.communication_type !== 'RS485' ? '' : 'display:none'}">
          <label>Gateway Name</label>
          <input id="f-gw" value="${d.gateway_name || ''}" /></div>
        <div class="form-field"><label>Description</label>
          <input id="f-desc" value="${d.description || ''}" /></div>
      </div>`;
  },
  toggleGw(v) {
    q('#gw-field').style.display = v !== 'RS485' ? '' : 'none';
    if (v !== 'RS485') { q('#f-gw').value = v; }
  },
  getFormData(num = 0) {
    const comm = q('#f-comm').value;
    return {
      device_number: num, device_name: q('#f-name').value.trim(),
      unit_id: parseInt(q('#f-uid').value), array_name: q('#f-arr').value.trim(),
      pou_name: q('#f-pou').value.trim(), meter_model: q('#f-model').value,
      communication_type: comm, gateway_name: comm !== 'RS485' ? q('#f-gw').value.trim() : '',
      description: q('#f-desc').value.trim(), fb_name: ''
    };
  },
  showAdd() {
    Modal.open('Add Device', this.form(),
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="Devices.add()">Add Device</button>`);
  },
  async add() {
    const data = this.getFormData();
    const r = await API.post('/devices', data);
    if (r.status === 'success') {
      Toast.ok('Device Added', data.device_name);
      Modal.close(); Router.navigate('devices');
    } else Toast.err('Error', r.message);
  },
  showEdit(num) {
    const d = STATE.devices.find(x => x.device_number === num);
    if (!d) return;
    Modal.open('Edit Device', this.form(d),
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="Devices.update(${num})">Save Changes</button>`);
  },
  async update(num) {
    const data = this.getFormData(num);
    const r = await API.put(`/devices/${num}`, data);
    if (r.status === 'success') {
      Toast.ok('Device Updated'); Modal.close(); Router.navigate('devices');
    } else Toast.err('Error', r.message);
  },
  del(num, name) {
    Modal.confirm('Delete Device', `Delete device "${name}"? This cannot be undone.`, async () => {
      await API.del(`/devices/${num}`);
      Toast.ok('Deleted', name); Router.navigate('devices');
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: METER MODELS
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('models', async () => {
  const r = await API.get('/meter-models');
  const models = r.data || {};
  const names = Object.keys(models);

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-layer-group"></i> Meter Models
        <small>Register map definitions for each device type</small>
      </div>
      <div class="page-actions">
        <button class="btn btn-accent" onclick="Models.showAdd()">+ Add Model</button>
      </div>
    </div>
    <div id="models-list">
      ${names.length ? names.map(name => Models.card(name, models[name])).join('') :
        `<div class="empty-state"><div class="empty-icon">◉</div><h3>No meter models yet</h3>
         <p>Add meter models with their Modbus register maps</p>
         <button class="btn btn-accent" onclick="Models.showAdd()" style="margin-top:14px">+ Add First Model</button></div>`}
    </div>
  `);
});

const Models = {
  card(name, maps) {
    const devCount = STATE.devices.filter(d => d.meter_model === name).length;
    return `
      <div class="panel" style="margin-bottom:14px">
        <div class="panel-header">
          <div class="panel-title">◉ ${name}
            <span class="badge">${maps.length} register map${maps.length !== 1 ? 's' : ''}</span>
            ${devCount ? `<span class="badge" style="color:var(--green)">${devCount} device${devCount !== 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="btn-group">
            <button class="btn btn-xs btn-danger" onclick="Models.del('${name}')">Delete Model</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Data Type</th><th>Start Addr</th><th>Quantity</th><th>Func Code</th><th>Comment</th></tr></thead>
            <tbody>
              ${maps.map(rm => `
                <tr>
                  <td class="amber">${rm.data_type}</td>
                  <td class="mono">${rm.start_address}</td>
                  <td class="mono">${rm.quantity}</td>
                  <td class="mono">${rm.function_code}</td>
                  <td class="muted">${rm.comment || '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },
  showAdd() {
    const body = `
      <div class="form-field" style="margin-bottom:16px">
        <label>Model Name <span class="req">*</span></label>
        <input id="m-name" placeholder="ABB_EM6400" />
      </div>
      <div class="section-divider">Register Maps</div>
      <div id="rm-list"></div>
      <button class="btn btn-outline btn-sm" onclick="Models.addRM()" style="margin-top:8px">+ Add Register Map</button>`;
    Modal.open('Add Meter Model', body,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="Models.save()">Save Model</button>`);
    Models.addRM();
  },
  rmCount: 0,
  addRM() {
    const i = this.rmCount++;
    const row = ce(`
      <div id="rm-${i}" style="display:grid;grid-template-columns:1fr 80px 70px 90px 1fr auto;gap:8px;align-items:end;margin-bottom:10px">
        <div class="form-field"><label>Data Type</label><input placeholder="realtime" id="rm-dt-${i}" /></div>
        <div class="form-field"><label>Start Addr</label><input type="number" value="0" id="rm-sa-${i}" /></div>
        <div class="form-field"><label>Quantity</label><input type="number" value="50" id="rm-qty-${i}" /></div>
        <div class="form-field"><label>Func Code</label><input value="16#03" id="rm-fc-${i}" /></div>
        <div class="form-field"><label>Comment</label><input id="rm-cm-${i}" placeholder="optional" /></div>
        <button class="btn btn-danger btn-icon btn-sm" onclick="document.getElementById('rm-${i}').remove()" style="margin-bottom:0">✕</button>
      </div>`);
    q('#rm-list').appendChild(row);
  },
  async save() {
    const name = q('#m-name').value.trim();
    if (!name) return Toast.warn('Validation', 'Model name is required');
    const rms = [];
    for (const el of qa('#rm-list > div')) {
      const id = el.id.split('-')[1];
      const dt = q(`#rm-dt-${id}`)?.value.trim();
      if (!dt) continue;
      rms.push({
        data_type: dt,
        start_address: parseInt(q(`#rm-sa-${id}`)?.value || 0),
        quantity: parseInt(q(`#rm-qty-${id}`)?.value || 50),
        function_code: q(`#rm-fc-${id}`)?.value || '16#03',
        comment: q(`#rm-cm-${id}`)?.value || ''
      });
    }
    if (!rms.length) return Toast.warn('Validation', 'Add at least one register map');
    const r = await API.post('/meter-models', { model_name: name, register_maps: rms });
    if (r.status === 'success') {
      Toast.ok('Model Added', name); Modal.close(); Router.navigate('models');
    } else Toast.err('Error', r.message);
  },
  del(name) {
    Modal.confirm('Delete Model', `Delete meter model "${name}"? This cannot be undone.`, async () => {
      await API.del(`/meter-models/${encodeURIComponent(name)}`);
      Toast.ok('Deleted', name); Router.navigate('models');
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: FUNCTION BLOCKS
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('fbs', async () => {
  const [r, mr, dr] = await Promise.all([
    API.get('/function-blocks'),
    API.get('/meter-models'),
    API.get('/devices'),
  ]);
  const fbs = r.data || [];
  STATE.fbs     = fbs;
  STATE.devices = dr.data || [];
  const modelNames = Object.keys(mr.data || {});

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-cube"></i> Function Blocks
        <small>Meter-specific CODESYS function blocks</small>
      </div>
      <div class="page-actions">
        <button class="btn btn-accent" onclick="FBs.showCreate()">+ Create FB</button>
      </div>
    </div>
    <div id="fb-list">
      ${fbs.length ? fbs.map(fb => FBs.card(fb)).join('') :
        `<div class="empty-state"><div class="empty-icon">◧</div><h3>No function blocks yet</h3>
         <p>Create FBs for your meter models to generate structured CODESYS code</p>
         <button class="btn btn-accent" onclick="FBs.showCreate()" style="margin-top:14px">+ Create First FB</button></div>`}
    </div>
  `);
  FBs._models    = modelNames;
  FBs._modelMaps = mr.data || {};
});

const FBs = {
  _models: [],
  _modelMaps: {},   // { modelName: [ {data_type, quantity, start_address, comment} ] }

  // ── mirror backend _get_array_suffix ──
  _arraySuffix(dt) {
    const d = dt.toLowerCase();
    if (d.includes('realtime')) return 'Realtime';
    if (d.includes('energy'))   return 'Energy';
    if (d.includes('harmonic')) return 'Harmonics';
    return d.charAt(0).toUpperCase() + d.slice(1).replace(/\s+/g,'_');
  },

  // ── build arrays dict from a model's register maps ──
  _buildArrays(modelName) {
    const maps = this._modelMaps[modelName] || [];
    const arrays = {};
    maps.forEach(rm => {
      const name = this._arraySuffix(rm.data_type);
      arrays[name] = {
        size: rm.quantity,
        comment: rm.comment || `Registers for ${rm.data_type}`,
        start_address: rm.start_address,
        function_code: rm.function_code || '16#03'
      };
    });
    return arrays;
  },

  card(fb) {
    const activeMaps = (fb.mappings || []).filter(m => m.type !== 'skip').length;
    const arrCount   = Object.keys(fb.arrays || {}).length;
    const devCount   = STATE.devices.filter(d => d.fb_name === fb.fb_name).length;
    return `
      <div class="panel" style="margin-bottom:14px">
        <div class="panel-header">
          <div class="panel-title">◧ ${fb.fb_name}
            <span class="badge">for ${fb.meter_model}</span>
            ${fb.has_swap ? '<span class="badge" style="color:var(--blue)">SWAP</span>' : ''}
          </div>
          <div class="btn-group">
            <button class="btn btn-xs btn-blue"   onclick="FBs.previewCode('${fb.fb_id}','${fb.fb_name}')">⌥ Code</button>
            <button class="btn btn-xs btn-ghost"  onclick="FBs.showEdit(STATE.fbs.find(f=>f.fb_id==='${fb.fb_id}'))">✎ Edit</button>
            <button class="btn btn-xs btn-danger" onclick="FBs.del('${fb.fb_id}','${fb.fb_name}')">Delete</button>
          </div>
        </div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            <div><div class="stat-label">Arrays</div><div class="mono text-amber">${arrCount}</div></div>
            <div><div class="stat-label">Mappings</div><div class="mono text-blue">${activeMaps}</div></div>
            <div><div class="stat-label">Devices Using</div><div class="mono text-green">${devCount}</div></div>
            <div><div class="stat-label">Created</div><div style="font-size:.72rem;color:var(--txt2)">${fmtDate(fb.created_at)}</div></div>
          </div>
          ${arrCount ? `<div class="sep"></div>
          <div style="font-size:.75rem;color:var(--txt2)">
            <strong style="color:var(--txt1)">Arrays:</strong>
            ${Object.entries(fb.arrays).map(([n,a]) =>
              `<span class="tag tag-rs485" style="margin:2px">${n} [${a.size}]</span>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
  },

  showCreate() {
    if (!this._models.length) {
      Toast.warn('No Models', 'Add meter models first');
      Router.navigate('models'); return;
    }
    const modelOpts = this._models.map(m => `<option value="${m}">${m}</option>`).join('');

    const body = `
      <!-- ── TOP ROW ── -->
      <div class="form-grid cols-2" style="margin-bottom:14px">
        <div class="form-field">
          <label>Meter Model <span class="req">*</span></label>
          <select id="fb-model">
            <option value="">— Select Model —</option>${modelOpts}
          </select>
          <div class="form-hint">Arrays are derived automatically from this model's register maps.</div>
        </div>
        <div class="form-field">
          <label>FB Name <span class="req">*</span></label>
          <input id="fb-name" placeholder="FB_ABB_EM6400" />
        </div>
        <div class="form-field span-2">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;letter-spacing:0;font-size:.82rem">
            <input type="checkbox" id="fb-swap" style="width:auto" />
            Include byte-swap option (for endianness correction)
          </label>
        </div>
      </div>

      <!-- ── AUTO ARRAYS PREVIEW ── -->
      <div class="section-divider">Input Arrays (auto-derived from model)</div>
      <div id="fb-arrays-preview">
        <div class="alert alert-info" style="font-size:.75rem">
          Select a meter model above — arrays will be generated automatically from its register maps.
        </div>
      </div>

      <!-- ── PARAMETER MAPPINGS ── -->
      <div class="section-divider">Parameter Mappings</div>
      <div class="alert alert-info" style="font-size:.75rem">
        Select an array, choose the conversion type, enter the register start index and scale factor.<br>
        For <strong>Calculated</strong> type, write a CODESYS formula referencing other parameters.
      </div>
      <div id="fb-mappings"></div>
      <button class="btn btn-outline btn-sm" onclick="FBs.addMapping()" style="margin-top:6px">
        + Add Parameter
      </button>`;

    Modal.open('Create Function Block', body,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="FBs.save()">Create FB</button>`);

    FBs._mc = 0;
    FBs.addMapping();   // start with one empty row

    // ── when model changes: rebuild array preview + refresh dropdowns ──
    q('#fb-model').addEventListener('change', e => {
      const m = e.target.value;
      if (!q('#fb-name').value && m)
        q('#fb-name').value = `FB_${m.replace(/[^a-zA-Z0-9]/g,'_')}`;
      FBs._refreshArrayPreview(m);
      FBs._refreshAllArrayDropdowns(m);
    });
  },

  // ── show a read-only table of the derived arrays ──
  _refreshArrayPreview(modelName) {
    const preview = q('#fb-arrays-preview');
    if (!preview) return;
    const arrays = this._buildArrays(modelName);
    const entries = Object.entries(arrays);
    if (!entries.length) {
      preview.innerHTML = `<div class="alert alert-warn" style="font-size:.75rem">
        No register maps found for this model. Add register maps first.</div>`;
      return;
    }
    preview.innerHTML = `
      <div class="table-wrap" style="margin-bottom:4px">
        <table>
          <thead>
            <tr><th>Array Name (auto)</th><th>Size</th><th>Start Addr</th><th>Func Code</th><th>Comment</th></tr>
          </thead>
          <tbody>
            ${entries.map(([name, info]) => `
              <tr>
                <td><span class="tag tag-rs485">${name}</span></td>
                <td class="mono">${info.size}</td>
                <td class="mono">${info.start_address}</td>
                <td class="mono">${info.function_code}</td>
                <td class="muted" style="font-size:.72rem">${info.comment}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  // ── replace every array <select> in the mapping rows ──
  _refreshAllArrayDropdowns(modelName) {
    const arrays = this._buildArrays(modelName);
    const opts = Object.keys(arrays).length
      ? Object.keys(arrays).map(n => `<option value="${n}">${n}</option>`).join('')
      : `<option value="">— select model first —</option>`;
    qa('[id^="fbm-arr-"]').forEach(sel => { sel.innerHTML = opts; });
  },

  // ── build the array options for a single new row ──
  _arrayOpts() {
    const modelName = q('#fb-model')?.value || '';
    const arrays = this._buildArrays(modelName);
    if (!Object.keys(arrays).length)
      return `<option value="">— select model first —</option>`;
    return Object.keys(arrays).map(n => `<option value="${n}">${n}</option>`).join('');
  },

  _mc: 0,

  // ── TYPE DEFINITIONS ──
  _types: [
    { value: 'single',        label: '1× WORD → REAL' },
    { value: 'single_int',    label: '1× WORD → INT' },
    { value: 'dword_real',    label: '2× WORD UNION → REAL (IEEE 754)' },
    { value: 'dword_shift',   label: '2× WORD Bit-Shift → REAL' },
    { value: 'dword_signed',  label: '2× WORD → DINT → REAL (signed)' },
    { value: 'calculated',    label: 'Calculated (custom formula)' },
  ],

  addMapping(prefill) {
    const i = this._mc++;
    const typeOpts = this._types.map(t =>
      `<option value="${t.value}" ${prefill && t.value === prefill.type ? 'selected' : ''}>${t.label}</option>`).join('');
    const arrayOpts = this._arrayOpts();
    const pf = prefill || {};

    const el = ce(`
      <div id="fbm-${i}" class="fb-mapping-row" style="
        background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);
        padding:12px;margin-bottom:10px;position:relative">

        <!-- ROW 1: name · array · type -->
        <div style="display:grid;grid-template-columns:1.6fr 1fr 1.8fr auto;gap:10px;align-items:end">
          <div class="form-field">
            <label>Parameter Name</label>
            <input id="fbm-n-${i}" value="${pf.name||''}" placeholder="PhaseVoltage_L1" />
          </div>
          <div class="form-field">
            <label>Array</label>
            <select id="fbm-arr-${i}">${arrayOpts}</select>
          </div>
          <div class="form-field">
            <label>Conversion Type</label>
            <select id="fbm-t-${i}" onchange="FBs.onTypeChange(${i})">
              ${typeOpts}
            </select>
          </div>
          <button class="btn btn-danger btn-icon btn-sm"
            onclick="document.getElementById('fbm-${i}').remove()"
            style="margin-bottom:0;align-self:flex-end" title="Remove">✕</button>
        </div>

        <!-- ROW 2: start idx · scale  (hidden for calculated) -->
        <div id="fbm-extra-${i}" style="display:grid;grid-template-columns:100px 150px 1fr;gap:10px;align-items:end;margin-top:10px">
          <div class="form-field">
            <label>Start Index</label>
            <input type="number" min="0" value="${pf.start ?? 0}" id="fbm-s-${i}" />
          </div>
          <div class="form-field">
            <label>Scale Factor</label>
            <input type="number" step="any" value="${pf.scale ?? 0.01}" id="fbm-sc-${i}" />
          </div>
          <div class="form-field">
            <label>Description <span style="color:var(--txt3);font-weight:400">(optional)</span></label>
            <input id="fbm-desc-${i}" value="${pf.description||''}" placeholder="Phase Voltage L1 (V)" />
          </div>
        </div>

        <!-- ROW 3: formula  (shown only for calculated) -->
        <div id="fbm-formula-${i}" style="display:none;margin-top:10px">
          <div class="form-field">
            <label>CODESYS Formula <span class="req">*</span></label>
            <input id="fbm-f-${i}" value="${pf.formula||''}" placeholder="e.g. (V_L1 + V_L2 + V_L3) / 3.0" />
            <div class="form-hint">Reference other output parameters by name. Pure CODESYS ST expression.</div>
          </div>
        </div>

        <!-- type hint badge -->
        <div id="fbm-hint-${i}" style="margin-top:8px"></div>
      </div>`);

    q('#fb-mappings').appendChild(el);
    // Set array selection if pre-filling
    if (pf.array) {
      const sel = el.querySelector(`#fbm-arr-${i}`);
      if (sel) sel.value = pf.array;
    }
    this.onTypeChange(i);   // set initial hint
  },

  // ── show/hide sub-fields based on type, update hint badge ──
  onTypeChange(i) {
    const type = q(`#fbm-t-${i}`)?.value;
    if (!type) return;
    const extra   = q(`#fbm-extra-${i}`);
    const formula = q(`#fbm-formula-${i}`);
    const hint    = q(`#fbm-hint-${i}`);
    if (!extra || !formula) return;

    const isCalc = type === 'calculated';
    extra.style.display   = isCalc ? 'none' : '';
    formula.style.display = isCalc ? '' : 'none';

    const hints = {
      single:       { cls:'tag-rs485', txt:'WORD_TO_REAL(arr[idx]) × scale' },
      single_int:   { cls:'tag-rs485', txt:'WORD_TO_INT(arr[idx])' },
      dword_real:   { cls:'tag-gw',    txt:'UNION method: HighWord+LowWord → DWORD → REAL × scale' },
      dword_shift:  { cls:'tag-gw',    txt:'Bit-shift: SHL(idx,16) OR (idx+1) → DWORD_TO_REAL × scale' },
      dword_signed: { cls:'tag-warn',  txt:'SHL → DWORD_TO_DINT → DINT_TO_REAL × scale (signed 32-bit)' },
      calculated:   { cls:'tag-ok',    txt:'Custom CODESYS ST formula — no array/scale needed' },
    };
    const h = hints[type];
    hint.innerHTML = h ? `<span class="tag ${h.cls}" style="font-size:.67rem">${h.txt}</span>` : '';
  },

  async save() {
    const model = q('#fb-model').value;
    const name  = q('#fb-name').value.trim();
    if (!model) return Toast.warn('Validation', 'Select a meter model');
    if (!name)  return Toast.warn('Validation', 'FB name is required');

    // ── arrays are auto-built from model ──
    const arrays = this._buildArrays(model);
    if (!Object.keys(arrays).length)
      return Toast.warn('No Arrays', 'The selected model has no register maps');

    // ── collect mappings ──
    const mappings = [];
    for (const el of qa('.fb-mapping-row')) {
      const i    = el.id.split('-')[1];
      const name_ = q(`#fbm-n-${i}`)?.value.trim();
      if (!name_) continue;
      const type = q(`#fbm-t-${i}`)?.value;

      const entry = {
        name:        name_,
        type:        type,
        description: q(`#fbm-desc-${i}`)?.value.trim() || name_,
        data_type:   'REAL',
      };

      if (type === 'calculated') {
        const formula = q(`#fbm-f-${i}`)?.value.trim();
        if (!formula) { Toast.warn('Validation', `Formula required for "${name_}"`); return; }
        entry.formula = formula;
      } else {
        const arr = q(`#fbm-arr-${i}`)?.value;
        if (!arr) { Toast.warn('Validation', `Select array for "${name_}"`); return; }
        entry.array  = arr;
        entry.start  = parseInt(q(`#fbm-s-${i}`)?.value  || 0);
        entry.scale  = parseFloat(q(`#fbm-sc-${i}`)?.value || 0.01);
        if (type === 'single_int') entry.data_type = 'INT';
      }
      mappings.push(entry);
    }

    if (!mappings.length) return Toast.warn('Validation', 'Add at least one parameter mapping');

    const r = await API.post('/function-blocks', {
      meter_model: model, fb_name: name,
      arrays, mappings,
      has_swap: q('#fb-swap').checked
    });
    if (r.status === 'success') {
      Toast.ok('FB Created', name); Modal.close(); Router.navigate('fbs');
    } else Toast.err('Error', r.message);
  },

  showEdit(fb) {
    if (!fb) { Toast.warn('Error', 'FB not found'); return; }
    if (!this._models.length) { Toast.warn('No Models', 'Add meter models first'); return; }

    const modelOpts = this._models.map(m =>
      `<option value="${m}" ${m === fb.meter_model ? 'selected' : ''}>${m}</option>`).join('');

    const body = `
      <div class="form-grid cols-2" style="margin-bottom:14px">
        <div class="form-field">
          <label>Meter Model <span class="req">*</span></label>
          <select id="fb-model">${modelOpts}</select>
        </div>
        <div class="form-field">
          <label>FB Name <span class="req">*</span></label>
          <input id="fb-name" value="${fb.fb_name}" placeholder="FB_ABB_EM6400" />
        </div>
        <div class="form-field span-2">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;letter-spacing:0;font-size:.82rem">
            <input type="checkbox" id="fb-swap" style="width:auto" ${fb.has_swap ? 'checked' : ''} />
            Include byte-swap option (for endianness correction)
          </label>
        </div>
      </div>
      <div class="section-divider">Input Arrays (auto-derived from model)</div>
      <div id="fb-arrays-preview"></div>
      <div class="section-divider">Parameter Mappings</div>
      <div class="alert alert-info" style="font-size:.75rem">
        Edit mappings below. Select array, conversion type, index and scale factor.
      </div>
      <div id="fb-mappings"></div>
      <button class="btn btn-outline btn-sm" onclick="FBs.addMapping()" style="margin-top:6px">+ Add Parameter</button>`;

    Modal.open(`Edit Function Block: ${fb.fb_name}`, body,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="FBs.saveEdit('${fb.fb_id}')">⊙ Save Changes</button>`);

    FBs._mc = 0;
    FBs._editId = fb.fb_id;

    // Pre-fill existing mappings
    FBs._refreshArrayPreview(fb.meter_model);
    (fb.mappings || []).forEach(m => {
      FBs.addMapping(m);
    });
    if (!fb.mappings || !fb.mappings.length) FBs.addMapping();

    q('#fb-model').addEventListener('change', e => {
      const m = e.target.value;
      FBs._refreshArrayPreview(m);
      FBs._refreshAllArrayDropdowns(m);
    });
  },

  async saveEdit(fbId) {
    const model = q('#fb-model').value;
    const name  = q('#fb-name').value.trim();
    if (!model) return Toast.warn('Validation', 'Select a meter model');
    if (!name)  return Toast.warn('Validation', 'FB name is required');

    const arrays = this._buildArrays(model);
    if (!Object.keys(arrays).length)
      return Toast.warn('No Arrays', 'The selected model has no register maps');

    const mappings = [];
    for (const el of qa('.fb-mapping-row')) {
      const i     = el.id.split('-')[1];
      const name_ = q(`#fbm-n-${i}`)?.value.trim();
      if (!name_) continue;
      const type  = q(`#fbm-t-${i}`)?.value;
      const entry = {
        name: name_, type, description: q(`#fbm-desc-${i}`)?.value.trim() || name_, data_type: 'REAL',
      };
      if (type === 'calculated') {
        const formula = q(`#fbm-f-${i}`)?.value.trim();
        if (!formula) { Toast.warn('Validation', `Formula required for "${name_}"`); return; }
        entry.formula = formula;
      } else {
        const arr = q(`#fbm-arr-${i}`)?.value;
        if (!arr) { Toast.warn('Validation', `Select array for "${name_}"`); return; }
        entry.array = arr;
        entry.start = parseInt(q(`#fbm-s-${i}`)?.value || 0);
        entry.scale = parseFloat(q(`#fbm-sc-${i}`)?.value || 0.01);
        if (type === 'single_int') entry.data_type = 'INT';
      }
      mappings.push(entry);
    }
    if (!mappings.length) return Toast.warn('Validation', 'Add at least one parameter mapping');

    const r = await API.put(`/function-blocks/${fbId}`, {
      meter_model: model, fb_name: name, arrays, mappings, has_swap: q('#fb-swap').checked
    });
    if (r.status === 'success') {
      Toast.ok('FB Updated', name); Modal.close(); Router.navigate('fbs');
    } else Toast.err('Error', r.message);
  },

  async previewCode(id, name) {
    const r = await API.get(`/function-blocks/${id}/code`);
    if (r.status === 'success') CodeViewer.show(`${name}.st`, r.data.code, r.data.filename);
    else Toast.err('Error', r.message);
  },

  del(id, name) {
    Modal.confirm('Delete FB', `Delete function block "${name}"?`, async () => {
      await API.del(`/function-blocks/${id}`);
      Toast.ok('Deleted', name); Router.navigate('fbs');
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: POU MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('mappings', async () => {
  const [mr, fb, inst, dr] = await Promise.all([
    API.get('/pou-mappings'),
    API.get('/function-blocks'),
    API.get('/pou-instances'),
    API.get('/devices'),
  ]);
  const mappings  = mr.data   || {};
  STATE.mappings  = mappings;
  STATE.fbs       = fb.data   || [];
  STATE.pouInst   = inst.data || {};
  STATE.devices   = dr.data   || [];
  const pouNames  = Object.keys(mappings);

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-right-left"></i> POU Mappings
        <small>Bulk FB output → variable assignments per POU</small>
      </div>
      <div class="page-actions">
        <button class="btn btn-accent" onclick="Mappings.showAdd()">+ Map POU</button>
      </div>
    </div>
    <div id="mapping-list">
      ${pouNames.length
        ? pouNames.map(p => Mappings.card(p, mappings[p])).join('')
        : `<div class="empty-state">
             <div class="empty-icon">⇌</div>
             <h3>No POU mappings yet</h3>
             <p>Click <strong>+ Map POU</strong> to bulk-map all FB outputs for a device in one go,
                or import from CSV Sheet 2.</p>
           </div>`}
    </div>
  `);
});

const Mappings = {

  card(pou, maps) {
    const dev      = STATE.devices.find(d => d.pou_name === pou);
    const model    = dev?.meter_model || '';
    const fb       = model ? (STATE.fbs||[]).find(f => f.meter_model === model) : null;
    const instName = (STATE.pouInst||{})[pou] || '';

    // Derive prefix from first mapping's output_variable (strip last _Xxx part)
    const prefix = maps.length
      ? (() => {
          const last = maps[0].output_variable;
          const cut  = last.lastIndexOf('_');
          return cut > 0 ? last.slice(0, cut) : last;
        })()
      : '';

    return `
      <div class="panel" style="margin-bottom:14px">
        <div class="panel-header">
          <div class="panel-title">⇌ ${pou}
            <span class="badge">${maps.length} variable${maps.length!==1?'s':''}</span>
            ${model    ? `<span class="badge" style="color:var(--amber)">${model}</span>` : ''}
            ${fb       ? `<span class="badge" style="color:var(--blue)">${fb.fb_name}</span>` : ''}
            ${instName ? `<span class="badge" style="color:var(--green)">inst: ${instName}</span>` : ''}
            ${prefix   ? `<span class="badge" style="color:var(--txt2)">prefix: ${prefix}</span>` : ''}
          </div>
          <div class="btn-group">
            <button class="btn btn-xs btn-ghost" onclick="Mappings.showEdit('${pou}')">✎ Edit</button>
            <button class="btn btn-xs btn-danger" onclick="Mappings.del('${pou}')">Delete All</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Output Variable</th>
                <th style="width:28px;text-align:center">←</th>
                <th>FB Output Param</th>
                <th style="color:var(--txt3);font-weight:400">Array</th>
              </tr>
            </thead>
            <tbody>
              ${maps.map(m => `
                <tr>
                  <td style="font-family:var(--font-co);font-size:.78rem;color:var(--txt1)">${m.output_variable}</td>
                  <td style="text-align:center;color:var(--txt3)">←</td>
                  <td><span class="tag tag-gw" style="font-size:.71rem">${m.mapping_fb_out}</span></td>
                  <td class="muted" style="font-size:.71rem;font-family:var(--font-co)">${m.input_array}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  _pouMeta: {},

  showAdd() {
    const seen = new Set();
    const pouDevices = STATE.devices.filter(d => {
      if (seen.has(d.pou_name)) return false;
      seen.add(d.pou_name); return true;
    });

    if (!pouDevices.length) {
      Toast.warn('No Devices', 'Add devices first to create POU mappings');
      return;
    }

    this._pouMeta = {};
    pouDevices.forEach(d => {
      const fb = (STATE.fbs||[]).find(f => f.meter_model === d.meter_model);
      this._pouMeta[d.pou_name] = { device: d, fb: fb || null };
    });

    const pouOpts = pouDevices.map(d => {
      const fb  = this._pouMeta[d.pou_name]?.fb;
      const sfx = fb ? ` [${fb.fb_name}]` : ' — no FB';
      return `<option value="${d.pou_name}">${d.pou_name}${sfx}</option>`;
    }).join('');

    Modal.open('Map POU — Bulk Variable Assignment', `
      <!-- ── STEP 1: POU ── -->
      <div class="form-field" style="margin-bottom:14px">
        <label>POU Name <span class="req">*</span></label>
        <select id="m-pou" onchange="Mappings.onPouChange()">
          <option value="">— Select POU —</option>${pouOpts}
        </select>
      </div>

      <!-- FB context strip -->
      <div id="m-fb-info" style="display:none;background:var(--bg3);border:1px solid var(--border);
           border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;font-size:.76rem"></div>

      <!-- ── STEP 2: names (shown after POU selected) ── -->
      <div id="m-name-fields" style="display:none">
        <div class="form-grid cols-2" style="margin-bottom:14px">

          <div class="form-field">
            <label>Output Variable Prefix <span class="req">*</span></label>
            <input id="m-prefix" placeholder="Zone1_EM01"
              oninput="Mappings.refreshPreview()" />
            <div class="form-hint">
              All FB outputs will be named <strong>Prefix_ParamName</strong>
              — e.g. <code>Zone1_EM01_VoltageL1</code>
            </div>
          </div>

          <div class="form-field">
            <label>FB Instance Name <span class="req">*</span></label>
            <input id="m-inst" placeholder="fbEM01_inst"
              oninput="Mappings.refreshPreview()" />
            <div class="form-hint">
              The FB variable declared in this POU
              — e.g. <code>fbEM01_inst : FB_ABB_M4M;</code>
            </div>
          </div>

        </div>

        <!-- ── live preview table ── -->
        <div class="section-divider" style="margin-bottom:10px">Preview — variables that will be created</div>
        <div id="m-preview" style="background:var(--bg1);border:1px solid var(--border);
             border-radius:var(--radius);max-height:240px;overflow-y:auto;
             font-family:var(--font-co);font-size:.73rem;padding:10px 14px;color:var(--txt2)">
          Enter a prefix above to preview…
        </div>
      </div>`,

      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" id="m-save-btn" onclick="Mappings.addBulk()"
         style="display:none">⇌ Create All Mappings</button>`
    );
  },

  onPouChange() {
    const pou  = q('#m-pou').value;
    const meta = this._pouMeta[pou];
    const info = q('#m-fb-info');
    const fields = q('#m-name-fields');
    const saveBtn = q('#m-save-btn');

    if (!pou || !meta) {
      info.style.display   = 'none';
      fields.style.display = 'none';
      saveBtn.style.display = 'none';
      return;
    }

    const { device, fb } = meta;
    info.style.display = '';

    if (fb) {
      const params = (fb.mappings||[]).filter(m => m.type !== 'skip');
      info.innerHTML = `
        <span style="color:var(--txt2)">Device:</span>
        <span style="color:var(--txt1);margin:0 12px 0 4px">${device.device_name}</span>
        <span style="color:var(--txt2)">Model:</span>
        <span style="color:var(--amber);margin:0 12px 0 4px">${device.meter_model}</span>
        <span style="color:var(--txt2)">FB:</span>
        <span style="color:var(--blue);margin:0 12px 0 4px">${fb.fb_name}</span>
        <span style="color:var(--green)">${params.length} output params will be mapped</span>`;

      fields.style.display  = '';
      saveBtn.style.display = '';

      // Auto-suggest instance name
      const instEl = q('#m-inst');
      if (!instEl.value)
        instEl.value = `fb${pou}_inst`;

      // Auto-suggest prefix from device name
      const prefEl = q('#m-prefix');
      if (!prefEl.value)
        prefEl.value = device.device_name.replace(/[^a-zA-Z0-9]/g, '_');

      this.refreshPreview();

    } else {
      info.innerHTML = `
        <span style="color:var(--txt2)">Device:</span>
        <span style="color:var(--txt1);margin:0 12px 0 4px">${device.device_name}</span>
        <span style="color:var(--amber)">
          ⚠ No Function Block linked to model "${device.meter_model || 'unassigned'}".
          Create an FB first.
        </span>`;
      fields.style.display  = 'none';
      saveBtn.style.display = 'none';
    }
  },

  refreshPreview() {
    const pou    = q('#m-pou').value;
    const prefix = q('#m-prefix')?.value.trim();
    const inst   = q('#m-inst')?.value.trim();
    const prev   = q('#m-preview');
    if (!prev) return;

    const fb = this._pouMeta[pou]?.fb;
    if (!fb || !prefix) {
      prev.innerHTML = '<span style="color:var(--txt3)">Enter a prefix above to preview…</span>';
      return;
    }

    const params = (fb.mappings||[]).filter(m => m.type !== 'skip');
    if (!params.length) {
      prev.innerHTML = '<span style="color:var(--warn)">This FB has no output parameters.</span>';
      return;
    }

    const instLine = inst
      ? `<div style="color:var(--txt3);margin-bottom:8px;padding-bottom:8px;
              border-bottom:1px solid var(--border)">
           <span style="color:var(--txt2)">FB Instance:</span>
           <span style="color:var(--green);margin-left:6px">${inst}</span>
           <span style="color:var(--txt3);margin-left:4px">: ${fb.fb_name};</span>
         </div>`
      : '';

    const rows = params.map(m => {
      const varName = `${prefix}_${m.name}`;
      const dt      = m.data_type || 'REAL';
      const desc    = m.description ? `<span style="color:var(--txt3);margin-left:8px">// ${m.description}</span>` : '';
      return `<div style="padding:3px 0;display:flex;gap:8px;align-items:baseline">
        <span style="color:var(--txt1);min-width:220px">${varName}</span>
        <span style="color:var(--txt3)">:=</span>
        <span style="color:var(--blue)">${inst || 'inst'}.${m.name}</span>
        <span style="color:var(--txt3)">; <em style="font-style:normal;color:var(--txt3)">${dt}</em>${desc}</span>
      </div>`;
    }).join('');

    prev.innerHTML = instLine + rows;
  },

  async addBulk() {
    const pou    = q('#m-pou').value.trim();
    const prefix = q('#m-prefix').value.trim();
    const inst   = q('#m-inst').value.trim();

    if (!pou)    return Toast.warn('Validation', 'Select a POU');
    if (!prefix) return Toast.warn('Validation', 'Output variable prefix is required');
    if (!inst)   return Toast.warn('Validation', 'FB instance name is required');

    const fb = this._pouMeta[pou]?.fb;
    if (!fb)   return Toast.warn('No FB', 'No Function Block found for this POU\'s model');

    const params = (fb.mappings||[]).filter(m => m.type !== 'skip');
    if (!params.length) return Toast.warn('No Params', 'This FB has no output parameters');

    const mappings = params.map(m => ({
      pou_name:        pou,
      input_array:     m.array || m.name,
      output_variable: `${prefix}_${m.name}`,
      mapping_fb_out:  m.name,
    }));

    const r = await API.post('/pou-mappings', {
      pou_name:      pou,
      instance_name: inst,
      mappings,
    });

    if (r.status === 'success') {
      Toast.ok('Mappings Created', `${r.data?.added ?? mappings.length} variables mapped`);
      Modal.close();
      Router.navigate('mappings');
    } else {
      Toast.err('Error', r.message);
    }
  },

  showEdit(pou) {
    const maps = STATE.mappings[pou] || [];
    const dev  = STATE.devices.find(d => d.pou_name === pou);
    const fb   = dev?.meter_model ? (STATE.fbs||[]).find(f => f.meter_model === dev.meter_model) : null;
    const inst = (STATE.pouInst||{})[pou] || '';

    // Derive current prefix from first mapping
    const curPrefix = maps.length
      ? (() => { const last = maps[0].output_variable; const cut = last.lastIndexOf('_'); return cut > 0 ? last.slice(0, cut) : last; })()
      : (dev?.device_name || pou);

    // Available arrays from FB for dropdown
    const arrOpts = fb
      ? Object.keys(fb.arrays || {}).map(a => `<option value="${a}">${a}</option>`).join('')
      : '<option value="">Realtime</option><option value="Energy">Energy</option><option value="Harmonics">Harmonics</option>';

    Modal.open(`Edit Mappings: ${pou}`, `
      <div class="form-grid cols-2" style="margin-bottom:14px">
        <div class="form-field">
          <label>Output Variable Prefix <span class="req">*</span></label>
          <input id="me-prefix" value="${curPrefix}" oninput="Mappings._editPreview()" />
        </div>
        <div class="form-field">
          <label>FB Instance Name <span class="req">*</span></label>
          <input id="me-inst" value="${inst}" oninput="Mappings._editPreview()" />
        </div>
      </div>
      ${fb ? '' : `<div class="alert alert-warn" style="font-size:.75rem">⚠ No Function Block for model "${dev?.meter_model||'none'}". Regen disabled, but you can still edit/delete rows.</div>`}
      <div class="section-divider" style="margin-bottom:10px">Existing mappings — click ✕ to remove individual rows</div>
      <div id="me-rows" style="background:var(--bg1);border:1px solid var(--border);border-radius:var(--radius);max-height:220px;overflow-y:auto;font-family:var(--font-co);font-size:.72rem;padding:8px 12px">
        ${maps.length ? maps.map((m, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)" id="me-row-${idx}" data-pou="${pou}" data-arr="${m.input_array}" data-out="${m.output_variable}" data-fb="${m.mapping_fb_out}">
            <div>
              <span style="color:var(--txt1)">${m.output_variable}</span>
              <span style="color:var(--txt3)"> ← </span>
              <span style="color:var(--blue)">${m.mapping_fb_out}</span>
              <span style="color:var(--txt3);margin-left:6px">[${m.input_array}]</span>
            </div>
            <button class="btn btn-xs btn-danger btn-icon" onclick="this.closest('[id]').remove()" title="Remove">✕</button>
          </div>`).join('') : '<div style="color:var(--txt3);padding:8px 0;font-size:.75rem">No mappings yet. Add rows below.</div>'}
      </div>
      <div style="margin-top:12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px">
        <div style="font-size:.71rem;color:var(--txt2);margin-bottom:8px;font-weight:600;letter-spacing:.04em">ADD NEW ROW</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
          <div class="form-field" style="margin:0">
            <label style="font-size:.67rem">Output Variable</label>
            <input id="me-add-out" placeholder="Zone1_Voltage_L1" style="font-size:.75rem" />
          </div>
          <div class="form-field" style="margin:0">
            <label style="font-size:.67rem">FB Output (mapping_fb_out)</label>
            <input id="me-add-fb" placeholder="v1" style="font-size:.75rem" />
          </div>
          <div class="form-field" style="margin:0">
            <label style="font-size:.67rem">Input Array</label>
            <select id="me-add-arr" style="font-size:.75rem">${arrOpts}</select>
          </div>
          <button class="btn btn-accent btn-sm" onclick="Mappings._addRow('${pou}')" style="margin-bottom:0">+ Add</button>
        </div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       ${fb ? `<button class="btn btn-accent" onclick="Mappings._editRegen('${pou}')">↺ Regen from FB</button>` : ''}
       <button class="btn btn-accent" onclick="Mappings._editSave('${pou}')">⊙ Save Changes</button>`
    );
    Mappings._editFB = fb;
    Mappings._editMaps = [...maps];
  },
  _editFB: null,
  _editMaps: [],

  _addRow(pou) {
    const outVar = q('#me-add-out')?.value.trim();
    const fbOut  = q('#me-add-fb')?.value.trim();
    const arr    = q('#me-add-arr')?.value.trim() || 'Realtime';
    if (!outVar) { Toast.warn('Validation', 'Output Variable is required'); return; }
    if (!fbOut)  { Toast.warn('Validation', 'FB Output name is required'); return; }
    const rows = q('#me-rows');
    if (!rows) return;
    const idx = Date.now(); // unique key
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)';
    row.id = `me-row-${idx}`;
    row.setAttribute('data-pou', pou);
    row.setAttribute('data-arr', arr);
    row.setAttribute('data-out', outVar);
    row.setAttribute('data-fb', fbOut);
    row.innerHTML = `
      <div>
        <span style="color:var(--txt1)">${outVar}</span>
        <span style="color:var(--txt3)"> ← </span>
        <span style="color:var(--blue)">${fbOut}</span>
        <span style="color:var(--txt3);margin-left:6px">[${arr}]</span>
        <span style="color:var(--green);margin-left:6px;font-size:.65rem">NEW</span>
      </div>
      <button class="btn btn-xs btn-danger btn-icon" onclick="this.closest('[id]').remove()" title="Remove">✕</button>`;
    rows.appendChild(row);
    // Clear inputs
    if (q('#me-add-out')) q('#me-add-out').value = '';
    if (q('#me-add-fb'))  q('#me-add-fb').value  = '';
    Toast.ok('Row Added', outVar);
  },

  _editPreview() {
    // future: live preview of renamed vars
  },

  _editRegen(pou) {
    const fb     = Mappings._editFB;
    const prefix = q('#me-prefix')?.value.trim();
    const inst   = q('#me-inst')?.value.trim();
    if (!fb || !prefix) { Toast.warn('Validation', 'Prefix required'); return; }
    const params = (fb.mappings||[]).filter(m => m.type !== 'skip');
    const rows   = q('#me-rows');
    if (!rows) return;
    rows.innerHTML = params.map((m, idx) => {
      const varName = `${prefix}_${m.name}`;
      const arr = m.array || 'Realtime';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)" id="me-row-regen-${idx}" data-pou="${pou}" data-arr="${arr}" data-out="${varName}" data-fb="${m.name}">
          <div>
            <span style="color:var(--txt1)">${varName}</span>
            <span style="color:var(--txt3)"> ← </span>
            <span style="color:var(--blue)">${m.name}</span>
            <span style="color:var(--txt3);margin-left:6px">[${arr}]</span>
          </div>
          <button class="btn btn-xs btn-danger btn-icon" onclick="this.closest('[id]').remove()" title="Remove">✕</button>
        </div>`;
    }).join('');
    Toast.info('Regenerated', `${params.length} mappings from FB`);
  },

  async _editSave(pou) {
    const prefix = q('#me-prefix')?.value.trim();
    const inst   = q('#me-inst')?.value.trim();
    if (!prefix) { Toast.warn('Validation', 'Prefix required'); return; }
    if (!inst)   { Toast.warn('Validation', 'FB instance name required'); return; }

    // Collect ALL surviving rows — they all now use data-* attributes
    const allRows = qa('#me-rows [data-out]');
    const mappings = allRows.map(row => ({
      pou_name:        pou,
      input_array:     row.dataset.arr  || 'Realtime',
      output_variable: row.dataset.out  || '',
      mapping_fb_out:  row.dataset.fb   || '',
    })).filter(m => m.output_variable && m.mapping_fb_out);

    if (!mappings.length) { Toast.warn('Empty', 'No mappings to save'); return; }

    // Delete existing and re-add
    await API.del(`/pou-mappings/${encodeURIComponent(pou)}`);
    const r = await API.post('/pou-mappings', { pou_name: pou, instance_name: inst, mappings });
    if (r.status === 'success') {
      Toast.ok('Mappings Updated', `${mappings.length} mappings saved`);
      Modal.close(); Router.navigate('mappings');
    } else Toast.err('Error', r.message);
  },

  del(pou) {
    Modal.confirm('Delete Mappings', `Delete all mappings for POU "${pou}"?`, async () => {
      await API.del(`/pou-mappings/${encodeURIComponent(pou)}`);
      // also remove instance name
      const inst = (STATE.pouInst||{});
      delete inst[pou];
      Toast.ok('Deleted');
      Router.navigate('mappings');
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: CLOUD TAGS
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('tags', async () => {
  const [r, dr] = await Promise.all([API.get('/tags'), API.get('/devices')]);
  const tags = r.data || [];
  STATE.tags    = tags;
  STATE.devices = dr.data || [];

  const byMsg = tags.reduce((a,t) => { (a[t.message_number]=a[t.message_number]||[]).push(t); return a; }, {});

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-cloud-bolt"></i> Cloud Tags <span style="font-size:.7rem;color:var(--txt2);font-family:var(--font-co)">(${tags.length})</span>
        <small>SCADA / CODESYS Cloud variable configuration</small>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" onclick="Tags.clearAll()">🗑 Clear All</button>
        <button class="btn btn-accent" onclick="Tags.showAdd()">+ Add Tag</button>
      </div>
    </div>
    <div class="action-bar">
      <div class="search-bar" style="margin:0">
        <input id="tag-search" placeholder="Search tags…" oninput="Tags.filter(this.value)" />
      </div>
      <div class="text-muted" style="font-size:.75rem">
        ${Object.keys(byMsg).length} messages · ${tags.length} total tags
      </div>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Msg</th><th>Idx</th><th>Tag Name</th><th>Data Type</th><th>POU</th><th>Actions</th></tr></thead>
          <tbody id="tags-body">
            ${tags.length ? tags.map(t => Tags.row(t)).join('') :
              '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">◈</div><h3>No tags yet</h3><p>Add tags or import via Sheet 3</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `);
});

const Tags = {
  row: (t) => `
    <tr data-msg="${t.message_number}" data-idx="${t.tag_index}">
      <td class="mono">${t.message_number}</td>
      <td class="mono text-muted">${t.tag_index}</td>
      <td class="bold">${t.tag_name}</td>
      <td>${dtBadge(t.data_type)}</td>
      <td class="mono" style="color:var(--blue)">${t.pou_name}</td>
      <td>
        <div class="btn-group">
          <button class="btn btn-xs btn-ghost btn-icon" onclick="Tags.showEdit(${t.message_number},${t.tag_index})" title="Edit">✎</button>
          <button class="btn btn-xs btn-danger btn-icon" onclick="Tags.del(${t.message_number},${t.tag_index},this)" title="Delete">✕</button>
        </div>
      </td>
    </tr>`,
  filter(q_) {
    const l = q_.toLowerCase();
    qa('#tags-body tr').forEach(r => r.style.display = r.textContent.toLowerCase().includes(l) ? '' : 'none');
  },
  showAdd() {
    const pouOpts = [...new Set(STATE.devices.map(d => d.pou_name))].map(p =>
      `<option value="${p}">${p}</option>`).join('');
    const nextMsg = Math.max(1, ...STATE.tags.map(t => t.message_number));
    const nextIdx = (STATE.tags.filter(t => t.message_number === nextMsg).length) + 1;
    Modal.open('Add Cloud Tag', `
      <div class="form-grid cols-2">
        <div class="form-field"><label>Message Number (1-66)</label><input id="t-msg" type="number" min="1" max="66" value="${nextMsg}" /></div>
        <div class="form-field"><label>Tag Index (1-1000)</label><input id="t-idx" type="number" min="1" max="1000" value="${nextIdx}" /></div>
        <div class="form-field"><label>Tag Name <span class="req">*</span></label><input id="t-name" placeholder="EM01_Voltage_L1" /></div>
        <div class="form-field"><label>Data Type</label>
          <select id="t-type">
            <option>REAL</option><option>INT</option><option>BOOL</option>
            <option>DWORD</option><option>WORD</option><option>DINT</option>
            <option>UDINT</option><option>UINT</option><option>STRING</option>
          </select></div>
        <div class="form-field span-2"><label>POU Name <span class="req">*</span></label>
          ${pouOpts ? `<select id="t-pou">${pouOpts}</select>` : `<input id="t-pou" />`}</div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="Tags.add()">Add Tag</button>`);
  },
  showEdit(msg, idx) {
    const t = STATE.tags.find(t_ => t_.message_number === msg && t_.tag_index === idx);
    if (!t) { Toast.warn('Not found'); return; }
    const pouOpts = [...new Set(STATE.devices.map(d => d.pou_name))].map(p =>
      `<option value="${p}" ${p === t.pou_name ? 'selected' : ''}>${p}</option>`).join('');
    const dtOpts = ['REAL','INT','BOOL','DWORD','WORD','DINT','UDINT','UINT','STRING'].map(dt =>
      `<option ${dt === t.data_type ? 'selected' : ''}>${dt}</option>`).join('');
    Modal.open(`Edit Tag: ${t.tag_name}`, `
      <div class="form-grid cols-2">
        <div class="form-field"><label>Message Number (1-66)</label><input id="t-msg" type="number" min="1" max="66" value="${t.message_number}" /></div>
        <div class="form-field"><label>Tag Index (1-1000)</label><input id="t-idx" type="number" min="1" max="1000" value="${t.tag_index}" /></div>
        <div class="form-field"><label>Tag Name <span class="req">*</span></label><input id="t-name" value="${t.tag_name}" /></div>
        <div class="form-field"><label>Data Type</label><select id="t-type">${dtOpts}</select></div>
        <div class="form-field span-2"><label>POU Name</label>
          ${pouOpts ? `<select id="t-pou">${pouOpts}</select>` : `<input id="t-pou" value="${t.pou_name}" />`}</div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="Tags.saveEdit(${msg},${idx})">⊙ Save</button>`);
  },
  async saveEdit(origMsg, origIdx) {
    const newMsg  = parseInt(q('#t-msg').value);
    const newIdx  = parseInt(q('#t-idx').value);
    const name    = q('#t-name').value.trim();
    const dtype   = q('#t-type').value;
    const pou     = q('#t-pou').value.trim();
    if (!name) { Toast.warn('Validation', 'Tag name required'); return; }
    if (!pou)  { Toast.warn('Validation', 'POU name required'); return; }
    // Delete old and re-add with new values
    await API.del(`/tags/${origMsg}/${origIdx}`);
    const r = await API.post('/tags', { message_number: newMsg, tag_index: newIdx, tag_name: name, data_type: dtype, pou_name: pou });
    if (r.status === 'success') { Toast.ok('Tag Updated', name); Modal.close(); Router.navigate('tags'); }
    else Toast.err('Error', r.message);
  },
  async add() {
    const r = await API.post('/tags', {
      message_number: parseInt(q('#t-msg').value), tag_index: parseInt(q('#t-idx').value),
      tag_name: q('#t-name').value.trim(), data_type: q('#t-type').value,
      pou_name: q('#t-pou').value.trim()
    });
    if (r.status === 'success') { Toast.ok('Tag Added'); Modal.close(); Router.navigate('tags'); }
    else Toast.err('Error', r.message);
  },
  del(msg, idx, btn) {
    const name = btn ? btn.closest('tr')?.querySelector('td:nth-child(3)')?.textContent : `msg:${msg} idx:${idx}`;
    Modal.confirm('Delete Tag', `Delete tag "${name}"?`, async () => {
      const r = await API.del(`/tags/${msg}/${idx}`);
      if (r.status === 'success') { Toast.ok('Deleted', name); Router.navigate('tags'); }
      else Toast.err('Error', r.message || 'Delete failed');
    });
  },
  clearAll() {
    Modal.confirm('Clear All Tags', 'Delete ALL tags? This cannot be undone.', async () => {
      await API.post('/tags/clear');
      Toast.ok('Cleared', 'All tags removed'); Router.navigate('tags');
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('comm', async () => {
  const [rsR, gwR] = await Promise.all([API.get('/rs485'), API.get('/gateways')]);
  const rs = rsR.data || {};
  const gws = gwR.data || [];
  STATE.rs485 = rs; STATE.gateways = gws;

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-network-wired"></i> Communication Management
        <small>RS485 serial and TCP gateway configuration</small>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">⟁ RS485 Configuration</div>
          <button class="btn btn-xs btn-accent" onclick="Comm.editRS485()">Edit</button>
        </div>
        <div class="panel-body">
          ${[
            ['COM Port', rs.com_port],['Baud Rate', rs.baud_rate],
            ['Parity', rs.parity],['Stop Bits', rs.stop_bits],
            ['Timeout', `${rs.timeout_ms} ms`],['Request Delay', `${rs.delay_ms} ms`]
          ].map(([k,v]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span class="text-muted" style="font-size:.8rem">${k}</span>
              <span class="mono text-amber">${v}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">⟁ Gateways <span class="badge">${gws.length}</span></div>
          <button class="btn btn-xs btn-accent" onclick="Comm.showAddGW()">+ Add</button>
        </div>
        <div class="panel-body" id="gw-list">
          ${gws.length ? gws.map(g => `
            <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div class="bold">${g.name}</div>
                  <div class="mono text-muted" style="font-size:.75rem">${g.ip_address}:${g.port}</div>
                  <div class="text-muted" style="font-size:.72rem">Timeout: ${g.timeout_ms}ms${g.description?' · '+g.description:''}</div>
                </div>
                <div class="btn-group">
                  <button class="btn btn-xs btn-ghost btn-icon" onclick="Comm.editGW('${g.name}')">✎</button>
                  <button class="btn btn-xs btn-danger btn-icon" onclick="Comm.delGW('${g.name}')">✕</button>
                </div>
              </div>
            </div>`).join('') :
            `<div class="empty-state" style="padding:20px">
              <div class="empty-icon">⟁</div><p>No gateways defined</p></div>`}
        </div>
      </div>
    </div>
  `);
});

const Comm = {
  editRS485() {
    const rs = STATE.rs485;
    Modal.open('Edit RS485 Configuration', `
      <div class="form-grid cols-2">
        <div class="form-field"><label>COM Port</label><input id="rs-port" value="${rs.com_port}" placeholder="COM1" /></div>
        <div class="form-field"><label>Baud Rate</label>
          <select id="rs-baud">${[1200,2400,4800,9600,19200,38400,57600,115200].map(b =>
            `<option value="${b}" ${rs.baud_rate==b?'selected':''}>${b}</option>`).join('')}</select></div>
        <div class="form-field"><label>Parity</label>
          <select id="rs-par">${['N','E','O'].map(p=>`<option value="${p}" ${rs.parity===p?'selected':''}>${p}</option>`).join('')}</select></div>
        <div class="form-field"><label>Stop Bits</label>
          <select id="rs-stop">${[1,2].map(s=>`<option value="${s}" ${rs.stop_bits==s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-field"><label>Timeout (ms)</label><input id="rs-to" type="number" value="${rs.timeout_ms}" /></div>
        <div class="form-field"><label>Request Delay (ms)</label><input id="rs-del" type="number" value="${rs.delay_ms}" /></div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="Comm.saveRS485()">Save</button>`);
  },
  async saveRS485() {
    const r = await API.put('/rs485', {
      com_port: q('#rs-port').value, baud_rate: parseInt(q('#rs-baud').value),
      parity: q('#rs-par').value, stop_bits: parseInt(q('#rs-stop').value),
      timeout_ms: parseInt(q('#rs-to').value), delay_ms: parseInt(q('#rs-del').value)
    });
    if (r.status === 'success') { Toast.ok('RS485 Updated'); Modal.close(); Router.navigate('comm'); }
    else Toast.err('Error', r.message);
  },
  showAddGW(gw = {}) {
    Modal.open(gw.name ? 'Edit Gateway' : 'Add Gateway', `
      <div class="form-grid cols-2">
        <div class="form-field"><label>Name <span class="req">*</span></label>
          <input id="gw-n" value="${gw.name||''}" placeholder="Gateway1" ${gw.name?'readonly':''} /></div>
        <div class="form-field"><label>IP Address <span class="req">*</span></label>
          <input id="gw-ip" value="${gw.ip_address||''}" placeholder="192.168.1.100" /></div>
        <div class="form-field"><label>Port</label>
          <input id="gw-p" type="number" value="${gw.port||502}" /></div>
        <div class="form-field"><label>Timeout (ms)</label>
          <input id="gw-t" type="number" value="${gw.timeout_ms||5000}" /></div>
        <div class="form-field span-2"><label>Description</label>
          <input id="gw-d" value="${gw.description||''}" /></div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
       <button class="btn btn-accent" onclick="Comm.saveGW('${gw.name||''}')">${gw.name?'Save':'Add'} Gateway</button>`);
  },
  async saveGW(existing) {
    const data = {
      name: q('#gw-n').value.trim(), ip_address: q('#gw-ip').value.trim(),
      port: parseInt(q('#gw-p').value), timeout_ms: parseInt(q('#gw-t').value),
      description: q('#gw-d').value.trim()
    };
    const r = existing ? await API.put(`/gateways/${existing}`, data) : await API.post('/gateways', data);
    if (r.status === 'success') { Toast.ok(existing?'Updated':'Added', data.name); Modal.close(); Router.navigate('comm'); }
    else Toast.err('Error', r.message);
  },
  editGW(name) {
    const gw = STATE.gateways.find(g => g.name === name);
    if (gw) this.showAddGW(gw);
  },
  delGW(name) {
    Modal.confirm('Delete Gateway', `Delete gateway "${name}"?`, async () => {
      const r = await API.del(`/gateways/${name}`);
      if (r.status === 'success') { Toast.ok('Deleted', name); Router.navigate('comm'); }
      else Toast.err('Error', r.message);
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: CSV IMPORT
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('import', () => {
  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-file-import"></i> Import Configuration
        <small>Single Excel file (3 sheets) or three separate CSV files</small>
      </div>
      <div class="page-actions">
        <a href="/api/sample-excel" class="btn btn-xs btn-accent" download>⬇ Sample Excel (.xlsx)</a>
        <a href="/api/sample-csv/1" class="btn btn-xs btn-outline" download>⬇ CSV Sheet 1</a>
        <a href="/api/sample-csv/2" class="btn btn-xs btn-outline" download>⬇ CSV Sheet 2</a>
        <a href="/api/sample-csv/3" class="btn btn-xs btn-outline" download>⬇ CSV Sheet 3</a>
      </div>
    </div>

    <div class="alert alert-info">
      <strong>⚠ Important:</strong> All meter models referenced in Sheet 1 must already exist.
      Add them via <a href="#models" onclick="Router.navigate('models')" style="color:var(--blue)">Meter Models</a> first.
    </div>

    <!-- Tab selector -->
    <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--border)">
      <button id="tab-excel" class="btn btn-outline" style="border-radius:var(--radius) var(--radius) 0 0;border-bottom:2px solid var(--amber2);color:var(--amber2);margin-bottom:-2px"
        onclick="Import.switchTab('excel')">📊 Excel (Single File) — Recommended</button>
      <button id="tab-csv" class="btn btn-ghost" style="border-radius:var(--radius) var(--radius) 0 0"
        onclick="Import.switchTab('csv')">📄 3× CSV Files</button>
    </div>

    <!-- ── EXCEL TAB ── -->
    <div id="panel-excel">
      <div class="panel" style="margin-bottom:16px">
        <div class="panel-body">
          <div style="font-size:.8rem;color:var(--txt2);margin-bottom:14px">
            Upload a single <strong style="color:var(--txt1)">.xlsx</strong> Excel file with exactly <strong style="color:var(--amber)">3 sheets</strong>:
            <span class="tag tag-rs485" style="margin:0 4px">Sheet 1 → Devices</span>
            <span class="tag tag-gw" style="margin:0 4px">Sheet 2 → POU Mappings</span>
            <span class="tag tag-ok" style="margin:0 4px">Sheet 3 → Cloud Tags</span>
          </div>
          <div class="dropzone" id="dz-xl" onclick="document.getElementById('file-xl').click()">
            <input type="file" id="file-xl" accept=".xlsx" style="display:none" onchange="Import.onExcel(this)" />
            <div class="dropzone-icon">📊</div>
            <div class="dropzone-title">Drop Excel File Here</div>
            <div class="dropzone-sub" id="dz-xl-sub">Click to browse · .xlsx only</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── CSV TAB ── -->
    <div id="panel-csv" style="display:none">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">
        ${[1,2,3].map(i => `
          <div>
            <div style="font-family:var(--font-hd);font-size:.7rem;letter-spacing:.1em;color:var(--txt2);margin-bottom:10px">
              SHEET ${i}: ${['DEVICES (Required)','MAPPINGS (Required)','CLOUD TAGS (Optional)'][i-1]}
            </div>
            <div class="dropzone" id="dz-${i}" onclick="document.getElementById('csv-${i}').click()">
              <input type="file" id="csv-${i}" accept=".csv" style="display:none" onchange="Import.onFile(${i},this)" />
              <div class="dropzone-icon">${['⬡','⇌','◈'][i-1]}</div>
              <div class="dropzone-title">Drop Sheet ${i} CSV</div>
              <div class="dropzone-sub" id="dz-${i}-sub">Click to browse or drag & drop</div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    <!-- Options -->
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-header"><div class="panel-title">⚙ Import Options</div></div>
      <div class="panel-body">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:.85rem">
          <input type="checkbox" id="opt-reset" style="width:auto" />
          <span>Clear existing devices, mappings, and tags before import</span>
          <span class="tag tag-warn" style="font-size:.65rem">Meter Models &amp; FBs always kept</span>
        </label>
      </div>
    </div>

    <div id="import-result" style="display:none"></div>

    <div style="display:flex;justify-content:center;gap:12px">
      <button class="btn btn-outline" onclick="Import.reset()">↺ Reset</button>
      <button class="btn btn-accent" id="import-btn" onclick="Import.run()" style="min-width:160px">⤓ Start Import</button>
    </div>
  `);
  Import._files = {};
  Import._excelFile = null;
  Import._mode = 'excel';
});

const Import = {
  _files: {},
  _excelFile: null,
  _mode: 'excel',   // 'excel' | 'csv'

  switchTab(tab) {
    this._mode = tab;
    const isExcel = tab === 'excel';
    q('#panel-excel').style.display = isExcel ? '' : 'none';
    q('#panel-csv').style.display   = isExcel ? 'none' : '';
    q('#tab-excel').style.cssText = isExcel
      ? 'border-radius:var(--radius) var(--radius) 0 0;border-bottom:2px solid var(--amber2);color:var(--amber2);margin-bottom:-2px'
      : '';
    q('#tab-csv').style.cssText = !isExcel
      ? 'border-radius:var(--radius) var(--radius) 0 0;border-bottom:2px solid var(--amber2);color:var(--amber2);margin-bottom:-2px'
      : '';
  },

  onExcel(input) {
    const file = input.files[0];
    if (!file) return;
    this._excelFile = file;
    q('#dz-xl').classList.add('has-file');
    q('#dz-xl-sub').textContent = `✓ ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
  },

  onFile(sheet, input) {
    const file = input.files[0];
    if (!file) return;
    this._files[`sheet${sheet}`] = file;
    const dz = document.getElementById(`dz-${sheet}`);
    dz.classList.add('has-file');
    document.getElementById(`dz-${sheet}-sub`).textContent = `✓ ${file.name}`;
  },

  reset() {
    this._files = {};
    this._excelFile = null;
    [1,2,3].forEach(i => {
      const dz = document.getElementById(`dz-${i}`);
      if (dz) {
        dz.classList.remove('has-file');
        const sub = document.getElementById(`dz-${i}-sub`);
        if (sub) sub.textContent = 'Click to browse or drag & drop';
        const inp = document.getElementById(`csv-${i}`);
        if (inp) inp.value = '';
      }
    });
    const xl = q('#dz-xl');
    if (xl) { xl.classList.remove('has-file'); q('#dz-xl-sub').textContent = 'Click to browse · .xlsx only'; }
    const fileEl = q('#file-xl');
    if (fileEl) fileEl.value = '';
    const res = document.getElementById('import-result');
    if (res) res.style.display = 'none';
  },

  async run() {
    const btn = document.getElementById('import-btn');
    btn.textContent = '⏳ Importing...'; btn.disabled = true;
    const resetFirst = document.getElementById('opt-reset')?.checked;

    let r;
    try {
      if (this._mode === 'excel') {
        if (!this._excelFile) { Toast.warn('Missing File', 'Select an Excel (.xlsx) file first'); btn.textContent = '⤓ Start Import'; btn.disabled = false; return; }
        const fd = new FormData();
        fd.append('file', this._excelFile);
        if (resetFirst) fd.append('reset_first', 'true');
        r = await API.upload('/import/excel', fd);
      } else {
        if (!this._files.sheet1) { Toast.warn('Missing File', 'Sheet 1 (Devices) is required'); btn.textContent = '⤓ Start Import'; btn.disabled = false; return; }
        if (!this._files.sheet2) { Toast.warn('Missing File', 'Sheet 2 (Mappings) is required'); btn.textContent = '⤓ Start Import'; btn.disabled = false; return; }
        const fd = new FormData();
        for (const [k, f] of Object.entries(this._files)) fd.append(k, f);
        if (resetFirst) fd.append('reset_first', 'true');
        r = await API.upload('/import/triple-sheet', fd);
      }
    } finally {
      btn.textContent = '⤓ Start Import'; btn.disabled = false;
    }

    const res = document.getElementById('import-result');
    res.style.display = 'block';

    if (r.status !== 'success') {
      res.innerHTML = `<div class="alert alert-err">❌ ${r.message}</div>`;
      return;
    }

    const d = r.data;
    const hasErr     = d.errors   && d.errors.length   > 0;
    const hasWarn    = d.warnings && d.warnings.length  > 0;
    const hasMissing = d.missing_models && d.missing_models.length > 0;

    res.innerHTML = `
      <div class="panel">
        <div class="panel-header"><div class="panel-title">📊 Import Results</div></div>
        <div class="panel-body">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px">
            <div class="stat-card c-green"><div class="stat-icon-wrap"><div class="stat-icon"><i class="fa-solid fa-microchip"></i></div></div><div class="stat-value">${d.imported?.devices||0}</div><div class="stat-label">Devices Added</div></div>
            <div class="stat-card c-cyan"><div class="stat-icon-wrap"><div class="stat-icon"><i class="fa-solid fa-right-left"></i></div></div><div class="stat-value">${d.imported?.mappings||0}</div><div class="stat-label">Mappings Added</div></div>
            <div class="stat-card c-amber"><div class="stat-icon-wrap"><div class="stat-icon"><i class="fa-solid fa-cloud-bolt"></i></div></div><div class="stat-value">${d.imported?.tags||0}</div><div class="stat-label">Tags Added</div></div>
          </div>
          ${hasMissing ? `<div class="alert alert-warn">⚠ Missing meter models (devices imported but not linked): ${d.missing_models.map(m=>`<code>${m}</code>`).join(', ')}</div>` : ''}
          ${hasErr ? `<div class="alert alert-err"><strong>❌ Errors (${d.errors.length}):</strong><ul style="margin:6px 0 0 18px">${d.errors.slice(0,10).map(e=>`<li>${e}</li>`).join('')}${d.errors.length>10?`<li>...and ${d.errors.length-10} more</li>`:''}</ul></div>` : ''}
          ${hasWarn ? `<div class="alert alert-warn"><strong>⚠ Warnings (${d.warnings.length}):</strong><ul style="margin:6px 0 0 18px">${d.warnings.slice(0,5).map(w=>`<li>${w}</li>`).join('')}${d.warnings.length>5?`<li>...and ${d.warnings.length-5} more</li>`:''}</ul></div>` : ''}
          ${!hasErr && !hasWarn && !hasMissing ? '<div class="alert alert-ok">✓ Import completed with no errors or warnings!</div>' : ''}
          <div class="btn-group" style="margin-top:14px">
            <button class="btn btn-accent" onclick="Router.navigate('devices')">View Devices →</button>
            <button class="btn btn-accent" onclick="Router.navigate('generate')">⚙ Generate Code →</button>
          </div>
        </div>
      </div>`;
    await refreshStatus();
    Toast.ok('Import Complete', `${d.imported?.devices||0} devices, ${d.imported?.mappings||0} mappings, ${d.imported?.tags||0} tags`);
  }
};



// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: GENERATE CODE
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('generate', async () => {
  // load all previewable items in parallel
  const items = (await API.get('/generate/items')).data || {};

  const fbs       = items.fbs       || [];
  const pous      = items.pous      || [];
  const gateways  = items.gateways  || [];
  const hasRS485  = items.has_rs485;
  const hasCloud  = items.has_cloud;

  // ── helper: render a category section with cards ──
  const section = (title, icon, cards) => cards.length === 0 ? '' : `
    <div style="margin-bottom:28px">
      <div class="section-divider">${icon} ${title}</div>
      <div class="gen-grid">${cards.join('')}</div>
    </div>`;

  const card = (icon, title, subtitle, onclick) => `
    <div class="gen-card" onclick="${onclick}">
      <div class="gen-card-icon"><i class="${icon}"></i></div>
      <div class="gen-card-title">${title}</div>
      <div class="gen-card-desc">${subtitle}</div>
    </div>`;

  // ── Fixed / always-available cards ──
  const fixedCards = [
    card('fa-solid fa-list-ul', 'GVL Array',    'Global variable list — all device arrays',    `Generate.preview('gvl')`),
    hasRS485 ? card('fa-solid fa-plug', 'PLC RS485', 'Modbus RTU serial communication',     `Generate.preview('plc_rs485')`) : '',
    hasCloud  ? card('fa-solid fa-cloud-bolt', 'Cloud Config', 'SCADA / Cloud tag configuration',  `Generate.preview('cloud')`) : '',
    card('fa-solid fa-code-merge', 'DWordToReal (TYPE)',  'Union TYPE for IEEE-754 conversion',    `Generate.preview('support_dtr')`),
    card('fa-solid fa-code-branch', 'FB_WordToReal',       'Helper FB for WORD-pair → REAL',       `Generate.preview('support_fbwtr')`),
  ].filter(Boolean);

  // ── FB cards — one per function block ──
  const fbCards = fbs.map(fb =>
    card('fa-solid fa-cube', fb.fb_name, `for ${fb.meter_model}`,
         `Generate.preview('fb','${fb.fb_id}','${fb.fb_name}.st')`));

  // ── POU cards — one per unique POU name ──
  const pouCards = pous.map(p =>
    card('fa-solid fa-file-code', p.pou_name, p.device_name,
         `Generate.preview('pou','${p.pou_name}','${p.pou_name}.st')`));

  // ── Gateway cards — one per gateway ──
  const gwCards = gateways.map(g =>
    card('fa-solid fa-network-wired', g.name, `TCP ${g.ip_address}`,
         `Generate.preview('gateway','${g.name}','${g.name}.st')`));

  const noItems = fixedCards.length + fbCards.length + pouCards.length + gwCards.length === 0;

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-terminal"></i> Generate Code
        <small>CODESYS Structured Text file generator</small>
      </div>
    </div>

    <!-- ── Generate All ── -->
    <div class="panel" style="margin-bottom:24px">
      <div class="panel-header"><div class="panel-title"><i class="fa-solid fa-gears"></i> Generate All Files</div></div>
      <div class="panel-body">
        <div class="alert alert-info" style="margin-bottom:14px;font-size:.78rem">
          Creates the full folder structure:
          <strong>GVL/ · FB/ · POU/ · Communication/ · Cloud/ · Support/</strong>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-field" style="flex:1;min-width:200px;margin:0">
            <label>Output Directory</label>
            <input id="gen-dir" value="generated_code" placeholder="generated_code" />
          </div>
          <button class="btn btn-accent" id="gen-all-btn" onclick="Generate.all()" style="margin-bottom:0">
            <i class="fa-solid fa-gears"></i> Generate All
          </button>
          <a id="gen-download-link" class="btn btn-green" href="#" style="display:none;margin-bottom:0">
            <i class="fa-solid fa-download"></i> Download ZIP
          </a>
        </div>
        <div id="gen-result" style="margin-top:14px"></div>
      </div>
    </div>

    <!-- ── Preview Cards ── -->
    <div class="section-divider" style="margin-bottom:18px">⌥ Preview Individual Files</div>

    ${noItems
      ? `<div class="empty-state">
           <div class="empty-icon">⌥</div>
           <h3>Nothing to preview yet</h3>
           <p>Add devices, meter models and function blocks first, then come back to preview generated code.</p>
         </div>`
      : `
        <!-- Fixed files -->
        <div style="margin-bottom:28px">
          <div class="gen-grid">${fixedCards.join('')}</div>
        </div>

        ${section('Function Blocks', '◧', fbCards)}
        ${section('POU Programs',    '▣', pouCards)}
        ${section('Gateway Programs','⟁', gwCards)}
      `
    }
  `);
});

const Generate = {
  async all() {
    const dir = q('#gen-dir').value || 'generated_code';
    const btn = q('#gen-all-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...'; btn.disabled = true;

    const r = await API.post('/generate/all', { output_dir: dir });
    btn.innerHTML = '<i class="fa-solid fa-gears"></i> Generate All'; btn.disabled = false;

    const res = q('#gen-result');
    if (r.status === 'success') {
      const files = r.data.files || [];
      q('#gen-download-link').style.display = 'inline-flex';
      q('#gen-download-link').href = `/api/generate/download?dir=${encodeURIComponent(dir)}`;
      res.innerHTML = `
        <div class="alert alert-ok">✓ ${files.length} files generated in <code>${r.data.output_dir}</code></div>
        <div style="background:var(--bg1);border:1px solid var(--border);border-radius:var(--radius);
                    padding:14px;max-height:220px;overflow-y:auto;font-family:var(--font-co);font-size:.72rem">
          ${files.map(f => `<div style="color:var(--txt2)">📄 ${f}</div>`).join('')}
        </div>`;
      Toast.ok('Code Generated', `${files.length} .st files created`);
    } else {
      res.innerHTML = `<div class="alert alert-err">❌ ${r.message}</div>`;
      Toast.err('Generation Failed', r.message);
    }
  },

  // ── preview(type, id_or_name, filename) ──
  // id_or_name is fb_id for FBs, pou_name for POUs, gateway name for gateways
  async preview(type, idOrName, filename) {
    Toast.info('Loading…', 'Generating preview');
    const body = { type };
    if (type === 'fb')      body.fb_id        = idOrName;
    if (type === 'pou')     body.pou_name      = idOrName;
    if (type === 'gateway') body.gateway_name  = idOrName;

    const r = await API.post('/generate/preview', body);
    if (r.status === 'success') {
      const title = filename || r.data.filename;
      CodeViewer.show(title, r.data.code, r.data.filename);
    } else Toast.err('Preview Error', r.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: BACKUPS
// ═══════════════════════════════════════════════════════════════════════════════
Router.register('backups', async () => {
  const r = await API.get('/backups');
  const backups = r.data || [];

  render(`
    <div class="page-header">
      <div class="page-title"><i class="fa-solid fa-database"></i> Backups
        <small>Configuration backup and restore</small>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" onclick="App.exportData()">⬆ Export All Data</button>
        <button class="btn btn-accent" onclick="App.createBackup()">⊞ Create Backup</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">⊞ Backup Files <span class="badge">${backups.length}</span></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Filename</th><th>Date</th><th>Size</th><th>Actions</th></tr></thead>
          <tbody>
            ${backups.length ? backups.map(b => `
              <tr>
                <td class="mono" style="font-size:.75rem">${b.filename}</td>
                <td>${fmtDate(b.timestamp)}</td>
                <td class="muted">${(b.size/1024).toFixed(1)} KB</td>
                <td><div class="btn-group">
                  <button class="btn btn-xs btn-blue" onclick="App.restoreBackup('${b.filename}')">↩ Restore</button>
                  <button class="btn btn-xs btn-danger" onclick="App.delBackup('${b.filename}')">✕</button>
                </div></td>
              </tr>`).join('') :
              `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">⊞</div><h3>No backups yet</h3><p>Create a backup to protect your configuration</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GLOBAL APP ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════
const App = {
  resetMenuOpen: false,
  async createBackup() {
    const r = await API.post('/backups');
    if (r.status === 'success') Toast.ok('Backup Created');
    else Toast.err('Error', r.message);
    if (Router.current === 'backups') Router.navigate('backups');
  },
  async restoreBackup(filename) {
    Modal.confirm('Restore Backup', `Restore from "${filename}"? Current data will be replaced.`, async () => {
      const r = await API.post(`/backups/${filename}/restore`);
      if (r.status === 'success') { Toast.ok('Restored', 'Reload to see changes'); location.reload(); }
      else Toast.err('Error', r.message);
    });
  },
  async delBackup(filename) {
    Modal.confirm('Delete Backup', `Delete backup "${filename}"?`, async () => {
      await API.del(`/backups/${filename}`);
      Toast.ok('Deleted'); Router.navigate('backups');
    });
  },
  exportData() { window.open('/api/export', '_blank'); Toast.info('Exporting...', 'Download will start shortly'); },
  showResetMenu() {
    const menu = document.getElementById('reset-menu');
    if (menu) {
      menu.classList.toggle('open');
      if (menu.classList.contains('open')) {
        setTimeout(() => document.addEventListener('click', App._closeResetMenu, {once:true}), 10);
      }
    }
  },
  _closeResetMenu(e) {
    const m = document.getElementById('reset-menu');
    const btn = document.getElementById('reset-btn');
    if (m && !m.contains(e.target) && e.target !== btn) { m.classList.remove('open'); }
  },
  resetDevices() {
    document.getElementById('reset-menu')?.remove();
    Modal.confirm('Reset Devices & Tags', 'Clear all devices, mappings, and tags? Meter models and FBs are preserved.', async () => {
      await API.post('/reset/devices');
      Toast.ok('Reset Complete'); await refreshStatus(); Router.navigate('dashboard');
    });
  },
  resetAll() {
    document.getElementById('reset-menu')?.remove();
    Modal.confirm('Reset All Data', 'Reset ALL data except meter models and FBs?', async () => {
      await API.post('/reset/all');
      Toast.ok('Reset Complete'); await refreshStatus(); Router.navigate('dashboard');
    });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
//  PAGE: FLOW EDITOR
// ═══════════════════════════════════════════════════════════════════════════════

Router.register('flow', async () => {
  const [gwR, rs485R, fbR, mapR, instR, layoutR, modelR] = await Promise.all([
    API.get('/gateways'),
    API.get('/rs485'),
    API.get('/function-blocks'),
    API.get('/pou-mappings'),
    API.get('/pou-instances'),
    API.get('/flow/layout'),
    API.get('/meter-models'),
  ]);

  // Refresh devices each time (may have been created in this session)
  const devR = await API.get('/devices');

  Flow._devices   = devR.data   || [];
  Flow._gateways  = gwR.data    || [];
  Flow._rs485     = rs485R.data || { com_port:'COM1', baud_rate:9600, parity:'N', stop_bits:1, timeout_ms:5000, delay_ms:100 };
  Flow._fbs       = fbR.data    || [];
  Flow._mappings  = mapR.data   || {};
  Flow._instances = instR.data  || {};
  Flow._models    = Object.keys(modelR.data || {});

  const gwList = Flow._gateways.map(g => `
    <div class="flow-palette-item" draggable="true"
         ondragstart="Flow.paletteDragStart(event,'gateway','${g.name}')"
         onclick="Flow.addNode('gateway','${g.name}')">
      <div class="fpi-icon type-gateway">⟁</div>
      <div>
        <div style="font-weight:600;color:var(--txt1);font-size:.73rem">${g.name}</div>
        <div style="font-size:.62rem;color:var(--txt3)">${g.ip_address}</div>
      </div>
    </div>`).join('');

  render(`
    <div class="flow-page" id="flow-page">

      <!-- ── Left palette ── -->
      <div class="flow-palette" id="flow-palette">
        <div class="flow-palette-title">⬡ Components</div>

        <div class="flow-palette-section">
          <div class="flow-palette-section-label">Masters</div>

          <div class="flow-palette-item" draggable="true"
               ondragstart="Flow.paletteDragStart(event,'rs485')"
               onclick="Flow.addNode('rs485')">
            <div class="fpi-icon type-rs485">⟁</div>
            <div>
              <div style="font-weight:600;color:var(--txt1)">RS485</div>
              <div style="font-size:.62rem;color:var(--txt3)">Serial Modbus master</div>
            </div>
          </div>

          ${gwList || `
          <div style="padding:6px 8px 4px;font-size:.68rem;color:var(--txt3)">
            No gateways — add one via<br>
            <span style="color:var(--blue);cursor:pointer"
              onclick="Router.navigate('comm')">Communication tab</span>
          </div>`}

          <!-- Add new gateway inline -->
          <div class="flow-palette-item" draggable="true"
               ondragstart="Flow.paletteDragStart(event,'gateway','__new__')"
               onclick="Flow.addNode('gateway','__new__')"
               style="border:1px dashed var(--border);margin-top:4px">
            <div class="fpi-icon type-gateway" style="opacity:.6">+</div>
            <div>
              <div style="color:var(--txt2);font-size:.72rem">New Gateway</div>
              <div style="font-size:.62rem;color:var(--txt3)">Configure on canvas</div>
            </div>
          </div>
        </div>

        <div class="flow-palette-section">
          <div class="flow-palette-section-label">Devices</div>

          <!-- Always-available "New Device" template -->
          <div class="flow-palette-item" draggable="true"
               ondragstart="Flow.paletteDragStart(event,'device','__new__')"
               onclick="Flow.addNode('device','__new__')"
               style="border:1px dashed var(--border)">
            <div class="fpi-icon type-device">+</div>
            <div>
              <div style="color:var(--txt2);font-weight:600;font-size:.73rem">New Device</div>
              <div style="font-size:.62rem;color:var(--txt3)">Drag & configure inline</div>
            </div>
          </div>

          <!-- Existing devices (already in DB) — data-devlist attr used by _refreshPalette -->
          <div data-devlist>
          ${Flow._devices.length ? `
          <div style="margin-top:8px;font-size:.62rem;color:var(--txt3);padding:0 4px 4px">
            EXISTING DEVICES
          </div>
          ${Flow._devices.map(d => `
            <div class="flow-palette-item" draggable="true"
                 ondragstart="Flow.paletteDragStart(event,'device',${d.device_number})"
                 onclick="Flow.addNode('device',${d.device_number})">
              <div class="fpi-icon type-device">⬡</div>
              <div>
                <div style="font-weight:600;color:var(--txt1);font-size:.72rem">${d.device_name}</div>
                <div style="font-size:.61rem;color:var(--txt3)">
                  ID ${d.unit_id} · ${d.meter_model||'no model'}
                </div>
              </div>
            </div>`).join('')}` : ''}
          </div>
        </div>
      </div>

      <!-- ── Canvas ── -->
      <div class="flow-canvas-wrap" id="flow-canvas"
           ondragover="event.preventDefault()"
           ondrop="Flow.canvasDrop(event)">

        <!-- flow-inner is created by JS with SVG inside it -->

        <div class="flow-toolbar">
          <button class="flow-toolbar-btn" onclick="Flow.autoLayout()" title="Auto-arrange nodes">⊞ Layout</button>
          <div class="flow-toolbar-sep"></div>
          <button class="flow-toolbar-btn" id="ft-connect" onclick="Flow.toggleConnectMode()" title="Connect ports between nodes">⟁ Connect</button>
          <div class="flow-toolbar-sep"></div>
          <button class="flow-toolbar-btn" id="ft-pan" onclick="Flow.togglePanMode()" title="Pan mode — drag to scroll canvas">✋ Pan</button>
          <div class="flow-toolbar-sep"></div>
          <button class="flow-toolbar-btn" onclick="Flow.zoomIn()" title="Zoom in (+)">＋</button>
          <span id="ft-zoom-label" style="font-size:.72rem;color:var(--txt2);padding:0 4px;min-width:36px;text-align:center">100%</span>
          <button class="flow-toolbar-btn" onclick="Flow.zoomOut()" title="Zoom out (−)">－</button>
          <button class="flow-toolbar-btn" onclick="Flow.resetView()" title="Reset view (Ctrl+0)">⊡ Reset</button>
          <div class="flow-toolbar-sep"></div>
          <button class="flow-toolbar-btn" onclick="Flow.deleteSelected()" title="Delete selected (Del key)">✕ Delete</button>
          <div class="flow-toolbar-sep"></div>
          <button class="flow-toolbar-btn" onclick="Flow.save()" style="color:var(--amber)" title="Save layout">⊙ Save</button>
        </div>

        <div class="flow-hint-bar">
          <span style="color:var(--txt3);font-size:.68rem">
            Scroll to zoom · Middle-drag or ✋Pan to scroll · Ctrl+click for multi-select · Del to delete · Click ports in Connect mode
          </span>
        </div>

        <div class="flow-empty" id="flow-empty">
          <div class="flow-empty-icon">⬡</div>
          <div class="flow-empty-text">
            <strong style="color:var(--txt2)">Drag RS485 or Gateway first,</strong><br>
            then drag "New Device" blocks and connect them.<br>
            <span style="font-size:.7rem;opacity:.7">Click ⟁ Connect → click any port on source → click any port on target</span>
          </div>
        </div>
      </div>

      <!-- ── Right panel ── -->
      <div class="flow-panel hidden" id="flow-panel">
        <div class="flow-panel-header">
          <div class="flow-panel-title" id="flow-panel-title">Settings</div>
          <button class="flow-panel-close" onclick="Flow.closePanel()">✕</button>
        </div>
        <div class="flow-panel-body" id="flow-panel-body"></div>
      </div>
    </div>
  `);

  Flow.init(layoutR.data || { nodes: [], connections: [] });
});

// ── Flow Engine ──────────────────────────────────────────────────────────────
const Flow = {
  _nodes: [],
  _conns: [],
  _selected: null,
  _selectedNodes: new Set(),   // multi-select
  _connectMode: false,
  _connectFrom: null,
  _connectFromPort: null,
  _dragNode: null,
  _dragOffX: 0, _dragOffY: 0,
  // pan / zoom
  _panX: 0, _panY: 0,
  _scale: 1,
  _isPanMode: false,
  _isPanning: false,
  _panStartX: 0, _panStartY: 0,
  _panStartPX: 0, _panStartPY: 0,
  _panPointerId: null,

  // data caches
  _devices: [], _gateways: [], _rs485: {}, _fbs: [],
  _mappings: {}, _instances: {}, _models: [],
  _keyHandler: null,  // named keydown handler (avoid stacking on re-navigation)

  _uid()  { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); },
  _cuid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); },

  init(layout) {
    // Reset runtime state (important on re-navigation)
    this._selected      = null;
    this._selectedNodes = new Set();
    this._connectMode   = false;
    this._connectFrom   = null;
    this._connectFromPort = null;
    this._dragNode      = null;
    this._isPanMode     = false;
    this._isPanning     = false;

    this._nodes = layout.nodes || [];
    this._conns = layout.connections || [];
    this._panX  = layout.panX  || 0;
    this._panY  = layout.panY  || 0;
    this._scale = layout.scale || 1;
    this._renderAll();
    this._bindCanvas();
    this._applyTransform();
  },

  // ── Transform helpers ──
  _applyTransform() {
    const inner = document.getElementById('flow-inner');
    if (inner) {
      inner.style.transform = `translate(${this._panX}px,${this._panY}px) scale(${this._scale})`;
      inner.style.transformOrigin = '0 0';
    }
    this._updateZoomLabel();
    this._redrawConns();
  },
  _updateZoomLabel() {
    const el = document.getElementById('ft-zoom-label');
    if (el) el.textContent = Math.round(this._scale * 100) + '%';
  },
  // Convert screen coords → canvas (flow-inner) coords
  _toCanvas(screenX, screenY) {
    const canvas = document.getElementById('flow-canvas');
    if (!canvas) return {x:0,y:0};
    const cr = canvas.getBoundingClientRect();
    return {
      x: (screenX - cr.left - this._panX) / this._scale,
      y: (screenY - cr.top  - this._panY) / this._scale,
    };
  },
  zoom(delta, cx, cy) {
    const canvas = document.getElementById('flow-canvas');
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    const px = cx !== undefined ? cx - cr.left : cr.width  / 2;
    const py = cy !== undefined ? cy - cr.top  : cr.height / 2;
    const prevScale = this._scale;
    this._scale = Math.max(0.2, Math.min(3, this._scale + delta));
    // Adjust pan so zoom is centered on cursor
    this._panX = px - (px - this._panX) * (this._scale / prevScale);
    this._panY = py - (py - this._panY) * (this._scale / prevScale);
    this._applyTransform();
  },
  zoomIn()    { this.zoom(+0.15); this._autosave(); },
  zoomOut()   { this.zoom(-0.15); this._autosave(); },
  resetView() {
    this._panX = 0; this._panY = 0; this._scale = 1;
    this._applyTransform();
    this._autosave();
  },
  togglePanMode() {
    this._isPanMode = !this._isPanMode;
    const btn = document.getElementById('ft-pan');
    const canvas = document.getElementById('flow-canvas');
    if (this._isPanMode) {
      btn?.classList.add('active');
      if (canvas) canvas.style.cursor = 'grab';
    } else {
      btn?.classList.remove('active');
      // Also cancel any in-progress pan drag
      if (this._isPanning) {
        this._isPanning = false;
        try { canvas?.releasePointerCapture(this._panPointerId); } catch(_) {}
      }
      if (canvas) canvas.style.cursor = '';
    }
  },

  // ── Palette drag/drop ──
  paletteDragStart(e, type, refId) {
    e.dataTransfer.setData('flow-type',  type);
    e.dataTransfer.setData('flow-refId', String(refId ?? ''));
  },
  canvasDrop(e) {
    e.preventDefault();
    const type  = e.dataTransfer.getData('flow-type');
    const refId = e.dataTransfer.getData('flow-refId');
    if (!type) return;
    const {x, y} = this._toCanvas(e.clientX, e.clientY);
    this._createNode(type, refId, x - 90, y - 50);
  },
  addNode(type, refId) {
    const existing = this._nodes.filter(n => n.type === type);
    this._createNode(type, refId,
      80  + (existing.length % 4) * 230,
      120 + Math.floor(existing.length / 4) * 170);
  },

  // ── Node creation ──
  _createNode(type, refId, x, y) {
    if (type === 'rs485' && this._nodes.find(n => n.type === 'rs485')) {
      Toast.warn('RS485', 'Only one RS485 master per project'); return;
    }
    if (type === 'gateway' && refId !== '__new__' &&
        this._nodes.find(n => n.type === 'gateway' && n.refId === refId)) {
      Toast.warn('Gateway', `${refId} is already on the canvas`); return;
    }
    if (type === 'device' && refId !== '__new__' &&
        this._nodes.find(n => n.type === 'device' && String(n.refId) === String(refId))) {
      Toast.warn('Device', 'This device is already on the canvas'); return;
    }
    const node = {
      id: this._uid(), type,
      refId: (refId === '__new__') ? null : (refId || null),
      x, y,
      _draft: (refId === '__new__') ? {} : null,
    };
    this._nodes.push(node);
    this._renderNode(node);
    this._updateEmpty();
    if (refId === '__new__') setTimeout(() => this.openPanel(node.id), 80);
    this._autosave();
  },

  // ── Render all ──
  _renderAll() {
    const canvas = document.getElementById('flow-canvas');
    if (!canvas) return;
    // Ensure flow-inner exists
    let inner = document.getElementById('flow-inner');
    if (!inner) {
      inner = document.createElement('div');
      inner.id = 'flow-inner';
      inner.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;transform-origin:0 0;overflow:visible;';
      canvas.appendChild(inner);
    }
    // Remove old nodes
    inner.querySelectorAll('.flow-node').forEach(n => n.remove());
    // Rebuild SVG inside inner
    let svg = document.getElementById('flow-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.id = 'flow-svg';
      svg.className.baseVal = 'flow-svg';
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100vw;height:100vh;overflow:visible;pointer-events:none;';
      inner.appendChild(svg);
    } else {
      inner.appendChild(svg); // move into inner
    }
    let g = document.getElementById('svg-connections');
    if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg','g'); g.id='svg-connections'; svg.appendChild(g); }
    else g.innerHTML = ''; // clears both visible paths and hit-area paths
    let previewPath = document.getElementById('conn-preview-line');
    if (!previewPath) {
      previewPath = document.createElementNS('http://www.w3.org/2000/svg','path');
      previewPath.id = 'conn-preview-line';
      previewPath.classList.add('conn-preview');
      previewPath.setAttribute('d','');
      previewPath.style.display='none';
      svg.appendChild(previewPath);
    }
    this._nodes.forEach(n => this._renderNode(n));
    this._conns.forEach(c => this._renderConn(c));
    this._updateEmpty();
  },

  _nodeData(node) {
    if (node.type === 'rs485')   return this._rs485;
    if (node.type === 'gateway') return this._gateways.find(g => g.name === node.refId) || node._draft || {};
    if (node.type === 'device')  return this._devices.find(d => String(d.device_number) === String(node.refId)) || node._draft || {};
    return {};
  },
  _isConfigured(node) {
    if (node.type === 'rs485')   return true;
    if (node.type === 'gateway') return !!node.refId;
    if (node.type === 'device')  return !!node.refId;
    return false;
  },
  _nodeLabel(node) {
    const d = this._nodeData(node);
    const uncfg = !this._isConfigured(node);
    if (node.type === 'rs485')
      return { title:'RS485 Master', sub:`${d.com_port||'COM1'} · ${d.baud_rate||9600}`, icon:'⟁', uncfg:false };
    if (node.type === 'gateway')
      return { title:uncfg?'New Gateway':(d.name||'Gateway'), sub:uncfg?'Click ⚙ to configure':(d.ip_address||''), icon:'⟁', uncfg };
    if (node.type === 'device')
      return { title:uncfg?'New Device':(d.device_name||'Device'), sub:uncfg?'Click ⚙ to configure':`ID ${d.unit_id} · ${d.meter_model||'—'}`, icon:'⬡', uncfg };
    return { title:'?', sub:'', icon:'?', uncfg:false };
  },

  _renderNode(node) {
    const inner = document.getElementById('flow-inner');
    if (!inner) return;
    const { title, sub, icon, uncfg } = this._nodeLabel(node);
    const d = this._nodeData(node);

    let props = '';
    if (node.type === 'rs485') {
      props = `
        <div class="flow-node-prop"><span class="flow-node-prop-k">Port</span><span class="flow-node-prop-v">${d.com_port||''}</span></div>
        <div class="flow-node-prop"><span class="flow-node-prop-k">Baud</span><span class="flow-node-prop-v">${d.baud_rate||''}</span></div>
        <div class="flow-node-prop"><span class="flow-node-prop-k">Parity</span><span class="flow-node-prop-v">${d.parity||'N'}</span></div>`;
    } else if (node.type === 'gateway') {
      props = uncfg
        ? `<div class="flow-node-prop" style="justify-content:center;color:var(--amber);font-size:.68rem">⚠ Not configured yet</div>`
        : `<div class="flow-node-prop"><span class="flow-node-prop-k">IP</span><span class="flow-node-prop-v">${d.ip_address||''}</span></div>
           <div class="flow-node-prop"><span class="flow-node-prop-k">Port</span><span class="flow-node-prop-v">${d.port||502}</span></div>`;
    } else if (node.type === 'device') {
      if (uncfg) {
        props = `<div class="flow-node-prop" style="justify-content:center;color:var(--amber);font-size:.68rem">⚠ Not configured yet</div>`;
      } else {
        const maps = this._mappings[d.pou_name] || [];
        props = `
          <div class="flow-node-prop"><span class="flow-node-prop-k">Unit ID</span><span class="flow-node-prop-v">${d.unit_id||''}</span></div>
          <div class="flow-node-prop"><span class="flow-node-prop-k">Model</span><span class="flow-node-prop-v">${d.meter_model||'—'}</span></div>
          <div class="flow-node-prop"><span class="flow-node-prop-k">POU</span><span class="flow-node-prop-v">${d.pou_name||'—'}</span></div>
          <div class="flow-node-prop"><span class="flow-node-prop-k">Mapped</span>
            <span class="flow-node-prop-v" style="color:${maps.length?'var(--green)':'var(--txt3)'}">
              ${maps.length?`✓ ${maps.length} vars`:'✗ none'}</span></div>`;
      }
    }

    const el = document.createElement('div');
    el.className = `flow-node type-${node.type}${uncfg?' node-uncfg':''}${this._selectedNodes.has(node.id)?' selected':''}`;
    el.id = `fn-${node.id}`;
    el.style.left = node.x + 'px';
    el.style.top  = node.y + 'px';
    if (uncfg) el.style.opacity = '0.75';

    // 4-sided ports — shown in connect mode only
    el.innerHTML = `
      <div class="flow-port port-top"    id="port-top-${node.id}"    data-node="${node.id}" data-port="top"></div>
      <div class="flow-port port-right"  id="port-right-${node.id}"  data-node="${node.id}" data-port="right"></div>
      <div class="flow-port port-bottom" id="port-bottom-${node.id}" data-node="${node.id}" data-port="bottom"></div>
      <div class="flow-port port-left"   id="port-left-${node.id}"   data-node="${node.id}" data-port="left"></div>
      <div class="flow-node-header">
        <div class="flow-node-icon">${icon}</div>
        <div>
          <div class="flow-node-title">${title}</div>
          <div class="flow-node-sub">${sub}</div>
        </div>
      </div>
      <div class="flow-node-body">${props}</div>
      <div class="flow-node-footer">
        <button class="flow-node-btn primary" onclick="Flow.openPanel('${node.id}')">
          ${uncfg ? '⚙ Configure' : '⚙ Settings'}
        </button>
      </div>`;

    inner.appendChild(el);
    this._bindNode(el, node);
  },

  _bindNode(el, node) {
    el.addEventListener('pointerdown', e => {
      if (this._isPanMode) return;
      if (e.target.classList.contains('flow-port') || e.target.classList.contains('flow-node-btn')) return;
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Multi-select toggle
        if (this._selectedNodes.has(node.id)) {
          this._selectedNodes.delete(node.id);
          el.classList.remove('selected');
        } else {
          this._selectedNodes.add(node.id);
          el.classList.add('selected');
        }
        this._selected = null;
        return;
      }

      this._selectNode(node.id);
      if (this._connectMode) return;

      this._dragNode  = node;
      const rect = el.getBoundingClientRect();
      this._dragOffX  = e.clientX - rect.left;
      this._dragOffY  = e.clientY - rect.top;
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!this._dragNode || this._dragNode.id !== node.id) return;
      // dragOffX/Y are screen-px offsets within the element; _toCanvas handles the scale conversion
      const {x, y} = this._toCanvas(e.clientX - this._dragOffX, e.clientY - this._dragOffY);
      node.x = Math.max(0, x);
      node.y = Math.max(0, y);
      el.style.left = node.x + 'px';
      el.style.top  = node.y + 'px';
      this._redrawConns();
    });
    el.addEventListener('pointerup', () => {
      if (this._dragNode) { el.classList.remove('dragging'); this._dragNode = null; this._autosave(); }
    });
    el.querySelectorAll('.flow-port').forEach(port => {
      port.addEventListener('click', e => {
        e.stopPropagation();
        this._handlePortClick(node.id, port.dataset.port);
      });
    });
  },

  // ── Selection ──
  _selectNode(id) {
    if (!id) {
      // Clear all
      document.querySelectorAll('.flow-node.selected').forEach(n => n.classList.remove('selected'));
      this._selected = null;
      this._selectedNodes.clear();
      return;
    }
    // Single select
    document.querySelectorAll('.flow-node.selected').forEach(n => n.classList.remove('selected'));
    this._selectedNodes.clear();
    this._selected = id;
    this._selectedNodes.add(id);
    document.getElementById(`fn-${id}`)?.classList.add('selected');
  },

  // ── Connections ──
  _renderConn(conn) {
    const fromNode = this._nodes.find(n => n.id === conn.fromNodeId);
    const toNode   = this._nodes.find(n => n.id === conn.toNodeId);
    if (!fromNode || !toNode) return;
    const g = document.getElementById('svg-connections');

    // Invisible wide hit-area path (makes clicking connections much easier)
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.id = `conn-hit-${conn.id}`;
    hitPath.style.cssText = 'fill:none;stroke:transparent;stroke-width:16;cursor:pointer;pointer-events:stroke;';
    hitPath.addEventListener('click', e => { e.stopPropagation(); this._selectConn(conn.id, path); });
    hitPath.addEventListener('mouseenter', () => { path.style.stroke = 'var(--blue)'; path.style.strokeWidth = '3'; });
    hitPath.addEventListener('mouseleave', () => { if (!path.classList.contains('selected')) { path.style.stroke = ''; path.style.strokeWidth = ''; } });
    g.appendChild(hitPath);

    // Visible styled path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.id    = `conn-${conn.id}`;
    path.classList.add('conn-line');
    if (fromNode.type === 'rs485')   path.classList.add('rs485');
    if (fromNode.type === 'gateway') path.classList.add('gateway');
    path.style.pointerEvents = 'none'; // hit-area path handles clicks
    path.addEventListener('click', e => { e.stopPropagation(); this._selectConn(conn.id, path); });
    g.appendChild(path);
    this._updateConnPath(conn.id);
  },
  _selectConn(id, pathEl) {
    document.querySelectorAll('.conn-line.selected').forEach(p => {
      p.classList.remove('selected');
      p.style.stroke = ''; p.style.strokeWidth = '';
    });
    pathEl.classList.add('selected');
    pathEl.style.stroke = 'var(--amber)'; pathEl.style.strokeWidth = '3';
    this._selected = 'conn:' + id;
    this._selectedNodes.clear();
    document.querySelectorAll('.flow-node.selected').forEach(n => n.classList.remove('selected'));
  },
  _getPortCenter(nodeId, portSide) {
    // Calculate port position in canvas (inner) coordinates
    const node = this._nodes.find(n => n.id === nodeId);
    if (!node) return {x:0,y:0};
    const el = document.getElementById(`fn-${nodeId}`);
    const w = el ? el.offsetWidth  : 180;
    const h = el ? el.offsetHeight : 120;
    const sides = {
      top:    { x: node.x + w/2,  y: node.y },
      bottom: { x: node.x + w/2,  y: node.y + h },
      left:   { x: node.x,        y: node.y + h/2 },
      right:  { x: node.x + w,    y: node.y + h/2 },
      // legacy compatibility
      in:     { x: node.x + w/2,  y: node.y },
      out:    { x: node.x + w/2,  y: node.y + h },
    };
    return sides[portSide] || sides.bottom;
  },
  _bezier(x1,y1,x2,y2, fromSide='bottom', toSide='top') {
    const dist = Math.sqrt((x2-x1)**2+(y2-y1)**2);
    const ctrl = Math.min(Math.max(dist*0.5, 50), 160);
    let c1x=x1,c1y=y1,c2x=x2,c2y=y2;
    if (fromSide==='bottom') c1y+=ctrl; else if (fromSide==='top') c1y-=ctrl;
    else if (fromSide==='right') c1x+=ctrl; else if (fromSide==='left') c1x-=ctrl;
    if (toSide==='top')    c2y-=ctrl; else if (toSide==='bottom') c2y+=ctrl;
    else if (toSide==='left') c2x-=ctrl; else if (toSide==='right') c2x+=ctrl;
    return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  },
  _updateConnPath(connId) {
    const conn = this._conns.find(c => c.id === connId);
    const path = document.getElementById(`conn-${connId}`);
    if (!conn || !path) return;
    const fromSide = conn.fromPort || 'bottom';
    const toSide   = conn.toPort   || 'top';
    const from = this._getPortCenter(conn.fromNodeId, fromSide);
    const to   = this._getPortCenter(conn.toNodeId,   toSide);
    const d = this._bezier(from.x, from.y, to.x, to.y, fromSide, toSide);
    path.setAttribute('d', d);
    // Also update hit-area path
    const hitPath = document.getElementById(`conn-hit-${connId}`);
    if (hitPath) hitPath.setAttribute('d', d);
  },
  _redrawConns() { this._conns.forEach(c => this._updateConnPath(c.id)); },

  // ── Connect mode ──
  toggleConnectMode() {
    this._connectMode = !this._connectMode;
    this._connectFrom = null;
    this._connectFromPort = null;
    const btn    = document.getElementById('ft-connect');
    const canvas = document.getElementById('flow-canvas');
    if (this._connectMode) {
      btn.classList.add('active');
      // .connecting class on canvas triggers port CSS visibility
      canvas?.classList.add('connecting');
      Toast.info('Connect Mode', 'Click any port (circle) on a node to start. Click a port on another node to complete. Click ⟁ Connect again to exit.');
    } else {
      btn.classList.remove('active');
      canvas?.classList.remove('connecting');
      const preview = document.getElementById('conn-preview-line');
      if (preview) preview.style.display = 'none';
      // Clear active port highlights
      document.querySelectorAll('.flow-port.active').forEach(p => p.classList.remove('active'));
    }
  },
  _handlePortClick(nodeId, portSide) {
    if (!this._connectMode) return;
    if (!this._connectFrom) {
      this._connectFrom     = nodeId;
      this._connectFromPort = portSide;
      document.getElementById(`port-${portSide}-${nodeId}`)?.classList.add('active');
      Toast.info('Connect', `Source: ${portSide.toUpperCase()} port selected — now click a port on another node`);
    } else {
      if (nodeId === this._connectFrom) {
        Toast.warn('Connect', 'Cannot connect to itself');
        document.querySelectorAll('.flow-port.active').forEach(p => p.classList.remove('active'));
        this._connectFrom = null; this._connectFromPort = null;
        return;
      }
      const exists = this._conns.find(c => c.fromNodeId===this._connectFrom && c.toNodeId===nodeId && c.fromPort===this._connectFromPort);
      if (!exists) {
        const conn = { id:this._cuid(), fromNodeId:this._connectFrom, toNodeId:nodeId, fromPort:this._connectFromPort, toPort:portSide };
        this._conns.push(conn);
        this._renderConn(conn);
        this._autosave();
        Toast.ok('Connected', `${this._connectFromPort} → ${portSide}`);
      } else Toast.warn('Already connected');
      document.querySelectorAll('.flow-port.active').forEach(p => p.classList.remove('active'));
      this._connectFrom = null; this._connectFromPort = null;
    }
  },

  // ── Delete (single or multi-select) ──
  deleteSelected() {
    const sel = this._selected;

    // Multi-node delete
    if (this._selectedNodes.size > 1) {
      const ids = [...this._selectedNodes];
      ids.forEach(id => {
        this._conns.filter(c => c.fromNodeId===id||c.toNodeId===id)
                   .forEach(c => {
                     document.getElementById(`conn-${c.id}`)?.remove();
                     document.getElementById(`conn-hit-${c.id}`)?.remove();
                   });
        this._conns = this._conns.filter(c => c.fromNodeId!==id && c.toNodeId!==id);
        document.getElementById(`fn-${id}`)?.remove();
      });
      this._nodes = this._nodes.filter(n => !ids.includes(n.id));
      this._selected = null;
      this._selectedNodes.clear();
      this.closePanel();
      this._updateEmpty();
      this._autosave();
      Toast.ok('Deleted', `${ids.length} nodes removed`);
      return;
    }

    if (!sel) { Toast.warn('Nothing selected', 'Click a node or connection first'); return; }

    if (sel.startsWith('conn:')) {
      const id = sel.slice(5);
      this._conns = this._conns.filter(c => c.id !== id);
      document.getElementById(`conn-${id}`)?.remove();
      document.getElementById(`conn-hit-${id}`)?.remove();
      this._selected = null; this._autosave();
      Toast.ok('Deleted', 'Connection removed');
    } else {
      const node = this._nodes.find(n => n.id === sel);
      if (!node) return;
      this._conns.filter(c => c.fromNodeId===sel||c.toNodeId===sel)
                 .forEach(c => {
                   document.getElementById(`conn-${c.id}`)?.remove();
                   document.getElementById(`conn-hit-${c.id}`)?.remove();
                 });
      this._conns = this._conns.filter(c => c.fromNodeId!==sel && c.toNodeId!==sel);
      document.getElementById(`fn-${sel}`)?.remove();
      this._nodes = this._nodes.filter(n => n.id !== sel);
      this._selected = null; this._selectedNodes.clear(); this.closePanel(); this._updateEmpty(); this._autosave();
      Toast.ok('Deleted', `${node.type} removed`);
    }
  },

  // ── Auto layout ──
  autoLayout() {
    if (!this._nodes.length) return;
    const masters = this._nodes.filter(n => n.type !== 'device');
    const devices = this._nodes.filter(n => n.type === 'device');
    masters.forEach((n,i) => {
      n.x=60+i*250; n.y=60;
      const el=document.getElementById(`fn-${n.id}`);
      if (el){el.style.left=n.x+'px';el.style.top=n.y+'px';}
    });
    const placed=new Set();
    masters.forEach((m,mi)=>{
      this._conns.filter(c=>c.fromNodeId===m.id)
        .map(c=>devices.find(d=>d.id===c.toNodeId)).filter(Boolean)
        .forEach((d,di)=>{
          d.x=60+mi*250; d.y=250+di*180;
          const el=document.getElementById(`fn-${d.id}`);
          if(el){el.style.left=d.x+'px';el.style.top=d.y+'px';}
          placed.add(d.id);
        });
    });
    let ux=60+masters.length*250;
    devices.filter(d=>!placed.has(d.id)).forEach((d,i)=>{
      d.x=ux; d.y=60+i*180;
      const el=document.getElementById(`fn-${d.id}`);
      if(el){el.style.left=d.x+'px';el.style.top=d.y+'px';}
    });
    this._redrawConns(); this._autosave();
    Toast.ok('Auto Layout','Nodes arranged');
  },

  // ── Settings panel ──
  openPanel(nodeId) {
    const node = this._nodes.find(n => n.id === nodeId);
    if (!node) return;
    this._selectNode(nodeId);
    const panel = document.getElementById('flow-panel');
    const body  = document.getElementById('flow-panel-body');
    const title = document.getElementById('flow-panel-title');
    panel.classList.remove('hidden');
    if (node.type==='rs485')   this._panelRS485(node,title,body);
    else if (node.type==='gateway') this._panelGateway(node,title,body);
    else if (node.type==='device')  this._panelDevice(node,title,body);
  },

  _panelRS485(node,title,body){
    const d=this._rs485;
    title.textContent='⟁ RS485 Settings';
    body.innerHTML=`
      <div class="flow-panel-section">
        <div class="flow-panel-section-title">Serial Port Configuration</div>
        <div class="flow-panel-section-body">
          ${this._row('COM Port','fp-com',d.com_port,'text','COM1')}
          ${this._rowSel('Baud Rate','fp-baud',String(d.baud_rate||9600),['1200','2400','4800','9600','19200','38400','57600','115200'])}
          ${this._rowSel('Parity','fp-parity',d.parity||'N',['N','E','O'])}
          ${this._rowSel('Stop Bits','fp-stop',String(d.stop_bits||1),['1','2'])}
          ${this._row('Timeout ms','fp-tout',d.timeout_ms,'number','5000')}
          ${this._row('Delay ms','fp-delay',d.delay_ms,'number','100')}
        </div>
      </div>
      <button class="btn btn-accent" style="width:100%" onclick="Flow.saveRS485('${node.id}')">⊙ Save RS485</button>`;
  },
  _panelGateway(node,title,body){
    const isNew=!node.refId;
    const d=isNew?(node._draft||{}):(this._gateways.find(g=>g.name===node.refId)||{});
    title.textContent=isNew?'⟁ New Gateway':`⟁ ${d.name||'Gateway'}`;
    body.innerHTML=`
      ${isNew?`<div class="alert alert-info" style="font-size:.73rem;margin-bottom:12px">Fill in details and click Create to add this gateway.</div>`:''}
      <div class="flow-panel-section">
        <div class="flow-panel-section-title">TCP/IP Settings</div>
        <div class="flow-panel-section-body">
          ${this._row('Name','fp-gwname',d.name,'text','GW_Panel1')}
          ${this._row('IP Address','fp-gwip',d.ip_address,'text','192.168.1.100')}
          ${this._row('Port','fp-gwport',d.port||502,'number','502')}
          ${this._row('Timeout ms','fp-gwtout',d.timeout_ms||5000,'number','5000')}
          ${this._row('Description','fp-gwdesc',d.description||'','text','optional')}
        </div>
      </div>
      <button class="btn btn-accent" style="width:100%" onclick="Flow.saveGateway('${node.id}')">
        ${isNew?'+ Create Gateway':'⊙ Save Gateway'}
      </button>`;
  },
  _panelDevice(node,title,body){
    const isNew=!node.refId;
    const d=isNew?(node._draft||{}):(this._devices.find(dv=>String(dv.device_number)===String(node.refId))||{});
    const maps=this._mappings[d.pou_name]||[];
    const inst=this._instances[d.pou_name]||'';
    const fb=this._fbs.find(f=>f.meter_model===d.meter_model);
    const masterConn=this._conns.find(c=>c.toNodeId===node.id);
    const masterNode=masterConn?this._nodes.find(n=>n.id===masterConn.fromNodeId):null;
    const inferredComm=masterNode?(masterNode.type==='rs485'?'RS485':(masterNode.refId||d.communication_type||'RS485')):(d.communication_type||'RS485');
    const nextNum=Math.max(0,...this._devices.map(x=>x.device_number||0))+1;
    const modelOpts=this._models.map(m=>`<option value="${m}" ${m===d.meter_model?'selected':''}>${m}</option>`).join('');
    const commOpts=['RS485',...this._gateways.map(g=>g.name)].map(o=>`<option value="${o}" ${o===inferredComm?'selected':''}>${o}</option>`).join('');
    title.textContent=isNew?'⬡ New Device':`⬡ ${d.device_name||'Device'}`;
    body.innerHTML=`
      ${isNew?`<div class="alert alert-info" style="font-size:.73rem;margin-bottom:12px">
        Fill in device details and click <strong>Create Device</strong>.
        ${masterNode?`<br><span style="color:var(--green)">✓ Will connect via ${inferredComm}</span>`:''}
      </div>`:''}
      <div class="flow-panel-section">
        <div class="flow-panel-section-title">Device Identity</div>
        <div class="flow-panel-section-body">
          ${this._row('Device Name','fp-dname',d.device_name||'','text','EM_Zone1_01')}
          ${this._row('Unit ID','fp-dunit',d.unit_id||1,'number','1','1','247')}
          ${this._row('POU Name','fp-dpou',d.pou_name||'','text','POU_Zone1_01')}
          ${this._row('Array Name','fp-darr',d.array_name||'','text','GVL.Zone1_01')}
        </div>
      </div>
      <div class="flow-panel-section">
        <div class="flow-panel-section-title">Model & Communication</div>
        <div class="flow-panel-section-body">
          <div class="flow-prop-row"><label>Meter Model</label>
            <select id="fp-dmodel" onchange="Flow._onModelChange()">
              <option value="">— select —</option>${modelOpts}
            </select></div>
          <div class="flow-prop-row"><label>Comm Type</label>
            <select id="fp-dcomm">${commOpts}</select></div>
        </div>
      </div>
      <div id="fp-fb-strip" style="margin-bottom:8px"></div>
      <button class="btn btn-accent" style="width:100%;margin-bottom:8px"
        onclick="Flow.${isNew?'createDevice':'saveDevice'}('${node.id}'${isNew?'':','+d.device_number})">
        ${isNew?'+ Create Device':'⊙ Save Device'}
      </button>
      ${!isNew?`
      <div class="flow-panel-section">
        <div class="flow-panel-section-title">POU Mapping
          <span style="float:right;color:${maps.length?'var(--green)':'var(--txt3)'};font-weight:400">${maps.length} var${maps.length!==1?'s':''}</span>
        </div>
        <div class="flow-panel-section-body">
          ${this._row('Variable Prefix','fp-prefix',d.device_name||'','text',d.device_name||'Zone1_EM01')}
          ${this._row('FB Instance','fp-inst',inst||`fb${d.pou_name}_inst`,'text','fbPOU_inst')}
          ${fb?`<div style="margin-top:4px;font-size:.67rem;color:var(--txt3)">FB: <span style="color:var(--blue)">${fb.fb_name}</span> · ${(fb.mappings||[]).filter(m=>m.type!=='skip').length} params</div>`
             :`<div style="margin-top:4px;font-size:.67rem;color:var(--amber)">⚠ No FB for "${d.meter_model||'no model'}"</div>`}
        </div>
      </div>
      ${fb?`<button class="btn btn-accent" style="width:100%;margin-bottom:8px" onclick="Flow.quickMapPOU('${node.id}',${d.device_number})">⇌ Bulk Map All FB Outputs</button>`:''}
      ${maps.length?`
      <div class="flow-panel-section">
        <div class="flow-panel-section-title">Mapped Variables</div>
        <div class="flow-panel-section-body" style="max-height:180px;overflow-y:auto">
          ${maps.map(m=>`<div style="font-size:.66rem;padding:2px 0;font-family:var(--font-co);border-bottom:1px solid var(--border);color:var(--txt2)">${m.output_variable}<span style="color:var(--txt3)"> ← </span><span style="color:var(--blue)">${m.mapping_fb_out}</span></div>`).join('')}
        </div>
      </div>`:''}`:''}`;
    if (d.meter_model) this._onModelChange();
  },

  _onModelChange(){
    const model=q('#fp-dmodel')?.value;
    const strip=q('#fp-fb-strip');
    if(!strip)return;
    if(!model){strip.innerHTML='';return;}
    const fb=this._fbs.find(f=>f.meter_model===model);
    strip.innerHTML=fb
      ?`<div style="background:var(--blue-lo);border:1px solid rgba(26,159,212,.2);border-radius:var(--radius);padding:6px 10px;font-size:.68rem"><span style="color:var(--txt2)">FB:</span><span style="color:var(--blue);margin:0 6px">${fb.fb_name}</span><span style="color:var(--green)">${(fb.mappings||[]).filter(m=>m.type!=='skip').length} outputs</span></div>`
      :`<div style="background:var(--amber-lo);border:1px solid var(--amber-lo);border-radius:var(--radius);padding:6px 10px;font-size:.68rem;color:var(--amber)">⚠ No Function Block for this model yet</div>`;
    const nameEl=q('#fp-dname'), pouEl=q('#fp-dpou'), arrEl=q('#fp-darr');
    if(nameEl?.value&&pouEl&&!pouEl.value) pouEl.value=`POU_${nameEl.value.replace(/[^a-zA-Z0-9]/g,'_')}`;
    if(nameEl?.value&&arrEl&&!arrEl.value) arrEl.value=`GVL.${nameEl.value.replace(/[^a-zA-Z0-9]/g,'_')}`;
  },

  _row(label,id,value,type,placeholder,min,max){
    return `<div class="flow-prop-row"><label>${label}</label>
      <input id="${id}" type="${type}" value="${value??''}" placeholder="${placeholder}" ${min?`min="${min}"`:''}${max?` max="${max}"`:''}/>
    </div>`;
  },
  _rowSel(label,id,value,options){
    return `<div class="flow-prop-row"><label>${label}</label>
      <select id="${id}">${options.map(o=>`<option value="${o}" ${String(o)===String(value)?'selected':''}>${o}</option>`).join('')}</select>
    </div>`;
  },

  closePanel(){
    document.getElementById('flow-panel')?.classList.add('hidden');
    this._selectNode(null);
  },

  async saveRS485(nodeId){
    const cfg={com_port:q('#fp-com')?.value.trim(),baud_rate:parseInt(q('#fp-baud')?.value),parity:q('#fp-parity')?.value,stop_bits:parseInt(q('#fp-stop')?.value),timeout_ms:parseInt(q('#fp-tout')?.value),delay_ms:parseInt(q('#fp-delay')?.value)};
    const r=await API.put('/rs485',cfg);
    if(r.status==='success'){this._rs485=cfg;const node=this._nodes.find(n=>n.id===nodeId);if(node){document.getElementById(`fn-${nodeId}`)?.remove();this._renderNode(node);}Toast.ok('Saved','RS485 updated');}
    else Toast.err('Error',r.message);
  },
  async saveGateway(nodeId){
    const node=this._nodes.find(n=>n.id===nodeId);if(!node)return;
    const name=q('#fp-gwname')?.value.trim(),ip=q('#fp-gwip')?.value.trim(),port=parseInt(q('#fp-gwport')?.value||502),tout=parseInt(q('#fp-gwtout')?.value||5000),desc=q('#fp-gwdesc')?.value.trim()||'';
    if(!name||!ip){Toast.warn('Validation','Name and IP required');return;}
    const isNew=!node.refId,payload={name,ip_address:ip,port,timeout_ms:tout,description:desc};
    const r=isNew?await API.post('/gateways',payload):await API.put(`/gateways/${encodeURIComponent(node.refId)}`,payload);
    if(r.status==='success'){const idx=this._gateways.findIndex(g=>g.name===(node.refId||name));if(idx>=0)this._gateways[idx]=payload;else this._gateways.push(payload);node.refId=name;node._draft=null;document.getElementById(`fn-${nodeId}`)?.remove();this._renderNode(node);this.openPanel(nodeId);this._refreshPalette();Toast.ok(isNew?'Gateway Created':'Gateway Saved',name);}
    else Toast.err('Error',r.message);
  },
  async createDevice(nodeId){
    const node=this._nodes.find(n=>n.id===nodeId);if(!node)return;
    const name=q('#fp-dname')?.value.trim(),unit=parseInt(q('#fp-dunit')?.value||1),pou=q('#fp-dpou')?.value.trim(),arr=q('#fp-darr')?.value.trim(),model=q('#fp-dmodel')?.value,comm=q('#fp-dcomm')?.value||'RS485';
    if(!name){Toast.warn('Validation','Device name is required');return;}
    if(!pou){Toast.warn('Validation','POU name is required');return;}
    if(!arr){Toast.warn('Validation','Array name is required');return;}
    const nextNum=Math.max(0,...this._devices.map(d=>d.device_number||0))+1;
    const payload={device_number:nextNum,device_name:name,unit_id:unit,pou_name:pou,array_name:arr,meter_model:model||'',communication_type:comm,description:'Created from Flow Editor'};
    const r=await API.post('/devices',payload);
    if(r.status==='success'){const created=r.data||payload;this._devices.push(created);node.refId=created.device_number||nextNum;node._draft=null;document.getElementById(`fn-${nodeId}`)?.remove();this._renderNode(node);this.openPanel(nodeId);this._refreshPalette();this._autosave();Toast.ok('Device Created',name);}
    else Toast.err('Error',r.message);
  },
  async saveDevice(nodeId,deviceNumber){
    const payload={device_number:deviceNumber,device_name:q('#fp-dname')?.value.trim(),unit_id:parseInt(q('#fp-dunit')?.value),pou_name:q('#fp-dpou')?.value.trim(),array_name:q('#fp-darr')?.value.trim(),meter_model:q('#fp-dmodel')?.value,communication_type:q('#fp-dcomm')?.value,description:''};
    const r=await API.put(`/devices/${deviceNumber}`,payload);
    if(r.status==='success'){const idx=this._devices.findIndex(d=>d.device_number===deviceNumber);if(idx>=0)this._devices[idx]={...this._devices[idx],...payload};const node=this._nodes.find(n=>n.id===nodeId);document.getElementById(`fn-${nodeId}`)?.remove();this._renderNode(node);this.openPanel(nodeId);Toast.ok('Saved','Device updated');}
    else Toast.err('Error',r.message);
  },
  async quickMapPOU(nodeId,deviceNumber){
    const d=this._devices.find(dv=>dv.device_number===deviceNumber);if(!d)return;
    const fb=this._fbs.find(f=>f.meter_model===d.meter_model);
    if(!fb){Toast.warn('No FB','Create a Function Block for this model first');return;}
    const prefix=q('#fp-prefix')?.value.trim()||d.device_name,inst=q('#fp-inst')?.value.trim()||`fb${d.pou_name}_inst`;
    if(!prefix){Toast.warn('Validation','Enter variable prefix');return;}
    const params=(fb.mappings||[]).filter(m=>m.type!=='skip');
    const mappings=params.map(m=>({pou_name:d.pou_name,input_array:m.array||m.name,output_variable:`${prefix}_${m.name}`,mapping_fb_out:m.name}));
    const r=await API.post('/pou-mappings',{pou_name:d.pou_name,instance_name:inst,mappings});
    if(r.status==='success'){this._mappings[d.pou_name]=mappings;this._instances[d.pou_name]=inst;const node=this._nodes.find(n=>n.id===nodeId);document.getElementById(`fn-${nodeId}`)?.remove();this._renderNode(node);this.openPanel(nodeId);Toast.ok('Mapped',`${mappings.length} variables created`);}
    else Toast.err('Error',r.message);
  },

  _refreshPalette(){
    const existingDiv = document.querySelector('#flow-palette [data-devlist]');
    if(!existingDiv) return;
    existingDiv.innerHTML = this._devices.length
      ? `<div style="margin-top:8px;font-size:.62rem;color:var(--txt3);padding:0 4px 4px">EXISTING DEVICES</div>`
        + this._devices.map(d=>`
          <div class="flow-palette-item" draggable="true"
               ondragstart="Flow.paletteDragStart(event,'device',${d.device_number})"
               onclick="Flow.addNode('device',${d.device_number})">
            <div class="fpi-icon type-device">⬡</div>
            <div>
              <div style="font-weight:600;color:var(--txt1);font-size:.72rem">${d.device_name}</div>
              <div style="font-size:.61rem;color:var(--txt3)">ID ${d.unit_id} · ${d.meter_model||'no model'}</div>
            </div>
          </div>`).join('')
      : '';
  },

  // ── Canvas events ──
  _bindCanvas(){
    const canvas=document.getElementById('flow-canvas');
    if(!canvas)return;

    // Click on empty canvas → deselect or cancel pending connection
    canvas.addEventListener('click',e=>{
      const tag=e.target;
      if(tag===canvas||tag.id==='flow-inner'||tag.tagName==='svg'||tag.id==='svg-connections'||tag.tagName==='g'){
        if(this._connectMode && this._connectFrom){
          // Cancel pending connection
          document.querySelectorAll('.flow-port.active').forEach(p=>p.classList.remove('active'));
          this._connectFrom=null; this._connectFromPort=null;
          const preview=document.getElementById('conn-preview-line');
          if(preview)preview.style.display='none';
          Toast.info('Cancelled','Connection cancelled — click a source port to start again');
        } else if(!this._connectMode){
          this._selectNode(null);
          document.querySelectorAll('.conn-line.selected').forEach(p=>{p.classList.remove('selected');p.style.stroke='';p.style.strokeWidth='';});
          this._selected=null;
        }
      }
    });

    // Mouse wheel → zoom
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.zoom(delta, e.clientX, e.clientY);
    },{passive:false});

    // Middle mouse or pan mode → pan
    canvas.addEventListener('pointerdown',e=>{
      if(e.button===1||(this._isPanMode&&e.button===0)){
        e.preventDefault();
        this._isPanning=true;
        this._panPointerId=e.pointerId;
        this._panStartX=e.clientX;
        this._panStartY=e.clientY;
        this._panStartPX=this._panX;
        this._panStartPY=this._panY;
        canvas.style.cursor='grabbing';
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove',e=>{
      if(this._isPanning){
        this._panX=this._panStartPX+(e.clientX-this._panStartX);
        this._panY=this._panStartPY+(e.clientY-this._panStartY);
        this._applyTransform();
      }
      // Connection preview line
      if(this._connectMode&&this._connectFrom){
        const preview=document.getElementById('conn-preview-line');
        const {x,y}=this._toCanvas(e.clientX,e.clientY);
        const from=this._getPortCenter(this._connectFrom,this._connectFromPort||'bottom');
        if(preview){preview.setAttribute('d',this._bezier(from.x,from.y,x,y));preview.style.display='';}
      }
    });
    canvas.addEventListener('pointerup',e=>{
      if(this._isPanning){
        this._isPanning=false;
        canvas.style.cursor=this._isPanMode?'grab':'';
        canvas.releasePointerCapture(e.pointerId);
        this._autosave();
      }
    });

    // Keyboard shortcuts on canvas — stored as named function to avoid stacking on re-navigation
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this._keyHandler = (e) => {
      if (document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
      if (!document.getElementById('flow-canvas')) { document.removeEventListener('keydown', this._keyHandler); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelected(); }
      if (e.key === '+' || e.key === '=') this.zoomIn();
      if (e.key === '-') this.zoomOut();
      if (e.key === 'Escape') {
        if (this._connectMode) { this.toggleConnectMode(); }
        else if (this._isPanMode) { this.togglePanMode(); }
        else { this._selectNode(null); }
      }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.resetView(); }
    };
    document.addEventListener('keydown', this._keyHandler);
  },

  _updateEmpty(){
    const el=document.getElementById('flow-empty');
    if(el)el.style.display=this._nodes.length?'none':'';
  },

  // ── Persist ──
  _autosaveTimer:null,
  _autosave(){clearTimeout(this._autosaveTimer);this._autosaveTimer=setTimeout(()=>this.save(true),1200);},
  async save(silent=false){
    const layout={nodes:this._nodes.map(n=>({id:n.id,type:n.type,refId:n.refId,x:n.x,y:n.y})),connections:this._conns,panX:this._panX,panY:this._panY,scale:this._scale};
    const r=await API.post('/flow/layout',layout);
    if(!silent){if(r.status==='success')Toast.ok('Saved','Layout saved');else Toast.err('Save Error',r.message);}
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Modal close buttons
  document.getElementById('modal-close').addEventListener('click', Modal.close);
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) Modal.close();
  });
  document.getElementById('code-modal-close').addEventListener('click', CodeViewer.close.bind(CodeViewer));
  document.getElementById('code-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) CodeViewer.close();
  });

  // Code viewer copy/download
  document.getElementById('code-copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(CodeViewer.currentCode)
      .then(() => Toast.ok('Copied', 'Code copied to clipboard'));
  });
  document.getElementById('code-download-btn').addEventListener('click', () => {
    const blob = new Blob([CodeViewer.currentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = CodeViewer.currentFilename || 'code.st';
    a.click(); URL.revokeObjectURL(url);
  });

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main');

  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('sidebar-collapsed');
    }
  }

  document.getElementById('hamburger').addEventListener('click', toggleSidebar);

  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  if (collapseBtn) collapseBtn.addEventListener('click', toggleSidebar);

  // Nav links
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      Router.navigate(a.dataset.page);
      if (window.innerWidth <= 768) sidebar.classList.remove('mobile-open');
    });
  });

  // Drag & drop on dropzones
  document.querySelectorAll('.dropzone').forEach(dz => {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag-over');
      // handled by input
    });
  });

  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      Modal.close(); CodeViewer.close(); Modal.closeConfirm();
    }
  });

  // Auto-refresh status every 30 seconds
  setInterval(refreshStatus, 30000);

  // Init router
  Router.init();

  // Initial status load
  refreshStatus();
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH & USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// ── Current session state ──
let SESSION = { user: null };

async function loadSession() {
  try {
    const r = await API.get('/auth/me');
    if (r.status === 'success') {
      SESSION.user = r.data;
      applyRoleUI(r.data.role, r.data.display_name || r.data.username);
    } else {
      window.location.href = '/login';
    }
  } catch {
    window.location.href = '/login';
  }
}

function applyRoleUI(role, displayName) {
  // Update sidebar user card
  const avatarEl = document.getElementById('sidebar-user-avatar');
  const nameEl   = document.getElementById('sidebar-user-name');
  const roleEl   = document.getElementById('sidebar-user-role');
  if (avatarEl) avatarEl.textContent = (displayName || 'U')[0].toUpperCase();
  if (nameEl)   nameEl.textContent   = displayName || 'User';
  if (roleEl)   roleEl.textContent   = role;

  // Update topbar role badge
  const badge = document.getElementById('topbar-role-badge');
  if (badge) {
    badge.textContent = role.toUpperCase();
    badge.className = `sys-version tbr-${role}`;
  }

  // Show/hide admin-only nav items
  const adminItems = document.querySelectorAll('.nav-admin-only');
  adminItems.forEach(el => {
    el.style.display = role === 'admin' ? '' : 'none';
  });

  // Show/hide action buttons based on role
  // viewer: hide all write actions in topbar
  if (role === 'viewer') {
    const exportBtn = document.querySelector('[onclick="App.exportData()"]');
    const resetBtn  = document.getElementById('reset-btn');
    if (exportBtn) exportBtn.style.display = 'none';
    if (resetBtn)  resetBtn.style.display  = 'none';
  }
}

// Logout handler
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await API.post('/auth/logout');
      window.location.href = '/login';
    });
  }
  // Load session on start (before router init)
  loadSession();
});

// ── Override refreshStatus to pass role to sidebar ──
const _origRefreshStatus = refreshStatus;
// refreshStatus now also updates nav counts — already done. We patch updateSidebarStatus
// to also ensure role UI is applied after each refresh:
const _origUpdateSidebarStatus = updateSidebarStatus;
window.updateSidebarStatus = function(d) {
  _origUpdateSidebarStatus(d);
  if (d.current_user) {
    SESSION.user = d.current_user;
    applyRoleUI(d.current_user.role, d.current_user.display_name || d.current_user.username);
  }
};

// ── Role guard helper for pages ──
function requireRole(...roles) {
  if (!SESSION.user) return false;
  return roles.includes(SESSION.user.role);
}

function renderAccessDenied(action) {
  render(`
    <div class="access-denied">
      <div class="access-denied-icon"><i class="fa-solid fa-ban"></i></div>
      <h3>Access Restricted</h3>
      <p>Your current role (<strong>${SESSION.user?.role || 'viewer'}</strong>) does not have permission to ${action}.<br>
      Contact your administrator to request elevated access.</p>
    </div>`);
}

// ══════════════════════════════════════════════════════
//  PAGE: USER MANAGEMENT (admin only)
// ══════════════════════════════════════════════════════

Router.register('users', async () => {
  if (!requireRole('admin')) {
    renderAccessDenied('manage users');
    return;
  }

  const r = await API.get('/users');
  const users = r.data || [];

  const roleHTML = (role) => {
    const cls = { admin: 'role-admin', editor: 'role-editor', viewer: 'role-viewer' }[role] || '';
    const icon = { admin: 'fa-user-shield', editor: 'fa-pen-ruler', viewer: 'fa-eye' }[role] || 'fa-user';
    return `<span class="role-badge ${cls}"><i class="fa-solid ${icon}"></i> ${role}</span>`;
  };

  const statusHTML = (active) => active !== false
    ? `<span class="status-chip chip-active"><i class="fa-solid fa-circle" style="font-size:.5rem"></i> Active</span>`
    : `<span class="status-chip chip-inactive"><i class="fa-solid fa-circle" style="font-size:.5rem"></i> Inactive</span>`;

  render(`
    <div class="page-header">
      <div class="page-title-wrap">
        <div class="page-title"><i class="fa-solid fa-users-gear"></i> User Management
          <small>Control access and roles for all system users</small>
        </div>
      </div>
      <div class="page-actions">
        <button class="btn btn-accent" onclick="Users.showCreate()">
          <i class="fa-solid fa-user-plus"></i> Add User
        </button>
        <button class="btn btn-ghost btn-sm" onclick="Users.showChangePassword()">
          <i class="fa-solid fa-key"></i> Change My Password
        </button>
      </div>
    </div>

    <!-- Role permissions reference -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px">
      <div class="panel" style="margin:0">
        <div class="panel-header" style="padding:10px 16px">
          <div class="panel-title"><i class="fa-solid fa-user-shield" style="color:var(--accent)"></i> Admin</div>
        </div>
        <div class="panel-body" style="padding:12px 16px;font-size:.75rem;color:var(--txt2)">
          Full access to all features, user management, system reset, and configuration.
        </div>
      </div>
      <div class="panel" style="margin:0">
        <div class="panel-header" style="padding:10px 16px">
          <div class="panel-title"><i class="fa-solid fa-pen-ruler" style="color:var(--amber)"></i> Editor</div>
        </div>
        <div class="panel-body" style="padding:12px 16px;font-size:.75rem;color:var(--txt2)">
          Can manage devices, mappings, tags, import data, generate code, and backups. Cannot create Meter Models or Function Blocks.
        </div>
      </div>
      <div class="panel" style="margin:0">
        <div class="panel-header" style="padding:10px 16px">
          <div class="panel-title"><i class="fa-solid fa-eye" style="color:var(--green)"></i> Viewer</div>
        </div>
        <div class="panel-body" style="padding:12px 16px;font-size:.75rem;color:var(--txt2)">
          Read-only access to all data and configuration. Cannot make any changes.
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="fa-solid fa-users"></i> System Users <span class="badge">${users.length}</span></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th><i class="fa-solid fa-user"></i> User</th>
              <th><i class="fa-solid fa-id-badge"></i> Display Name</th>
              <th><i class="fa-solid fa-shield"></i> Role</th>
              <th><i class="fa-solid fa-circle-dot"></i> Status</th>
              <th><i class="fa-solid fa-clock"></i> Created</th>
              <th><i class="fa-solid fa-sliders"></i> Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--txt3);padding:24px">No users found</td></tr>` :
              users.map(u => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:30px;height:30px;border-radius:7px;background:linear-gradient(135deg,var(--accent),var(--amber));
                                  display:flex;align-items:center;justify-content:center;font-family:var(--font-hd);
                                  font-size:.8rem;font-weight:700;color:#000;flex-shrink:0">
                        ${(u.display_name || u.username)[0].toUpperCase()}
                      </div>
                      <span class="mono">${u.username}</span>
                      ${u.id === SESSION.user?.id ? '<span class="tag tag-ok" style="font-size:.6rem">You</span>' : ''}
                    </div>
                  </td>
                  <td>${u.display_name || '—'}</td>
                  <td>${roleHTML(u.role)}</td>
                  <td>${statusHTML(u.active)}</td>
                  <td class="muted" style="font-size:.72rem">${fmtDate(u.created_at)}</td>
                  <td>
                    <div class="user-actions">
                      <button class="btn btn-xs btn-ghost btn-icon" onclick="Users.showEdit('${u.id}')" title="Edit user">
                        <i class="fa-solid fa-pen-to-square"></i>
                      </button>
                      ${u.id !== SESSION.user?.id ? `
                        <button class="btn btn-xs btn-danger btn-icon" onclick="Users.del('${u.id}','${u.username}')" title="Delete user">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);
});

// ── Users CRUD ──
const Users = {
  _all: [],

  showCreate() {
    Modal.open('Add New User', `
      <div class="form-grid cols-2">
        <div class="form-field">
          <label><i class="fa-solid fa-user"></i> Username <span class="req">*</span></label>
          <input id="u-username" class="mono" placeholder="e.g. john_doe" />
        </div>
        <div class="form-field">
          <label><i class="fa-solid fa-id-badge"></i> Display Name</label>
          <input id="u-displayname" placeholder="e.g. John Doe" />
        </div>
        <div class="form-field">
          <label><i class="fa-solid fa-lock"></i> Password <span class="req">*</span></label>
          <input id="u-password" type="password" placeholder="Min 6 characters" />
          <div class="pw-strength"><div class="pw-strength-bar" id="pw-strength-bar"></div></div>
          <div class="form-hint" id="pw-hint"></div>
        </div>
        <div class="form-field">
          <label><i class="fa-solid fa-shield"></i> Role <span class="req">*</span></label>
          <select id="u-role">
            <option value="viewer">Viewer — Read Only</option>
            <option value="editor">Editor — Can Edit & Generate</option>
            <option value="admin">Admin — Full Access</option>
          </select>
        </div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()"><i class="fa-solid fa-ban"></i> Cancel</button>
       <button class="btn btn-accent" onclick="Users.create()"><i class="fa-solid fa-user-plus"></i> Create User</button>`
    );
    // Password strength meter
    document.getElementById('u-password')?.addEventListener('input', Users._pwStrength);
  },

  _pwStrength(e) {
    const pw = e.target.value;
    const bar = document.getElementById('pw-strength-bar');
    const hint = document.getElementById('pw-hint');
    if (!bar) return;
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const colors = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--green)', 'var(--green)'];
    const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
    bar.style.width = `${(score / 5) * 100}%`;
    bar.style.background = colors[score] || 'var(--red)';
    if (hint) { hint.textContent = pw ? labels[score] : ''; hint.style.color = colors[score]; }
  },

  async create() {
    const username    = document.getElementById('u-username')?.value.trim();
    const displayName = document.getElementById('u-displayname')?.value.trim();
    const password    = document.getElementById('u-password')?.value;
    const role        = document.getElementById('u-role')?.value;
    if (!username || !password) { Toast.err('Required', 'Username and password are required'); return; }
    const r = await API.post('/users', { username, display_name: displayName, password, role });
    if (r.status === 'success') {
      Toast.ok('User Created', `${username} has been added as ${role}`);
      Modal.close();
      Router.navigate('users');
    } else Toast.err('Error', r.message);
  },

  showEdit(userId) {
    API.get('/users').then(r => {
      const user = (r.data || []).find(u => u.id === userId);
      if (!user) return;
      const isSelf = user.id === SESSION.user?.id;
      Modal.open(`Edit User — ${user.username}`, `
        <div class="form-grid cols-2">
          <div class="form-field">
            <label><i class="fa-solid fa-user"></i> Username</label>
            <input value="${user.username}" disabled style="opacity:.5" />
            <div class="form-hint">Username cannot be changed</div>
          </div>
          <div class="form-field">
            <label><i class="fa-solid fa-id-badge"></i> Display Name</label>
            <input id="eu-displayname" value="${user.display_name || ''}" placeholder="Display name" />
          </div>
          <div class="form-field">
            <label><i class="fa-solid fa-shield"></i> Role</label>
            <select id="eu-role" ${isSelf ? 'disabled style="opacity:.5"' : ''}>
              <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer — Read Only</option>
              <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor — Can Edit & Generate</option>
              <option value="admin"  ${user.role === 'admin'  ? 'selected' : ''}>Admin — Full Access</option>
            </select>
            ${isSelf ? '<div class="form-hint">Cannot change your own role</div>' : ''}
          </div>
          <div class="form-field">
            <label><i class="fa-solid fa-circle-dot"></i> Status</label>
            <select id="eu-active" ${isSelf ? 'disabled style="opacity:.5"' : ''}>
              <option value="true" ${user.active !== false ? 'selected' : ''}>Active</option>
              <option value="false" ${user.active === false ? 'selected' : ''}>Inactive</option>
            </select>
          </div>
          <div class="form-field span-2">
            <label><i class="fa-solid fa-lock"></i> New Password <span style="color:var(--txt3);font-weight:400">(leave blank to keep current)</span></label>
            <input id="eu-password" type="password" placeholder="Leave blank to keep current password" />
            <div class="pw-strength"><div class="pw-strength-bar" id="pw-strength-bar"></div></div>
          </div>
        </div>`,
        `<button class="btn btn-outline" onclick="Modal.close()"><i class="fa-solid fa-ban"></i> Cancel</button>
         <button class="btn btn-accent" onclick="Users.update('${userId}')"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>`
      );
      document.getElementById('eu-password')?.addEventListener('input', Users._pwStrength);
    });
  },

  async update(userId) {
    const body = {
      display_name: document.getElementById('eu-displayname')?.value.trim(),
      role:   document.getElementById('eu-role')?.value,
      active: document.getElementById('eu-active')?.value === 'true',
    };
    const pw = document.getElementById('eu-password')?.value;
    if (pw) body.password = pw;
    const r = await API.put(`/users/${userId}`, body);
    if (r.status === 'success') {
      Toast.ok('User Updated');
      Modal.close();
      Router.navigate('users');
    } else Toast.err('Error', r.message);
  },

  del(userId, username) {
    Modal.confirm(`Delete User — ${username}`,
      `Are you sure you want to permanently delete "${username}"? This cannot be undone.`,
      async () => {
        const r = await API.del(`/users/${userId}`);
        if (r.status === 'success') {
          Toast.ok('Deleted', `${username} has been removed`);
          Router.navigate('users');
        } else Toast.err('Error', r.message);
      }, true);
  },

  showChangePassword() {
    Modal.open('Change My Password', `
      <div class="form-grid">
        <div class="form-field">
          <label><i class="fa-solid fa-lock-open"></i> Current Password</label>
          <input id="cp-current" type="password" placeholder="Enter current password" />
        </div>
        <div class="form-field">
          <label><i class="fa-solid fa-lock"></i> New Password</label>
          <input id="cp-new" type="password" placeholder="Min 6 characters" />
          <div class="pw-strength"><div class="pw-strength-bar" id="pw-strength-bar"></div></div>
        </div>
        <div class="form-field">
          <label><i class="fa-solid fa-lock"></i> Confirm New Password</label>
          <input id="cp-confirm" type="password" placeholder="Repeat new password" />
        </div>
      </div>`,
      `<button class="btn btn-outline" onclick="Modal.close()"><i class="fa-solid fa-ban"></i> Cancel</button>
       <button class="btn btn-accent" onclick="Users.changePassword()"><i class="fa-solid fa-key"></i> Change Password</button>`
    );
    document.getElementById('cp-new')?.addEventListener('input', Users._pwStrength);
  },

  async changePassword() {
    const current = document.getElementById('cp-current')?.value;
    const newPw   = document.getElementById('cp-new')?.value;
    const confirm = document.getElementById('cp-confirm')?.value;
    if (!current || !newPw || !confirm) { Toast.warn('Fill all fields'); return; }
    if (newPw !== confirm) { Toast.err('Mismatch', 'New passwords do not match'); return; }
    if (newPw.length < 6) { Toast.err('Too Short', 'Password must be at least 6 characters'); return; }
    const r = await API.post('/auth/change-password', { current_password: current, new_password: newPw });
    if (r.status === 'success') {
      Toast.ok('Password Changed', 'Your password has been updated');
      Modal.close();
    } else Toast.err('Error', r.message);
  }
};
