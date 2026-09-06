// ============================================================
// DASHBOARD ASOCIATIVO — encuentros.js
// Encuentros: CRUD (con eliminar) + carpeta Drive
// (Encuentros > Asociación > Nombre del Encuentro).
// Al eliminar el registro se manda a papelera SOLO la carpeta del encuentro,
// no la de la asociación. Colección: Encuentros
// ============================================================

let ENC_FILTROS = { prov: [], asoc: [], tipo: [] };
let ENCUENTROS_DATA = [];

// Navegación de dos niveles (Nivel 1 = provincia → asociación; Nivel 2 = registro)
let ENC_VISTA = 'asociaciones';
let ENC_ASOC_SEL = null;

const TIPOS_ENCUENTRO = ['Reunión', 'Taller', 'Capacitación', 'Foro', 'Seminario', 'Otros'];

// Verificables (PDF) de la ficha del encuentro — 1 archivo cada uno
const ENC_DOCS = [
  { key: 'registro_asistencia',  lbl: 'Registro de asistencia', file: 'Registro_de_asistencia' },
  { key: 'registro_fotografico', lbl: 'Registro fotográfico',   file: 'Registro_fotografico' },
];
function _encDoc(e, key) { return (e && e.documentos && e.documentos[key]) ? e.documentos[key] : null; }
let _ENC_FORM = null;

// Color + ícono por tipo de encuentro
const ENC_TIPO_META = {
  'Reunión':      { color: '#506CFF', icon: 'users' },
  'Taller':       { color: '#7B5CFF', icon: 'leaf' },
  'Capacitación': { color: '#18AE97', icon: 'presentation' },
  'Foro':         { color: '#F5AD21', icon: 'chat' },
  'Seminario':    { color: '#F82D72', icon: 'star' },
  'Otros':        { color: '#0d9aa8', icon: 'calendar' },
};
function _encMeta(t) { return ENC_TIPO_META[t] || { color: '#7a7a8c', icon: 'calendar' }; }

// Fecha → partes (día, mes abreviado, año) y hora → formato AM/PM
const ENC_MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
function _encFechaPartes(f) {
  const s = String(f || '').substring(0, 10).split('-');
  if (s.length < 3) return null;
  const y = +s[0], m = +s[1], d = +s[2];
  if (!y || !m || !d) return null;
  return { d: d, mes: ENC_MESES[m - 1] || '', y: y, date: new Date(y, m - 1, d) };
}
function _fmtHora12(hhmm) {
  const p = String(hhmm || '').split(':');
  if (p.length < 2 || p[0] === '') return '';
  let h = parseInt(p[0], 10); const min = p[1];
  if (isNaN(h)) return '';
  const ap = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + min + ' ' + ap;
}
function _encRango(e) {
  const ini = _fmtHora12(e.hora_inicio), fin = _fmtHora12(e.hora_fin);
  if (ini && fin) return ini + ' – ' + fin;
  return ini || fin || '';
}

// Estadísticas para las tarjetas (Hoy / Esta semana / Este mes / Total asistentes)
function _encStats(data) {
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (now.getDay() + 6) % 7;               // lunes = 0
  const wk = new Date(t0); wk.setDate(t0.getDate() - dow);
  const wkEnd = new Date(wk); wkEnd.setDate(wk.getDate() + 7);
  let hoy = 0, sem = 0, mes = 0, asist = 0;
  data.forEach(function (e) {
    asist += parseFloat(e.num_asistentes) || 0;
    const p = _encFechaPartes(e.fecha_encuentro); if (!p) return;
    const dt = p.date;
    if (dt.getTime() === t0.getTime()) hoy++;
    if (dt >= wk && dt < wkEnd) sem++;
    if (dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()) mes++;
  });
  return { hoy: hoy, sem: sem, mes: mes, asist: asist };
}

function registerEncuentrosFilters() {
  registerFilterConfig('encuentros', {
    badgeId: 'enc-filter-badge',
    sections: [
      { key: 'prov', title: 'Provincia',   type: 'options', options: _provinciasEnc() },
      { key: 'asoc', title: 'Asociación',  type: 'options', options: CAT.asocAmbiente.map(function (a) { return { val: a.id_asociacion, lbl: a.nombre }; }) },
      { key: 'tipo', title: 'Tipo de encuentro', type: 'options', options: TIPOS_ENCUENTRO },
    ],
    getValue: function (k) { return ENC_FILTROS[k] || []; },
    setValue: function (k, v) { ENC_FILTROS[k] = v; },
    apply: function () { cargarEncuentros(); },
  });
}

function _provinciasEnc() {
  return Array.from(new Set(CAT.encuentros.map(function (e) { return e.provincia; }).filter(Boolean))).sort();
}

function renderEncuentros() {
  ENC_VISTA = 'asociaciones';
  ENC_ASOC_SEL = null;
  renderVistaEncuentros();
}

function renderVistaEncuentros() {
  if (ENC_VISTA === 'lista' && ENC_ASOC_SEL) renderNivelListaEnc();
  else renderNivelAsociacionesEnc();
}

function abrirAsociacionEnc(idAsoc) { ENC_ASOC_SEL = idAsoc; ENC_VISTA = 'lista'; renderVistaEncuentros(); }
function volverAsociacionesEnc() { ENC_VISTA = 'asociaciones'; ENC_ASOC_SEL = null; renderVistaEncuentros(); }

// N° de encuentros de una asociación
function _encCount(idAsoc) {
  return (CAT.encuentros || []).filter(function (e) { return e.id_asociacion === idAsoc; }).length;
}

// ── Nivel 1: carpetas 3D por provincia (mismo formato que Asociaciones) ──
function renderNivelAsociacionesEnc() {
  const add = puedeEditar();
  document.getElementById('main-content').innerHTML =
    '<div class="page-header">' +
      '<div><div class="page-title">Encuentros</div><div class="page-sub">Elegí una asociación</div></div>' +
      '<div class="hdr-actions">' +
        '<button class="hdr-circle" onclick="exportarEncuentrosExcel()" title="Descargar Excel">' + icoHTML('download') + '</button>' +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormEncuentro()" title="Nuevo encuentro">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="enc-n1-wrap"></div>';

  // Datos para exportar "todo" desde este nivel
  ENCUENTROS_DATA = (CAT.encuentros || []).slice().sort(function (a, b) {
    return String(b.fecha_encuentro || '').localeCompare(String(a.fecha_encuentro || ''));
  });

  const wrap = document.getElementById('enc-n1-wrap');
  const asocs = CAT.asocAmbiente || [];
  if (!asocs.length) {
    wrap.innerHTML = '<div class="empty-state">' + icoHTML('users').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') + '<p>No hay asociaciones</p></div>';
    return;
  }
  const grupos = {};
  asocs.forEach(function (a) { const p = a.provincia || 'Sin provincia'; (grupos[p] = grupos[p] || []).push(a); });
  const provs = Object.keys(grupos).sort(function (a, b) { return a.localeCompare(b, 'es'); });

  const badge = function (a) {
    const n = _encCount(a.id_asociacion);
    const style = n > 0 ? 'color:#0a9e83;background:rgba(24,174,151,.14)' : 'color:var(--text-dim);background:rgba(0,0,0,.05)';
    return '<span class="asocf-badge" style="' + style + '">' + (n > 0 ? (n + ' encuentro' + (n !== 1 ? 's' : '')) : 'Sin encuentros') + '</span>';
  };

  wrap.innerHTML = '<div class="asocf-wrap">' + provs.map(function (prov) {
    const col = _provColorAsoc(prov);
    const lista = grupos[prov].slice().sort(function (a, b) { return (a.nombre || '').localeCompare(b.nombre || '', 'es'); });
    const carpetas = lista.map(function (a) {
      return '<div class="asocf-fold" onclick="abrirAsociacionEnc(\'' + jsEsc(a.id_asociacion) + '\')" title="' + esc(a.nombre || '') + '">' +
        _folder3D(col, 72) +
        '<span class="asocf-nom">' + esc(a.nombre || '—') + '</span>' +
        badge(a) +
      '</div>';
    }).join('');
    return '<div class="asocf-sec">' +
      '<div class="asocf-h">' +
        '<span class="asocf-dot" style="background:' + col + '"></span>' +
        '<span class="asocf-name" style="color:' + col + '">' + esc(prov) + '</span>' +
        '<span class="asocf-cnt">' + lista.length + ' asociaci' + (lista.length !== 1 ? 'ones' : 'ón') + '</span>' +
      '</div>' +
      '<div class="asocf-grid">' + carpetas + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

// ── Nivel 2: registro de la asociación (mismas filas de la imagen, en blanco, sin charts) ──
function renderNivelListaEnc() {
  const add = puedeEditar();
  const asoc = (CAT.asocAmbiente || []).find(function (a) { return a.id_asociacion === ENC_ASOC_SEL; });
  const nombre = asoc ? (asoc.nombre || '') : '';
  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
  document.getElementById('main-content').innerHTML =
    '<div class="page-header">' +
      '<div><div class="ent-title-row" style="display:flex;align-items:center;gap:12px">' +
        '<button class="ent-back" onclick="volverAsociacionesEnc()" title="Volver">' + BACK + '</button>' +
        '<div><div class="page-title">Encuentros</div><div class="page-sub">' + esc(nombre) + '</div></div>' +
      '</div></div>' +
      '<div class="hdr-actions">' +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormEncuentro()" title="Nuevo encuentro">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="enc-table-wrap"></div>';
  cargarEncuentros();
}

function _encStatCard(ico, color, num, lbl, sub) {
  return '<div class="enc-stat">' +
    '<span class="enc-stat-ico" style="background:' + _asocRgba(color, 0.12) + ';color:' + color + '">' + icoHTML(ico) + '</span>' +
    '<div class="enc-stat-tx"><span class="enc-stat-lbl">' + esc(lbl) + '</span>' +
      '<b class="enc-stat-num">' + num + '</b><span class="enc-stat-sub">' + esc(sub) + '</span></div>' +
  '</div>';
}

function cargarEncuentros() {
  ENCUENTROS_DATA = (CAT.encuentros || []).filter(function (e) {
    return e.id_asociacion === ENC_ASOC_SEL;
  }).slice().sort(function (a, b) {
    // Más reciente primero
    return String(b.fecha_encuentro || '').localeCompare(String(a.fecha_encuentro || ''));
  });
  renderTablaEncuentros();
}

function renderTablaEncuentros() {
  const wrap = document.getElementById('enc-table-wrap');
  if (!wrap) return;
  if (!ENCUENTROS_DATA.length) {
    wrap.innerHTML = '<div class="empty-state">' +
      icoHTML('calendar').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') +
      '<p>Esta asociación aún no tiene encuentros</p></div>';
    return;
  }
  const edit = puedeEditar();
  const CAL = icoHTML('calendar'), CLK = icoHTML('clock'), PIN = icoHTML('mapPin'), USR = icoHTML('users');

  const acciones = function (e) {
    const docId = jsEsc(e._docId || '');
    const carpeta = jsEsc(e.id_carpeta_drive || '');
    return '<button class="enc-act" onclick="verEncuentro(\'' + docId + '\')"><span class="enc-act-ico">' + icoHTML('view') + '</span>Ver</button>' +
      (edit ? '<button class="enc-act enc-act-edit" onclick="editarEncuentro(\'' + docId + '\')"><span class="enc-act-ico">' + icoHTML('edit') + '</span>Editar</button>' +
        '<button class="enc-act enc-act-del" onclick="confirmarEliminarEncuentro(\'' + docId + '\',\'' + carpeta + '\')"><span class="enc-act-ico">' + icoHTML('trash') + '</span>Eliminar</button>' : '');
  };

  const filas = ENCUENTROS_DATA.map(function (e) {
    const m = _encMeta(e.tipo_encuentro);
    const fp = _encFechaPartes(e.fecha_encuentro);
    const rango = _encRango(e);
    const fechaTxt = fp ? (String(fp.d).padStart(2, '0') + '/' + String(_encFechaPartes(e.fecha_encuentro).date.getMonth() + 1).padStart(2, '0') + '/' + fp.y) : '—';
    return '<div class="enc-row">' +
      '<div class="enc-date" style="color:' + m.color + '">' +
        (fp ? '<span class="enc-date-d">' + String(fp.d).padStart(2, '0') + '</span><span class="enc-date-m">' + fp.mes + '</span><span class="enc-date-y">' + fp.y + '</span>'
            : '<span class="enc-date-m">—</span>') +
      '</div>' +
      '<div class="enc-cardrow">' +
        '<span class="enc-cardrow-ico" style="background:' + _asocRgba(m.color, 0.12) + ';color:' + m.color + '">' + icoHTML(m.icon) + '</span>' +
        '<div class="enc-cardrow-main">' +
          '<div class="enc-cardrow-tit">' + esc(e.nombre_encuentro || '—') + '</div>' +
          '<div class="enc-cardrow-asoc">' + esc(e.nombre_asociacion || '—') + '</div>' +
          '<div class="enc-cardrow-meta">' +
            '<span class="enc-meta-it">' + PIN + esc(e.provincia || '—') + '</span>' +
            '<span class="enc-meta-it">' + USR + fmtNum(e.num_asistentes) + ' asistentes</span>' +
            '<span class="enc-tipo-chip" style="color:' + m.color + ';background:' + _asocRgba(m.color, 0.12) + '">' + esc(e.tipo_encuentro || '—') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="enc-cardrow-when">' +
          '<span class="enc-when-it">' + CAL + fechaTxt + '</span>' +
          (rango ? '<span class="enc-when-it">' + CLK + rango + '</span>' : '') +
        '</div>' +
        '<div class="enc-cardrow-acts">' + acciones(e) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  wrap.innerHTML = '<div class="enc-list">' + filas + '</div>' +
    '<div style="font-size:12px;color:var(--text-dim);text-align:center;margin-top:16px">' + ENCUENTROS_DATA.length + ' encuentro' + (ENCUENTROS_DATA.length !== 1 ? 's' : '') + '</div>';
}

function _tipoEncBadge(t) {
  const map = { 'Reunión': 'badge-blue', 'Taller': 'badge-green', 'Capacitación': 'badge-cyan', 'Foro': 'badge-warn', 'Seminario': 'badge-nivel-3', 'Otros': 'badge-off' };
  return '<span class="badge ' + (map[t] || 'badge-off') + '">' + esc(t || '—') + '</span>';
}

// ── Ver ficha ──
function verEncuentro(docId) {
  const e = CAT.encuentros.find(function (x) { return x._docId === docId; });
  if (!e) { showToast('Encuentro no encontrado'); return; }
  const rango = _encRango(e);
  const docChips = ENC_DOCS.map(function (dd) {
    const f = _encDoc(e, dd.key);
    return (f && f.url)
      ? '<a class="asoc-doc-chip" href="' + esc(f.url) + '" target="_blank" rel="noopener">' + icoHTML('view') + ' ' + esc(dd.lbl) + '</a>'
      : '<span class="asoc-doc-chip asoc-doc-chip-off">' + icoHTML('close') + ' ' + esc(dd.lbl) + '</span>';
  }).join('');
  const m = _encMeta(e.tipo_encuentro);
  abrirModal(
    '<div class="modal">' +
      '<div class="modal-head"><div><div class="modal-title">' + esc(e.nombre_encuentro || 'Encuentro') + '</div>' +
        '<div class="modal-sub">' + esc(e.nombre_asociacion || '—') + ' · ' + fmtFecha(e.fecha_encuentro) + (rango ? ' · ' + esc(rango) : '') + '</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="form-grid-2" style="margin-bottom:16px">' +
          '<div><div class="form-label">Provincia</div><div style="font-size:14px">' + esc(e.provincia || '—') + '</div></div>' +
          '<div><div class="form-label">Tipo</div><div style="margin-top:4px"><span class="enc-tipo-chip" style="color:' + m.color + ';background:' + _asocRgba(m.color, 0.12) + '">' + esc(e.tipo_encuentro || '—') + '</span></div></div>' +
          '<div><div class="form-label">Horario</div><div style="font-size:14px;font-weight:600">' + (rango || '—') + '</div></div>' +
          '<div><div class="form-label">N° de asistentes</div><div style="font-size:18px;font-weight:700">' + fmtNum(e.num_asistentes) + '</div></div>' +
        '</div>' +
        '<div class="form-label" style="margin-bottom:8px">Verificables</div>' +
        '<div class="asoc-docs-ver">' + docChips + '</div>' +
        '<div style="margin-top:14px"><div class="form-label">Invitados</div><div style="font-size:13px;color:var(--text-muted);margin-top:4px">' + (e.invitados ? esc(e.invitados) : '—') + '</div></div>' +
        '<div style="margin-top:14px"><div class="form-label">Resultados</div><div style="font-size:13px;color:var(--text-muted);margin-top:4px">' + (e.resultados ? esc(e.resultados) : '—') + '</div></div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn btn-glass" onclick="cerrarModal()">Cerrar</button></div>' +
    '</div>'
  );
}

// ── Eliminar (manda a papelera SOLO la carpeta del encuentro) ──
function confirmarEliminarEncuentro(docId, folderId) {
  abrirModal(
    '<div class="modal" style="max-width:440px">' +
      '<div class="modal-head"><div class="modal-title">Eliminar encuentro</div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body"><p style="color:var(--text-muted);font-size:14px;line-height:1.6">' +
        '¿Seguro que quieres eliminar este encuentro? Se quitará el registro y su carpeta del encuentro se enviará a la papelera de Drive. La carpeta de la asociación se conserva.' +
      '</p></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        '<button class="btn btn-danger" onclick="eliminarEncuentro(\'' + jsEsc(docId) + '\',\'' + jsEsc(folderId) + '\')">Eliminar</button>' +
      '</div>' +
    '</div>'
  );
}

async function eliminarEncuentro(docId, folderId) {
  if (!docId) { showToast('No se encontró el encuentro'); return; }
  // Papelera de la subcarpeta del encuentro (no la de la asociación)
  if (folderId) {
    const tok = driveToken();
    if (tok) {
      try { await driveEliminarCarpeta(folderId, tok); }
      catch (e) { console.warn('Drive papelera encuentro:', e); }
    }
  }
  const r = await fsWrite(function () { return window.fb.deleteDoc(fsDoc('Encuentros', docId)); });
  if (!r.ok) { showToast('Error al eliminar: ' + (r.error || '')); return; }
  CAT.encuentros = CAT.encuentros.filter(function (x) { return x._docId !== docId; });
  showToast(r.offline ? 'Eliminado (se sincronizará) ✓' : 'Encuentro eliminado ✓');
  cerrarModal();
  renderVistaEncuentros();
}

// ── Formulario ──
function editarEncuentro(docId) { abrirFormEncuentro(docId); }

function abrirFormEncuentro(docId) {
  docId = docId || null;
  const e = docId ? CAT.encuentros.find(function (x) { return x._docId === docId; }) : null;
  const editing = !!e;

  _ENC_FORM = {
    docId: docId,
    documentos: JSON.parse(JSON.stringify((e && e.documentos) ? e.documentos : {})),
    eliminar: [],
  };

  // Preselección de asociación al crear desde el Nivel 2
  const preAsoc = (!editing && ENC_VISTA === 'lista' && ENC_ASOC_SEL) ? ENC_ASOC_SEL : '';
  const preAmb = preAsoc ? (CAT.asocAmbiente || []).find(function (a) { return a.id_asociacion === preAsoc; }) : null;

  const asocField = editing
    ? '<input type="text" class="form-input" value="' + esc(e.nombre_asociacion) + '" readonly>' +
      '<input type="hidden" id="enc-asoc" value="' + esc(e.id_asociacion) + '">'
    : (preAmb
        ? '<input type="text" class="form-input" value="' + esc(preAmb.nombre) + '" readonly>' +
          '<input type="hidden" id="enc-asoc" value="' + esc(preAsoc) + '">'
        : '<select class="form-select" id="enc-asoc" onchange="onAsocChangeEnc(this.value)">' +
            '<option value="">Seleccioná una asociación…</option>' + _asocOptions('') + '</select>');

  const tipoOpts = TIPOS_ENCUENTRO.map(function (t) {
    return '<option value="' + t + '"' + (e && e.tipo_encuentro === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  const hoy = new Date().toISOString().substring(0, 10);

  abrirModal(
    '<div class="modal">' +
      '<div class="modal-head"><div><div class="modal-title">' + (editing ? 'Editar' : 'Nuevo') + ' encuentro</div>' +
        '<div class="modal-sub">Taller / Reunión</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="form-grid-2">' +
          '<div class="form-group"><label class="form-label">Asociación</label>' + asocField + '</div>' +
          '<div class="form-group"><label class="form-label">Provincia</label><input type="text" class="form-input" id="enc-provincia" readonly value="' + esc(e ? e.provincia : (preAmb ? preAmb.provincia : '')) + '"></div>' +
          '<div class="form-group" style="grid-column:1/-1"><label class="form-label">Nombre del encuentro</label><input type="text" class="form-input" id="enc-nombre" placeholder="Ej. Taller de fortalecimiento" value="' + esc(e ? e.nombre_encuentro : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Fecha</label><input type="date" class="form-input" id="enc-fecha" value="' + (e && e.fecha_encuentro ? String(e.fecha_encuentro).substring(0, 10) : hoy) + '"></div>' +
          '<div class="form-group"><label class="form-label">Tipo de encuentro</label><select class="form-select" id="enc-tipo">' + tipoOpts + '</select></div>' +
          '<div class="form-group"><label class="form-label">Hora inicio</label><input type="time" class="form-input" id="enc-hora-ini" value="' + esc(e ? e.hora_inicio : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Hora fin</label><input type="time" class="form-input" id="enc-hora-fin" value="' + esc(e ? e.hora_fin : '') + '"></div>' +
          '<div class="form-group" style="grid-column:1/-1"><label class="form-label">N° de asistentes</label><input type="number" class="form-input" id="enc-asist" min="0" step="1" value="' + (e ? e.num_asistentes : '') + '"></div>' +
        '</div>' +
        '<div class="form-label" style="margin:16px 0 8px">Verificables (PDF)</div>' +
        '<div class="asoc-docs" id="enc-docs-cont"></div>' +
        '<div class="form-group" style="margin-top:14px"><label class="form-label">Invitados</label><textarea class="form-textarea" id="enc-invitados" placeholder="Nombres o entidades invitadas…">' + esc(e ? e.invitados : '') + '</textarea></div>' +
        '<div class="form-group" style="margin-top:14px"><label class="form-label">Resultados</label><textarea class="form-textarea" id="enc-resultados" placeholder="Resultados del encuentro…">' + esc(e ? e.resultados : '') + '</textarea></div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        (puedeEditar() ? '<button class="btn btn-primary" id="enc-save-btn" onclick="guardarEncuentro(' + (docId ? '\'' + jsEsc(docId) + '\'' : 'null') + ')">Guardar</button>' : '') +
      '</div>' +
    '</div>'
  );
  _renderEncDocs();
}

// Casillas de verificables (reutiliza estilos asoc-doc-*/asoc-f-*)
function _renderEncDocs() {
  const cont = document.getElementById('enc-docs-cont');
  if (!cont || !_ENC_FORM) return;
  cont.innerHTML = ENC_DOCS.map(function (dd) {
    const f = _ENC_FORM.documentos[dd.key];
    const fila = (f && (f.url || f.id))
      ? '<div class="asoc-f-list"><div class="asoc-f-row">' +
          '<span class="asoc-f-nom">' + esc(f.nombre || dd.lbl) + '</span>' +
          (f.url ? '<a class="asoc-f-ver" href="' + esc(f.url) + '" target="_blank" rel="noopener" title="Ver PDF">' + icoHTML('view') + '</a>' : '') +
          '<button type="button" class="asoc-f-del" onclick="_encQuitarArchivo(\'' + dd.key + '\')" title="Eliminar archivo">' + icoHTML('trash') + '</button>' +
        '</div></div>'
      : '';
    return '<div class="asoc-doc-item">' +
      '<div class="asoc-doc-cab"><span class="asoc-doc-lbl">' + esc(dd.lbl) + '</span></div>' + fila +
      '<label class="asoc-doc-add">' + icoHTML('cloudUp') + '<span>' + (f ? 'Reemplazar archivo' : 'Subir archivo') + '</span>' +
        '<input type="file" accept="application/pdf,.pdf" class="asoc-doc-file" id="enc-doc-' + dd.key + '" onchange="_encFileSel(this,\'' + dd.key + '\')"></label>' +
      '<div class="asoc-doc-pend" id="enc-pend-' + dd.key + '"></div>' +
    '</div>';
  }).join('');
}

function _encFileSel(input, key) {
  const cont = document.getElementById('enc-pend-' + key);
  if (!cont) return;
  const f = input.files && input.files[0] ? input.files[0] : null;
  cont.innerHTML = f ? '<div class="asoc-f-pend">' + icoHTML('check') + '<span>' + esc(f.name) + '</span><small>listo para subir al guardar</small></div>' : '';
}

function _encQuitarArchivo(key) {
  if (!_ENC_FORM) return;
  const f = _ENC_FORM.documentos[key];
  if (f && f.id) _ENC_FORM.eliminar.push(f.id);
  delete _ENC_FORM.documentos[key];
  _renderEncDocs();
}

function onAsocChangeEnc(idAsoc) {
  const amb = CAT.asocAmbiente.find(function (a) { return a.id_asociacion === idAsoc; });
  const prov = document.getElementById('enc-provincia');
  if (prov) prov.value = amb ? (amb.provincia || '') : '';
}

// ── Guardar ──
async function guardarEncuentro(docId) {
  const idAsoc = (document.getElementById('enc-asoc') || {}).value || '';
  if (!idAsoc) { showToast('Elegí una asociación'); return; }
  const nombre = ((document.getElementById('enc-nombre') || {}).value || '').trim();
  if (!nombre) { showToast('Indicá el nombre del encuentro'); return; }
  const fecha = (document.getElementById('enc-fecha') || {}).value || '';
  if (!fecha) { showToast('Indicá la fecha'); return; }
  const tipo = (document.getElementById('enc-tipo') || {}).value || '';
  if (!tipo) { showToast('Elegí el tipo de encuentro'); return; }

  const amb = CAT.asocAmbiente.find(function (a) { return a.id_asociacion === idAsoc; });
  const actual = docId ? CAT.encuentros.find(function (x) { return x._docId === docId; }) : null;
  const nombreAsoc = amb ? amb.nombre : (actual ? actual.nombre_asociacion : '');

  const o = {
    id_encuentro:    actual ? actual.id_encuentro : nuevoId('ENC'),
    id_asociacion:   idAsoc,
    nombre_asociacion:nombreAsoc,
    nombre_encuentro:nombre,
    provincia:       amb ? amb.provincia : (actual ? actual.provincia : ((document.getElementById('enc-provincia') || {}).value || '')),
    fecha_encuentro: fecha,
    hora_inicio:     (document.getElementById('enc-hora-ini') || {}).value || '',
    hora_fin:        (document.getElementById('enc-hora-fin') || {}).value || '',
    tipo_encuentro:  tipo,
    num_asistentes:  (document.getElementById('enc-asist') || {}).value || 0,
    invitados:       (document.getElementById('enc-invitados') || {}).value || '',
    resultados:      (document.getElementById('enc-resultados') || {}).value || '',
    documentos:      JSON.parse(JSON.stringify((_ENC_FORM && _ENC_FORM.documentos) ? _ENC_FORM.documentos : {})),
    id_carpeta_drive:(actual && actual.id_carpeta_drive) ? actual.id_carpeta_drive : '',
  };

  const btn = document.getElementById('enc-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  // Carpeta de Drive: Encuentros > <Asociación> > <Nombre del Encuentro>
  const tok = driveToken();
  if (!o.id_carpeta_drive) {
    if (tok) {
      try {
        const carpetaAsoc = await driveBuscarOCrear(nombreAsoc || idAsoc, DRIVE_PARENTS.encuentros, tok);
        o.id_carpeta_drive = await driveCrearCarpeta(nombre, carpetaAsoc, tok);
      } catch (e) { console.warn('Drive encuentro:', e); showToast('No se pudo crear la carpeta (se guarda igual)'); }
    } else {
      showToast('Sesión de Drive expirada: se guarda sin carpeta');
    }
  }

  // Subir verificables seleccionados (carpeta propia del encuentro, sin colisiones)
  const nuevos = ENC_DOCS.map(function (dd) {
    const el = document.getElementById('enc-doc-' + dd.key);
    const f = el && el.files && el.files[0] ? el.files[0] : null;
    return f ? { key: dd.key, file: dd.file, archivo: f } : null;
  }).filter(Boolean);
  const noPdf = nuevos.find(function (n) { return n.archivo.type !== 'application/pdf' && !/\.pdf$/i.test(n.archivo.name); });
  if (noPdf) { showToast('Solo se permiten archivos PDF'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }

  if (nuevos.length) {
    if (!tok) { showToast('Sesión de Drive expirada: no se subieron los PDFs'); }
    else if (!o.id_carpeta_drive) { showToast('Sin carpeta: no se subieron los PDFs'); }
    else {
      for (let i = 0; i < nuevos.length; i++) {
        const n = nuevos[i];
        if (btn) btn.textContent = 'Subiendo ' + (i + 1) + '/' + nuevos.length + '…';
        try {
          const fname = n.file + '.pdf';
          const prev = o.documentos[n.key];
          if (prev && prev.id) { try { await driveEliminarCarpeta(prev.id, tok); } catch (e) {} }
          const up = await driveSubirArchivo(n.archivo, fname, o.id_carpeta_drive, tok);
          o.documentos[n.key] = { id: up.id, url: up.webViewLink, nombre: fname };
        } catch (e) { console.warn('Subida verificable:', e); showToast('No se pudo subir ' + n.file); }
      }
    }
  }

  // Aplicar eliminaciones marcadas (a papelera)
  if (_ENC_FORM && _ENC_FORM.eliminar.length && tok) {
    for (let i = 0; i < _ENC_FORM.eliminar.length; i++) {
      try { await driveEliminarCarpeta(_ENC_FORM.eliminar[i], tok); } catch (e) { console.warn('Papelera verificable:', e); }
    }
  }

  const fs = encuentroToFS(o);
  let r;
  if (docId) {
    r = await fsWrite(function () { return window.fb.updateDoc(fsDoc('Encuentros', docId), fs); });
    if (r.ok) { const i = CAT.encuentros.findIndex(function (x) { return x._docId === docId; }); if (i >= 0) CAT.encuentros[i] = encuentroFromFS(Object.assign({ _docId: docId }, fs)); }
  } else {
    const ref = window.fb.doc(fsCol('Encuentros'));
    r = await fsWrite(function () { return window.fb.setDoc(ref, fs); });
    if (r.ok) CAT.encuentros.push(encuentroFromFS(Object.assign({ _docId: ref.id }, fs)));
  }

  if (!r.ok) { showToast('Error al guardar: ' + (r.error || '')); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }
  showToast(r.offline ? 'Guardado (se sincronizará) ✓' : 'Guardado ✓');
  cerrarModal();
  renderVistaEncuentros();
}

// ── Exportar Excel ──
async function exportarEncuentrosExcel() {
  if (!ENCUENTROS_DATA.length) { showToast('No hay datos para exportar.'); return; }
  try {
    await cargarSheetJS();
    if (!window.XLSX) { showToast('No se pudo cargar el exportador'); return; }
    const sino = function (e, key) { return _encDoc(e, key) ? 'Sí' : 'No'; };
    const header = ['Asociación', 'Encuentro', 'Provincia', 'Fecha', 'Horario', 'Tipo', 'N° Asistentes', 'Reg. asistencia', 'Reg. fotográfico', 'Invitados', 'Resultados'];
    const filas = ENCUENTROS_DATA.map(function (e) {
      return [e.nombre_asociacion, e.nombre_encuentro, e.provincia, (e.fecha_encuentro || '').substring(0, 10), _encRango(e) || '', e.tipo_encuentro,
        parseFloat(e.num_asistentes) || 0, sino(e, 'registro_asistencia'), sino(e, 'registro_fotografico'), e.invitados || '', e.resultados || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([header].concat(filas));
    ws['!cols'] = [{ wch: 24 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 16 }, { wch: 30 }, { wch: 36 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Encuentros');
    XLSX.writeFile(wb, 'Encuentros_' + new Date().toISOString().substring(0, 10) + '.xlsx');
    showToast('Excel descargado ✓');
  } catch (e) { console.error('export encuentros:', e); showToast('Error al exportar'); }
}

// ── Estilos propios (tarjetas móviles) ──
(function () {
  if (document.getElementById('enc-styles')) return;
  const s = document.createElement('style');
  s.id = 'enc-styles';
  s.textContent = `
    /* Tarjetas de estadísticas */
    .enc-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
    .enc-stat { display:flex; align-items:center; gap:14px; background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:16px 18px; }
    .enc-stat-ico { width:46px; height:46px; border-radius:13px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .enc-stat-ico svg { width:22px; height:22px; }
    .enc-stat-tx { display:flex; flex-direction:column; line-height:1.2; min-width:0; }
    .enc-stat-lbl { font-size:12px; color:var(--text-muted); font-weight:600; }
    .enc-stat-num { font-size:26px; font-weight:800; color:var(--text); }
    .enc-stat-sub { font-size:11px; color:var(--text-dim); }

    /* Nivel 2: botón volver */
    .ent-back { width:38px; height:38px; border-radius:11px; border:1px solid var(--border); background:var(--surface); color:var(--text-muted); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:background .15s,color .15s; }
    .ent-back:hover { background:var(--surface-hover); color:var(--text); }
    .ent-back svg { width:18px; height:18px; }

    /* Timeline de encuentros */
    .enc-list { display:flex; flex-direction:column; gap:16px; }
    .enc-row { display:flex; align-items:stretch; gap:18px; }
    .enc-date { width:64px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding-top:6px; }
    .enc-date-d { font-size:28px; font-weight:800; line-height:1; }
    .enc-date-m { font-size:12px; font-weight:800; letter-spacing:.5px; margin-top:2px; }
    .enc-date-y { font-size:11px; color:var(--text-dim); font-weight:600; margin-top:2px; }

    .enc-cardrow { flex:1; min-width:0; display:flex; align-items:center; gap:16px; background:var(--white); border:1px solid var(--border); border-radius:18px; padding:16px 20px; box-shadow:0 1px 3px rgba(0,0,0,.04),0 4px 14px rgba(0,0,0,.04); }
    .enc-cardrow-ico { width:52px; height:52px; border-radius:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .enc-cardrow-ico svg { width:24px; height:24px; }
    .enc-cardrow-main { flex:1; min-width:0; }
    .enc-cardrow-tit { font-size:17px; font-weight:800; color:var(--text); line-height:1.25; }
    .enc-cardrow-asoc { font-size:13px; color:var(--text-muted); margin-top:2px; }
    .enc-cardrow-meta { display:flex; align-items:center; gap:16px; margin-top:9px; flex-wrap:wrap; }
    .enc-meta-it { display:inline-flex; align-items:center; gap:5px; font-size:12.5px; color:var(--text-muted); }
    .enc-meta-it svg { width:15px; height:15px; opacity:.75; }
    .enc-tipo-chip { font-size:11.5px; font-weight:700; padding:4px 12px; border-radius:20px; }

    .enc-cardrow-when { flex-shrink:0; display:flex; flex-direction:column; gap:7px; padding:0 20px; border-left:1px solid var(--border); }
    .enc-when-it { display:inline-flex; align-items:center; gap:7px; font-size:13px; color:var(--text-muted); font-weight:600; white-space:nowrap; }
    .enc-when-it svg { width:15px; height:15px; opacity:.7; }

    .enc-cardrow-acts { flex-shrink:0; display:flex; gap:6px; }
    .enc-act { display:flex; flex-direction:column; align-items:center; gap:4px; border:none; background:transparent; font-family:inherit; font-size:11px; font-weight:600; color:var(--text-muted); cursor:pointer; padding:6px 10px; border-radius:12px; transition:background .15s; }
    .enc-act:hover { background:rgba(0,0,0,.04); }
    .enc-act-ico { width:38px; height:38px; border-radius:11px; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.04); }
    .enc-act-ico svg { width:17px; height:17px; }
    .enc-act-edit { color:#506CFF; } .enc-act-edit .enc-act-ico { background:rgba(80,108,255,.1); }
    .enc-act-edit:hover { background:rgba(80,108,255,.06); }
    .enc-act-del { color:#e5484d; } .enc-act-del .enc-act-ico { background:rgba(229,72,77,.1); }
    .enc-act-del:hover { background:rgba(229,72,77,.06); }

    @media (max-width:960px) {
      .enc-stats-grid { grid-template-columns:repeat(2,1fr); }
      .enc-cardrow { flex-wrap:wrap; }
      .enc-cardrow-when { border-left:none; padding:0; flex-direction:row; gap:16px; width:100%; margin-top:4px; }
      .enc-cardrow-acts { width:100%; justify-content:flex-end; }
    }
    @media (max-width:560px) {
      .enc-stats-grid { grid-template-columns:1fr 1fr; gap:10px; }
      .enc-stat { padding:12px; gap:10px; }
      .enc-stat-ico { width:38px; height:38px; }
      .enc-stat-num { font-size:22px; }
      .enc-row { gap:10px; }
      .enc-date { width:48px; }
      .enc-date-d { font-size:22px; }
      .enc-cardrow { padding:14px; gap:12px; }
      .enc-cardrow-ico { width:44px; height:44px; }
    }
  `;
  document.head.appendChild(s);
})();
