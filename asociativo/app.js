// ============================================================
// DASHBOARD ASOCIATIVO — app.js
// Core: sesión (heredada del Hub), datos (Firestore), Drive API,
//       navegación, drawer, modales, helpers.
// Mismo proyecto Firebase (recircula360). Copiar firebase-init.js,
// styles.css e icons.js del dashboard ambiental sin cambios.
// ============================================================

const DOMAIN  = 'redesconrostro.org';
const DOMINIO_VISUALIZADOR = 'cbc.co'; // Tesalia (CBC): acceso Visualizador (solo lectura)
const HUB_URL = 'https://recircula.redesconrostro.org';

// Carpetas raíz de Drive (ya creadas). Las subcarpetas se crean automáticamente.
const DRIVE_PARENTS = {
  asociaciones: '1K2Px_ml8uiniHDnf-PSLrGbSPoMMRBFe', // "Documento General"
  diagnosticos: '18Atpvu84E0Pk4jl0jfepgRCDVLaOZD1K', // "Diagnósticos"
  encuentros:   '13Z4ysWFJWt0xep5r_OHh9IP1260Wj7M7', // "Encuentros"
};

let SESSION = null;

// Colecciones en memoria.
// asocAmbiente = colección asoc_ambiental (fuente de los desplegables: id, nombre, provincia)
let CAT = {
  asocAmbiente: [],
  asociaciones: [],   // Asoc_Asociativo  (la ficha)
  diagnosticos: [],   // Diagnosticos
  encuentros:   [],   // Encuentros
};

// ============================================================
// HELPERS FIRESTORE (sobre window.fb)
// ============================================================

function fsCol(nombre) { return window.fb.collection(window.fb.db, nombre); }
function fsDoc(nombre, id) { return window.fb.doc(window.fb.db, nombre, id); }

async function fsGetAll(nombre) {
  const snap = await window.fb.getDocs(fsCol(nombre));
  return snap.docs.map(function (d) { return Object.assign({ _docId: d.id }, d.data()); });
}

// ============================================================
// PERMISOS POR ROL
// ============================================================

// Solo Admin y Editor pueden crear/editar/eliminar.
// Visualizador (incluye Tesalia/CBC) es solo lectura.
function puedeEditar() {
  return !!(SESSION && (SESSION.rol === 'Admin' || SESSION.rol === 'Editor'));
}

// Escritura tolerante a offline (Firestore encola con su persistencia nativa).
async function fsWrite(opFactory) {
  // Guard central: ninguna escritura procede si el usuario es solo lectura.
  if (!puedeEditar()) {
    if (typeof showToast === 'function') showToast('Solo lectura: no tienes permiso para esta accion');
    return { ok: false, error: 'sin_permiso' };
  }
  if (!navigator.onLine) {
    try { opFactory(); } catch (e) { console.warn(e); }
    return { ok: true, offline: true };
  }
  try { await opFactory(); return { ok: true }; }
  catch (e) { console.error(e); return { ok: false, error: e.message }; }
}

function byNombre(a, b) { return (a.nombre || '').localeCompare(b.nombre || ''); }

function nuevoId(prefijo) {
  return prefijo + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

// ============================================================
// DIAGNÓSTICO — cálculos automáticos
// ============================================================

// Categoría según la valoración total (0–100).
// Líderes ≥ 90 (100–90) · Fortalecimiento 80–89 · Acompañamiento ≤ 79
function categoriaDesdePuntaje(v) {
  if (v == null || isNaN(v)) return '';
  if (v >= 90) return 'Líderes de ReCircula';
  if (v >= 80) return 'En Fortalecimiento';
  return 'En Acompañamiento';
}

// Promedio de los 5 módulos + módulo más débil + categoría.
function calcDiagnostico(p) {
  const modulos = ['Organizacional', 'Productivo', 'Empresarial', 'Ambiental', 'Financiero'];
  const vals = [p.organizacional, p.productivo, p.empresarial, p.ambiental, p.financiero]
    .map(function (x) { return parseFloat(x) || 0; });
  const total = vals.reduce(function (a, b) { return a + b; }, 0) / 5;
  let minIdx = 0;
  vals.forEach(function (v, i) { if (v < vals[minIdx]) minIdx = i; });
  return { total: +total.toFixed(2), debil: modulos[minIdx], categoria: categoriaDesdePuntaje(+total.toFixed(2)) };
}

// Categoría vigente de una asociación = la de su diagnóstico más reciente
// (mayor año; a igual año, Cierre tiene prioridad sobre Inicial).
function categoriaVigente(idAsociacion) {
  const ds = CAT.diagnosticos.filter(function (d) { return d.id_asociacion === idAsociacion; });
  if (!ds.length) return '';
  ds.sort(function (a, b) {
    const ay = parseFloat(a.anio) || 0, by = parseFloat(b.anio) || 0;
    if (by !== ay) return by - ay;
    const rank = function (t) { return t === 'Cierre' ? 1 : 0; };
    return rank(b.tipo) - rank(a.tipo);
  });
  // Se recalcula desde la valoración para que los nuevos umbrales apliquen
  // también a registros guardados con umbrales anteriores.
  return categoriaDesdePuntaje(parseFloat(ds[0].valoracion_total));
}

// ============================================================
// TRADUCTORES Firestore ⇄ objeto en memoria (claves = campos FS)
// ============================================================

function asocAmbienteFromFS(d) {
  return {
    _docId: d._docId,
    id_asociacion: d.id_asociacion || '',
    nombre:        d.nombre || '',
    provincia:     d.provincia || '',
  };
}

function asociacionFromFS(d) {
  return {
    _docId: d._docId,
    id_asociacion:   d.id_asociacion || '',
    nombre:          d.nombre || '',
    provincia:       d.provincia || '',
    num_recicladores:d.num_recicladores || 0,
    documentos:      (d.documentos && typeof d.documentos === 'object') ? d.documentos : {},
    observaciones:   d.observaciones || '',
    id_carpeta_drive:d.id_carpeta_drive || '',
  };
}
function asociacionToFS(o) {
  return {
    id_asociacion:   o.id_asociacion || '',
    nombre:          o.nombre || '',
    provincia:       o.provincia || '',
    num_recicladores:parseFloat(o.num_recicladores) || 0,
    documentos:      (o.documentos && typeof o.documentos === 'object') ? o.documentos : {},
    observaciones:   o.observaciones || '',
    id_carpeta_drive:o.id_carpeta_drive || '',
  };
}

function diagnosticoFromFS(d) {
  return {
    _docId: d._docId,
    id_diagnostico:  d.id_diagnostico || '',
    id_asociacion:   d.id_asociacion || '',
    nombre:          d.nombre || '',
    provincia:       d.provincia || '',
    anio:            d.anio || '',
    tipo:            d.tipo || '',
    p_organizacional:d.p_organizacional || 0,
    p_productivo:    d.p_productivo || 0,
    p_empresarial:   d.p_empresarial || 0,
    p_ambiental:     d.p_ambiental || 0,
    p_financiero:    d.p_financiero || 0,
    valoracion_total:d.valoracion_total || 0,
    modulo_debil:    d.modulo_debil || '',
    categoria:       d.categoria || '',
    observaciones:   d.observaciones || '',
    documentos:      (d.documentos && typeof d.documentos === 'object') ? d.documentos : {},
    id_carpeta_drive:d.id_carpeta_drive || '',
  };
}
function diagnosticoToFS(o) {
  const c = calcDiagnostico({
    organizacional: o.p_organizacional, productivo: o.p_productivo,
    empresarial: o.p_empresarial, ambiental: o.p_ambiental, financiero: o.p_financiero,
  });
  return {
    id_diagnostico:  o.id_diagnostico || '',
    id_asociacion:   o.id_asociacion || '',
    nombre:          o.nombre || '',
    provincia:       o.provincia || '',
    anio:            parseFloat(o.anio) || 0,
    tipo:            o.tipo || '',
    p_organizacional:parseFloat(o.p_organizacional) || 0,
    p_productivo:    parseFloat(o.p_productivo) || 0,
    p_empresarial:   parseFloat(o.p_empresarial) || 0,
    p_ambiental:     parseFloat(o.p_ambiental) || 0,
    p_financiero:    parseFloat(o.p_financiero) || 0,
    valoracion_total:c.total,
    modulo_debil:    c.debil,
    categoria:       c.categoria,
    observaciones:   o.observaciones || '',
    documentos:      (o.documentos && typeof o.documentos === 'object') ? o.documentos : {},
    id_carpeta_drive:o.id_carpeta_drive || '',
  };
}

function encuentroFromFS(d) {
  return {
    _docId: d._docId,
    id_encuentro:    d.id_encuentro || '',
    id_asociacion:   d.id_asociacion || '',
    nombre_asociacion:d.nombre_asociacion || '',
    nombre_encuentro:d.nombre_encuentro || '',
    provincia:       d.provincia || '',
    fecha_encuentro: d.fecha_encuentro || '',
    hora_inicio:     d.hora_inicio || '',
    hora_fin:        d.hora_fin || '',
    tipo_encuentro:  d.tipo_encuentro || '',
    num_asistentes:  d.num_asistentes || 0,
    invitados:       d.invitados || '',
    resultados:      d.resultados || '',
    documentos:      (d.documentos && typeof d.documentos === 'object') ? d.documentos : {},
    id_carpeta_drive:d.id_carpeta_drive || '',
  };
}
function encuentroToFS(o) {
  return {
    id_encuentro:    o.id_encuentro || '',
    id_asociacion:   o.id_asociacion || '',
    nombre_asociacion:o.nombre_asociacion || '',
    nombre_encuentro:o.nombre_encuentro || '',
    provincia:       o.provincia || '',
    fecha_encuentro: o.fecha_encuentro || '',
    hora_inicio:     o.hora_inicio || '',
    hora_fin:        o.hora_fin || '',
    tipo_encuentro:  o.tipo_encuentro || '',
    num_asistentes:  parseFloat(o.num_asistentes) || 0,
    invitados:       o.invitados || '',
    resultados:      o.resultados || '',
    documentos:      (o.documentos && typeof o.documentos === 'object') ? o.documentos : {},
    id_carpeta_drive:o.id_carpeta_drive || '',
  };
}

// ============================================================
// DRIVE API (REST) — token OAuth heredado del Hub
// Soporta Mi unidad y Unidades compartidas (supportsAllDrives).
// ============================================================

// Devuelve el token de Drive si existe y no expiró; null en caso contrario.
function driveToken() {
  const t = sessionStorage.getItem('rcr_token');
  if (!t) return null;
  const exp = parseInt(sessionStorage.getItem('rcr_token_exp'), 10);
  if (exp && Date.now() > exp) return null;
  return t;
}

function driveDisponible() { return !!driveToken(); }

function urlCarpeta(id) { return id ? ('https://drive.google.com/drive/folders/' + id) : ''; }

// Busca una carpeta por nombre dentro de un padre. Devuelve su id o null.
async function driveBuscarCarpeta(nombre, parentId, token) {
  const q = "name='" + String(nombre).replace(/'/g, "\\'") + "' and '" + parentId +
            "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
              '&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Drive búsqueda ' + r.status);
  const j = await r.json();
  return (j.files && j.files[0]) ? j.files[0].id : null;
}

// Crea una carpeta y devuelve su id.
async function driveCrearCarpeta(nombre, parentId, token) {
  const url = 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true';
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  if (!r.ok) throw new Error('Drive crear ' + r.status);
  const j = await r.json();
  return j.id;
}

// Busca y, si no existe, crea. Devuelve el id de la carpeta.
async function driveBuscarOCrear(nombre, parentId, token) {
  const found = await driveBuscarCarpeta(nombre, parentId, token);
  return found || await driveCrearCarpeta(nombre, parentId, token);
}

// Envía la carpeta a la papelera (reversible). No la borra de forma permanente.
async function driveEliminarCarpeta(folderId, token) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + folderId + '?supportsAllDrives=true';
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!r.ok) throw new Error('Drive papelera ' + r.status);
  return true;
}

// Sube un archivo (Blob) a una carpeta de Drive. Devuelve {id, webViewLink}.
async function driveSubirArchivo(blob, filename, parentId, token) {
  const meta = { name: filename, parents: [parentId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob, filename);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
    { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  if (!r.ok) throw new Error('Drive subida ' + r.status);
  return await r.json();
}

// ============================================================
// SESIÓN (heredada del Hub)
// ============================================================

async function establecerSesion(user) {
  const s = sessionStorage.getItem('rcr_session');
  if (s) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && parsed.rol) { SESSION = parsed; return true; }
    } catch (e) {}
  }
  // Tesalia (CBC): Visualizador automatico aunque no esté en Usuarios.
  const emailLower = (user.email || '').toLowerCase();
  if (emailLower.endsWith('@' + DOMINIO_VISUALIZADOR)) {
    SESSION = { nombre: user.displayName || 'Tesalia', email: emailLower, rol: 'Visualizador', externo: true };
    sessionStorage.setItem('rcr_session', JSON.stringify(SESSION));
    return true;
  }
  try {
    const snap = await window.fb.getDocs(
      window.fb.query(fsCol('Usuarios'), window.fb.where('email', '==', user.email))
    );
    if (snap.empty) return false;
    const u = snap.docs[0].data();
    SESSION = { nombre: u.nombre || user.displayName || 'Usuario', email: user.email, rol: u.rol || 'Visualizador' };
    sessionStorage.setItem('rcr_session', JSON.stringify(SESSION));
    return true;
  } catch (e) {
    console.error('establecerSesion:', e);
    return false;
  }
}

// Vuelve al Hub SIN cerrar sesión (se conserva el login).
function volverAlHub() { window.location.href = HUB_URL; }

// ============================================================
// CARGA DE DATOS
// ============================================================

async function cargarDatos() {
  try {
    const res = await Promise.all([
      fsGetAll('Asoc_Ambiente'),
      fsGetAll('Asoc_Asociativo'),
      fsGetAll('Diagnosticos'),
      fsGetAll('Encuentros'),
    ]);
    CAT.asocAmbiente = res[0].map(asocAmbienteFromFS).sort(byNombre);
    CAT.asociaciones = res[1].map(asociacionFromFS).sort(byNombre);
    CAT.diagnosticos = res[2].map(diagnosticoFromFS);
    CAT.encuentros   = res[3].map(encuentroFromFS);
    console.log('[Asociativo] datos:', {
      asocAmbiente: CAT.asocAmbiente.length, asociaciones: CAT.asociaciones.length,
      diagnosticos: CAT.diagnosticos.length, encuentros: CAT.encuentros.length,
      driveToken: driveDisponible() ? 'presente' : 'ausente/expirado',
    });
  } catch (e) {
    console.error('Error cargando datos:', e);
    showToast('Error al cargar datos');
  }
}

// Carga SheetJS bajo demanda para exportar a Excel.
async function cargarSheetJS() {
  if (window.XLSX) return;
  await new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ============================================================
// INICIAR APP
// ============================================================

async function iniciarApp() {
  await cargarDatos();
  mostrarApp();
  pintarIconos();
  navTo('home');
}

// Los íconos del bottom-nav van inline en index.html; aquí solo el cierre del drawer.
function pintarIconos() {
  const dc = document.querySelector('.filter-drawer-head .modal-close');
  if (dc && !dc.innerHTML.trim()) dc.innerHTML = icoHTML('close');
}

// ============================================================
// NAVEGACIÓN
// ============================================================

let CURRENT_SECTION = null;

function navTo(seccion) {
  CURRENT_SECTION = seccion;
  document.querySelectorAll('.bn-item').forEach(function (el) { el.classList.remove('active'); });
  const navEl = document.getElementById('nav-' + seccion);
  if (navEl) navEl.classList.add('active');

  closeFilterDrawer();
  document.getElementById('main-content').innerHTML = '';

  switch (seccion) {
    case 'home':         if (typeof renderHome === 'function')         renderHome();         break;
    case 'asociaciones': if (typeof renderAsociaciones === 'function') renderAsociaciones(); break;
    case 'diagnosticos': if (typeof renderDiagnosticos === 'function') renderDiagnosticos(); break;
    case 'encuentros':   if (typeof renderEncuentros === 'function')   renderEncuentros();   break;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// FILTER DRAWER — compartido entre pantallas
// ============================================================

const FILTER_CONFIGS = {};
function registerFilterConfig(scope, cfg) { FILTER_CONFIGS[scope] = cfg; }

let currentFilterScope = null;
let pendingFilters = {};
let _filterDrawerBtn = null;   // botón que abrió el popover (para anclarlo y no auto-cerrarlo)

function openFilterDrawer(scope, btn) {
  const cfg = FILTER_CONFIGS[scope];
  if (!cfg) return;
  currentFilterScope = scope;
  _filterDrawerBtn = btn || null;

  pendingFilters = {};
  cfg.sections.forEach(function (sec) {
    const v = cfg.getValue(sec.key);
    pendingFilters[sec.key] = Array.isArray(v) ? v.slice() : (v ? [v] : []);
  });

  document.getElementById('filter-drawer-body').innerHTML = _buildFilterBody(cfg);
  _refreshFilterCount();
  document.getElementById('filter-drawer').classList.add('open');
  if (_filterDrawerBtn) _posicionarFilterDrawer(_filterDrawerBtn);
}

// Cuerpo del popover: un grupo por sección con chips (o buscador).
function _buildFilterBody(cfg) {
  return cfg.sections.map(function (sec) {
    return '<div class="filter-group" data-key="' + sec.key + '">' +
      '<div class="filter-group-lbl">' + esc(sec.title) + '</div>' +
      renderFilterSection(sec) +
    '</div>';
  }).join('');
}

function _refreshFilterCount() {
  const cfg = FILTER_CONFIGS[currentFilterScope]; if (!cfg) return;
  let n = 0;
  cfg.sections.forEach(function (sec) {
    if (sec.noBadge) return;
    const v = pendingFilters[sec.key];
    const arr = Array.isArray(v) ? v : (v ? [v] : []);
    if (arr.filter(function (x) { return x && x !== '__ALL__'; }).length) n++;
  });
  const c = document.getElementById('filter-drawer-count');
  if (c) { c.textContent = n; c.style.display = n > 0 ? 'inline-flex' : 'none'; }
}

// Ancla el popover bajo el botón que lo abrió, con la colita apuntándolo.
function _posicionarFilterDrawer(btn) {
  const drawer = document.getElementById('filter-drawer');
  const surface = document.getElementById('filter-drawer-surface');
  const tail = document.getElementById('filter-drawer-tail');
  if (!drawer || !surface || !tail) return;
  const margin = 16;
  const r = btn.getBoundingClientRect();
  const surfaceW = Math.min(360, window.innerWidth - margin * 2);
  let left = Math.max(margin, Math.min(r.right - surfaceW, window.innerWidth - surfaceW - margin));
  let top = Math.min(r.bottom + 12, window.innerHeight - margin - 120);
  drawer.style.left = left + 'px';
  drawer.style.top = top + 'px';
  let tailLeft = Math.max(14, Math.min(r.left + r.width / 2 - left - 7, surfaceW - 28));
  tail.style.left = tailLeft + 'px';
}

window.addEventListener('scroll', function () {
  const drawer = document.getElementById('filter-drawer');
  if (drawer && drawer.classList.contains('open') && _filterDrawerBtn) _posicionarFilterDrawer(_filterDrawerBtn);
}, true);

document.addEventListener('click', function (e) {
  const drawer = document.getElementById('filter-drawer');
  if (!drawer || !drawer.classList.contains('open')) return;
  if (drawer.contains(e.target)) return;
  if (_filterDrawerBtn && (e.target === _filterDrawerBtn || _filterDrawerBtn.contains(e.target))) return;
  closeFilterDrawer();
});

function renderFilterSection(sec) {
  const current = pendingFilters[sec.key];
  const arr = Array.isArray(current) ? current : (current ? [current] : []);
  if (sec.type === 'search') {
    const txt = arr[0] || '';
    return '<div class="filter-search-box">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input type="text" class="filter-search" placeholder="' + esc(sec.placeholder || '') + '"' +
      ' value="' + esc(txt) + '"' +
      ' oninput="pendingFilters[\'' + sec.key + '\'] = this.value ? [this.value] : []; _refreshFilterCount();">' +
    '</div>';
  }
  if (sec.type === 'radio') {
    const opts = sec.options || [];
    const sel = arr[0] || sec.def || '';
    return '<div class="filter-chips">' + opts.map(function (o) {
      const val = typeof o === 'object' ? o.val : o;
      const lbl = typeof o === 'object' ? o.lbl : o;
      const on = val === sel ? ' on' : '';
      return '<button type="button" class="filter-chip' + on + '" data-val="' + esc(val) + '"' +
        ' onclick="toggleFilterRadioChip(\'' + jsEsc(sec.key) + '\',\'' + jsEsc(val) + '\', this)">' + esc(lbl) + '</button>';
    }).join('') + '</div>';
  }
  // 'options' → chips multi-select; sin ninguno activo = todos.
  const opts = sec.options || [];
  if (!opts.length) return '<div class="filter-empty">Sin opciones disponibles</div>';
  return '<div class="filter-chips">' + opts.map(function (o) {
    const val = typeof o === 'object' ? o.val : o;
    const lbl = typeof o === 'object' ? o.lbl : o;
    const on = arr.includes(val) ? ' on' : '';
    return '<button type="button" class="filter-chip' + on + '" data-val="' + esc(val) + '"' +
      ' onclick="toggleFilterChip(\'' + jsEsc(sec.key) + '\',\'' + jsEsc(val) + '\', this)">' + esc(lbl) + '</button>';
  }).join('') + '</div>';
}

function toggleFilterChip(key, val, el) {
  if (!Array.isArray(pendingFilters[key])) pendingFilters[key] = pendingFilters[key] ? [pendingFilters[key]] : [];
  let arr = pendingFilters[key].filter(function (v) { return v !== '__ALL__'; });
  const i = arr.indexOf(val);
  if (i === -1) arr.push(val); else arr.splice(i, 1);
  pendingFilters[key] = arr;
  if (el) el.classList.toggle('on');
  _refreshFilterCount();
}

// Chip de selección única (reemplaza los radios): activa uno y apaga los hermanos.
function toggleFilterRadioChip(key, val, el) {
  pendingFilters[key] = [val];
  if (el && el.parentElement) el.parentElement.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.toggle('on', c === el); });
  _refreshFilterCount();
}

function closeFilterDrawer() { const d = document.getElementById('filter-drawer'); if (d) d.classList.remove('open'); }

function applyFilters() {
  const cfg = FILTER_CONFIGS[currentFilterScope];
  if (!cfg) return;
  cfg.sections.forEach(function (sec) { cfg.setValue(sec.key, pendingFilters[sec.key] || []); });
  updateFilterBadge(currentFilterScope);
  if (cfg.apply) cfg.apply();
  closeFilterDrawer();
}

function clearFilters() {
  const cfg = FILTER_CONFIGS[currentFilterScope];
  if (!cfg) return;
  cfg.sections.forEach(function (sec) { pendingFilters[sec.key] = []; });
  document.getElementById('filter-drawer-body').innerHTML = _buildFilterBody(cfg);
  _refreshFilterCount();
}

function updateFilterBadge(scope) {
  const cfg = FILTER_CONFIGS[scope];
  if (!cfg) return;
  const badge = document.getElementById(cfg.badgeId);
  if (!badge) return;
  const count = cfg.sections.filter(function (sec) {
    if (sec.noBadge) return false;
    const v = cfg.getValue(sec.key);
    if (!Array.isArray(v)) return v && v.toString().trim() !== '' && v !== '__ALL__';
    return v.length > 0 && !v.includes('__ALL__');
  }).length;
  // Sin círculo naranja: el botón mismo se tiñe de índigo discreto.
  badge.style.display = 'none';
  const btn = badge.closest('.hdr-circle');
  if (btn) btn.classList.toggle('has-filters', count > 0);
}

function pasaFiltro(arr, val) {
  if (!Array.isArray(arr) || !arr.length) return true;
  if (arr.includes('__ALL__')) return true;
  return arr.includes(val);
}

// ============================================================
// UI HELPERS
// ============================================================

function mostrarLoading() {
  const l = document.getElementById('screen-loading'); if (l) l.classList.remove('hidden');
  const a = document.getElementById('screen-app');     if (a) a.classList.add('hidden');
}
function mostrarApp() {
  const l = document.getElementById('screen-loading'); if (l) l.classList.add('hidden');
  const a = document.getElementById('screen-app');     if (a) a.classList.remove('hidden');
}

function showToast(msg, dur) {
  dur = dur || 3500;
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (showToast._tid) clearTimeout(showToast._tid);
  showToast._tid = setTimeout(function () { t.classList.remove('show'); }, dur);
}

function abrirModal(html) {
  cerrarModal(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = html;
  overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrarModal(); });
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.modal-close').forEach(function (el) {
    if (!el.innerHTML.trim()) el.innerHTML = icoHTML('close');
  });
  setTimeout(function () {
    const first = overlay.querySelector('input:not([readonly]):not([type="file"]), select, textarea');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
  }, 60);
}

function cerrarModal(immediate) {
  const m = document.getElementById('modal-overlay');
  if (!m) return;
  if (immediate) { m.remove(); return; }
  m.classList.add('closing');
  setTimeout(function () { m.remove(); }, 200);
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    if (document.getElementById('modal-overlay')) cerrarModal();
    else if (document.querySelector('.filter-drawer.open')) closeFilterDrawer();
  }
});

// ============================================================
// FORMATEO
// ============================================================

function fmtNum(n, dec) {
  if (dec === undefined) dec = 0;
  if (n == null || isNaN(n)) return '—';
  return parseFloat(n).toLocaleString('es-EC', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtFecha(f) {
  if (!f) return '—';
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) {
    const p = f.substring(0, 10).split('-').map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2]);
    if (!isNaN(dt)) return dt.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const d = new Date(f);
  return isNaN(d) ? f : d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtFechaLarga(f) {
  if (!f) f = new Date();
  const d = typeof f === 'string' ? new Date(f) : f;
  if (isNaN(d)) return '';
  const s = d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsEsc(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\r?\n/g, '\\n');
}

function gradFromName(name) {
  const grads = [
    'linear-gradient(135deg,#33A8DE,#506CFF)',
    'linear-gradient(135deg,#18AE97,#0BC3FF)',
    'linear-gradient(135deg,#F5AD21,#9FDA60)',
    'linear-gradient(135deg,#F82D72,#FF85FF)',
    'linear-gradient(135deg,#FF751F,#FF376F)',
  ];
  const s = (name || '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return grads[h % grads.length];
}

// Badge de categoría con el color de marca correspondiente.
function categoriaBadge(cat) {
  const map = {
    'Líderes de ReCircula': 'badge-green',
    'En Fortalecimiento':   'badge-cyan',
    'En Acompañamiento':    'badge-warn',
  };
  if (!cat) return '<span class="badge badge-off">Sin diagnóstico</span>';
  return '<span class="badge ' + (map[cat] || 'badge-blue') + '">' + esc(cat) + '</span>';
}

// ============================================================
// INICIO — autenticación heredada + carga
// ============================================================

let APP_INICIADA = false;

window.addEventListener('load', async function () {
  if (!window.fb) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#555">No se pudo cargar Firebase. Revisá tu conexión e intentá de nuevo.</div>';
    return;
  }
  await window.fbReady;

  window.fb.onAuthStateChanged(window.fb.auth, async function (user) {
    var emailLower = (user && user.email) ? user.email.toLowerCase() : '';
    var dominioOk = emailLower.endsWith('@' + DOMAIN) || emailLower.endsWith('@' + DOMINIO_VISUALIZADOR);
    if (!user || !dominioOk) {
      window.location.href = HUB_URL;
      return;
    }
    if (APP_INICIADA) return;
    const ok = await establecerSesion(user);
    if (!ok) { window.location.href = HUB_URL; return; }
    APP_INICIADA = true;
    mostrarLoading();
    await iniciarApp();
  });
});
