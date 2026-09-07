// ============================================================
// DASHBOARD SOCIAL — recicladores.js
// Sección Recicladores: lee/escribe la colección "recicladores"
// (compartida con la app de Fichas). CRUD: ver / editar / eliminar.
//  - La tabla NO muestra nada hasta aplicar filtros.
//  - Ficha completa al hacer clic en el nombre + descarga en PDF (con fotos).
//  - Editar permite reemplazar las 3 fotos (opcional) en la misma carpeta.
//  - Eliminar manda a la papelera la carpeta del reciclador en Drive.
// ============================================================

let RECS_FILTROS = { sexo: [], ruc: [], secap: [], cuenta: [] };
let RECS_DATA = [];

const SEXOS = ['Masculino', 'Femenino'];

// ── Filtros (drawer) del Nivel 2: aplican dentro de la asociación abierta ──
function registerRecicladoresFilters() {
  registerFilterConfig('recicladores', {
    badgeId: 'recs-filter-badge',
    sections: [
      { key: 'sexo',   title: 'Sexo',              type: 'options', options: SEXOS },
      { key: 'ruc',    title: 'RUC',               type: 'options', options: [{ val: 'si', lbl: 'Con RUC' }, { val: 'no', lbl: 'Sin RUC' }] },
      { key: 'secap',  title: 'Certificación SECAP', type: 'options', options: [{ val: 'si', lbl: 'Con SECAP' }, { val: 'no', lbl: 'Sin SECAP' }] },
      { key: 'cuenta', title: 'Cuenta bancaria',   type: 'options', options: [{ val: 'si', lbl: 'Con cuenta' }, { val: 'no', lbl: 'Sin cuenta' }] },
    ],
    getValue: function (k) { return RECS_FILTROS[k] || []; },
    setValue: function (k, v) { RECS_FILTROS[k] = v; },
    apply: function () { renderVistaRecs(); },
  });
}

// ¿pasa un booleano el filtro con/sin? (sel puede tener 'si', 'no', o ambos/ninguno)
function _pasaBool(sel, valor) {
  if (!sel || !sel.length || sel.indexOf('__ALL__') >= 0) return true;
  const quiereSi = sel.indexOf('si') >= 0;
  const quiereNo = sel.indexOf('no') >= 0;
  if (quiereSi && quiereNo) return true;
  if (quiereSi) return valor === true;
  if (quiereNo) return valor !== true;
  return true;
}

// ── Estilo por provincia (ícono + color) ──
const PROV_PALETA = ['#506CFF', '#18AE97', '#F5AD21', '#F82D72', '#FF751F', '#33A8DE', '#9FDA60', '#7B5CFF'];
const PROV_ESTILO = {
  'el oro':     { ico: 'trophy',   color: '#F5AD21' },
  'guayas':     { ico: 'mapPin',   color: '#18AE97' },
  'manabi':     { ico: 'waves',    color: '#33A8DE' },
  'pichincha':  { ico: 'mountain', color: '#506CFF' },
  'sucumbios':  { ico: 'leaf',     color: '#9FDA60' },
  'los rios':   { ico: 'waves',    color: '#0BC3FF' },
  'chimborazo': { ico: 'mountain', color: '#F82D72' },
};
function _normTxt(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function _provEstilo(prov) {
  const k = _normTxt(prov);
  if (PROV_ESTILO[k]) return PROV_ESTILO[k];
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return { ico: 'mapPin', color: PROV_PALETA[h % PROV_PALETA.length] };
}
function _rgba(hex, a) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  const n = parseInt(h, 16) || 0;
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

// Avatar con iniciales (color determinista por nombre)
function _inicialRec(nombre) {
  const parts = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
function _avatarColor(nombre) {
  const k = _normTxt(nombre);
  let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return PROV_PALETA[h % PROV_PALETA.length];
}

// ¿La ficha tiene los datos clave completos? Incluye las 3 fotos (perfil,
// cédula anverso y reverso): sin alguna de ellas, la ficha queda incompleta.
function _datosCompletos(r) {
  return !!(String(r.nombres_apellidos || '').trim() &&
    String(r.cedula || '').trim() &&
    String(r.fecha_nacimiento || '').trim() &&
    String(r.celular || '').trim() &&
    (r.foto_perfil_id || r.foto_perfil_url) &&
    (r.foto_cedula_anverso_id || r.foto_cedula_anverso_url) &&
    (r.foto_cedula_reverso_id || r.foto_cedula_reverso_url));
}

// Visor de foto (overlay sobre el formulario; se cierra al tocar)
function _fotoLightbox(urlOrId, titulo) {
  const src = driveImgSrc(urlOrId, 1200);
  if (!src) { showToast('No hay imagen disponible'); return; }
  const ov = document.createElement('div');
  ov.className = 'rec-lightbox';
  ov.innerHTML =
    '<div class="rec-lightbox-inner" onclick="event.stopPropagation()">' +
      '<button class="rec-lightbox-x" title="Cerrar">&times;</button>' +
      '<img src="' + src + '" alt="' + esc(titulo || '') + '" onerror="this.style.display=\'none\'">' +
      (titulo ? '<div class="rec-lightbox-cap">' + esc(titulo) + '</div>' : '') +
    '</div>';
  const cerrar = function () { ov.remove(); document.removeEventListener('keydown', onEsc); };
  const onEsc = function (e) { if (e.key === 'Escape') cerrar(); };
  ov.addEventListener('click', cerrar);
  ov.querySelector('.rec-lightbox-x').addEventListener('click', cerrar);
  document.addEventListener('keydown', onEsc);
  document.body.appendChild(ov);
}

// ── Render principal ──
// ── Estado de navegación (dos niveles) ──
let RECS_VISTA = 'asociaciones';  // 'asociaciones' | 'lista'
let RECS_ASOC_SEL = null;         // _docId de la asociación abierta

// docId canónico de la asociación de un reciclador (tolera id_asociacion o nombre)
function _asocDocIdDeReciclador(r) {
  let a = _buscarAsoc(r.id_asociacion);
  if (!a && r.asociacion_nombre) {
    a = CAT.asocAmbiente.find(function (x) { return (x.nombre || '').trim() === (r.asociacion_nombre || '').trim(); });
  }
  return a ? a._docId : null;
}

function _recsDeAsociacion(docId) {
  return CAT.recicladores
    .filter(function (r) { return _asocDocIdDeReciclador(r) === docId; })
    .slice()
    .sort(function (a, b) { return (a.nombres_apellidos || '').localeCompare(b.nombres_apellidos || ''); });
}

function renderRecicladores() {
  registerRecicladoresFilters();
  RECS_VISTA = 'asociaciones';   // al entrar siempre se muestran las asociaciones
  RECS_ASOC_SEL = null;
  renderVistaRecs();
  updateFilterBadge('recicladores');
}

// Wrapper: guardar/eliminar/aplicar-filtro refrescan la vista activa.
function cargarRecicladores() { renderVistaRecs(); }

function renderVistaRecs() {
  if (RECS_VISTA === 'lista' && RECS_ASOC_SEL) renderListaAsociacion();
  else renderAsociacionesCards();
}

// ── Nivel 1: asociaciones agrupadas por provincia ──
function renderAsociacionesCards() {
  RECS_VISTA = 'asociaciones';
  RECS_ASOC_SEL = null;
  const add = puedeEditar();

  // Conteo de recicladores por asociación
  const conteo = {};
  CAT.recicladores.forEach(function (r) {
    const id = _asocDocIdDeReciclador(r);
    if (id) conteo[id] = (conteo[id] || 0) + 1;
  });

  // Todas las asociaciones (el Nivel 1 ya no filtra)
  const asocs = CAT.asocAmbiente.slice();

  const header =
    '<div class="page-header">' +
      '<div><div class="page-title">Recicladores</div><div class="page-sub">Elegí una asociación</div></div>' +
      '<div class="hdr-actions">' +
        '<button class="hdr-circle" onclick="exportarTodosRecicladoresExcel()" title="Descargar Excel de todas las asociaciones">' + icoHTML('download') + '</button>' +
        (add ? '<label class="hdr-circle" title="Importar recicladores desde Excel" style="cursor:pointer">' + icoHTML('cloudUp') +
          '<input type="file" accept=".xlsx,.xls" style="display:none" onchange="importarRecicladoresExcel(this)"></label>' : '') +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormReciclador()" title="Nuevo reciclador">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>';

  if (!asocs.length) {
    document.getElementById('main-content').innerHTML = header +
      '<div class="empty-state">' + icoHTML('users').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') +
      '<p>No hay asociaciones</p></div>';
    return;
  }

  // Agrupar por provincia
  const grupos = {};
  asocs.forEach(function (a) {
    const prov = a.provincia || 'Sin provincia';
    (grupos[prov] = grupos[prov] || []).push(a);
  });
  const provsOrden = Object.keys(grupos).sort(function (a, b) { return a.localeCompare(b, 'es'); });

  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  const cuerpo = provsOrden.map(function (prov) {
    const est = _provEstilo(prov);
    const lista = grupos[prov].slice().sort(function (a, b) { return (a.nombre || '').localeCompare(b.nombre || '', 'es'); });
    const filas = lista.map(function (a) {
      const n = conteo[a._docId] || 0;
      const vacia = n === 0;
      const pill = vacia
        ? '<span class="asoc-pill asoc-pill-0">0</span>'
        : '<span class="asoc-pill" style="background:' + _rgba(est.color, 0.13) + ';color:' + est.color + '">' + n + '</span>';
      return '<button class="asoc-row' + (vacia ? ' asoc-row-vacia' : '') + '" onclick="abrirAsociacionRecs(\'' + jsEsc(a._docId) + '\')">' +
        '<span class="asoc-row-ico" style="background:' + _rgba(est.color, 0.12) + ';color:' + est.color + '">' + icoHTML('users') + '</span>' +
        '<span class="asoc-row-nombre">' + esc(a.nombre || '—') + '</span>' +
        '<span class="asoc-row-right">' + pill + '<span class="asoc-row-chev">' + CHEV + '</span></span>' +
      '</button>';
    }).join('');
    return '<div class="asoc-grupo">' +
      '<div class="asoc-grupo-titulo">' +
        '<span class="asoc-prov-ico" style="background:' + _rgba(est.color, 0.14) + ';color:' + est.color + '">' + icoHTML(est.ico) + '</span>' +
        '<span class="asoc-prov-nom">' + esc(prov) + '</span>' +
        '<span class="asoc-prov-count">' + lista.length + ' asociaci' + (lista.length !== 1 ? 'ones' : 'ón') + '</span>' +
      '</div>' +
      '<div class="asoc-grupo-lista">' + filas + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('main-content').innerHTML = header + '<div class="asoc-provs">' + cuerpo + '</div>';
}

function abrirAsociacionRecs(docId) {
  RECS_ASOC_SEL = docId;
  RECS_VISTA = 'lista';
  renderVistaRecs();
}

function volverAAsociaciones() {
  RECS_ASOC_SEL = null;
  RECS_VISTA = 'asociaciones';
  renderVistaRecs();
}

// ── Nivel 2: lista de recicladores de la asociación ──
let RECS_BUSQUEDA = '';

function renderListaAsociacion() {
  const add = puedeEditar();

  // Recicladores de la asociación, con los filtros del drawer aplicados
  const base = _recsDeAsociacion(RECS_ASOC_SEL).filter(function (r) {
    return pasaFiltro(RECS_FILTROS.sexo, r.sexo) &&
      _pasaBool(RECS_FILTROS.ruc, r.ruc === true) &&
      _pasaBool(RECS_FILTROS.secap, r.certificacion_secap === true) &&
      _pasaBool(RECS_FILTROS.cuenta, r.cuenta_bancaria === true);
  });

  // Métricas (sobre el conjunto filtrado, antes de la búsqueda de texto)
  const total = base.length;
  const completos = base.filter(_datosCompletos).length;
  const conCel = base.filter(function (r) { return String(r.celular || '').trim(); }).length;
  RECS_DATA = base; // la búsqueda de texto se aplica sobre esto en renderTablaRecicladores

  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';

  const header =
    '<div class="page-header">' +
      '<div>' +
        '<div class="rec-title-row">' +
          '<button class="rec-back" onclick="volverAAsociaciones()" title="Volver a asociaciones">' + BACK + '</button>' +
          '<div class="rec-asoc-info">' +
            '<div class="page-title">Recicladores</div>' +
            '<div class="rec-asoc-conteo">' + total + ' reciclador' + (total !== 1 ? 'es' : '') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="hdr-actions">' +
        '<button class="hdr-circle" onclick="openFilterDrawer(\'recicladores\', this)" title="Filtrar">' +
          icoHTML('filter') + '<span class="filter-badge" id="recs-filter-badge" style="display:none">0</span></button>' +
        '<button class="hdr-circle" onclick="exportarRecicladoresExcel()" title="Descargar Excel">' + icoHTML('download') + '</button>' +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormReciclador(null,\'' + jsEsc(RECS_ASOC_SEL) + '\')" title="Nuevo reciclador">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>';

  const barra =
    '<div class="rec-toolbar">' +
      '<div class="rec-search">' + icoHTML('search') +
        '<input type="text" id="rec-buscar" placeholder="Buscar por nombre o celular…" ' +
        'oninput="filtrarRecicladoresBusqueda(this.value)" value="' + esc(RECS_BUSQUEDA) + '">' +
      '</div>' +
      '<div class="rec-stats">' +
        _statCard('users', '#506CFF', total, 'Total recicladores') +
        _statCard('calendar', '#18AE97', completos, 'Con datos completos') +
        _statCard('phone', '#7B5CFF', conCel, 'Con celular registrado') +
      '</div>' +
    '</div>';

  document.getElementById('main-content').innerHTML = header + barra + '<div id="recs-wrap"></div>';
  updateFilterBadge('recicladores');
  renderTablaRecicladores();
}

function _statCard(icono, color, valor, etiqueta) {
  return '<div class="rec-stat">' +
    '<span class="rec-stat-ico" style="background:' + _rgba(color, 0.12) + ';color:' + color + '">' + icoHTML(icono) + '</span>' +
    '<div class="rec-stat-txt"><b>' + valor + '</b><span>' + esc(etiqueta) + '</span></div>' +
  '</div>';
}

function filtrarRecicladoresBusqueda(q) {
  RECS_BUSQUEDA = q || '';
  renderTablaRecicladores();
}

function renderTablaRecicladores() {
  const wrap = document.getElementById('recs-wrap');
  if (!wrap) return;

  // Búsqueda de texto (nombre o celular) sobre el conjunto ya filtrado
  const q = _normTxt(RECS_BUSQUEDA);
  const lista = !q ? RECS_DATA : RECS_DATA.filter(function (r) {
    return _normTxt(r.nombres_apellidos).indexOf(q) >= 0 || _normTxt(r.celular).indexOf(q) >= 0;
  });

  if (!lista.length) {
    wrap.innerHTML = '<div class="empty-state">' +
      icoHTML('users').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') +
      '<p>' + (RECS_BUSQUEDA ? 'Sin resultados para “' + esc(RECS_BUSQUEDA) + '”' : 'No hay recicladores con estos filtros') + '</p></div>';
    return;
  }

  const edit = puedeEditar();
  const acciones = function (r) {
    const docId = jsEsc(r._docId || '');
    const carpeta = jsEsc(r.carpeta_id || '');
    return (carpeta ? '<button class="icon-btn" onclick="event.stopPropagation();window.open(\'https://drive.google.com/drive/folders/' + carpeta + '\',\'_blank\')" title="Carpeta">' + icoHTML('folder') + '</button>' : '') +
      '<button class="icon-btn" onclick="event.stopPropagation();verReciclador(\'' + docId + '\')" title="Ver ficha">' + icoHTML('view') + '</button>' +
      (edit ? '<button class="icon-btn primary" onclick="event.stopPropagation();editarReciclador(\'' + docId + '\')" title="Editar">' + icoHTML('edit') + '</button>' +
        '<button class="icon-btn del" onclick="event.stopPropagation();confirmarEliminarReciclador(\'' + docId + '\',\'' + carpeta + '\')" title="Eliminar">' + icoHTML('trash') + '</button>' : '');
  };

  const cards = lista.map(function (r) {
    const docId = jsEsc(r._docId || '');
    const completo = _datosCompletos(r);
    const badge = completo
      ? '<span class="rec-badge rec-badge-ok">Completo</span>'
      : '<span class="rec-badge rec-badge-warn">Datos incompletos</span>';
    const nac = fmtFecha(r.fecha_nacimiento);
    const cel = esc(r.celular || '—');
    return '<div class="rec-card2" onclick="verReciclador(\'' + docId + '\')">' +
      '<div class="rec-card2-top">' +
        '<span class="rec-avatar" style="background:' + _avatarColor(r.nombres_apellidos) + '">' + esc(_inicialRec(r.nombres_apellidos)) + '</span>' +
        '<div class="rec-card2-id">' +
          '<div class="rec-card2-nombre">' + esc(r.nombres_apellidos || '—') + '</div>' +
          '<div class="rec-card2-meta">' +
            '<span class="rec-card2-dato">' + icoHTML('calendar') + ' ' + nac + '</span>' +
            '<span class="rec-card2-dato">' + icoHTML('phone') + ' ' + cel + '</span>' +
          '</div>' +
        '</div>' +
        badge +
      '</div>' +
      '<div class="rec-card2-foot"><div class="td-actions">' + acciones(r) + '</div></div>' +
    '</div>';
  }).join('');

  wrap.innerHTML = '<div class="rec-cards2">' + cards + '</div>' +
    '<div style="font-size:12px;color:var(--text-dim);text-align:right;margin-top:10px">' + lista.length + ' registro' + (lista.length !== 1 ? 's' : '') + '</div>';
}

// ── Ver ficha (clic en el nombre) ──
function verReciclador(docId) {
  const r = CAT.recicladores.find(function (x) { return x._docId === docId; });
  if (!r) { showToast('Ficha no encontrada'); return; }
  const prov = provinciaDeReciclador(r);
  const dato = function (lbl, val) {
    return '<div class="rf-row"><span class="rf-lbl">' + esc(lbl) + '</span><span class="rf-val">' + (val ? esc(val) : '—') + '</span></div>';
  };
  const sino = function (b) { return b ? 'Sí' : 'No'; };
  const foto = function (urlOrId, titulo) {
    const tiene = !!urlOrId;
    if (!tiene) {
      return '<div class="rf-foto-item rf-foto-item-none">' +
        '<span class="rf-foto-item-cap">' + esc(titulo) + '</span>' +
        '<span class="rf-foto-item-sin">Sin foto</span></div>';
    }
    return '<button type="button" class="rf-foto-item" onclick="_fotoLightbox(\'' + jsEsc(urlOrId) + '\',\'' + jsEsc(titulo) + '\')">' +
      '<span class="rf-foto-item-cap">' + esc(titulo) + '</span>' +
      '<span class="rf-foto-item-ver">' + icoHTML('viewCheck') + ' Ver foto</span></button>';
  };

  abrirModal(
    '<div class="modal modal-lg">' +
      '<div class="modal-head"><div><div class="modal-title">' + esc(r.nombres_apellidos || 'Reciclador') + '</div>' +
        '<div class="modal-sub">' + esc(r.asociacion_nombre || nombreDeAsociacion(r.id_asociacion) || '—') + (prov ? ' · ' + esc(prov) : '') + '</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="rf-grid">' +
          dato('Sexo', r.sexo) +
          dato('Cédula', r.cedula) +
          dato('Fecha de nacimiento', fmtFecha(r.fecha_nacimiento)) +
          dato('Asociación', r.asociacion_nombre || nombreDeAsociacion(r.id_asociacion)) +
          dato('Fecha de afiliación', fmtFecha(r.fecha_afiliacion)) +
          dato('Provincia', prov) +
          dato('Domicilio', r.domicilio) +
          dato('Celular', r.celular) +
          dato('Cargas familiares', fmtNum(r.cargas_familiares)) +
          dato('RUC', sino(r.ruc)) +
          dato('Cuenta bancaria', sino(r.cuenta_bancaria)) +
          dato('Certificación SECAP', sino(r.certificacion_secap)) +
        '</div>' +
        '<div class="rf-fotos">' +
          foto(r.foto_perfil_id || r.foto_perfil_url, 'Foto de perfil') +
          foto(r.foto_cedula_anverso_id || r.foto_cedula_anverso_url, 'Cédula (anverso)') +
          foto(r.foto_cedula_reverso_id || r.foto_cedula_reverso_url, 'Cédula (reverso)') +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        (r.carpeta_id ? '<a class="btn btn-glass" href="' + urlCarpeta(r.carpeta_id) + '" target="_blank" rel="noopener">Carpeta de Drive ↗</a>' : '') +
        '<button class="btn btn-primary" id="rec-pdf-btn" onclick="descargarRecicladorPDF(\'' + jsEsc(docId) + '\')">' + icoHTML('download') + ' Descargar PDF</button>' +
      '</div>' +
    '</div>'
  );
}

// ── Formulario (crear / editar) ──
function editarReciclador(docId) { abrirFormReciclador(docId); }

function abrirFormReciclador(docId, presetAsoc) {
  docId = docId || null;
  const r = docId ? CAT.recicladores.find(function (x) { return x._docId === docId; }) : null;
  const editing = !!r;

  const asocSel = r ? r.id_asociacion : (presetAsoc || '');
  const asocOpts = '<option value="">Seleccioná una asociación…</option>' + CAT.asocAmbiente.map(function (a) {
    return '<option value="' + esc(a._docId) + '"' + (asocSel === a._docId ? ' selected' : '') + '>' + esc(a.nombre) + '</option>';
  }).join('');
  const sexoOpts = '<option value="">—</option>' + SEXOS.map(function (s) {
    return '<option value="' + s + '"' + (r && r.sexo === s ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  const fotoInput = function (campo, label, urlActual) {
    const verBtn = urlActual
      ? '<button type="button" class="rec-foto-ver" onclick="_fotoLightbox(\'' + jsEsc(urlActual) + '\',\'' + jsEsc(label) + '\')">' + icoHTML('viewCheck') + ' Ver foto actual</button>'
      : '<span class="rec-foto-none">sin foto</span>';
    return '<div class="form-group"><label class="form-label">' + esc(label) + '</label>' +
      '<input type="file" accept="image/*" class="form-input rec-file" id="' + campo + '">' +
      '<div class="rec-foto-hint">' + (editing ? verBtn + ' · dejá vacío para conservarla' : 'Opcional') + '</div></div>';
  };

  abrirModal(
    '<div class="modal modal-lg">' +
      '<div class="modal-head"><div><div class="modal-title">' + (editing ? 'Editar' : 'Nuevo') + ' reciclador</div>' +
        '<div class="modal-sub">Ficha de registro</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="form-grid-2">' +
          '<div class="form-group" style="grid-column:1/-1"><label class="form-label">Nombres y apellidos *</label>' +
            '<input type="text" class="form-input" id="rec-nombre" value="' + esc(r ? r.nombres_apellidos : '') + '" placeholder="Nombre completo"></div>' +
          '<div class="form-group"><label class="form-label">Asociación</label><select class="form-select" id="rec-asoc">' + asocOpts + '</select></div>' +
          '<div class="form-group"><label class="form-label">Sexo</label><select class="form-select" id="rec-sexo">' + sexoOpts + '</select></div>' +
          '<div class="form-group"><label class="form-label">Cédula</label><input type="text" class="form-input" id="rec-cedula" maxlength="10" value="' + esc(r ? r.cedula : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Celular</label><input type="text" class="form-input" id="rec-celular" maxlength="10" value="' + esc(r ? r.celular : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Fecha de nacimiento</label><input type="date" class="form-input" id="rec-nac" value="' + _dmyToIso(r ? r.fecha_nacimiento : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Fecha de afiliación</label><input type="date" class="form-input" id="rec-afi" value="' + _dmyToIso(r ? r.fecha_afiliacion : '') + '"></div>' +
          '<div class="form-group" style="grid-column:1/-1"><label class="form-label">Domicilio</label><input type="text" class="form-input" id="rec-domicilio" value="' + esc(r ? r.domicilio : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Cargas familiares</label><input type="number" class="form-input" id="rec-cargas" min="0" step="1" value="' + (r ? r.cargas_familiares : '') + '"></div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap">' +
          _sinoRec('rec-ruc', 'Tiene RUC', r ? r.ruc : false) +
          _sinoRec('rec-cuenta', 'Cuenta bancaria', r ? r.cuenta_bancaria : false) +
          _sinoRec('rec-secap', '¿Tiene certificación del SECAP?', r ? r.certificacion_secap : false) +
        '</div>' +
        '<div class="form-label" style="margin:18px 0 8px">Fotografías</div>' +
        '<div class="form-grid-2">' +
          fotoInput('rec-foto-perfil', 'Foto de perfil', r ? (r.foto_perfil_id || r.foto_perfil_url) : '') +
          fotoInput('rec-foto-anverso', 'Cédula (anverso)', r ? (r.foto_cedula_anverso_id || r.foto_cedula_anverso_url) : '') +
          fotoInput('rec-foto-reverso', 'Cédula (reverso)', r ? (r.foto_cedula_reverso_id || r.foto_cedula_reverso_url) : '') +
        '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        '<button class="btn btn-primary" id="rec-save-btn" onclick="guardarReciclador(' + (docId ? '\'' + jsEsc(docId) + '\'' : 'null') + ')">Guardar</button>' +
      '</div>' +
    '</div>'
  );
}

function _sinoRec(id, label, checked) {
  return '<label class="sino-row" style="flex:1"><span>' + esc(label) + '</span>' +
    '<span class="sino-switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="sino-slider"></span></span></label>';
}

// dd/mm/aaaa  ⇄  aaaa-mm-dd
function _dmyToIso(dmy) {
  if (!dmy) return '';
  const m = String(dmy).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  if (/^\d{4}-\d{2}-\d{2}/.test(dmy)) return String(dmy).substring(0, 10);
  return '';
}
function _isoToDmy(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(iso);
}

// ── Guardar (escribe directo a Firestore; fotos a Drive) ──
async function guardarReciclador(docId) {
  const nombre = ((document.getElementById('rec-nombre') || {}).value || '').trim();
  if (!nombre) { showToast('El nombre es obligatorio'); return; }
  const idAsoc = (document.getElementById('rec-asoc') || {}).value || '';

  const actual = docId ? CAT.recicladores.find(function (x) { return x._docId === docId; }) : null;
  const asocNombre = idAsoc ? nombreDeAsociacion(idAsoc) : (actual ? actual.asociacion_nombre : '');

  const o = {
    id_asociacion:           idAsoc || (actual ? actual.id_asociacion : ''),
    asociacion_nombre:       asocNombre,
    nombres_apellidos:       nombre,
    sexo:                    (document.getElementById('rec-sexo') || {}).value || '',
    cedula:                  ((document.getElementById('rec-cedula') || {}).value || '').trim(),
    fecha_nacimiento:        _isoToDmy((document.getElementById('rec-nac') || {}).value || ''),
    fecha_afiliacion:        _isoToDmy((document.getElementById('rec-afi') || {}).value || ''),
    domicilio:               ((document.getElementById('rec-domicilio') || {}).value || '').trim(),
    celular:                 ((document.getElementById('rec-celular') || {}).value || '').trim(),
    cargas_familiares:       (document.getElementById('rec-cargas') || {}).value || 0,
    ruc:                     !!(document.getElementById('rec-ruc') || {}).checked,
    cuenta_bancaria:         !!(document.getElementById('rec-cuenta') || {}).checked,
    certificacion_secap:     !!(document.getElementById('rec-secap') || {}).checked,
    foto_perfil_url:         actual ? actual.foto_perfil_url : '',
    foto_cedula_anverso_url: actual ? actual.foto_cedula_anverso_url : '',
    foto_cedula_reverso_url: actual ? actual.foto_cedula_reverso_url : '',
    foto_perfil_id:          actual ? actual.foto_perfil_id : '',
    foto_cedula_anverso_id:  actual ? actual.foto_cedula_anverso_id : '',
    foto_cedula_reverso_id:  actual ? actual.foto_cedula_reverso_id : '',
    carpeta_id:              actual ? actual.carpeta_id : '',
  };

  if (r_cedulaInvalida(o.cedula)) { showToast('La cédula debe tener 10 dígitos'); return; }

  const btn = document.getElementById('rec-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  // Fotos nuevas seleccionadas
  const fPerfil = _archivo('rec-foto-perfil');
  const fAnverso = _archivo('rec-foto-anverso');
  const fReverso = _archivo('rec-foto-reverso');
  const hayFotosNuevas = !!(fPerfil || fAnverso || fReverso);

  // Drive: carpeta + subida (si hay token)
  const tok = driveToken();
  if (tok) {
    try {
      if (!o.carpeta_id) {
        const carpAsoc = await driveBuscarOCrear(asocNombre || 'Sin asociación', DRIVE_PARENTS.recicladores, tok);
        o.carpeta_id = await driveBuscarOCrear(nombre, carpAsoc, tok);
      }
      if (hayFotosNuevas) {
        const ts = Date.now();
        if (fPerfil)  { const up = await driveSubirArchivo(await comprimirImagen(fPerfil),  'perfil_' + ts + '.jpg',         o.carpeta_id, tok); o.foto_perfil_url = up.webViewLink; o.foto_perfil_id = up.id; }
        if (fAnverso) { const up = await driveSubirArchivo(await comprimirImagen(fAnverso), 'cedula_anverso_' + ts + '.jpg', o.carpeta_id, tok); o.foto_cedula_anverso_url = up.webViewLink; o.foto_cedula_anverso_id = up.id; }
        if (fReverso) { const up = await driveSubirArchivo(await comprimirImagen(fReverso), 'cedula_reverso_' + ts + '.jpg', o.carpeta_id, tok); o.foto_cedula_reverso_url = up.webViewLink; o.foto_cedula_reverso_id = up.id; }
      }
    } catch (e) {
      console.warn('Drive reciclador:', e);
      showToast('No se pudieron subir las fotos (se guarda el resto)');
    }
  } else if (hayFotosNuevas || !o.carpeta_id) {
    showToast('Sesión de Drive expirada: se guarda sin carpeta/fotos');
  }

  const fs = recicladorToFS(o);
  fs.actualizado_en = new Date();
  let r;
  if (docId) {
    r = await fsWrite(function () { return window.fb.setDoc(fsDoc('recicladores', docId), fs, { merge: true }); });
    if (r.ok) { const i = CAT.recicladores.findIndex(function (x) { return x._docId === docId; }); if (i >= 0) CAT.recicladores[i] = recicladorFromFS(Object.assign({ _docId: docId }, fs)); }
  } else {
    fs.creado_en = new Date();
    fs.creado_por = SESSION ? SESSION.email : '';
    const ref = window.fb.doc(fsCol('recicladores'));
    r = await fsWrite(function () { return window.fb.setDoc(ref, fs); });
    if (r.ok) CAT.recicladores.push(recicladorFromFS(Object.assign({ _docId: ref.id }, fs)));
  }

  if (!r.ok) { showToast('Error al guardar: ' + (r.error || '')); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }
  showToast(r.offline ? 'Guardado (se sincronizará) ✓' : 'Guardado ✓');
  cerrarModal();
  cargarRecicladores();
}

function _archivo(id) { const el = document.getElementById(id); return (el && el.files && el.files[0]) ? el.files[0] : null; }
function r_cedulaInvalida(c) { return !!c && !/^\d{10}$/.test(c); }

// Comprime y reescala una imagen a JPEG (máx ~1280px). Devuelve Blob.
function comprimirImagen(file, maxLado, calidad) {
  maxLado = maxLado || 1280; calidad = calidad || 0.82;
  return new Promise(function (resolve) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      let w = img.width, h = img.height;
      if (w > h && w > maxLado) { h = Math.round(h * maxLado / w); w = maxLado; }
      else if (h >= w && h > maxLado) { w = Math.round(w * maxLado / h); h = maxLado; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', calidad);
    };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ── Eliminar (registro + papelera de la carpeta de Drive) ──
function confirmarEliminarReciclador(docId, carpetaId) {
  abrirModal(
    '<div class="modal" style="max-width:440px">' +
      '<div class="modal-head"><div class="modal-title">Eliminar reciclador</div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body"><p style="color:var(--text-muted);font-size:14px;line-height:1.6">' +
        'Se eliminará el registro y su carpeta de Drive (con las fotos) se enviará a la papelera. Esto afecta también a la app de Fichas. ¿Continuar?' +
      '</p></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        '<button class="btn btn-danger" onclick="eliminarReciclador(\'' + jsEsc(docId) + '\',\'' + jsEsc(carpetaId) + '\')">Eliminar</button>' +
      '</div>' +
    '</div>'
  );
}

async function eliminarReciclador(docId, carpetaId) {
  if (!docId) { showToast('No se encontró la ficha'); return; }
  if (carpetaId) {
    const tok = driveToken();
    if (tok) { try { await driveEliminarCarpeta(carpetaId, tok); } catch (e) { console.warn('Drive papelera reciclador:', e); } }
  }
  const r = await fsWrite(function () { return window.fb.deleteDoc(fsDoc('recicladores', docId)); });
  if (!r.ok) { showToast('Error al eliminar: ' + (r.error || '')); return; }
  CAT.recicladores = CAT.recicladores.filter(function (x) { return x._docId !== docId; });
  showToast(r.offline ? 'Eliminado (se sincronizará) ✓' : 'Reciclador eliminado ✓');
  cerrarModal();
  cargarRecicladores();
}

// ── PDF de la ficha (con fotos) ──
async function descargarRecicladorPDF(docId) {
  const r = CAT.recicladores.find(function (x) { return x._docId === docId; });
  if (!r) { showToast('Ficha no encontrada'); return; }
  const btn = document.getElementById('rec-pdf-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    await cargarJsPDF();
    const tok = driveToken();
    // Descarga las imágenes como dataURL (vía Drive API con token).
    const imgs = {};
    if (tok) {
      const pares = [['perfil', r.foto_perfil_id || r.foto_perfil_url], ['anverso', r.foto_cedula_anverso_id || r.foto_cedula_anverso_url], ['reverso', r.foto_cedula_reverso_id || r.foto_cedula_reverso_url]];
      for (let i = 0; i < pares.length; i++) {
        try { imgs[pares[i][0]] = await _imagenDataURL(pares[i][1], tok); } catch (e) { imgs[pares[i][0]] = null; }
      }
    }
    _construirPDF(r, imgs);
    showToast('PDF generado ✓');
  } catch (e) {
    console.error('PDF:', e);
    showToast('No se pudo generar el PDF');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = icoHTML('download') + ' Descargar PDF'; }
  }
}

async function _imagenDataURL(urlOrId, token) {
  const m = String(urlOrId || '').match(/[-\w]{25,}/);
  if (!m) return null;
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + m[0] + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const blob = await r.blob();
  return await new Promise(function (res) { const fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(null); }; fr.readAsDataURL(blob); });
}

function _construirPDF(r, imgs) {
  const jsPDF = window.jspdf.jsPDF;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = M;

  // Encabezado
  doc.setFillColor(0, 35, 67); doc.rect(0, 0, W, 70, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Ficha de Reciclador', M, 34);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('ReCircula 360 · Redes Con Rostro', M, 52);
  y = 96;

  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(r.nombres_apellidos || 'Reciclador', M, y); y += 22;

  const prov = provinciaDeReciclador(r);
  const sino = function (b) { return b ? 'Sí' : 'No'; };
  const filas = [
    ['Sexo', r.sexo || '—'],
    ['Cédula', r.cedula || '—'],
    ['Fecha de nacimiento', fmtFecha(r.fecha_nacimiento)],
    ['Asociación', r.asociacion_nombre || nombreDeAsociacion(r.id_asociacion) || '—'],
    ['Provincia', prov || '—'],
    ['Fecha de afiliación', fmtFecha(r.fecha_afiliacion)],
    ['Domicilio', r.domicilio || '—'],
    ['Celular', r.celular || '—'],
    ['Cargas familiares', String(r.cargas_familiares != null ? r.cargas_familiares : '—')],
    ['RUC', sino(r.ruc)],
    ['Cuenta bancaria', sino(r.cuenta_bancaria)],
  ];
  doc.setFontSize(11);
  filas.forEach(function (f) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90);
    doc.text(f[0], M, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20);
    doc.text(String(f[1]), M + 150, y);
    y += 20;
  });

  // Fotos
  y += 10;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 90, 90); doc.setFontSize(11);
  doc.text('Fotografías', M, y); y += 12;

  const cellW = (W - M * 2 - 20) / 3;
  const cellH = cellW * 0.75;
  const pies = ['Perfil', 'Cédula (anverso)', 'Cédula (reverso)'];
  const claves = ['perfil', 'anverso', 'reverso'];
  claves.forEach(function (k, i) {
    const x = M + i * (cellW + 10);
    doc.setDrawColor(220, 220, 228); doc.setFillColor(245, 245, 249);
    doc.rect(x, y, cellW, cellH, 'FD');
    if (imgs && imgs[k]) {
      try { doc.addImage(imgs[k], 'JPEG', x + 4, y + 4, cellW - 8, cellH - 8, undefined, 'FAST'); }
      catch (e) {}
    } else {
      doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('Sin imagen', x + cellW / 2, y + cellH / 2, { align: 'center' });
    }
    doc.setTextColor(90, 90, 90); doc.setFontSize(9);
    doc.text(pies[i], x, y + cellH + 12);
  });

  const nomArch = (r.nombres_apellidos || 'reciclador').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  doc.save('Ficha_' + nomArch + '.pdf');
}

// ── Exportar Excel — por defecto la asociación abierta (con filtros aplicados);
// admite un dataset y nombre de archivo explícitos para el export de Nivel 1 (todas). ──
async function exportarRecicladoresExcel(dataset, nombreArchivo) {
  const datos = dataset || RECS_DATA;
  if (!datos.length) { showToast('No hay datos para exportar.'); return; }
  try {
    await cargarSheetJS();
    if (!window.XLSX) { showToast('No se pudo cargar el exportador'); return; }
    const sino = function (b) { return b ? 'Sí' : 'No'; };
    const header = ['Nombres y Apellidos', 'Sexo', 'Cédula', 'Fecha Nacimiento', 'Asociación', 'Provincia', 'Fecha Afiliación', 'Domicilio', 'Celular', 'Cargas Familiares', 'RUC', 'Cuenta Bancaria', 'Certificación SECAP'];
    const filas = datos.map(function (r) {
      return [r.nombres_apellidos, r.sexo, r.cedula, r.fecha_nacimiento, r.asociacion_nombre || nombreDeAsociacion(r.id_asociacion),
        provinciaDeReciclador(r), r.fecha_afiliacion, r.domicilio, r.celular, parseFloat(r.cargas_familiares) || 0, sino(r.ruc), sino(r.cuenta_bancaria), sino(r.certificacion_secap)];
    });
    const ws = XLSX.utils.aoa_to_sheet([header].concat(filas));
    ws['!cols'] = [{ wch: 28 }, { wch: 11 }, { wch: 13 }, { wch: 15 }, { wch: 26 }, { wch: 14 }, { wch: 15 }, { wch: 26 }, { wch: 12 }, { wch: 10 }, { wch: 7 }, { wch: 14 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recicladores');
    let nombreArch = nombreArchivo;
    if (!nombreArch) {
      const asoc = _buscarAsoc(RECS_ASOC_SEL);
      nombreArch = asoc && asoc.nombre ? asoc.nombre : 'Recicladores';
    }
    nombreArch = nombreArch.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    XLSX.writeFile(wb, nombreArch + '_' + new Date().toISOString().substring(0, 10) + '.xlsx');
    showToast(datos.length + ' reciclador' + (datos.length !== 1 ? 'es' : '') + ' exportado' + (datos.length !== 1 ? 's' : '') + ' ✓');
  } catch (e) { console.error('export recicladores:', e); showToast('Error al exportar'); }
}

// Descarga TODOS los recicladores de TODAS las asociaciones (botón de Nivel 1).
function exportarTodosRecicladoresExcel() {
  if (!CAT.recicladores.length) { showToast('No hay recicladores para exportar.'); return; }
  exportarRecicladoresExcel(CAT.recicladores.slice(), 'Recicladores_todas_las_asociaciones');
}

// Normaliza un nombre de asociación para comparar con tolerancia a acentos,
// mayúsculas y espacios extra/dobles (evita que un simple tilde o doble espacio
// haga que TODA la importación se salte por "asociación no encontrada").
function _normalizarNombreAsoc(s) {
  return String(s || '')
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // quita tildes/diacríticos
    .trim().replace(/\s+/g, ' ').toLowerCase();
}

// ── Importar Excel (Nivel 1): crea un reciclador por fila. Mismas columnas que
// exportarRecicladoresExcel, para poder exportar → editar → reimportar. Las fotos
// no se pueden traer por Excel; los importados quedan "incompletos" hasta subirlas. ──
async function importarRecicladoresExcel(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  input.value = ''; // permite reintentar con el mismo archivo si algo falla

  try {
    await cargarSheetJS();
    if (!window.XLSX) { showToast('No se pudo cargar el importador'); return; }

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    if (!filas.length) { showToast('El archivo no tiene filas'); return; }

    const get = function (row) {
      const claves = Array.prototype.slice.call(arguments, 1);
      for (let i = 0; i < claves.length; i++) {
        const v = row[claves[i]];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };
    const sino = function (v) {
      const s = String(v || '').trim().toLowerCase();
      return s === 'sí' || s === 'si' || s === 'true' || s === '1' || s === 'x';
    };

    showToast('Importando ' + filas.length + ' fila' + (filas.length !== 1 ? 's' : '') + '…', 60000);
    const tok = driveToken();
    let creados = 0;
    const saltados = [];

    for (let i = 0; i < filas.length; i++) {
      const row = filas[i];
      const fila = i + 2; // +1 encabezado, +1 base-1

      const nombre = get(row, 'Nombres y Apellidos', 'Nombre', 'Nombres y apellidos');
      if (!nombre) { saltados.push('Fila ' + fila + ': sin nombre'); continue; }

      const cedula = get(row, 'Cédula', 'Cedula');
      if (r_cedulaInvalida(cedula)) { saltados.push('Fila ' + fila + ' (' + nombre + '): cédula inválida'); continue; }

      const nombreAsocTexto = get(row, 'Asociación', 'Asociacion');
      let asoc = null;
      if (nombreAsocTexto) {
        const normAsoc = _normalizarNombreAsoc(nombreAsocTexto);
        asoc = CAT.asocAmbiente.find(function (a) { return _normalizarNombreAsoc(a.nombre) === normAsoc; });
        if (!asoc) { saltados.push('Fila ' + fila + ' (' + nombre + '): asociación "' + nombreAsocTexto + '" no encontrada'); continue; }
      }
      const asocNombre = asoc ? asoc.nombre : '';

      const o = {
        id_asociacion:           asoc ? asoc._docId : '',
        asociacion_nombre:       asocNombre,
        nombres_apellidos:       nombre,
        sexo:                    get(row, 'Sexo'),
        cedula:                  cedula,
        fecha_nacimiento:        get(row, 'Fecha Nacimiento', 'Fecha de nacimiento'),
        fecha_afiliacion:        get(row, 'Fecha Afiliación', 'Fecha de afiliación'),
        domicilio:               get(row, 'Domicilio'),
        celular:                 get(row, 'Celular'),
        cargas_familiares:       parseFloat(get(row, 'Cargas Familiares')) || 0,
        ruc:                     sino(get(row, 'RUC')),
        cuenta_bancaria:         sino(get(row, 'Cuenta Bancaria')),
        certificacion_secap:     sino(get(row, 'Certificación SECAP')),
        foto_perfil_url: '', foto_cedula_anverso_url: '', foto_cedula_reverso_url: '',
        foto_perfil_id: '', foto_cedula_anverso_id: '', foto_cedula_reverso_id: '',
        carpeta_id: '',
      };

      if (tok) {
        try {
          const carpAsoc = await driveBuscarOCrear(asocNombre || 'Sin asociación', DRIVE_PARENTS.recicladores, tok);
          o.carpeta_id = await driveBuscarOCrear(nombre, carpAsoc, tok);
        } catch (e) { console.warn('Drive import reciclador:', e); }
      }

      const fs = recicladorToFS(o);
      fs.creado_en = new Date();
      fs.creado_por = SESSION ? SESSION.email : '';
      const ref = window.fb.doc(fsCol('recicladores'));
      const res = await fsWrite(function () { return window.fb.setDoc(ref, fs); });
      if (res.ok) {
        CAT.recicladores.push(recicladorFromFS(Object.assign({ _docId: ref.id }, fs)));
        creados++;
      } else {
        saltados.push('Fila ' + fila + ' (' + nombre + '): error al guardar');
      }
    }

    renderVistaRecs();
    let msg = creados + ' reciclador' + (creados !== 1 ? 'es' : '') + ' importado' + (creados !== 1 ? 's' : '') + ' ✓';
    if (saltados.length) msg += ' — ' + saltados.length + ' omitido' + (saltados.length !== 1 ? 's' : '') + ' (ver consola)';
    showToast(msg, 6000);
    if (saltados.length) console.warn('Importación de recicladores — filas omitidas:\n' + saltados.join('\n'));
  } catch (e) {
    console.error('importar recicladores:', e);
    showToast('Error al importar el Excel');
  }
}

// ── Estilos propios ──
(function () {
  if (document.getElementById('recs-styles')) return;
  const s = document.createElement('style');
  s.id = 'recs-styles';
  s.textContent = `
    .modal-lg { max-width:680px; }

    .rec-nombre, .rec-card-nombre { color:#2f5bd0; font-weight:600; cursor:pointer; text-decoration:none; }
    .rec-nombre:hover, .rec-card-nombre:hover { text-decoration:underline; }

    .recs-hint { text-align:center; padding:60px 24px; color:var(--text-muted); }
    .recs-hint-ico { color:var(--text-dim); opacity:.5; margin-bottom:14px; }
    .recs-hint-txt { font-size:16px; font-weight:700; color:var(--text); }
    .recs-hint-sub { font-size:13px; color:var(--text-dim); margin-top:6px; }

    /* Ficha */
    .rf-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 24px; }
    .rf-row { display:flex; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px solid var(--border); font-size:13px; }
    .rf-lbl { color:var(--text-muted); font-weight:600; }
    .rf-val { color:var(--text); font-weight:600; text-align:right; }
    .rf-fotos { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:18px; }
    .rf-foto-item { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; aspect-ratio:4/3; background:var(--surface); border:1px solid var(--border); border-radius:12px; cursor:pointer; font-family:inherit; padding:12px; transition:box-shadow .15s,border-color .15s,transform .12s; }
    .rf-foto-item:hover { box-shadow:0 4px 14px rgba(0,0,0,.08); border-color:#506CFF; transform:translateY(-2px); }
    .rf-foto-item-cap { font-size:11.5px; font-weight:700; color:var(--text-muted); text-align:center; }
    .rf-foto-item-ver { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color:#506CFF; }
    .rf-foto-item-ver svg { width:15px; height:15px; }
    .rf-foto-item-none { cursor:default; }
    .rf-foto-item-none:hover { box-shadow:none; border-color:var(--border); transform:none; }
    .rf-foto-item-sin { font-size:11px; color:var(--text-dim); }

    /* Form fotos */
    .rec-file { padding:8px; }
    .rec-foto-hint { font-size:11px; color:var(--text-dim); margin-top:5px; display:flex; align-items:center; gap:6px; }
    .rec-foto-actual { display:inline-flex; align-items:center; gap:5px; color:var(--text-muted); }
    .rec-foto-actual img { width:22px; height:22px; object-fit:cover; border-radius:4px; }
    .rec-foto-none { color:var(--text-dim); }

    /* Switch Sí/No */
    .sino-row { display:flex; align-items:center; justify-content:space-between; padding:11px 14px; border:1.5px solid var(--border); border-radius:12px; font-size:14px; color:var(--text); }
    .sino-switch { position:relative; width:44px; height:24px; flex-shrink:0; }
    .sino-switch input { opacity:0; width:0; height:0; position:absolute; }
    .sino-slider { position:absolute; inset:0; background:#d7d7e0; border-radius:24px; transition:.2s; cursor:pointer; }
    .sino-slider::before { content:""; position:absolute; width:18px; height:18px; left:3px; top:3px; background:#fff; border-radius:50%; transition:.2s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
    .sino-switch input:checked + .sino-slider { background-image:var(--grad-c); }
    .sino-switch input:checked + .sino-slider::before { transform:translateX(20px); }

    /* Form: botón ver foto */
    .rec-foto-ver { display:inline-flex; align-items:center; gap:5px; background:rgba(80,108,255,.1); color:#506CFF; border:none; font-family:inherit; font-size:11px; font-weight:700; padding:5px 10px; border-radius:8px; cursor:pointer; }
    .rec-foto-ver svg { width:14px; height:14px; }
    .rec-foto-ver:hover { background:rgba(80,108,255,.18); }
    .rec-foto-none { color:var(--text-dim); }

    /* Visor de foto (lightbox) */
    .rec-lightbox { position:fixed; inset:0; z-index:9999; background:rgba(15,18,30,.82); display:flex; align-items:center; justify-content:center; padding:24px; backdrop-filter:blur(2px); }
    .rec-lightbox-inner { position:relative; max-width:520px; width:100%; }
    .rec-lightbox-inner img { width:100%; max-height:80vh; object-fit:contain; border-radius:14px; display:block; background:#fff; }
    .rec-lightbox-cap { text-align:center; color:#fff; font-size:13px; font-weight:600; margin-top:10px; }
    .rec-lightbox-x { position:absolute; top:-14px; right:-14px; width:34px; height:34px; border-radius:50%; border:none; background:#fff; color:#333; font-size:22px; line-height:1; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.3); }

    /* Nivel 1: asociaciones agrupadas por provincia */
    .asoc-provs { display:flex; flex-direction:column; gap:20px; }
    .asoc-grupo-titulo { display:flex; align-items:center; gap:9px; margin-bottom:9px; padding-left:2px; }
    .asoc-prov-ico { width:30px; height:30px; border-radius:9px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .asoc-prov-ico svg { width:17px; height:17px; }
    .asoc-prov-nom { font-size:12px; font-weight:800; color:var(--text); text-transform:uppercase; letter-spacing:.7px; }
    .asoc-prov-count { font-size:11.5px; font-weight:600; color:var(--text-dim); border-left:1.5px solid var(--border); padding-left:9px; }
    .asoc-grupo-lista { background:var(--surface); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
    .asoc-row {
      display:flex; align-items:center; gap:12px; width:100%;
      background:none; border:none; border-bottom:1px solid var(--border);
      padding:12px 16px; cursor:pointer; font-family:inherit; text-align:left; transition:background .13s;
    }
    .asoc-row:last-child { border-bottom:none; }
    .asoc-row:hover { background:rgba(80,108,255,.05); }
    .asoc-row-ico { width:34px; height:34px; border-radius:9px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .asoc-row-ico svg { width:18px; height:18px; }
    .asoc-row-nombre { font-size:14px; color:var(--text); line-height:1.35; flex:1; min-width:0; }
    .asoc-row-vacia { opacity:.62; }
    .asoc-row-right { display:flex; align-items:center; gap:11px; flex-shrink:0; }
    .asoc-pill { font-size:12px; font-weight:700; min-width:26px; height:22px; padding:0 8px; border-radius:20px; display:inline-flex; align-items:center; justify-content:center; }
    .asoc-pill-0 { background:rgba(0,0,0,.05); color:var(--text-dim); font-weight:600; }
    .asoc-row-chev { color:var(--text-dim); display:inline-flex; transition:transform .13s; }
    .asoc-row-chev svg { width:18px; height:18px; }
    .asoc-row:hover .asoc-row-chev { transform:translateX(3px); color:#506CFF; }

    /* Nivel 2: volver + título */
    .rec-title-row { display:flex; align-items:center; gap:12px; }
    .rec-asoc-info { min-width:0; }
    .rec-asoc-conteo { font-size:12.5px; color:var(--text-muted); margin-top:2px; }
    .rec-back { width:34px; height:34px; border-radius:10px; flex-shrink:0; border:1px solid var(--border); background:var(--surface); color:var(--text-muted); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s,color .15s; }
    .rec-back:hover { background:rgba(80,108,255,.08); color:#506CFF; }
    .rec-back svg { width:18px; height:18px; }

    /* Nivel 2: barra de búsqueda + tarjetas resumen */
    .rec-toolbar { display:flex; flex-direction:column; gap:14px; margin-bottom:18px; }
    .rec-search { position:relative; display:flex; align-items:center; }
    .rec-search svg { position:absolute; left:14px; width:18px; height:18px; color:var(--text-dim); pointer-events:none; }
    .rec-search input { width:100%; padding:12px 14px 12px 42px; border:1px solid var(--border); border-radius:14px; background:var(--surface); font-family:inherit; font-size:14px; color:var(--text); }
    .rec-search input:focus { outline:none; border-color:#506CFF; box-shadow:0 0 0 3px rgba(80,108,255,.12); }
    .rec-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .rec-stat { display:flex; align-items:center; gap:11px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 16px; }
    .rec-stat-ico { width:40px; height:40px; border-radius:11px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .rec-stat-ico svg { width:20px; height:20px; }
    .rec-stat-txt { display:flex; flex-direction:column; min-width:0; }
    .rec-stat-txt b { font-size:20px; font-weight:800; color:var(--text); line-height:1.1; }
    .rec-stat-txt span { font-size:11.5px; color:var(--text-muted); line-height:1.3; }

    /* Nivel 2: tarjetas de reciclador (sin foto) */
    .rec-cards2 { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:14px; }
    .rec-card2 { background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:16px 18px; cursor:pointer; transition:box-shadow .16s,transform .12s,border-color .16s; }
    .rec-card2:hover { box-shadow:0 6px 20px rgba(0,0,0,.08); transform:translateY(-2px); border-color:transparent; }
    .rec-card2-top { display:flex; align-items:flex-start; gap:12px; }
    .rec-avatar { width:46px; height:46px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#fff; font-size:15px; font-weight:800; }
    .rec-card2-id { flex:1; min-width:0; }
    .rec-card2-nombre { font-size:15px; font-weight:700; color:var(--text); line-height:1.3; }
    .rec-card2-meta { display:flex; flex-direction:column; gap:3px; margin-top:5px; }
    .rec-card2-dato { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-muted); }
    .rec-card2-dato svg { width:14px; height:14px; color:var(--text-dim); flex-shrink:0; }
    .rec-badge { font-size:10.5px; font-weight:700; padding:4px 9px; border-radius:20px; white-space:nowrap; flex-shrink:0; }
    .rec-badge-ok { background:rgba(24,174,151,.12); color:#0f9b84; }
    .rec-badge-warn { background:rgba(245,173,33,.15); color:#b3800f; }
    .rec-card2-foot { display:flex; justify-content:flex-end; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }

    @media (max-width:768px) {
      .rf-grid { grid-template-columns:1fr; }
      .rf-fotos { grid-template-columns:1fr; }
      .rec-stats { grid-template-columns:1fr; }
      .rec-cards2 { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(s);
})();
