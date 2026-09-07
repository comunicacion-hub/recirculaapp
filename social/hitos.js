// ============================================================
// DASHBOARD SOCIAL — hitos.js
// Sección Hitos: registro de acciones (colección "Hitos").
//  - Tabla con vistos de los 2 documentos (asistencia / bitácora)
//  - Filtros: Provincia, Asociación, Tipo, Año, Mes, Actores
//  - Documentos PDF subidos desde la ficha (Drive: Hitos > Nombre del hito)
//  - Sin acceso directo a la carpeta de Drive (solo "Ver PDF" por documento)
// Reutiliza helpers globales: _statCardAli, _docVisto, esc, jsEsc, fmt*,
// pasaFiltro(Lista), driveBuscarOCrear/driveSubirArchivo/driveEliminarCarpeta.
// ============================================================

// ── Constantes ──
const HITO_TIPOS = ['Comunitario', 'En salud', 'En educación', 'En infraestructura', 'En empoderamiento social', 'En seguridad'];
const HITO_ACTORES = ['Empresa privada', 'Instituciones públicas', 'ONGs', 'Comités barriales', 'Asociación de recicladores', 'Otros'];
const HITO_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const HITO_DOCS = [
  { key: 'asistencia', lbl: 'Registro de asistencia', file: 'Registro_asistencia' },
  { key: 'bitacora',   lbl: 'Bitácora de resultado',  file: 'Bitacora_resultado' },
];

// ── Estado ──
let HIT_FILTROS = { prov: [], asoc: [], tipo: [], anio: [], mes: [], actor: [] };
let HITOS_DATA = [];
let HIT_PAGINA = 1;
const HIT_POR_PAGINA = 8;
function irPaginaHitos(p) { HIT_PAGINA = p; renderTablaHitos(); }

// ── Helpers ──
function _hitoDoc(h, key) { return (h && h.documentos && h.documentos[key]) ? h.documentos[key] : null; }
function _nombresAsocHit(ids) {
  return (ids || []).map(function (id) { return nombreDeAsociacion(id) || id; });
}
function _valsCheckedHit(sel) {
  return Array.from(document.querySelectorAll(sel + ' input:checked')).map(function (i) { return i.value; });
}
function _provinciasHit() {
  const set = new Set();
  CAT.hitos.forEach(function (h) { (h.provincias || []).forEach(function (p) { if (p) set.add(p); }); });
  if (!set.size) CAT.asocAmbiente.forEach(function (a) { if (a.provincia) set.add(a.provincia); });
  return Array.from(set).sort();
}
function _aniosHit() {
  const set = new Set();
  CAT.hitos.forEach(function (h) { if (h.anio) set.add(String(h.anio)); });
  return Array.from(set).sort(function (a, b) { return b.localeCompare(a); });
}
function _asociacionesHit() {
  return CAT.asocAmbiente.map(function (a) { return { val: a.id_asociacion, lbl: a.nombre }; });
}

// ── Filtros (drawer) ──
function registerHitosFilters() {
  registerFilterConfig('hitos', {
    badgeId: 'hit-filter-badge',
    sections: [
      { key: 'prov',  title: 'Provincia',  type: 'options', options: _provinciasHit() },
      { key: 'asoc',  title: 'Asociación', type: 'options', options: _asociacionesHit() },
      { key: 'tipo',  title: 'Tipo',       type: 'options', options: HITO_TIPOS },
      { key: 'anio',  title: 'Año',        type: 'options', options: _aniosHit() },
      { key: 'mes',   title: 'Mes',        type: 'options', options: HITO_MESES },
      { key: 'actor', title: 'Actores',    type: 'options', options: HITO_ACTORES },
    ],
    getValue: function (k) { return HIT_FILTROS[k] || []; },
    setValue: function (k, v) { HIT_FILTROS[k] = v; },
    apply: function () { cargarHitos(); },
  });
}

// ── Render principal ──
function renderHitos() {
  registerHitosFilters();
  const add = puedeEditar();
  document.getElementById('main-content').innerHTML =
    '<div class="page-header">' +
      '<div><div class="page-title">Hitos</div><div class="page-sub">Registro de acciones</div></div>' +
      '<div class="hdr-actions">' +
        '<button class="hdr-circle" onclick="openFilterDrawer(\'hitos\', this)" title="Filtros">' +
          icoHTML('filter') + '<span class="filter-badge" id="hit-filter-badge" style="display:none">0</span></button>' +
        '<button class="hdr-circle" onclick="exportarHitosExcel()" title="Descargar Excel">' + icoHTML('download') + '</button>' +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormHito()" title="Nuevo hito">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="hit-wrap"></div>';
  cargarHitos();
  updateFilterBadge('hitos');
}

function cargarHitos() {
  HIT_PAGINA = 1;
  HITOS_DATA = CAT.hitos.filter(function (h) {
    return pasaFiltroLista(HIT_FILTROS.prov, h.provincias) &&
      pasaFiltroLista(HIT_FILTROS.asoc, h.asociaciones) &&
      pasaFiltroLista(HIT_FILTROS.tipo, h.tipos) &&
      pasaFiltro(HIT_FILTROS.anio, String(h.anio || '')) &&
      pasaFiltro(HIT_FILTROS.mes, h.mes) &&
      pasaFiltroLista(HIT_FILTROS.actor, h.actores);
  }).slice().sort(function (a, b) {
    // Más recientes primero (por fecha; si no, por año)
    const fa = a.fecha || (a.anio ? String(a.anio) : '');
    const fb = b.fecha || (b.anio ? String(b.anio) : '');
    return fb.localeCompare(fa);
  });
  renderTablaHitos();
}

// ── Tabla ──
// Fecha compacta para el timeline ("14 JUL 2025")
function _fechaCorta(h) {
  const ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  if (h.fecha) {
    const p = String(h.fecha).split('-');
    if (p.length === 3) return p[2] + ' ' + (ABBR[(parseInt(p[1], 10) - 1)] || '') + ' ' + p[0];
  }
  const m3 = h.mes ? h.mes.substring(0, 3).toUpperCase() : '';
  return ((m3 ? m3 + ' ' : '') + (h.anio || '')).trim() || '—';
}

// Caja de visto (Asistencia/Bitácora) para la tarjeta
function _vbox(lbl, doc) {
  const on = !!(doc && doc.url);
  return '<div class="hito-vbox ' + (on ? 'on' : 'off') + '">' +
    '<span class="hito-vbox-ic">' + (on ? icoHTML('check') : '—') + '</span>' +
    '<div class="hito-vbox-tx"><small>' + esc(lbl) + '</small><b>' + (on ? 'Sí' : 'No') + '</b></div>' +
  '</div>';
}

function renderTablaHitos() {
  const wrap = document.getElementById('hit-wrap');
  if (!wrap) return;

  // ── Tarjetas-resumen ──
  const total = HITOS_DATA.length;
  const asistentes = HITOS_DATA.reduce(function (a, h) { return a + (parseFloat(h.num_asistentes) || 0); }, 0);
  const conAsist = HITOS_DATA.filter(function (h) { return _hitoDoc(h, 'asistencia'); }).length;
  const conBit = HITOS_DATA.filter(function (h) { return _hitoDoc(h, 'bitacora'); }).length;
  const pc = function (n) { return total ? Math.round(n / total * 100) : 0; };
  const stats = '<div class="ali-stats">' +
    _statCardAli('flag', '#7B5CFF', total, 'Total hitos', 'Registros totales') +
    _statCardAli('users', '#506CFF', fmtNum(asistentes), 'N° de asistentes', 'En total') +
    _statCardAli('check', '#18AE97', conAsist, 'Con asistencia', pc(conAsist) + '% del total') +
    _statCardAli('star', '#F5AD21', conBit, 'Con bitácora', pc(conBit) + '% del total') +
  '</div>';

  if (!HITOS_DATA.length) {
    wrap.innerHTML = stats + '<div class="empty-state">' +
      icoHTML('flag').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') +
      '<p>No hay hitos con estos filtros</p></div>';
    return;
  }

  const edit = puedeEditar();
  const acciones = function (h) {
    const docId = jsEsc(h._docId || '');
    return '<button class="icon-btn" onclick="event.stopPropagation();verHito(\'' + docId + '\')" title="Ver">' + icoHTML('view') + '</button>' +
      (edit ? '<button class="icon-btn primary" onclick="event.stopPropagation();editarHito(\'' + docId + '\')" title="Editar">' + icoHTML('edit') + '</button>' +
        '<button class="icon-btn del" onclick="event.stopPropagation();confirmarEliminarHito(\'' + docId + '\',\'' + jsEsc(h.id_carpeta_drive || '') + '\')" title="Eliminar">' + icoHTML('trash') + '</button>' : '');
  };
  const tiposChips = function (h) {
    const t = h.tipos || [];
    if (!t.length) return '';
    return '<div class="hito-chips">' + t.slice(0, 3).map(function (x) {
      return '<span class="hito-chip">' + esc(x) + '</span>';
    }).join('') + (t.length > 3 ? '<span class="hito-chip hito-chip-mas">+' + (t.length - 3) + '</span>' : '') + '</div>';
  };
  const provTxt = function (h) { return (h.provincias || []).length ? esc(h.provincias.join(', ')) : '—'; };

  // Paginación
  const nPag = Math.max(1, Math.ceil(HITOS_DATA.length / HIT_POR_PAGINA));
  if (HIT_PAGINA > nPag) HIT_PAGINA = nPag;
  const ini = (HIT_PAGINA - 1) * HIT_POR_PAGINA;
  const pagina = HITOS_DATA.slice(ini, ini + HIT_POR_PAGINA);

  // ── Timeline (escritorio) ──
  const rows = pagina.map(function (h, i) {
    const docId = jsEsc(h._docId || '');
    return '<div class="hito-tl-row">' +
      '<div class="hito-tl-side">' +
        '<div class="hito-tl-dot">' + (ini + i + 1) + '</div>' +
        '<div class="hito-tl-fecha">' + esc(_fechaCorta(h)) + '</div>' +
      '</div>' +
      '<div class="hito-tl-card" onclick="verHito(\'' + docId + '\')">' +
        '<div class="hito-c-main">' +
          '<span class="hito-c-ava">' + icoHTML('users') + '</span>' +
          '<div class="hito-c-id"><div class="hito-nombre">' + esc(h.nombre || '—') + '</div>' + tiposChips(h) +
            '<div class="hito-c-prov">' + icoHTML('mapPin') + ' ' + provTxt(h) + '</div></div>' +
        '</div>' +
        '<div class="hito-c-docs">' + _vbox('Asistencia', _hitoDoc(h, 'asistencia')) + _vbox('Bitácora', _hitoDoc(h, 'bitacora')) + '</div>' +
        '<div class="hito-c-acts td-actions">' + acciones(h) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  const timeline = '<div class="hito-tl hito-desk">' + rows + '</div>';

  // ── Tarjetas (móvil) ──
  const cards = pagina.map(function (h) {
    const docId = jsEsc(h._docId || '');
    return '<div class="hito-card" onclick="verHito(\'' + docId + '\')">' +
      '<div class="hito-card-top">' +
        '<span class="hito-c-ava">' + icoHTML('users') + '</span>' +
        '<div class="hito-id"><div class="hito-nombre">' + esc(h.nombre || '—') + '</div>' + tiposChips(h) + '</div>' +
        '<span class="hito-fecha-chip">' + esc(_fechaCorta(h)) + '</span>' +
      '</div>' +
      '<div class="hito-c-prov" style="margin-top:10px">' + icoHTML('mapPin') + ' ' + provTxt(h) + '</div>' +
      '<div class="hito-docs-mob">' + _vbox('Asistencia', _hitoDoc(h, 'asistencia')) + _vbox('Bitácora', _hitoDoc(h, 'bitacora')) + '</div>' +
      '<div class="hito-foot"><div class="td-actions">' + acciones(h) + '</div></div>' +
    '</div>';
  }).join('');
  const cardsWrap = '<div class="hito-mob">' + cards + '</div>';

  // Pie con paginación
  const btnPrev = '<button class="ali-pg-btn"' + (HIT_PAGINA <= 1 ? ' disabled' : ' onclick="irPaginaHitos(' + (HIT_PAGINA - 1) + ')"') + '>‹</button>';
  const btnNext = '<button class="ali-pg-btn"' + (HIT_PAGINA >= nPag ? ' disabled' : ' onclick="irPaginaHitos(' + (HIT_PAGINA + 1) + ')"') + '>›</button>';
  let nums = '';
  for (let p = 1; p <= nPag; p++) nums += '<button class="ali-pg-num' + (p === HIT_PAGINA ? ' on' : '') + '" onclick="irPaginaHitos(' + p + ')">' + p + '</button>';
  const pager = '<div class="ali-pager">' +
    '<span class="ali-pager-info">Mostrando ' + pagina.length + ' de ' + HITOS_DATA.length + ' registro' + (HITOS_DATA.length !== 1 ? 's' : '') + '</span>' +
    '<div class="ali-pager-ctrls">' + btnPrev + nums + btnNext + '</div>' +
  '</div>';

  wrap.innerHTML = stats + timeline + cardsWrap + pager;
}

// ── Ficha de detalle ──
function verHito(docId) {
  const h = CAT.hitos.find(function (x) { return x._docId === docId; });
  if (!h) { showToast('Hito no encontrado'); return; }
  const dato = function (lbl, val) {
    return '<div class="rf-row"><span class="rf-lbl">' + esc(lbl) + '</span><span class="rf-val">' + (val ? esc(val) : '—') + '</span></div>';
  };
  const bloque = function (lbl, val) {
    if (!val) return '';
    return '<div style="margin-top:14px"><div class="form-label">' + esc(lbl) + '</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-top:4px;line-height:1.55">' + esc(val) + '</div></div>';
  };
  const asocs = _nombresAsocHit(h.asociaciones);
  const docsChips = HITO_DOCS.map(function (d) {
    const doc = _hitoDoc(h, d.key);
    return doc && doc.url
      ? '<a class="ali-doc-chip" href="' + esc(doc.url) + '" target="_blank" rel="noopener">' + icoHTML('file') + ' ' + esc(d.lbl) + '</a>'
      : '<span class="ali-doc-chip ali-doc-chip-off">' + icoHTML('file') + ' ' + esc(d.lbl) + '</span>';
  }).join('');

  abrirModal(
    '<div class="modal">' +
      '<div class="modal-head"><div><div class="modal-title">' + esc(h.nombre || 'Hito') + '</div>' +
        '<div class="modal-sub">' + ((h.provincias || []).join(', ') || '—') + '</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        (h.tipos && h.tipos.length ? '<div class="hito-chips" style="margin-bottom:14px">' + h.tipos.map(function (t) { return '<span class="hito-chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="rf-grid">' +
          dato('Fecha', fmtFecha(h.fecha)) +
          dato('Año', h.anio) +
          dato('Mes', h.mes) +
          dato('N° de asistentes', h.num_asistentes ? fmtNum(h.num_asistentes) : '') +
          dato('Provincias', (h.provincias || []).join(', ')) +
        '</div>' +
        (h.actores && h.actores.length ? '<div style="margin-top:14px"><div class="form-label">Actores</div><div class="hito-chips" style="margin-top:6px">' + h.actores.map(function (a) { return '<span class="hito-chip hito-chip-act">' + esc(a) + '</span>'; }).join('') + '</div></div>' : '') +
        (asocs.length ? '<div style="margin-top:14px"><div class="form-label">Asociaciones beneficiadas</div><div class="hito-chips" style="margin-top:6px">' + asocs.map(function (n) { return '<span class="hito-chip">' + esc(n) + '</span>'; }).join('') + '</div></div>' : '') +
        bloque('Resumen', h.resumen) +
        bloque('Impacto a largo plazo', h.impacto) +
        '<div style="margin-top:16px"><div class="form-label" style="margin-bottom:8px">Documentos</div>' +
          '<div class="ali-docs-ver">' + docsChips + '</div></div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-primary" onclick="cerrarModal()">Cerrar</button>' +
      '</div>' +
    '</div>'
  );
}

// ── Formulario ──
function editarHito(docId) { abrirFormHito(docId); }

function abrirFormHito(docId) {
  const h = docId ? CAT.hitos.find(function (x) { return x._docId === docId; }) : null;
  const editing = !!h;

  const selTipos = h ? (h.tipos || []) : [];
  const tipoChecks = HITO_TIPOS.map(function (t) {
    const on = selTipos.indexOf(t) !== -1 ? 'checked' : '';
    return '<label class="chk-pill"><input type="checkbox" value="' + esc(t) + '" ' + on + '><span>' + esc(t) + '</span></label>';
  }).join('');

  const selProvs = h ? (h.provincias || []) : [];
  const provsCat = _provinciasHit();
  const provChecks = provsCat.map(function (p) {
    const on = selProvs.indexOf(p) !== -1 ? 'checked' : '';
    return '<label class="chk-pill"><input type="checkbox" value="' + esc(p) + '" ' + on + '><span>' + esc(p) + '</span></label>';
  }).join('');

  const selActores = h ? (h.actores || []) : [];
  const actorChecks = HITO_ACTORES.map(function (a) {
    const on = selActores.indexOf(a) !== -1 ? 'checked' : '';
    return '<label class="chk-pill"><input type="checkbox" value="' + esc(a) + '" ' + on + '><span>' + esc(a) + '</span></label>';
  }).join('');

  const selAsocs = h ? (h.asociaciones || []) : [];
  const asocChecks = CAT.asocAmbiente.map(function (x) {
    const on = selAsocs.indexOf(x.id_asociacion) !== -1 ? 'checked' : '';
    return '<label class="ms-opt"><input type="checkbox" value="' + esc(x.id_asociacion) + '" ' + on + '><span>' + esc(x.nombre) + '</span></label>';
  }).join('');

  const mesOpts = ['<option value="">— Mes —</option>'].concat(HITO_MESES.map(function (m) {
    return '<option value="' + esc(m) + '"' + (h && h.mes === m ? ' selected' : '') + '>' + esc(m) + '</option>';
  })).join('');

  const docsSlots = HITO_DOCS.map(function (d) {
    const doc = _hitoDoc(h, d.key);
    const ver = (doc && doc.url)
      ? '<button type="button" class="ali-doc-ver" onclick="window.open(\'' + jsEsc(doc.url) + '\',\'_blank\')">' + icoHTML('viewCheck') + ' Ver PDF</button>'
      : '<span class="ali-doc-sin">Sin archivo</span>';
    return '<div class="ali-doc-item">' +
      '<div class="ali-doc-cab"><span class="ali-doc-lbl">' + esc(d.lbl) + '</span>' + ver + '</div>' +
      '<input type="file" accept="application/pdf,.pdf" class="form-input ali-doc-file" id="hit-doc-' + d.key + '">' +
    '</div>';
  }).join('');

  abrirModal(
    '<div class="modal modal-lg">' +
      '<div class="modal-head"><div><div class="modal-title">' + (editing ? 'Editar' : 'Nuevo') + ' hito</div>' +
        '<div class="modal-sub">Registro de acciones</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="form-group"><label class="form-label">Nombre del hito</label>' +
          '<input type="text" class="form-input" id="hit-nombre" value="' + esc(h ? h.nombre : '') + '" placeholder="Ej. Jornada de salud comunitaria"></div>' +
        '<div class="form-label" style="margin:16px 0 8px">Tipo</div>' +
        '<div class="chk-pills">' + tipoChecks + '</div>' +
        '<div class="form-label" style="margin:16px 0 8px">Provincia</div>' +
        '<div class="chk-pills">' + (provChecks || '<span style="color:var(--text-dim);font-size:13px">No hay provincias en el catálogo</span>') + '</div>' +
        '<div class="form-grid-2" style="margin-top:16px">' +
          '<div class="form-group"><label class="form-label">Fecha</label><input type="date" class="form-input" id="hit-fecha" value="' + esc(h ? h.fecha : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Año</label><input type="number" class="form-input" id="hit-anio" min="2000" max="2100" step="1" value="' + (h ? h.anio : new Date().getFullYear()) + '"></div>' +
          '<div class="form-group"><label class="form-label">Mes</label><select class="form-select" id="hit-mes">' + mesOpts + '</select></div>' +
          '<div class="form-group"><label class="form-label">N° de asistentes</label><input type="number" class="form-input" id="hit-asistentes" min="0" step="1" value="' + (h ? (h.num_asistentes || 0) : 0) + '"></div>' +
        '</div>' +
        '<div class="form-label" style="margin:16px 0 8px">Actores</div>' +
        '<div class="chk-pills">' + actorChecks + '</div>' +
        '<div class="form-label" style="margin:16px 0 8px">Asociaciones beneficiadas</div>' +
        '<div class="ms-box" id="hit-asocs">' + (asocChecks || '<div style="padding:10px;color:var(--text-dim);font-size:13px">No hay asociaciones en el catálogo</div>') + '</div>' +
        '<div class="form-group" style="margin-top:16px"><label class="form-label">Resumen</label>' +
          '<textarea class="form-textarea" id="hit-resumen" placeholder="¿Qué se hizo?">' + esc(h ? h.resumen : '') + '</textarea></div>' +
        '<div class="form-group"><label class="form-label">Impacto a largo plazo</label>' +
          '<textarea class="form-textarea" id="hit-impacto" placeholder="¿Qué cambio genera a futuro?">' + esc(h ? h.impacto : '') + '</textarea></div>' +
        '<div class="form-label" style="margin:16px 0 8px">Documentos (PDF)</div>' +
        '<div class="ali-docs">' + docsSlots + '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        '<button class="btn btn-primary" id="hit-save-btn" onclick="guardarHito(' + (docId ? '\'' + jsEsc(docId) + '\'' : 'null') + ')">Guardar</button>' +
      '</div>' +
    '</div>'
  );
}

// ── Guardar ──
async function guardarHito(docId) {
  const actual = docId ? CAT.hitos.find(function (x) { return x._docId === docId; }) : null;
  const nombre = (document.getElementById('hit-nombre').value || '').trim();
  if (!nombre) { showToast('Escribí el nombre del hito'); return; }

  const o = {
    id_hito:          actual ? actual.id_hito : nuevoId('HITO'),
    nombre:           nombre,
    tipos:            [],
    provincias:       [],
    fecha:            (document.getElementById('hit-fecha') || {}).value || '',
    anio:             (document.getElementById('hit-anio') || {}).value || '',
    mes:              (document.getElementById('hit-mes') || {}).value || '',
    num_asistentes:   (document.getElementById('hit-asistentes') || {}).value || 0,
    actores:          [],
    resumen:          ((document.getElementById('hit-resumen') || {}).value || '').trim(),
    asociaciones:     _valsCheckedHit('#hit-asocs'),
    impacto:          ((document.getElementById('hit-impacto') || {}).value || '').trim(),
    id_carpeta_drive: actual ? actual.id_carpeta_drive : '',
    documentos:       Object.assign({}, actual && actual.documentos ? actual.documentos : {}),
  };

  // Lectura robusta de los 3 grupos de chk-pills (por orden de aparición en el modal)
  const grupos = document.querySelectorAll('.modal-body .chk-pills');
  const leerGrupo = function (idx) {
    if (!grupos[idx]) return [];
    return Array.from(grupos[idx].querySelectorAll('input:checked')).map(function (i) { return i.value; });
  };
  o.tipos = leerGrupo(0);
  o.provincias = leerGrupo(1);
  o.actores = leerGrupo(2);

  const btn = document.getElementById('hit-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  // ── Drive: subcarpeta con el nombre del hito + subida de PDFs seleccionados ──
  const nuevos = HITO_DOCS.map(function (d) {
    const el = document.getElementById('hit-doc-' + d.key);
    const f = el && el.files && el.files[0] ? el.files[0] : null;
    return f ? { key: d.key, file: d.file, archivo: f } : null;
  }).filter(Boolean);

  const noPdf = nuevos.find(function (n) {
    return n.archivo.type !== 'application/pdf' && !/\.pdf$/i.test(n.archivo.name);
  });
  if (noPdf) { showToast('Solo se permiten archivos PDF'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }

  const tok = driveToken();
  if (!o.id_carpeta_drive || nuevos.length) {
    if (tok) {
      try {
        if (!o.id_carpeta_drive) o.id_carpeta_drive = await driveBuscarOCrear(nombre, DRIVE_PARENTS.hitos, tok);
        for (let i = 0; i < nuevos.length; i++) {
          const n = nuevos[i];
          if (btn) btn.textContent = 'Subiendo ' + (i + 1) + '/' + nuevos.length + '…';
          const up = await driveSubirArchivo(n.archivo, n.file + '.pdf', o.id_carpeta_drive, tok);
          o.documentos[n.key] = { id: up.id, url: up.webViewLink, nombre: n.file + '.pdf' };
        }
      } catch (e) {
        console.warn('Drive hito:', e);
        showToast('No se pudieron subir algunos archivos (se guarda igual)');
      }
    } else {
      showToast(nuevos.length ? 'Sesión de Drive expirada: no se subieron los PDFs' : 'Sesión de Drive expirada: se guarda sin carpeta');
    }
  }

  const fs = hitoToFS(o);
  let r;
  if (docId) {
    r = await fsWrite(function () { return window.fb.updateDoc(fsDoc('Hitos', docId), fs); });
    if (r.ok) { const i = CAT.hitos.findIndex(function (x) { return x._docId === docId; }); if (i >= 0) CAT.hitos[i] = hitoFromFS(Object.assign({ _docId: docId }, fs)); }
  } else {
    const ref = window.fb.doc(fsCol('Hitos'));
    r = await fsWrite(function () { return window.fb.setDoc(ref, fs); });
    if (r.ok) CAT.hitos.push(hitoFromFS(Object.assign({ _docId: ref.id }, fs)));
  }

  if (!r.ok) { showToast('Error al guardar: ' + (r.error || '')); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }
  showToast(r.offline ? 'Guardado (se sincronizará) ✓' : 'Guardado ✓');
  cerrarModal();
  cargarHitos();
}

// ── Eliminar (registro + papelera de la carpeta del hito) ──
function confirmarEliminarHito(docId, carpetaId) {
  abrirModal(
    '<div class="modal" style="max-width:440px">' +
      '<div class="modal-head"><div class="modal-title">Eliminar hito</div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body"><p style="color:var(--text-muted);font-size:14px;line-height:1.6">' +
        '¿Seguro que quieres eliminar este hito? Se quitará el registro y su carpeta se enviará a la papelera de Drive.' +
      '</p></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        '<button class="btn btn-danger" onclick="eliminarHito(\'' + jsEsc(docId) + '\',\'' + jsEsc(carpetaId) + '\')">Eliminar</button>' +
      '</div>' +
    '</div>'
  );
}

async function eliminarHito(docId, carpetaId) {
  if (!docId) { showToast('No se encontró el hito'); return; }
  if (carpetaId) {
    const tok = driveToken();
    if (tok) { try { await driveEliminarCarpeta(carpetaId, tok); } catch (e) { console.warn('Drive papelera hito:', e); } }
  }
  const r = await fsWrite(function () { return window.fb.deleteDoc(fsDoc('Hitos', docId)); });
  if (!r.ok) { showToast('Error al eliminar: ' + (r.error || '')); return; }
  CAT.hitos = CAT.hitos.filter(function (x) { return x._docId !== docId; });
  showToast(r.offline ? 'Eliminado (se sincronizará) ✓' : 'Hito eliminado ✓');
  cerrarModal();
  cargarHitos();
}

// ── Exportar Excel ──
async function exportarHitosExcel() {
  if (!HITOS_DATA.length) { showToast('No hay datos para exportar.'); return; }
  try {
    await cargarSheetJS();
    if (!window.XLSX) { showToast('No se pudo cargar el exportador'); return; }
    const tiene = function (h, key) { const d = _hitoDoc(h, key); return d && d.url ? 'Sí' : 'No'; };
    const header = ['Nombre del hito', 'Tipos', 'Provincias', 'Fecha', 'Año', 'Mes', 'N° de asistentes', 'Actores', 'Asociaciones beneficiadas', 'Resumen', 'Impacto a largo plazo', 'Registro de asistencia', 'Bitácora de resultado'];
    const filas = HITOS_DATA.map(function (h) {
      return [h.nombre, (h.tipos || []).join(', '), (h.provincias || []).join(', '), h.fecha || '',
        parseFloat(h.anio) || 0, h.mes || '', parseFloat(h.num_asistentes) || 0, (h.actores || []).join(', '), _nombresAsocHit(h.asociaciones).join(', '),
        h.resumen || '', h.impacto || '', tiene(h, 'asistencia'), tiene(h, 'bitacora')];
    });
    const ws = XLSX.utils.aoa_to_sheet([header].concat(filas));
    ws['!cols'] = [{ wch: 30 }, { wch: 26 }, { wch: 20 }, { wch: 12 }, { wch: 7 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 36 }, { wch: 40 }, { wch: 40 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hitos');
    XLSX.writeFile(wb, 'Hitos_' + new Date().toISOString().substring(0, 10) + '.xlsx');
    showToast('Excel descargado ✓');
  } catch (e) { console.error('export hitos:', e); showToast('Error al exportar'); }
}

// ── Estilos propios ──
(function () {
  if (document.getElementById('hitos-styles')) return;
  const s = document.createElement('style');
  s.id = 'hitos-styles';
  s.textContent = `
    .hito-nombre { font-weight:700; color:var(--text); font-size:15px; line-height:1.3; }
    .hito-chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
    .hito-chip { font-size:10.5px; font-weight:600; color:#506CFF; background:rgba(80,108,255,.1); padding:3px 8px; border-radius:20px; }
    .hito-chip-mas { color:var(--text-dim); background:rgba(0,0,0,.05); }
    .hito-chip-act { color:#0f9b84; background:rgba(24,174,151,.12); }

    /* Avatar de la tarjeta */
    .hito-c-ava { width:46px; height:46px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:rgba(80,108,255,.1); color:#506CFF; }
    .hito-c-ava svg { width:22px; height:22px; }
    .hito-c-prov { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-muted); margin-top:6px; }
    .hito-c-prov svg { width:14px; height:14px; color:var(--text-dim); flex-shrink:0; }

    /* Caja de visto */
    .hito-vbox { display:flex; align-items:center; gap:9px; padding:10px 14px; border-radius:12px; min-width:130px; }
    .hito-vbox.on { background:rgba(24,174,151,.08); }
    .hito-vbox.off { background:rgba(0,0,0,.03); }
    .hito-vbox-ic { width:26px; height:26px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-weight:700; }
    .hito-vbox.on .hito-vbox-ic { background:#18AE97; color:#fff; }
    .hito-vbox.off .hito-vbox-ic { background:#d7d7e0; color:#fff; }
    .hito-vbox-ic svg { width:15px; height:15px; }
    .hito-vbox-tx { display:flex; flex-direction:column; line-height:1.2; }
    .hito-vbox-tx small { font-size:11px; color:var(--text-muted); }
    .hito-vbox-tx b { font-size:14px; font-weight:700; color:var(--text); }

    /* ── Timeline (escritorio) ── */
    .hito-tl { display:flex; flex-direction:column; }
    .hito-tl-row { display:flex; gap:16px; align-items:stretch; }
    .hito-tl-row + .hito-tl-row { margin-top:16px; }
    .hito-tl-side { position:relative; width:58px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:8px; padding-top:20px; }
    .hito-tl-side::before { content:''; position:absolute; top:54px; left:50%; transform:translateX(-50%); width:2px; height:calc(100% + 16px - 34px); background:linear-gradient(#c7cbef,#c7cbef); }
    .hito-tl-row:last-child .hito-tl-side::before { display:none; }
    .hito-tl-dot { position:relative; z-index:1; width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#7B5CFF,#506CFF); color:#fff; font-size:14px; font-weight:800; display:flex; align-items:center; justify-content:center; }
    .hito-tl-fecha { font-size:11px; font-weight:700; color:var(--text-muted); text-align:center; line-height:1.25; }
    .hito-tl-card { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:16px 18px; display:flex; align-items:center; gap:18px; cursor:pointer; transition:box-shadow .15s,transform .12s,border-color .15s; }
    .hito-tl-card:hover { box-shadow:0 6px 20px rgba(0,0,0,.08); transform:translateY(-2px); border-color:transparent; }
    .hito-c-main { display:flex; align-items:center; gap:14px; flex:1; min-width:0; }
    .hito-c-id { min-width:0; }
    .hito-c-docs { display:flex; gap:10px; flex-shrink:0; }
    .hito-c-acts { flex-shrink:0; }

    /* ── Tarjetas (móvil) ── */
    .hito-mob { display:none; flex-direction:column; gap:12px; }
    .hito-card { background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:16px; cursor:pointer; transition:box-shadow .15s,transform .12s,border-color .15s; }
    .hito-card:hover { box-shadow:0 6px 20px rgba(0,0,0,.08); transform:translateY(-2px); border-color:transparent; }
    .hito-card-top { display:flex; align-items:flex-start; gap:12px; }
    .hito-card-top .hito-id { flex:1; min-width:0; }
    .hito-fecha-chip { font-size:11px; font-weight:700; color:#506CFF; background:rgba(80,108,255,.1); padding:4px 9px; border-radius:20px; white-space:nowrap; flex-shrink:0; }
    .hito-docs-mob { display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; }
    .hito-docs-mob .hito-vbox { flex:1; min-width:130px; }
    .hito-foot { display:flex; justify-content:flex-end; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }

    @media (max-width:820px) {
      .hito-desk { display:none; }
      .hito-mob { display:flex; }
      .ali-stats { grid-template-columns:1fr 1fr; }
      .form-grid-2 { grid-template-columns:1fr 1fr; }
    }
  `;
  document.head.appendChild(s);
})();
