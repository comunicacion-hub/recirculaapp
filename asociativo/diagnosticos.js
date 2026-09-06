// ============================================================
// DASHBOARD ASOCIATIVO — diagnosticos.js
// Diagnósticos: CRUD + cálculos automáticos (valoración, módulo débil,
// categoría) + carpeta Drive (Diagnósticos > Asociación).
// Colección: Diagnosticos
// ============================================================

let DIAG_FILTROS = { prov: [], cat: [] };
let DIAGNOSTICOS_DATA = [];

const CATEGORIAS_DIAG = ['Líderes de ReCircula', 'En Fortalecimiento', 'En Acompañamiento'];
const TIPOS_DIAG = ['Inicial', 'Cierre'];

// Documentos PDF de la ficha del diagnóstico
const DIAG_DOCS = [
  { key: 'diag_inicial', lbl: 'Diagnóstico inicial', file: 'Diagnostico_inicial' },
  { key: 'diag_final',   lbl: 'Diagnóstico final',   file: 'Diagnostico_final' },
];
function _diagDoc(d, key) { return (d && d.documentos && d.documentos[key]) ? d.documentos[key] : null; }

// Navegación de dos niveles (Nivel 1 = asociaciones por provincia; Nivel 2 = tabla de diagnósticos)
let DIAG_VISTA = 'asociaciones';
let DIAG_ASOC_SEL = null;

// Copia de trabajo del formulario (documentos + archivos a papelera)
let _DIAG_FORM = null;

// N° de diagnósticos de una asociación
function _diagCount(idAsoc) {
  return (CAT.diagnosticos || []).filter(function (d) { return d.id_asociacion === idAsoc; }).length;
}

// Donut de porcentaje (SVG) con color por umbral
function _diagColor(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '#d7d7e0';
  return n >= 90 ? '#18AE97' : n >= 80 ? '#F5AD21' : '#e5484d';
}
function _diagDonut(v, label) {
  const n = parseFloat(v);
  const ok = !isNaN(n);
  const col = _diagColor(v);
  const r = 16, c = 2 * Math.PI * r;
  const dash = ok ? (Math.max(0, Math.min(n, 100)) / 100) * c : 0;
  return '<div class="diag-donut">' +
    '<svg viewBox="0 0 40 40">' +
      '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="#eef0f4" stroke-width="4"></circle>' +
      (ok ? '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + dash + ' ' + c + '" transform="rotate(-90 20 20)"></circle>' : '') +
      '<text x="20" y="20" text-anchor="middle" dominant-baseline="central" class="diag-donut-tx">' + (ok ? Math.round(n) + '%' : '—') + '</text>' +
    '</svg>' +
    '<span class="diag-donut-lbl">' + esc(label) + '</span>' +
  '</div>';
}

function registerDiagnosticosFilters() {
  registerFilterConfig('diagnosticos', {
    badgeId: 'diag-filter-badge',
    sections: [
      { key: 'prov', title: 'Provincia', type: 'options', options: _provinciasDiag() },
      { key: 'cat',  title: 'Categoría', type: 'options', options: CATEGORIAS_DIAG },
    ],
    getValue: function (k) { return DIAG_FILTROS[k] || []; },
    setValue: function (k, v) { DIAG_FILTROS[k] = v; },
    apply: function () { renderVistaDiagnosticos(); },
  });
}

// Provincias disponibles (desde la lista maestra de asociaciones)
function _provinciasDiag() {
  return Array.from(new Set((CAT.asocAmbiente || []).map(function (a) { return a.provincia; }).filter(Boolean)))
    .sort(function (a, b) { return a.localeCompare(b, 'es'); });
}

function renderDiagnosticos() {
  registerDiagnosticosFilters();
  DIAG_VISTA = 'asociaciones';
  DIAG_ASOC_SEL = null;
  renderVistaDiagnosticos();
}

function renderVistaDiagnosticos() {
  if (DIAG_VISTA === 'lista' && DIAG_ASOC_SEL) renderNivelListaDiag();
  else renderNivelAsociacionesDiag();
}

// ── Nivel 1: Desempeño asociativo (asociaciones ordenadas por categoría) ──

// Componentes (módulos) del diagnóstico, en el orden de la ficha.
const DIAG_MODULOS = [
  { key: 'p_organizacional', lbl: 'Organizacional', abbr: 'Organiz.', col: '#506CFF' },
  { key: 'p_productivo',     lbl: 'Productivo',     abbr: 'Product.', col: '#FF751F' },
  { key: 'p_empresarial',    lbl: 'Empresarial',    abbr: 'Empres.',  col: '#F82D72' },
  { key: 'p_ambiental',      lbl: 'Ambiental',      abbr: 'Ambien.',  col: '#18AE97' },
  { key: 'p_financiero',     lbl: 'Financiero',     abbr: 'Financ.',  col: '#7B5CFF' },
];

// Diagnóstico vigente de una asociación (mayor año; a igual año, Cierre gana).
function _diagVigenteDe(idAsoc) {
  const ds = (CAT.diagnosticos || []).filter(function (d) { return d.id_asociacion === idAsoc; });
  if (!ds.length) return null;
  ds.sort(function (a, b) {
    const ay = parseFloat(a.anio) || 0, by = parseFloat(b.anio) || 0;
    if (by !== ay) return by - ay;
    return (b.tipo === 'Cierre' ? 1 : 0) - (a.tipo === 'Cierre' ? 1 : 0);
  });
  return ds[0];
}

function renderNivelAsociacionesDiag() {
  const add = puedeEditar();
  document.getElementById('main-content').innerHTML =
    '<div class="page-header">' +
      '<div><div class="page-title">Diagnósticos</div></div>' +
      '<div class="hdr-actions">' +
        '<button class="hdr-circle" onclick="openFilterDrawer(\'diagnosticos\', this)" title="Filtros">' +
          icoHTML('filter') + '<span class="filter-badge" id="diag-filter-badge" style="display:none">0</span></button>' +
        '<button class="hdr-circle" onclick="exportarDiagnosticosExcel()" title="Descargar Excel">' + icoHTML('download') + '</button>' +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormDiagnostico()" title="Nuevo diagnóstico">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="diag-n1-wrap"></div>';
  updateFilterBadge('diagnosticos');
  renderDesempenoAsociativo();
}

// Construye el cuadro de desempeño: asociaciones agrupadas por categoría vigente.
function renderDesempenoAsociativo() {
  const wrap = document.getElementById('diag-n1-wrap');
  if (!wrap) return;

  const fProv = DIAG_FILTROS.prov || [];
  const fCat  = DIAG_FILTROS.cat  || [];

  // Una fila por asociación, con su diagnóstico vigente resuelto.
  const filas = (CAT.asocAmbiente || [])
    .filter(function (a) { return pasaFiltro(fProv, a.provincia); })
    .map(function (a) {
      const d = _diagVigenteDe(a.id_asociacion);
      const total = d ? parseFloat(d.valoracion_total) : null;
      return {
        id:        a.id_asociacion,
        nombre:    a.nombre || '—',
        provincia: a.provincia || '',
        diag:      d,
        total:     (total == null || isNaN(total)) ? null : total,
        cat:       d ? categoriaDesdePuntaje(total) : '',
      };
    });

  // Agrupar por categoría (+ "Sin diagnóstico" al final) y ordenar por desempeño.
  const GRUPOS = CATEGORIAS_DIAG.concat(['Sin diagnóstico']);
  const porCat = {};
  GRUPOS.forEach(function (g) { porCat[g] = []; });
  filas.forEach(function (f) { porCat[f.cat || 'Sin diagnóstico'].push(f); });
  GRUPOS.forEach(function (g) {
    porCat[g].sort(function (x, y) {
      const tx = x.total == null ? -1 : x.total, ty = y.total == null ? -1 : y.total;
      if (ty !== tx) return ty - tx;
      return x.nombre.localeCompare(y.nombre, 'es');
    });
  });

  // Grupos visibles: respeta el filtro de categoría; "Sin diagnóstico" solo sin ese filtro.
  const catActivo = fCat.length > 0;
  const gruposVis = GRUPOS.filter(function (g) {
    if (!porCat[g].length) return false;
    if (g === 'Sin diagnóstico') return !catActivo;
    return !catActivo || fCat.includes(g);
  });

  if (!gruposVis.length) {
    wrap.innerHTML = '<div class="empty-state">' +
      icoHTML('clipboard').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') +
      '<p>No hay asociaciones con estos filtros</p></div>';
    return;
  }

  // Secciones separadas por categoría (cada una por su cuenta, sin una caja
  // única que las contenga a todas).
  wrap.innerHTML = '<div class="diag-cats">' +
    gruposVis.map(function (g) { return _desempSeccion(g, porCat[g]); }).join('') +
  '</div>';
}

// Color y promedio de un grupo (categoría).
function _desempGrupoMeta(cat, lista) {
  const conDiag = cat !== 'Sin diagnóstico';
  const col = conDiag ? _asocColorCat(cat) : '#9aa2b1';
  const vals = lista.filter(function (f) { return f.total != null; }).map(function (f) { return f.total; });
  const prom = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
  return { conDiag: conDiag, col: col, prom: prom };
}

// Cuerpo desplegable: promedio general (número grande) + barra.
function _desempGen(v, col) {
  const n = parseFloat(v);
  const w = isNaN(n) ? 0 : Math.max(0, Math.min(n, 100));
  return '<div class="diag-sgen">' +
      '<span class="diag-sgen-lbl">Promedio general</span>' +
      '<span class="diag-sgen-val" style="color:' + col + '">' + (isNaN(n) ? '—' : fmtNum(n, 1) + '%') + '</span>' +
    '</div>' +
    '<div class="diag-sgen-bar"><i style="width:' + w + '%;background:' + col + '"></i></div>';
}

// Cuerpo desplegable: promedio por componente (una fila por módulo).
function _desempComps(f, m) {
  return '<div class="diag-scomps">' + DIAG_MODULOS.map(function (mm) {
    const n = parseFloat(f.diag[mm.key]);
    const w = isNaN(n) ? 0 : Math.max(0, Math.min(n, 100));
    return '<div class="diag-scomp">' +
      '<span class="diag-scomp-lbl">' + esc(mm.lbl) + '</span>' +
      '<span class="diag-scomp-bar"><i style="width:' + w + '%;background:' + mm.col + '"></i></span>' +
      '<span class="diag-scomp-val">' + (isNaN(n) ? '—' : Math.round(n)) + '</span>' +
    '</div>';
  }).join('') + '</div>';
}

// Franja por asociación: cerrada = tira delgada (nombre + desplegar + flecha);
// al desplegar aparece el promedio general y por componente.
function _desempStrip(f, m) {
  const body = f.diag
    ? (_desempGen(f.total, m.col) + _desempComps(f, m))
    : '<div class="diag-ssin">Sin diagnóstico registrado</div>';
  return '<div class="diag-strip">' +
    '<div class="diag-shead" onclick="toggleDiagStrip(this)">' +
      '<span class="diag-sacc" style="background:' + m.col + '"></span>' +
      '<span class="diag-sname"><b>' + esc(f.nombre) + '</b>' + (f.provincia ? '<small>' + esc(f.provincia) + '</small>' : '') + '</span>' +
      '<span class="diag-stog" title="Desplegar desempeño">' + icoHTML('chevDown') + '</span>' +
      '<button class="diag-sarr" title="Ir al registro" onclick="event.stopPropagation();abrirAsociacionDiag(\'' + jsEsc(f.id) + '\')">' + icoHTML('chevRight') + '</button>' +
    '</div>' +
    '<div class="diag-sbody">' + body + '</div>' +
  '</div>';
}

// Sección de una categoría: cabecera + franjas (separada de las demás).
function _desempSeccion(cat, lista) {
  const m = _desempGrupoMeta(cat, lista);
  const head = '<div class="diag-cat-head">' +
    '<span class="diag-grp-dot" style="background:' + m.col + '"></span>' +
    '<span class="diag-grp-name" style="color:' + m.col + '">' + esc(cat) + '</span>' +
    (m.prom != null ? '<span class="diag-grp-prom">prom. ' + fmtNum(m.prom, 1) + '%</span>' : '') +
  '</div>';
  return '<div class="diag-cat">' + head +
    '<div class="diag-strips">' + lista.map(function (f) { return _desempStrip(f, m); }).join('') + '</div>' +
  '</div>';
}

// Abrir/cerrar una franja.
function toggleDiagStrip(el) { const s = el.closest('.diag-strip'); if (s) s.classList.toggle('open'); }

function abrirAsociacionDiag(idAsoc) { DIAG_ASOC_SEL = idAsoc; DIAG_VISTA = 'lista'; renderVistaDiagnosticos(); }
function volverAsociacionesDiag() { DIAG_VISTA = 'asociaciones'; DIAG_ASOC_SEL = null; renderVistaDiagnosticos(); }

// ── Nivel 2: tabla de diagnósticos de la asociación ──
function renderNivelListaDiag() {
  const add = puedeEditar();
  const asoc = (CAT.asocAmbiente || []).find(function (a) { return a.id_asociacion === DIAG_ASOC_SEL; });
  const nombre = asoc ? (asoc.nombre || '') : '';
  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
  document.getElementById('main-content').innerHTML =
    '<div class="page-header">' +
      '<div><div class="ent-title-row" style="display:flex;align-items:center;gap:12px">' +
        '<button class="ent-back" onclick="volverAsociacionesDiag()" title="Volver">' + BACK + '</button>' +
        '<div><div class="page-title">Diagnósticos</div><div class="page-sub">' + esc(nombre) + '</div></div>' +
      '</div></div>' +
      '<div class="hdr-actions">' +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormDiagnostico()" title="Nuevo diagnóstico">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="diag-table-wrap"></div>';
  cargarDiagnosticos();
}

// Rango de categoría para ordenar (Líderes primero → Acompañamiento último)
function _catRank(d) {
  const c = categoriaDesdePuntaje(parseFloat(d.valoracion_total));
  return c === 'Líderes de ReCircula' ? 0 : c === 'En Fortalecimiento' ? 1 : 2;
}

function cargarDiagnosticos() {
  DIAGNOSTICOS_DATA = (CAT.diagnosticos || []).filter(function (d) {
    return d.id_asociacion === DIAG_ASOC_SEL;
  }).slice().sort(function (a, b) {
    const ya = parseFloat(a.anio) || 0, yb = parseFloat(b.anio) || 0;
    if (ya !== yb) return yb - ya;                       // año más reciente primero
    return (a.tipo || '').localeCompare(b.tipo || '');    // Cierre antes que Inicial (alfabético)
  });
  renderTablaDiagnosticos();
}

function renderTablaDiagnosticos() {
  const wrap = document.getElementById('diag-table-wrap');
  if (!wrap) return;
  if (!DIAGNOSTICOS_DATA.length) {
    wrap.innerHTML = '<div class="empty-state">' +
      icoHTML('clipboard').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') +
      '<p>Esta asociación aún no tiene diagnósticos</p></div>';
    return;
  }
  const edit = puedeEditar();
  wrap.innerHTML = '<div class="dg2-list">' +
    DIAGNOSTICOS_DATA.map(function (d) { return _diagCardN2(d, edit); }).join('') +
  '</div>' +
    '<div class="dg2-count">' + DIAGNOSTICOS_DATA.length + ' diagnóstico' + (DIAGNOSTICOS_DATA.length !== 1 ? 's' : '') + '</div>';
}

// Tarjeta de un diagnóstico (registro): año/tipo · valoración · componentes · docs · acciones.
function _diagCardN2(d, edit) {
  const val = parseFloat(d.valoracion_total);
  const catg = categoriaDesdePuntaje(val);
  const col = catg ? _asocColorCat(catg) : '#9aa2b1';
  const valTxt = isNaN(val) ? '—' : fmtNum(val, 1) + '%';

  // Valores por módulo + índice del más débil (para destacarlo).
  const vals = DIAG_MODULOS.map(function (m) { return parseFloat(d[m.key]); });
  let minIdx = -1, minV = Infinity;
  vals.forEach(function (v, i) { if (!isNaN(v) && v < minV) { minV = v; minIdx = i; } });

  const comps = DIAG_MODULOS.map(function (m, i) {
    const n = vals[i];
    const weak = (i === minIdx);
    return '<div class="dg2-c' + (weak ? ' weak' : '') + '">' +
      '<span class="dg2-c-lbl">' + esc(m.lbl) + (weak ? '<em>más débil</em>' : '') + '</span>' +
      '<span class="dg2-c-val">' + (isNaN(n) ? '—' : Math.round(n)) + '</span>' +
    '</div>';
  }).join('');

  // Documentos (solo los presentes).
  const docChips = DIAG_DOCS.map(function (dd) {
    const f = _diagDoc(d, dd.key);
    return (f && f.url)
      ? '<a class="dg2-doc" href="' + esc(f.url) + '" target="_blank" rel="noopener">' + icoHTML('view') + esc(dd.lbl) + '</a>'
      : '';
  }).join('');

  const docId = jsEsc(d._docId || '');
  const acts = '<button class="icon-btn" onclick="verDiagnostico(\'' + docId + '\')" title="Ver ficha">' + icoHTML('view') + '</button>' +
    (edit ? '<button class="icon-btn primary" onclick="editarDiagnostico(\'' + docId + '\')" title="Editar">' + icoHTML('edit') + '</button>' +
      '<button class="icon-btn del" onclick="confirmarEliminarDiagnostico(\'' + docId + '\')" title="Eliminar">' + icoHTML('trash') + '</button>' : '');

  return '<article class="dg2-card">' +
    '<div class="dg2-head">' +
      '<div class="dg2-year"><span class="dg2-anio">' + esc(d.anio || '—') + '</span>' + _tipoBadge(d.tipo) + '</div>' +
      '<div class="dg2-acts">' + acts + '</div>' +
    '</div>' +
    '<div class="dg2-score">' +
      '<div class="dg2-score-l"><span class="dg2-score-lbl">Valoración total</span>' +
        '<span class="dg2-score-val" style="color:' + col + '">' + valTxt + '</span></div>' +
      categoriaBadge(catg) +
    '</div>' +
    '<div class="dg2-comps">' + comps + '</div>' +
    (docChips ? '<div class="dg2-docs">' + docChips + '</div>' : '') +
  '</article>';
}

function _tipoBadge(t) {
  return '<span class="badge ' + (t === 'Cierre' ? 'badge-blue' : 'badge-off') + '">' + esc(t || '—') + '</span>';
}

// ── Ver ficha ──
function verDiagnostico(docId) {
  const d = CAT.diagnosticos.find(function (x) { return x._docId === docId; });
  if (!d) { showToast('Diagnóstico no encontrado'); return; }
  const pct = function (v) { return (v == null || isNaN(v)) ? '—' : fmtNum(v, 1) + '%'; };
  const fila = function (lbl, v) {
    return '<tr><td>' + esc(lbl) + '</td><td style="text-align:right;font-weight:600">' + pct(v) + '</td></tr>';
  };
  const docChips = DIAG_DOCS.map(function (dd) {
    const f = _diagDoc(d, dd.key);
    return (f && f.url)
      ? '<a class="asoc-doc-chip" href="' + esc(f.url) + '" target="_blank" rel="noopener">' + icoHTML('view') + ' ' + esc(dd.lbl) + '</a>'
      : '<span class="asoc-doc-chip asoc-doc-chip-off">' + icoHTML('close') + ' ' + esc(dd.lbl) + '</span>';
  }).join('');
  abrirModal(
    '<div class="modal">' +
      '<div class="modal-head"><div><div class="modal-title">' + esc(d.nombre || 'Diagnóstico') + '</div>' +
        '<div class="modal-sub">' + esc(d.provincia || '—') + ' · ' + esc(d.anio || '') + ' · ' + esc(d.tipo || '') + '</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="form-grid-2" style="margin-bottom:16px">' +
          '<div><div class="form-label">Valoración total</div><div style="font-size:22px;font-weight:800;color:#0a9e83">' + pct(d.valoracion_total) + '</div></div>' +
          '<div><div class="form-label">Categoría</div><div style="margin-top:4px">' + categoriaBadge(d.categoria) + '</div></div>' +
          '<div><div class="form-label">Módulo más débil</div><div style="font-size:14px;font-weight:600">' + esc(d.modulo_debil || '—') + '</div></div>' +
        '</div>' +
        '<div class="table-wrap" style="border-radius:14px;box-shadow:none;border:1px solid var(--border)"><table>' +
          '<thead><tr><th>Módulo</th><th style="text-align:right">%</th></tr></thead><tbody>' +
            fila('Organizacional', d.p_organizacional) + fila('Productivo', d.p_productivo) + fila('Empresarial', d.p_empresarial) +
            fila('Ambiental', d.p_ambiental) + fila('Financiero', d.p_financiero) +
          '</tbody></table></div>' +
        '<div class="form-label" style="margin:16px 0 8px">Documentos</div>' +
        '<div class="asoc-docs-ver">' + docChips + '</div>' +
        (d.observaciones ? '<div style="margin-top:14px"><div class="form-label">Observaciones</div><div style="font-size:13px;color:var(--text-muted);margin-top:4px">' + esc(d.observaciones) + '</div></div>' : '') +
      '</div>' +
      '<div class="modal-foot"><button class="btn btn-glass" onclick="cerrarModal()">Cerrar</button></div>' +
    '</div>'
  );
}

// ── Formulario ──
function editarDiagnostico(docId) { abrirFormDiagnostico(docId); }

function abrirFormDiagnostico(docId) {
  docId = docId || null;
  const d = docId ? CAT.diagnosticos.find(function (x) { return x._docId === docId; }) : null;
  const editing = !!d;

  // Preselección de asociación al crear desde el Nivel 2
  const preAsoc = (!editing && DIAG_VISTA === 'lista' && DIAG_ASOC_SEL) ? DIAG_ASOC_SEL : '';
  const preAmb = preAsoc ? (CAT.asocAmbiente || []).find(function (a) { return a.id_asociacion === preAsoc; }) : null;

  _DIAG_FORM = {
    docId: docId,
    documentos: JSON.parse(JSON.stringify((d && d.documentos) ? d.documentos : {})),
    eliminar: [],
  };

  const asocField = editing
    ? '<input type="text" class="form-input" value="' + esc(d.nombre) + '" readonly>' +
      '<input type="hidden" id="diag-asoc" value="' + esc(d.id_asociacion) + '">'
    : (preAmb
        ? '<input type="text" class="form-input" value="' + esc(preAmb.nombre) + '" readonly>' +
          '<input type="hidden" id="diag-asoc" value="' + esc(preAsoc) + '">'
        : '<select class="form-select" id="diag-asoc" onchange="onAsocChangeDiag(this.value)">' +
            '<option value="">Seleccioná una asociación…</option>' + _asocOptions('') + '</select>');

  const tipoOpts = TIPOS_DIAG.map(function (t) {
    return '<option value="' + t + '"' + (d && d.tipo === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  const numInput = function (id, val) {
    return '<input type="number" class="form-input" id="' + id + '" min="0" max="100" step="0.1" value="' + (d ? val : '') + '" oninput="recalcDiagnostico()">';
  };

  abrirModal(
    '<div class="modal">' +
      '<div class="modal-head"><div><div class="modal-title">' + (editing ? 'Editar' : 'Nuevo') + ' diagnóstico</div>' +
        '<div class="modal-sub">Diagnóstico asociativo</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="form-grid-2">' +
          '<div class="form-group"><label class="form-label">Asociación</label>' + asocField + '</div>' +
          '<div class="form-group"><label class="form-label">Provincia</label><input type="text" class="form-input" id="diag-provincia" readonly value="' + esc(d ? d.provincia : (preAmb ? preAmb.provincia : '')) + '"></div>' +
          '<div class="form-group"><label class="form-label">Año</label><input type="number" class="form-input" id="diag-anio" min="2000" max="2100" step="1" value="' + (d ? d.anio : new Date().getFullYear()) + '"></div>' +
          '<div class="form-group"><label class="form-label">Tipo</label><select class="form-select" id="diag-tipo">' + tipoOpts + '</select></div>' +
        '</div>' +
        '<div class="form-label" style="margin:16px 0 8px">Puntajes por módulo (0–100)</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-group"><label class="form-label">Organizacional</label>' + numInput('diag-org', d ? d.p_organizacional : '') + '</div>' +
          '<div class="form-group"><label class="form-label">Productivo</label>' + numInput('diag-prod', d ? d.p_productivo : '') + '</div>' +
          '<div class="form-group"><label class="form-label">Empresarial</label>' + numInput('diag-emp', d ? d.p_empresarial : '') + '</div>' +
          '<div class="form-group"><label class="form-label">Ambiental</label>' + numInput('diag-amb', d ? d.p_ambiental : '') + '</div>' +
          '<div class="form-group"><label class="form-label">Financiero</label>' + numInput('diag-fin', d ? d.p_financiero : '') + '</div>' +
        '</div>' +
        '<div class="diag-calc" id="diag-calc">' + _calcResumenHTML(d) + '</div>' +
        '<div class="form-label" style="margin:16px 0 8px">Documentos (PDF)</div>' +
        '<div class="asoc-docs" id="diag-docs-cont"></div>' +
        '<div class="form-group" style="margin-top:14px"><label class="form-label">Observaciones</label>' +
          '<textarea class="form-textarea" id="diag-obs" placeholder="Notas adicionales…">' + esc(d ? d.observaciones : '') + '</textarea></div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        (puedeEditar() ? '<button class="btn btn-primary" id="diag-save-btn" onclick="guardarDiagnostico(' + (docId ? '\'' + jsEsc(docId) + '\'' : 'null') + ')">Guardar</button>' : '') +
      '</div>' +
    '</div>'
  );
  _renderDiagDocs();
}

// Render de las casillas de documentos (reutiliza estilos asoc-doc-*/asoc-f-*)
function _renderDiagDocs() {
  const cont = document.getElementById('diag-docs-cont');
  if (!cont || !_DIAG_FORM) return;
  cont.innerHTML = DIAG_DOCS.map(function (dd) {
    const f = _DIAG_FORM.documentos[dd.key];
    const fila = (f && (f.url || f.id))
      ? '<div class="asoc-f-list"><div class="asoc-f-row">' +
          '<span class="asoc-f-nom">' + esc(f.nombre || dd.lbl) + '</span>' +
          (f.url ? '<a class="asoc-f-ver" href="' + esc(f.url) + '" target="_blank" rel="noopener" title="Ver PDF">' + icoHTML('view') + '</a>' : '') +
          '<button type="button" class="asoc-f-del" onclick="_diagQuitarArchivo(\'' + dd.key + '\')" title="Eliminar archivo">' + icoHTML('trash') + '</button>' +
        '</div></div>'
      : '';
    return '<div class="asoc-doc-item">' +
      '<div class="asoc-doc-cab"><span class="asoc-doc-lbl">' + esc(dd.lbl) + '</span></div>' + fila +
      '<label class="asoc-doc-add">' + icoHTML('cloudUp') + '<span>' + (f ? 'Reemplazar archivo' : 'Subir archivo') + '</span>' +
        '<input type="file" accept="application/pdf,.pdf" class="asoc-doc-file" id="diag-doc-' + dd.key + '" onchange="_diagFileSel(this,\'' + dd.key + '\')"></label>' +
      '<div class="asoc-doc-pend" id="diag-pend-' + dd.key + '"></div>' +
    '</div>';
  }).join('');
}

function _diagFileSel(input, key) {
  const cont = document.getElementById('diag-pend-' + key);
  if (!cont) return;
  const f = input.files && input.files[0] ? input.files[0] : null;
  cont.innerHTML = f ? '<div class="asoc-f-pend">' + icoHTML('check') + '<span>' + esc(f.name) + '</span><small>listo para subir al guardar</small></div>' : '';
}

function _diagQuitarArchivo(key) {
  if (!_DIAG_FORM) return;
  const f = _DIAG_FORM.documentos[key];
  if (f && f.id) _DIAG_FORM.eliminar.push(f.id);
  delete _DIAG_FORM.documentos[key];
  _renderDiagDocs();
}

function onAsocChangeDiag(idAsoc) {
  const amb = CAT.asocAmbiente.find(function (a) { return a.id_asociacion === idAsoc; });
  const prov = document.getElementById('diag-provincia');
  if (prov) prov.value = amb ? (amb.provincia || '') : '';
}

// Lee los 5 puntajes del form y devuelve el cálculo.
function _calcDesdeForm() {
  return calcDiagnostico({
    organizacional: (document.getElementById('diag-org') || {}).value,
    productivo:     (document.getElementById('diag-prod') || {}).value,
    empresarial:    (document.getElementById('diag-emp') || {}).value,
    ambiental:      (document.getElementById('diag-amb') || {}).value,
    financiero:     (document.getElementById('diag-fin') || {}).value,
  });
}

function _calcResumenHTML(d) {
  const c = d
    ? { total: d.valoracion_total, debil: d.modulo_debil, categoria: d.categoria }
    : { total: 0, debil: '—', categoria: 'En Acompañamiento' };
  return '<div class="diag-calc-item"><span>Valoración total</span><b id="diag-total">' + fmtNum(c.total, 1) + '%</b></div>' +
         '<div class="diag-calc-item"><span>Módulo más débil</span><b id="diag-debil">' + esc(c.debil || '—') + '</b></div>' +
         '<div class="diag-calc-item"><span>Categoría</span><span id="diag-categoria">' + categoriaBadge(c.categoria) + '</span></div>';
}

// Recalcula y refresca los displays automáticos al escribir.
function recalcDiagnostico() {
  const c = _calcDesdeForm();
  const t = document.getElementById('diag-total'); if (t) t.textContent = fmtNum(c.total, 1) + '%';
  const w = document.getElementById('diag-debil'); if (w) w.textContent = c.debil || '—';
  const k = document.getElementById('diag-categoria'); if (k) k.innerHTML = categoriaBadge(c.categoria);
}

// ── Guardar ──
async function guardarDiagnostico(docId) {
  const idAsoc = (document.getElementById('diag-asoc') || {}).value || '';
  if (!idAsoc) { showToast('Elegí una asociación'); return; }
  const anio = (document.getElementById('diag-anio') || {}).value || '';
  if (!anio) { showToast('Indicá el año'); return; }
  const tipo = (document.getElementById('diag-tipo') || {}).value || '';
  if (!tipo) { showToast('Elegí el tipo (Inicial/Cierre)'); return; }

  const amb = CAT.asocAmbiente.find(function (a) { return a.id_asociacion === idAsoc; });
  const actual = docId ? CAT.diagnosticos.find(function (x) { return x._docId === docId; }) : null;

  const o = {
    id_diagnostico:  actual ? actual.id_diagnostico : nuevoId('DIAG'),
    id_asociacion:   idAsoc,
    nombre:          amb ? amb.nombre : (actual ? actual.nombre : ''),
    provincia:       amb ? amb.provincia : (actual ? actual.provincia : ((document.getElementById('diag-provincia') || {}).value || '')),
    anio:            anio,
    tipo:            tipo,
    p_organizacional:(document.getElementById('diag-org') || {}).value || 0,
    p_productivo:    (document.getElementById('diag-prod') || {}).value || 0,
    p_empresarial:   (document.getElementById('diag-emp') || {}).value || 0,
    p_ambiental:     (document.getElementById('diag-amb') || {}).value || 0,
    p_financiero:    (document.getElementById('diag-fin') || {}).value || 0,
    observaciones:   (document.getElementById('diag-obs') || {}).value || '',
    documentos:      JSON.parse(JSON.stringify((_DIAG_FORM && _DIAG_FORM.documentos) ? _DIAG_FORM.documentos : {})),
    id_carpeta_drive:(actual && actual.id_carpeta_drive) ? actual.id_carpeta_drive : '',
  };

  const btn = document.getElementById('diag-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  // Carpeta de Drive: Diagnósticos > <Asociación> (compartida por asociación)
  const tok = driveToken();
  if (!o.id_carpeta_drive) {
    if (tok) {
      try { o.id_carpeta_drive = await driveBuscarOCrear(o.nombre || idAsoc, DRIVE_PARENTS.diagnosticos, tok); }
      catch (e) { console.warn('Drive diagnóstico:', e); showToast('No se pudo crear la carpeta (se guarda igual)'); }
    } else {
      showToast('Sesión de Drive expirada: se guarda sin carpeta');
    }
  }

  // Subir los PDFs seleccionados (nombre con año+tipo para no colisionar en la carpeta compartida)
  const nuevos = DIAG_DOCS.map(function (dd) {
    const el = document.getElementById('diag-doc-' + dd.key);
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
          const fname = n.file + '_' + anio + '_' + tipo + '.pdf';
          const prev = o.documentos[n.key];
          if (prev && prev.id) { try { await driveEliminarCarpeta(prev.id, tok); } catch (e) {} }
          const up = await driveSubirArchivo(n.archivo, fname, o.id_carpeta_drive, tok);
          o.documentos[n.key] = { id: up.id, url: up.webViewLink, nombre: fname };
        } catch (e) { console.warn('Subida documento:', e); showToast('No se pudo subir ' + n.file); }
      }
    }
  }

  // Aplicar eliminaciones marcadas (a papelera)
  if (_DIAG_FORM && _DIAG_FORM.eliminar.length && tok) {
    for (let i = 0; i < _DIAG_FORM.eliminar.length; i++) {
      try { await driveEliminarCarpeta(_DIAG_FORM.eliminar[i], tok); } catch (e) { console.warn('Papelera archivo:', e); }
    }
  }

  const fs = diagnosticoToFS(o); // calcula valoración/módulo débil/categoría
  let r;
  if (docId) {
    r = await fsWrite(function () { return window.fb.updateDoc(fsDoc('Diagnosticos', docId), fs); });
    if (r.ok) { const i = CAT.diagnosticos.findIndex(function (x) { return x._docId === docId; }); if (i >= 0) CAT.diagnosticos[i] = diagnosticoFromFS(Object.assign({ _docId: docId }, fs)); }
  } else {
    const ref = window.fb.doc(fsCol('Diagnosticos'));
    r = await fsWrite(function () { return window.fb.setDoc(ref, fs); });
    if (r.ok) CAT.diagnosticos.push(diagnosticoFromFS(Object.assign({ _docId: ref.id }, fs)));
  }

  if (!r.ok) { showToast('Error al guardar: ' + (r.error || '')); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }
  showToast(r.offline ? 'Guardado (se sincronizará) ✓' : 'Guardado ✓');
  cerrarModal();
  renderVistaDiagnosticos();
}

// ── Eliminar ──
function confirmarEliminarDiagnostico(docId) {
  const d = CAT.diagnosticos.find(function (x) { return x._docId === docId; });
  if (!d) return;
  abrirModal(
    '<div class="modal" style="max-width:440px">' +
      '<div class="modal-head"><div class="modal-title">Eliminar diagnóstico</div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body"><p style="color:var(--text-muted);font-size:14px;line-height:1.6">' +
        '¿Seguro que quieres eliminar el diagnóstico <strong>' + esc(d.tipo || '') + ' ' + esc(d.anio || '') + '</strong> de <strong>' + esc(d.nombre || '') + '</strong>? Se enviarán a la papelera sus documentos (la carpeta de la asociación se conserva).' +
      '</p></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        '<button class="btn btn-danger" onclick="eliminarDiagnostico(\'' + jsEsc(docId) + '\')">Eliminar</button>' +
      '</div>' +
    '</div>'
  );
}

async function eliminarDiagnostico(docId) {
  const d = CAT.diagnosticos.find(function (x) { return x._docId === docId; });
  if (!d) { showToast('No se encontró el diagnóstico'); return; }
  const tok = driveToken();
  if (tok) {
    for (let i = 0; i < DIAG_DOCS.length; i++) {
      const f = _diagDoc(d, DIAG_DOCS[i].key);
      if (f && f.id) { try { await driveEliminarCarpeta(f.id, tok); } catch (e) { console.warn('Papelera doc diag:', e); } }
    }
  }
  const r = await fsWrite(function () { return window.fb.deleteDoc(fsDoc('Diagnosticos', docId)); });
  if (!r.ok) { showToast('Error al eliminar: ' + (r.error || '')); return; }
  CAT.diagnosticos = CAT.diagnosticos.filter(function (x) { return x._docId !== docId; });
  showToast(r.offline ? 'Eliminado (se sincronizará) ✓' : 'Diagnóstico eliminado ✓');
  cerrarModal();
  renderVistaDiagnosticos();
}

// ── Exportar Excel ──
async function exportarDiagnosticosExcel() {
  if (!(CAT.diagnosticos || []).length) { showToast('No hay datos para exportar.'); return; }
  try {
    await cargarSheetJS();
    if (!window.XLSX) { showToast('No se pudo cargar el exportador'); return; }
    const num = function (v) { return parseFloat(v) || 0; };
    const sino = function (d, key) { return _diagDoc(d, key) ? 'Sí' : 'No'; };
    const header = ['Asociación', 'Provincia', 'Año', 'Tipo', 'Organizacional', 'Productivo', 'Empresarial', 'Ambiental', 'Financiero', 'Valoración Total', 'Módulo Débil', 'Categoría', 'Diagnóstico inicial', 'Diagnóstico final', 'Observaciones'];
    const filas = (CAT.diagnosticos || []).map(function (d) {
      return [d.nombre, d.provincia, num(d.anio), d.tipo, num(d.p_organizacional), num(d.p_productivo), num(d.p_empresarial), num(d.p_ambiental), num(d.p_financiero),
        num(d.valoracion_total), d.modulo_debil || '', d.categoria || '', sino(d, 'diag_inicial'), sino(d, 'diag_final'), d.observaciones || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([header].concat(filas));
    ws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 7 }, { wch: 9 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 15 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Diagnósticos');
    XLSX.writeFile(wb, 'Diagnosticos_' + new Date().toISOString().substring(0, 10) + '.xlsx');
    showToast('Excel descargado ✓');
  } catch (e) { console.error('export diagnósticos:', e); showToast('Error al exportar'); }
}

// ── Estilos propios (resumen de cálculo en el form) ──
(function () {
  if (document.getElementById('diag-styles')) return;
  const s = document.createElement('style');
  s.id = 'diag-styles';
  s.textContent = `
    .diag-calc { background:var(--surface-hover); border:1px solid var(--border); border-radius:14px; padding:6px 16px; margin-top:8px; }
    .diag-calc-item { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); font-size:14px; color:var(--text-muted); }
    .diag-calc-item:last-child { border-bottom:none; }
    .diag-calc-item b { font-size:16px; font-weight:800; color:var(--text); }

    /* Botón volver + chevron del Nivel 1 */
    .ent-back { width:38px; height:38px; border-radius:11px; border:1px solid var(--border); background:var(--surface); color:var(--text-muted); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; transition:background .15s,color .15s; }
    .ent-back:hover { background:var(--surface-hover); color:var(--text); }
    .ent-back svg { width:18px; height:18px; }

    /* Filas agrupadas por provincia (tarjetas por asociación) */
    .asoc-provs { display:flex; flex-direction:column; gap:22px; }
    .asoc-prov-cab { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
    .asoc-prov-ico { width:34px; height:34px; border-radius:10px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .asoc-prov-ico svg { width:17px; height:17px; }
    .asoc-prov-nom { font-size:14px; font-weight:800; color:var(--text); text-transform:uppercase; letter-spacing:.4px; }
    .asoc-prov-count { font-size:11px; font-weight:600; color:var(--text-dim); background:rgba(0,0,0,.04); padding:3px 10px; border-radius:20px; }
    .asoc-prov-lista { display:flex; flex-direction:column; gap:10px; }

    .asoc-row { display:flex; align-items:center; gap:14px; width:100%; text-align:left; background:var(--surface); border:1px solid var(--border); border-radius:15px; padding:13px 18px; cursor:pointer; transition:box-shadow .15s,transform .12s,border-color .15s; }
    .asoc-row:hover { box-shadow:0 6px 18px rgba(0,0,0,.08); transform:translateY(-2px); border-color:transparent; }
    .asoc-row-ico { width:40px; height:40px; border-radius:11px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .asoc-row-ico svg { width:19px; height:19px; }
    .asoc-row-nom { flex:1; min-width:0; font-size:14px; font-weight:700; color:var(--text); line-height:1.3; }
    .asoc-row-right { display:flex; align-items:center; gap:12px; flex-shrink:0; }
    .asoc-row-pill { font-size:12.5px; font-weight:700; padding:5px 12px; border-radius:20px; white-space:nowrap; }
    .asoc-row-pill-0 { color:var(--text-dim); background:rgba(0,0,0,.05); }
    .asoc-row-chev { color:var(--text-dim); display:flex; align-items:center; }
    .asoc-row-chev svg { width:18px; height:18px; }

    /* ── Nivel 2: registro de diagnósticos (tarjeta simple, sin gráficos) ── */
    .dg2-list { display:flex; flex-direction:column; gap:14px; }
    .dg2-card { background:var(--white); border:1px solid var(--border); border-radius:16px; padding:18px 20px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
    .dg2-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .dg2-year { display:flex; align-items:center; gap:10px; min-width:0; }
    .dg2-anio { font-size:20px; font-weight:800; color:var(--text); letter-spacing:-.3px; font-variant-numeric:tabular-nums; }
    .dg2-acts { display:flex; gap:6px; flex-shrink:0; }
    .dg2-score { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; margin-top:12px; padding-bottom:14px; border-bottom:1px solid #eef1f7; }
    .dg2-score-l { display:flex; flex-direction:column; min-width:0; }
    .dg2-score-lbl { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.4px; }
    .dg2-score-val { font-size:28px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.05; margin-top:3px; }
    .dg2-comps { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:0 28px; margin-top:6px; }
    .dg2-c { display:flex; align-items:baseline; justify-content:space-between; gap:10px; padding:9px 0; border-bottom:1px solid #f1f3f8; }
    .dg2-c-lbl { font-size:13px; font-weight:600; color:var(--text-muted); display:flex; align-items:baseline; gap:8px; }
    .dg2-c-lbl em { font-style:normal; font-size:9px; font-weight:700; color:#c26a00; background:rgba(245,173,33,.16); padding:2px 7px; border-radius:20px; text-transform:uppercase; letter-spacing:.3px; white-space:nowrap; }
    .dg2-c-val { font-size:16px; font-weight:800; color:var(--text); font-variant-numeric:tabular-nums; }
    .dg2-c.weak .dg2-c-val { color:#c26a00; }
    .dg2-docs { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
    .dg2-doc { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600; color:#0a9e83; background:rgba(24,174,151,.08); border:1px solid rgba(24,174,151,.18); border-radius:10px; padding:7px 11px; text-decoration:none; }
    .dg2-doc:hover { background:rgba(24,174,151,.16); }
    .dg2-doc svg { width:14px; height:14px; }
    .dg2-count { font-size:12px; color:var(--text-dim); text-align:center; margin-top:16px; }

    @media (max-width:560px) {
      .dg2-card { padding:16px; }
      .dg2-score-val { font-size:24px; }
      .dg2-comps { grid-template-columns:1fr; }
    }

    /* ── Nivel 1: secciones por categoría + franjas desplegables ── */
    .diag-cats { display:flex; flex-direction:column; gap:26px; }
    .diag-cat-head { display:flex; align-items:center; flex-wrap:wrap; gap:8px 10px; padding:0 4px 10px; }
    .diag-grp-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
    .diag-grp-name { font-size:12.5px; font-weight:800; text-transform:uppercase; letter-spacing:.5px; }
    .diag-grp-count { font-size:11.5px; font-weight:600; color:var(--text-dim); }
    .diag-grp-prom { margin-left:auto; font-size:11.5px; font-weight:700; color:var(--text-muted); background:var(--surface); border:1px solid var(--border); padding:3px 11px; border-radius:20px; white-space:nowrap; font-variant-numeric:tabular-nums; }

    .diag-strips { display:flex; flex-direction:column; gap:10px; }

    /* Franja: cerrada = tira delgada; abierta = crece con el detalle */
    .diag-strip { position:relative; background:var(--white); border:1px solid var(--border); border-radius:14px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.03); transition:box-shadow .15s; }
    .diag-strip:hover, .diag-strip.open { box-shadow:0 6px 18px rgba(0,0,0,.07); }
    .diag-sacc { position:absolute; left:0; top:0; bottom:0; width:4px; }
    .diag-shead { display:flex; align-items:center; gap:12px; padding:13px 14px 13px 20px; cursor:pointer; }
    .diag-sname { flex:1; min-width:0; }
    .diag-sname b { display:block; font-size:14px; font-weight:700; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .diag-sname small { display:block; font-size:11.5px; color:var(--text-muted); margin-top:1px; }
    .diag-stog { flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; color:var(--text-dim); }
    .diag-stog svg { width:18px; height:18px; transition:transform .2s; }
    .diag-strip.open .diag-stog svg { transform:rotate(180deg); }
    .diag-sarr { flex-shrink:0; width:32px; height:32px; border-radius:9px; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--border); background:var(--surface); color:var(--text-muted); cursor:pointer; padding:0; transition:.14s; }
    .diag-sarr svg { width:16px; height:16px; }
    .diag-sarr:hover { background:#506CFF; border-color:#506CFF; color:#fff; }

    .diag-sbody { display:none; border-top:1px solid var(--border); padding:16px 18px 18px; }
    .diag-strip.open .diag-sbody { display:block; }
    .diag-sgen { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .diag-sgen-lbl { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.4px; }
    .diag-sgen-val { font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; }
    .diag-sgen-bar { height:6px; background:#eef0f4; border-radius:20px; overflow:hidden; margin:8px 0 16px; }
    .diag-sgen-bar i { display:block; height:100%; border-radius:20px; }
    .diag-scomps { display:flex; flex-direction:column; gap:10px; }
    .diag-scomp { display:flex; align-items:center; gap:12px; }
    .diag-scomp-lbl { font-size:12.5px; font-weight:600; color:var(--text-muted); width:116px; flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .diag-scomp-bar { flex:1; height:7px; background:#eef0f4; border-radius:20px; overflow:hidden; }
    .diag-scomp-bar i { display:block; height:100%; border-radius:20px; transition:width .5s ease; }
    .diag-scomp-val { font-size:13px; font-weight:800; width:30px; text-align:right; flex-shrink:0; font-variant-numeric:tabular-nums; color:var(--text); }
    .diag-ssin { font-size:13px; font-weight:600; color:var(--text-dim); }

    @media (max-width:560px) {
      .diag-shead { padding:12px 12px 12px 18px; }
      .diag-sbody { padding:14px 14px 16px; }
      .diag-scomp-lbl { width:96px; font-size:12px; }
    }
  `;
  document.head.appendChild(s);
})();
