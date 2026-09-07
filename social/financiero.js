// ============================================================
// DASHBOARD SOCIAL — financiero.js
// Sección Financiero (Cajas de Ahorro): CRUD (ver/editar/eliminar).
// Colección: CajasAhorro
//  - Único por Asociación + Año.
//  - Actas (miembros/validación): checklist Sí/No.
//  - Carpeta Drive: Caja de ahorro > Asociación (se crea con el 1er registro;
//    NO se elimina al borrar el registro, por ser la carpeta de la asociación).
// ============================================================

let FIN_FILTROS = { prov: [], asoc: [] };
let CAJAS_DATA = [];

function registerFinancieroFilters() {
  registerFilterConfig('financiero', {
    badgeId: 'fin-filter-badge',
    sections: [
      { key: 'prov', title: 'Provincia',  type: 'options', options: _provinciasFin() },
      { key: 'asoc', title: 'Asociación', type: 'searchselect', placeholder: 'Buscar asociación…', options: CAT.asocAmbiente.map(function (a) { return { val: a.id_asociacion, lbl: a.nombre }; }) },
    ],
    getValue: function (k) { return FIN_FILTROS[k] || []; },
    setValue: function (k, v) { FIN_FILTROS[k] = v; },
    apply: function () { cargarCajas(); },
  });
}

function _provinciasFin() {
  const set = new Set();
  CAT.cajas.forEach(function (c) { if (c.provincia) set.add(c.provincia); });
  if (!set.size) CAT.asocAmbiente.forEach(function (a) { if (a.provincia) set.add(a.provincia); });
  return Array.from(set).sort();
}

function renderFinanciero() {
  registerFinancieroFilters();
  const add = puedeEditar();
  document.getElementById('main-content').innerHTML =
    '<div class="page-header">' +
      '<div><div class="page-title">Financiero</div><div class="page-sub">Cajas de Ahorro</div></div>' +
      '<div class="hdr-actions">' +
        '<button class="hdr-circle" onclick="openFilterDrawer(\'financiero\', this)" title="Filtros">' +
          icoHTML('filter') + '<span class="filter-badge" id="fin-filter-badge" style="display:none">0</span></button>' +
        '<button class="hdr-circle" onclick="exportarCajasExcel()" title="Descargar Excel">' + icoHTML('download') + '</button>' +
        (add ? '<button class="hdr-circle hdr-circle-primary" onclick="abrirFormCaja()" title="Nueva caja de ahorro">' + icoHTML('plus') + '</button>' : '') +
      '</div>' +
    '</div>' +
    '<div id="fin-wrap"></div>';
  cargarCajas();
  updateFilterBadge('financiero');
}

function cargarCajas() {
  FIN_PAGINA = 1;
  CAJAS_DATA = CAT.cajas.filter(function (c) {
    return pasaFiltro(FIN_FILTROS.prov, c.provincia) && pasaFiltro(FIN_FILTROS.asoc, c.id_asociacion);
  }).slice().sort(function (a, b) {
    const p = (a.provincia || '').localeCompare(b.provincia || '');
    if (p !== 0) return p;
    const n = (a.asociacion || '').localeCompare(b.asociacion || '');
    if (n !== 0) return n;
    return (parseFloat(b.anio) || 0) - (parseFloat(a.anio) || 0);
  });
  renderTablaCajas();
}

// Casillas de documentos (PDF) de la caja. key = campo en documentos; file = nombre en Drive.
const CAJA_DOCS = [
  { key: 'acta_miembros',   lbl: 'Acta de miembros',   file: 'Acta_miembros' },
  { key: 'acta_validacion', lbl: 'Acta de validación', file: 'Acta_validacion' },
  { key: 'evidencia',       lbl: 'Evidencia',          file: 'Evidencia' },
];

function _cajaDoc(c, key) { return (c && c.documentos && c.documentos[key]) ? c.documentos[key] : null; }

// Visto para la tabla (verde si el documento existe)
function _docVisto(doc) {
  return (doc && doc.url)
    ? '<span class="fin-visto"><span class="fin-visto-ic">' + icoHTML('check') + '</span>Sí</span>'
    : '<span class="fin-visto-no">—</span>';
}

let FIN_PAGINA = 1;
const FIN_POR_PAGINA = 8;
function irPaginaCajas(p) { FIN_PAGINA = p; renderTablaCajas(); }

function renderTablaCajas() {
  const wrap = document.getElementById('fin-wrap');
  if (!wrap) return;

  // ── Tarjetas-resumen ──
  const total = CAJAS_DATA.length;
  const activas = CAJAS_DATA.filter(function (c) { return c.activa !== false; });
  const inscritosAct = activas.reduce(function (acc, c) { return acc + (parseFloat(c.num_inscritos) || 0); }, 0);
  const provsAct = new Set(activas.map(function (c) { return c.provincia; }).filter(Boolean));
  const asocsAct = new Set(activas.map(function (c) { return c.id_asociacion; }).filter(Boolean));
  const stats = '<div class="ali-stats">' +
    _statCardAli('wallet', '#506CFF', total, 'Total cajas', 'Registradas') +
    _statCardAli('mapPin', '#18AE97', provsAct.size, 'Provincias', 'Con cajas activas') +
    _statCardAli('users', '#7B5CFF', asocsAct.size, 'Asociaciones', 'Con cajas activas') +
    _statCardAli('user', '#F5AD21', fmtNum(inscritosAct), 'Recicladores en cajas', 'En cajas activas') +
  '</div>';

  if (!CAJAS_DATA.length) {
    wrap.innerHTML = stats + '<div class="empty-state">' +
      icoHTML('wallet').replace('<svg', '<svg style="width:48px;height:48px;opacity:0.4"') +
      '<p>No hay cajas de ahorro con estos filtros</p></div>';
    return;
  }

  const edit = puedeEditar();
  const acciones = function (c) {
    const docId = jsEsc(c._docId || '');
    return '<button class="icon-btn" onclick="event.stopPropagation();verCaja(\'' + docId + '\')" title="Ver">' + icoHTML('view') + '</button>' +
      (edit ? '<button class="icon-btn primary" onclick="event.stopPropagation();editarCaja(\'' + docId + '\')" title="Editar">' + icoHTML('edit') + '</button>' +
        '<button class="icon-btn del" onclick="event.stopPropagation();confirmarEliminarCaja(\'' + docId + '\')" title="Eliminar">' + icoHTML('trash') + '</button>' : '');
  };
  const estadoBadge = function (c) {
    const act = c.activa !== false;
    return '<span class="ali-estado ' + (act ? 'ali-estado-on' : 'ali-estado-off') + '">' + (act ? 'Activa' : 'Inactiva') + '</span>';
  };

  // ── Paginación ──
  const nPag = Math.max(1, Math.ceil(CAJAS_DATA.length / FIN_POR_PAGINA));
  if (FIN_PAGINA > nPag) FIN_PAGINA = nPag;
  const ini = (FIN_PAGINA - 1) * FIN_POR_PAGINA;
  const pagina = CAJAS_DATA.slice(ini, ini + FIN_POR_PAGINA);

  // Tabla (desktop)
  const filas = pagina.map(function (c) {
    const docId = jsEsc(c._docId || '');
    return '<tr onclick="verCaja(\'' + docId + '\')">' +
      '<td><div class="fin-conv-nombre">' + esc(c.asociacion || '—') + '</div>' +
        '<div class="fin-conv-meta">' + estadoBadge(c) + '</div></td>' +
      '<td>' + esc(c.provincia || '—') + '</td>' +
      '<td>' + esc(c.anio || '—') + '</td>' +
      '<td>' + _docVisto(_cajaDoc(c, 'acta_miembros')) + '</td>' +
      '<td>' + _docVisto(_cajaDoc(c, 'acta_validacion')) + '</td>' +
      '<td>' + _docVisto(_cajaDoc(c, 'evidencia')) + '</td>' +
      '<td data-actions-row><div class="td-actions">' + acciones(c) + '</div></td>' +
    '</tr>';
  }).join('');
  const tabla = '<div class="table-wrap fin-desk"><table>' +
    '<thead><tr><th>Asociación</th><th>Provincia</th><th>Año</th><th>Acta de miembros</th><th>Acta de validación</th><th>Evidencia</th><th style="text-align:right">Acciones</th></tr></thead>' +
    '<tbody>' + filas + '</tbody></table></div>';

  // Tarjetas (móvil)
  const cards = pagina.map(function (c) {
    const docId = jsEsc(c._docId || '');
    return '<div class="fin-card" onclick="verCaja(\'' + docId + '\')">' +
      '<div class="fin-top"><div class="fin-id"><div class="fin-nombre">' + esc(c.asociacion || '—') + '</div>' +
        '<div class="fin-conv-meta" style="margin-top:5px">' + estadoBadge(c) + '</div></div>' +
        '<span class="badge badge-blue">' + esc(c.anio || '—') + '</span></div>' +
      '<div class="fin-grid">' +
        '<div class="fin-cell"><span class="fin-mini">Provincia</span><b>' + esc(c.provincia || '—') + '</b></div>' +
        '<div class="fin-cell"><span class="fin-mini">Acta miembros</span><b>' + _docVisto(_cajaDoc(c, 'acta_miembros')) + '</b></div>' +
        '<div class="fin-cell"><span class="fin-mini">Acta validación</span><b>' + _docVisto(_cajaDoc(c, 'acta_validacion')) + '</b></div>' +
        '<div class="fin-cell"><span class="fin-mini">Evidencia</span><b>' + _docVisto(_cajaDoc(c, 'evidencia')) + '</b></div>' +
      '</div>' +
      '<div class="fin-foot"><div class="td-actions">' + acciones(c) + '</div></div>' +
    '</div>';
  }).join('');
  const cardsWrap = '<div class="fin-mob">' + cards + '</div>';

  // Pie con paginación
  const btnPrev = '<button class="ali-pg-btn"' + (FIN_PAGINA <= 1 ? ' disabled' : ' onclick="irPaginaCajas(' + (FIN_PAGINA - 1) + ')"') + '>‹</button>';
  const btnNext = '<button class="ali-pg-btn"' + (FIN_PAGINA >= nPag ? ' disabled' : ' onclick="irPaginaCajas(' + (FIN_PAGINA + 1) + ')"') + '>›</button>';
  let nums = '';
  for (let p = 1; p <= nPag; p++) nums += '<button class="ali-pg-num' + (p === FIN_PAGINA ? ' on' : '') + '" onclick="irPaginaCajas(' + p + ')">' + p + '</button>';
  const pager = '<div class="ali-pager">' +
    '<span class="ali-pager-info">Mostrando ' + pagina.length + ' de ' + CAJAS_DATA.length + ' registro' + (CAJAS_DATA.length !== 1 ? 's' : '') + '</span>' +
    '<div class="ali-pager-ctrls">' + btnPrev + nums + btnNext + '</div>' +
  '</div>';

  wrap.innerHTML = stats + tabla + cardsWrap + pager;
}

// ── Ver ficha ──
function verCaja(docId) {
  const c = CAT.cajas.find(function (x) { return x._docId === docId; });
  if (!c) { showToast('Caja no encontrada'); return; }
  const dato = function (lbl, val) {
    return '<div class="rf-row"><span class="rf-lbl">' + esc(lbl) + '</span><span class="rf-val">' + (val ? esc(val) : '—') + '</span></div>';
  };
  const docsChips = CAJA_DOCS.map(function (d) {
    const doc = _cajaDoc(c, d.key);
    return doc && doc.url
      ? '<a class="ali-doc-chip" href="' + esc(doc.url) + '" target="_blank" rel="noopener">' + icoHTML('file') + ' ' + esc(d.lbl) + '</a>'
      : '<span class="ali-doc-chip ali-doc-chip-off">' + icoHTML('file') + ' ' + esc(d.lbl) + '</span>';
  }).join('');
  abrirModal(
    '<div class="modal">' +
      '<div class="modal-head"><div><div class="modal-title">' + esc(c.asociacion || 'Caja de ahorro') + '</div>' +
        '<div class="modal-sub">' + esc(c.provincia || '—') + ' · ' + esc(c.anio || '') + '</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="rf-grid">' +
          dato('Estado', c.activa !== false ? 'Activa' : 'Inactiva') +
          dato('Año', c.anio) +
          dato('Provincia', c.provincia) +
          dato('Fecha de creación', fmtFecha(c.fecha_creacion)) +
          dato('Recicladores inscritos', fmtNum(c.num_inscritos || 0)) +
        '</div>' +
        '<div style="margin-top:16px"><div class="form-label" style="margin-bottom:8px">Documentos</div>' +
          '<div class="ali-docs-ver">' + docsChips + '</div></div>' +
        (c.observaciones ? '<div style="margin-top:14px"><div class="form-label">Observaciones</div><div style="font-size:13px;color:var(--text-muted);margin-top:4px">' + esc(c.observaciones) + '</div></div>' : '') +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-primary" onclick="cerrarModal()">Cerrar</button>' +
      '</div>' +
    '</div>'
  );
}

// ── Formulario ──
function editarCaja(docId) { abrirFormCaja(docId); }

function abrirFormCaja(docId) {
  docId = docId || null;
  const c = docId ? CAT.cajas.find(function (x) { return x._docId === docId; }) : null;
  const editing = !!c;

  const asocField = editing
    ? '<input type="text" class="form-input" value="' + esc(c.asociacion) + '" readonly>' +
      '<input type="hidden" id="caja-asoc" value="' + esc(c.id_asociacion) + '">'
    : '<select class="form-select" id="caja-asoc" onchange="onAsocChangeCaja(this.value)">' +
        '<option value="">Seleccioná una asociación…</option>' +
        CAT.asocAmbiente.map(function (a) { return '<option value="' + esc(a.id_asociacion) + '">' + esc(a.nombre) + '</option>'; }).join('') +
      '</select>';

  abrirModal(
    '<div class="modal">' +
      '<div class="modal-head"><div><div class="modal-title">' + (editing ? 'Editar' : 'Nueva') + ' caja de ahorro</div>' +
        '<div class="modal-sub">Registro financiero</div></div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body">' +
        '<div class="form-grid-2">' +
          '<div class="form-group"><label class="form-label">Asociación</label>' + asocField + '</div>' +
          '<div class="form-group"><label class="form-label">Provincia</label><input type="text" class="form-input" id="caja-provincia" readonly value="' + esc(c ? c.provincia : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Año</label><input type="number" class="form-input" id="caja-anio" min="2000" max="2100" step="1" value="' + (c ? c.anio : new Date().getFullYear()) + '"></div>' +
          '<div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="caja-estado">' +
            '<option value="activa"' + (!c || c.activa !== false ? ' selected' : '') + '>Activa</option>' +
            '<option value="inactiva"' + (c && c.activa === false ? ' selected' : '') + '>Inactiva</option>' +
          '</select></div>' +
          '<div class="form-group"><label class="form-label">Fecha de creación</label><input type="date" class="form-input" id="caja-fecha" value="' + esc(c ? c.fecha_creacion : '') + '"></div>' +
          '<div class="form-group"><label class="form-label">Recicladores inscritos</label><input type="number" class="form-input" id="caja-inscritos" min="0" step="1" value="' + (c ? (c.num_inscritos || 0) : 0) + '"></div>' +
        '</div>' +
        '<div class="form-label" style="margin:16px 0 8px">Documentos (PDF)</div>' +
        '<div class="ali-docs">' + CAJA_DOCS.map(function (d) {
          const doc = _cajaDoc(c, d.key);
          const ver = (doc && doc.url)
            ? '<button type="button" class="ali-doc-ver" onclick="window.open(\'' + jsEsc(doc.url) + '\',\'_blank\')">' + icoHTML('viewCheck') + ' Ver PDF</button>'
            : '<span class="ali-doc-sin">Sin archivo</span>';
          return '<div class="ali-doc-item">' +
            '<div class="ali-doc-cab"><span class="ali-doc-lbl">' + esc(d.lbl) + '</span>' + ver + '</div>' +
            '<input type="file" accept="application/pdf,.pdf" class="form-input ali-doc-file" id="caja-doc-' + d.key + '">' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="form-group" style="margin-top:14px"><label class="form-label">Observaciones</label>' +
          '<textarea class="form-textarea" id="caja-obs" placeholder="Notas…">' + esc(c ? c.observaciones : '') + '</textarea></div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        (puedeEditar() ? '<button class="btn btn-primary" id="caja-save-btn" onclick="guardarCaja(' + (docId ? '\'' + jsEsc(docId) + '\'' : 'null') + ')">Guardar</button>' : '') +
      '</div>' +
    '</div>'
  );
}

function onAsocChangeCaja(idAsoc) {
  const prov = document.getElementById('caja-provincia');
  if (prov) prov.value = provinciaDeAsociacion(idAsoc) || '';
}

// ── Guardar ──
async function guardarCaja(docId) {
  const idAsoc = (document.getElementById('caja-asoc') || {}).value || '';
  if (!idAsoc) { showToast('Elegí una asociación'); return; }
  const anio = (document.getElementById('caja-anio') || {}).value || '';
  if (!anio) { showToast('Indicá el año'); return; }

  // Único por asociación + año
  const dup = CAT.cajas.find(function (c) {
    return c.id_asociacion === idAsoc && String(c.anio) === String(anio) && c._docId !== docId;
  });
  if (dup) { showToast('Ya existe una caja de ahorro para esa asociación y año'); return; }

  const actual = docId ? CAT.cajas.find(function (x) { return x._docId === docId; }) : null;
  const asocNombre = nombreDeAsociacion(idAsoc) || (actual ? actual.asociacion : '');

  const o = {
    id_asociacion:    idAsoc,
    id_caja_ahorro:   actual ? actual.id_caja_ahorro : nuevoId('CAJA'),
    asociacion:       asocNombre,
    provincia:        provinciaDeAsociacion(idAsoc) || (actual ? actual.provincia : ''),
    anio:             anio,
    activa:           ((document.getElementById('caja-estado') || {}).value) !== 'inactiva',
    fecha_creacion:   (document.getElementById('caja-fecha') || {}).value || '',
    num_inscritos:    (document.getElementById('caja-inscritos') || {}).value || 0,
    observaciones:    ((document.getElementById('caja-obs') || {}).value || '').trim(),
    id_carpeta_drive: actual ? actual.id_carpeta_drive : '',
    documentos:       Object.assign({}, actual && actual.documentos ? actual.documentos : {}),
  };

  const btn = document.getElementById('caja-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  // ── Drive: carpeta de la asociación (compartida) + subida de PDFs seleccionados ──
  const nuevos = CAJA_DOCS.map(function (d) {
    const el = document.getElementById('caja-doc-' + d.key);
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
        if (!o.id_carpeta_drive) o.id_carpeta_drive = await driveBuscarOCrear(asocNombre || idAsoc, DRIVE_PARENTS.cajas, tok);
        for (let i = 0; i < nuevos.length; i++) {
          const n = nuevos[i];
          if (btn) btn.textContent = 'Subiendo ' + (i + 1) + '/' + nuevos.length + '…';
          // Incluye el año en el nombre (la carpeta es compartida por asociación entre años)
          const up = await driveSubirArchivo(n.archivo, n.file + '_' + anio + '.pdf', o.id_carpeta_drive, tok);
          o.documentos[n.key] = { id: up.id, url: up.webViewLink, nombre: n.file + '_' + anio + '.pdf' };
        }
      } catch (e) {
        console.warn('Drive caja:', e);
        showToast('No se pudieron subir algunos archivos (se guarda igual)');
      }
    } else {
      showToast(nuevos.length ? 'Sesión de Drive expirada: no se subieron los PDFs' : 'Sesión de Drive expirada: se guarda sin carpeta');
    }
  }

  const fs = cajaToFS(o);
  let r;
  if (docId) {
    r = await fsWrite(function () { return window.fb.updateDoc(fsDoc('CajasAhorro', docId), fs); });
    if (r.ok) { const i = CAT.cajas.findIndex(function (x) { return x._docId === docId; }); if (i >= 0) CAT.cajas[i] = cajaFromFS(Object.assign({ _docId: docId }, fs)); }
  } else {
    const ref = window.fb.doc(fsCol('CajasAhorro'));
    r = await fsWrite(function () { return window.fb.setDoc(ref, fs); });
    if (r.ok) CAT.cajas.push(cajaFromFS(Object.assign({ _docId: ref.id }, fs)));
  }

  if (!r.ok) { showToast('Error al guardar: ' + (r.error || '')); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }
  showToast(r.offline ? 'Guardado (se sincronizará) ✓' : 'Guardado ✓');
  cerrarModal();
  cargarCajas();
}

// ── Eliminar (solo el registro; la carpeta de la asociación se conserva) ──
function confirmarEliminarCaja(docId) {
  abrirModal(
    '<div class="modal" style="max-width:440px">' +
      '<div class="modal-head"><div class="modal-title">Eliminar caja de ahorro</div>' +
        '<button class="modal-close" onclick="cerrarModal()"></button></div>' +
      '<div class="modal-body"><p style="color:var(--text-muted);font-size:14px;line-height:1.6">' +
        '¿Seguro que quieres eliminar este registro? La carpeta de la asociación en Drive se conserva.' +
      '</p></div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
        '<button class="btn btn-danger" onclick="eliminarCaja(\'' + jsEsc(docId) + '\')">Eliminar</button>' +
      '</div>' +
    '</div>'
  );
}

async function eliminarCaja(docId) {
  if (!docId) { showToast('No se encontró el registro'); return; }
  const r = await fsWrite(function () { return window.fb.deleteDoc(fsDoc('CajasAhorro', docId)); });
  if (!r.ok) { showToast('Error al eliminar: ' + (r.error || '')); return; }
  CAT.cajas = CAT.cajas.filter(function (x) { return x._docId !== docId; });
  showToast(r.offline ? 'Eliminado (se sincronizará) ✓' : 'Caja eliminada ✓');
  cerrarModal();
  cargarCajas();
}

// ── Exportar Excel ──
async function exportarCajasExcel() {
  if (!CAJAS_DATA.length) { showToast('No hay datos para exportar.'); return; }
  try {
    await cargarSheetJS();
    if (!window.XLSX) { showToast('No se pudo cargar el exportador'); return; }
    const tiene = function (c, key) { const d = _cajaDoc(c, key); return d && d.url ? 'Sí' : 'No'; };
    const header = ['Asociación', 'Provincia', 'Año', 'Estado', 'Fecha de creación', 'Recicladores inscritos', 'Acta de Miembros', 'Acta de Validación', 'Evidencia', 'Observaciones'];
    const filas = CAJAS_DATA.map(function (c) {
      return [c.asociacion, c.provincia, parseFloat(c.anio) || 0, c.activa !== false ? 'Activa' : 'Inactiva',
        c.fecha_creacion || '', parseFloat(c.num_inscritos) || 0,
        tiene(c, 'acta_miembros'), tiene(c, 'acta_validacion'), tiene(c, 'evidencia'), c.observaciones || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([header].concat(filas));
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 7 }, { wch: 9 }, { wch: 15 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cajas de Ahorro');
    XLSX.writeFile(wb, 'CajasAhorro_' + new Date().toISOString().substring(0, 10) + '.xlsx');
    showToast('Excel descargado ✓');
  } catch (e) { console.error('export cajas:', e); showToast('Error al exportar'); }
}

// ── Estilos propios ──
(function () {
  if (document.getElementById('fin-styles')) return;
  const s = document.createElement('style');
  s.id = 'fin-styles';
  s.textContent = `
    /* Visto de documentos (tabla) */
    .fin-visto { display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:700; color:#0f9b84; }
    .fin-visto-ic { width:22px; height:22px; border-radius:50%; background:#18AE97; color:#fff; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
    .fin-visto-ic svg { width:13px; height:13px; }
    .fin-visto-no { color:var(--text-dim); font-weight:600; }

    /* Asociación (nombre + estado) */
    .fin-conv-nombre { font-weight:700; color:var(--text); font-size:14px; }
    .fin-conv-meta { display:flex; align-items:center; gap:8px; margin-top:5px; }

    .fin-desk table tbody tr { cursor:pointer; }

    /* Tarjetas móviles */
    .fin-mob { display:none; flex-direction:column; gap:12px; }
    .fin-card { background:var(--surface); border:1px solid var(--border); border-radius:18px; padding:16px; cursor:pointer; transition:box-shadow .15s,transform .12s,border-color .15s; }
    .fin-card:hover { box-shadow:0 6px 20px rgba(0,0,0,.08); transform:translateY(-2px); border-color:transparent; }
    .fin-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .fin-nombre { font-size:16px; font-weight:700; color:var(--text); line-height:1.3; }
    .fin-grid { display:flex; flex-wrap:wrap; gap:10px; margin-top:12px; padding-top:12px; border-top:1px solid var(--border); }
    .fin-cell { flex:1; min-width:45%; display:flex; flex-direction:column; gap:5px; }
    .fin-cell b { font-size:13px; font-weight:700; color:var(--text); }
    .fin-mini { font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:.5px; }
    .fin-foot { display:flex; justify-content:flex-end; margin-top:14px; }

    @media (max-width:768px) {
      .fin-desk { display:none; }
      .fin-mob { display:flex; }
      .ali-stats { grid-template-columns:1fr 1fr; }
      .form-grid-2 { grid-template-columns:1fr 1fr; }
    }
  `;
  document.head.appendChild(s);
})();
