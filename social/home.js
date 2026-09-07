// ============================================================
// DASHBOARD SOCIAL — home.js
// Sección Home: gráficos generados en el frontend.
//  1) % de alianzas por etapa (Inicial/Intermedia/Final)
//  2) % de recicladores por provincia
//  3) % de recicladores por sexo
//  4) % de recicladores con RUC
//  5) % de recicladores con cuenta bancaria
//  6) % de recicladores con certificación SECAP
//  7) Recicladores CON SECAP por rango etario
//  8) Recicladores SIN SECAP por rango etario
// Filtros (drawer): provincia + asociación. Botón para volver al Hub.
// ============================================================

const HOME = (() => {

  let _fProvs = [];
  let _fAsocs = [];
  let _fSexoEdad = '';   // '' = todos | 'Masculino' | 'Femenino' — solo para los 2 gráficos por rango etario

  const ETAPAS = ['Inicial', 'Intermedia', 'Final'];
  const ETAPA_COLORS = ['#F5AD21', '#33A8DE', '#18AE97'];
  const PROV_COLORS = ['#506CFF', '#18AE97', '#F5AD21', '#F82D72', '#FF751F', '#33A8DE', '#9FDA60', '#FF85FF', '#0BC3FF', '#FF376F'];

  // ── Rangos etarios (SECAP por edad) ──
  const RANGOS_EDAD = [
    { label: 'Menores de 18', min: 0,  max: 17 },
    { label: '18 a 29 años',  min: 18, max: 29 },
    { label: '30 a 44 años',  min: 30, max: 44 },
    { label: '45 a 64 años',  min: 45, max: 64 },
    { label: '65 años y más', min: 65, max: 200 },
  ];
  const SIN_FECHA = 'Sin fecha de nacimiento';
  // Mismo color por rango en ambos gráficos, para poder compararlos de un vistazo.
  const EDAD_COLORS = ['#F82D72', '#7B5CFF', '#33A8DE', '#18AE97', '#F5AD21'];

  // Sexo normalizado a 'Masculino' | 'Femenino' | '' (sin dato). Criterio único
  // para el gráfico de sexo y para el filtro de los gráficos por rango etario.
  function _sexoNorm(r) {
    const s = (r.sexo || '').toLowerCase();
    if (s.indexOf('masc') === 0) return 'Masculino';
    if (s.indexOf('fem') === 0) return 'Femenino';
    return '';
  }

  // Edad en años cumplidos. Acepta dd/mm/aaaa (formato de la app de Fichas) y
  // aaaa-mm-dd, igual que fmtFecha. Devuelve null si no hay fecha o es inválida.
  function _edadDesdeFecha(f) {
    if (!f) return null;
    const s = String(f).trim();
    let a, m, d, mm;
    if ((mm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { d = +mm[1]; m = +mm[2]; a = +mm[3]; }
    else if ((mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { a = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else return null;
    if (!a || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - a;
    const yaCumplio = (hoy.getMonth() + 1 > m) || (hoy.getMonth() + 1 === m && hoy.getDate() >= d);
    if (!yaCumplio) edad--;
    return (edad < 0 || edad > 120) ? null : edad;   // descarta fechas corruptas
  }

  function _contarPorRango(lista) {
    const cont = {};
    RANGOS_EDAD.forEach(function (g) { cont[g.label] = 0; });
    cont[SIN_FECHA] = 0;
    lista.forEach(function (r) {
      const e = _edadDesdeFecha(r.fecha_nacimiento);
      const g = (e == null) ? null : RANGOS_EDAD.find(function (x) { return e >= x.min && e <= x.max; });
      cont[g ? g.label : SIN_FECHA]++;
    });
    return cont;
  }

  // Rangos con datos en ALGUNO de los dos grupos: así ambos gráficos muestran
  // las mismas filas (comparables) sin arrastrar rangos vacíos en los dos.
  function _rangosVisibles(contA, contB) {
    return RANGOS_EDAD.map(function (g) { return g.label; }).concat([SIN_FECHA])
      .filter(function (l) { return (contA[l] || 0) > 0 || (contB[l] || 0) > 0; });
  }

  function _colorRango(label) {
    const i = RANGOS_EDAD.findIndex(function (g) { return g.label === label; });
    return i >= 0 ? EDAD_COLORS[i % EDAD_COLORS.length] : '#d7d7e0';
  }

  // Porcentaje relativo al propio grupo (con/sin SECAP): cada gráfico suma 100%.
  function _itemsRango(cont, total, etiquetas) {
    return etiquetas.map(function (l) {
      const v = cont[l] || 0;
      return { label: l, value: v, pct: total ? v / total * 100 : 0, color: _colorRango(l) };
    });
  }

  // ── Conjuntos filtrados ──
  // La asociación se resuelve al _docId canónico de Asoc_Ambiente (mismo criterio
  // que la sección Recicladores), porque los registros referencian la asociación
  // de formas distintas (doc.id del formulario externo vs. campo id_asociacion).
  function _asocDocIds(ids) {
    return (ids || []).map(function (x) { const a = _buscarAsoc(x); return a ? a._docId : x; });
  }
  function _recFiltrados() {
    return CAT.recicladores.filter(function (r) {
      return pasaFiltro(_fProvs, provinciaDeReciclador(r)) && pasaFiltro(_fAsocs, _asocDocIdDeReciclador(r));
    });
  }
  function _aliFiltradas() {
    return CAT.alianzas.filter(function (a) {
      return pasaFiltroLista(_fProvs, a.provincias) && pasaFiltroLista(_fAsocs, _asocDocIds(a.asociaciones));
    });
  }

  function _provincias() {
    return Array.from(new Set(CAT.asocAmbiente.map(function (a) { return a.provincia; }).filter(Boolean))).sort();
  }
  function _asociaciones() {
    return CAT.asocAmbiente.map(function (a) { return { val: a._docId, lbl: a.nombre }; });
  }

  // ── Render principal ──
  function render() {
    _registrarFiltros();
    document.getElementById('main-content').innerHTML =
      '<div class="page-header">' +
        '<div>' +
          '<div class="page-title">Gráficos</div>' +
          '<div class="page-sub">' + esc(fmtFechaLarga(new Date())) + '</div>' +
        '</div>' +
        '<div class="hdr-actions">' +
          '<button class="hdr-circle" onclick="openFilterDrawer(\'home\', this)" title="Filtros" aria-label="Filtros">' +
            icoHTML('filter') + '<span class="filter-badge" id="home-filter-badge" style="display:none"></span>' +
          '</button>' +
          '<button class="hdr-circle" onclick="volverAlHub()" title="Volver al Hub" aria-label="Volver al Hub">' +
            icoHTML('logout') +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div id="home-charts">' + _charts() + '</div>';
    updateFilterBadge('home');
  }

  // ── Bloque de gráficos ──
  function _charts() {
    const recs = _recFiltrados();
    const alis = _aliFiltradas();
    const totR = recs.length;

    // 1) Alianzas por etapa (checklist múltiple → % de alianzas con cada etapa marcada)
    const totA = alis.length;
    const contE = { Inicial: 0, Intermedia: 0, Final: 0 };
    alis.forEach(function (a) { (a.etapas || []).forEach(function (e) { if (contE[e] != null) contE[e]++; }); });
    const itemsEtapa = ETAPAS.map(function (e, i) {
      return { label: e, value: contE[e], pct: totA ? contE[e] / totA * 100 : 0, color: ETAPA_COLORS[i] };
    });

    // 2) Recicladores por provincia
    const byProv = {};
    recs.forEach(function (r) { const p = provinciaDeReciclador(r) || 'Sin provincia'; byProv[p] = (byProv[p] || 0) + 1; });
    const itemsProv = Object.keys(byProv).map(function (p, i) {
      return { label: p, value: byProv[p], pct: totR ? byProv[p] / totR * 100 : 0 };
    }).sort(function (a, b) { return b.value - a.value; });
    itemsProv.forEach(function (it, i) { it.color = PROV_COLORS[i % PROV_COLORS.length]; });

    // 3) Sexo
    let m = 0, f = 0, sd = 0;
    recs.forEach(function (r) {
      const s = _sexoNorm(r);
      if (s === 'Masculino') m++; else if (s === 'Femenino') f++; else sd++;
    });
    const segSexo = [
      { label: 'Masculino', value: m, color: '#33A8DE' },
      { label: 'Femenino',  value: f, color: '#F82D72' },
    ];
    if (sd > 0) segSexo.push({ label: 'Sin dato', value: sd, color: '#d7d7e0' });

    // 4) RUC
    let conRuc = 0; recs.forEach(function (r) { if (r.ruc) conRuc++; });
    const segRuc = [
      { label: 'Con RUC', value: conRuc, color: '#18AE97' },
      { label: 'Sin RUC', value: totR - conRuc, color: '#e6e6ee' },
    ];

    // 5) Cuenta bancaria
    let conCta = 0; recs.forEach(function (r) { if (r.cuenta_bancaria) conCta++; });
    const segCta = [
      { label: 'Con cuenta', value: conCta, color: '#506CFF' },
      { label: 'Sin cuenta', value: totR - conCta, color: '#e6e6ee' },
    ];

    // 6) Certificación SECAP
    let conSecap = 0; recs.forEach(function (r) { if (r.certificacion_secap) conSecap++; });
    const segSecap = [
      { label: 'Con SECAP', value: conSecap, color: '#FF751F' },
      { label: 'Sin SECAP', value: totR - conSecap, color: '#e6e6ee' },
    ];

    // 7 y 8) SECAP por rango etario (con y sin certificación).
    // El filtro de sexo (icono en la cabecera) aplica a los DOS para que sigan comparables.
    const recsEdad = _fSexoEdad
      ? recs.filter(function (r) { return _sexoNorm(r) === _fSexoEdad; })
      : recs;
    const listaCon = recsEdad.filter(function (r) { return !!r.certificacion_secap; });
    const listaSin = recsEdad.filter(function (r) { return !r.certificacion_secap; });
    const contCon = _contarPorRango(listaCon);
    const contSin = _contarPorRango(listaSin);
    const rangos  = _rangosVisibles(contCon, contSin);
    const itemsEdadCon = _itemsRango(contCon, listaCon.length, rangos);
    const itemsEdadSin = _itemsRango(contSin, listaSin.length, rangos);

    return '<div class="charts-grid">' +
      _chartCard('Alianzas por etapa', 'users', _stagesBlockAlianzas(itemsEtapa, totA)) +
      _chartCard('Recicladores por provincia', 'mapPin', _barsBlockProv(itemsProv, totR)) +
      _chartCard('Recicladores por sexo', 'user', _donutBlock(segSexo, fmtNum(totR), 'recicladores')) +
      _chartCard('Recicladores con RUC', 'file', _donutBlock(segRuc, fmtPct(totR ? conRuc / totR * 100 : 0), 'con RUC')) +
      _chartCard('Recicladores con cuenta bancaria', 'wallet', _donutBlock(segCta, fmtPct(totR ? conCta / totR * 100 : 0), 'con cuenta')) +
      _chartCard('Recicladores con certificación SECAP', 'cap', _donutBlock(segSecap, fmtPct(totR ? conSecap / totR * 100 : 0), 'con SECAP')) +
      _chartCard('CON certificación SECAP · por rango etario', 'cap',
        _chipSexo() + _barsBlockEdad(itemsEdadCon, listaCon.length, 'con SECAP'), null, _btnSexo()) +
      _chartCard('SIN certificación SECAP · por rango etario', 'cap',
        _chipSexo() + _barsBlockEdad(itemsEdadSin, listaSin.length, 'sin SECAP'), 'capOff', _btnSexo()) +
    '</div>';
  }

  function _chartCard(titulo, icono, contenido, claseIco, accion) {
    return '<div class="chart-card">' +
      '<div class="chart-head">' +
        '<span class="chart-ico chart-ico-' + (claseIco || icono) + '">' + icoHTML(icono) + '</span>' +
        '<div class="chart-title">' + esc(titulo) + '</div>' +
        (accion || '') +
      '</div>' + contenido + '</div>';
  }

  // ── Filtro por sexo de los gráficos por rango etario ──
  // Icono en la cabecera de ambas tarjetas; la selección afecta a las dos.
  function _btnSexo() {
    const on = !!_fSexoEdad;
    return '<button class="chart-act' + (on ? ' chart-act-on' : '') + '" onclick="HOME.abrirFiltroSexo()" ' +
      'title="Filtrar por sexo' + (on ? ': ' + esc(_fSexoEdad) : '') + '" aria-label="Filtrar por sexo">' +
      icoHTML('user') + '</button>';
  }

  // Chip visible sólo cuando hay filtro activo; un clic lo quita.
  function _chipSexo() {
    if (!_fSexoEdad) return '';
    return '<button class="chart-chip" onclick="HOME.limpiarFiltroSexo()" title="Quitar el filtro de sexo">' +
      icoHTML('user') + ' Solo ' + esc(_fSexoEdad) +
      '<span class="chart-chip-x">' + icoHTML('close') + '</span></button>';
  }

  function abrirFiltroSexo() {
    const opts = [
      { val: '',          lbl: 'Todos' },
      { val: 'Masculino', lbl: 'Masculino' },
      { val: 'Femenino',  lbl: 'Femenino' },
    ].map(function (o) {
      return '<label class="filter-opt"><input type="radio" name="home-sexo-edad" value="' + esc(o.val) + '"' +
        (_fSexoEdad === o.val ? ' checked' : '') + '><span>' + esc(o.lbl) + '</span></label>';
    }).join('');
    abrirModal(
      '<div class="modal" style="max-width:380px">' +
        '<div class="modal-head">' +
          '<div><div class="modal-title">Filtrar por sexo</div>' +
            '<div class="modal-sub">Se aplica a los dos gráficos por rango etario</div></div>' +
          '<button class="modal-close" onclick="cerrarModal()"></button>' +
        '</div>' +
        '<div class="modal-body"><div id="home-sexo-opts">' + opts + '</div></div>' +
        '<div class="modal-foot">' +
          '<button class="btn btn-glass" onclick="cerrarModal()">Cancelar</button>' +
          '<button class="btn btn-primary" onclick="HOME.aplicarFiltroSexo()">Aplicar</button>' +
        '</div>' +
      '</div>'
    );
  }

  function _repintar() {
    const cont = document.getElementById('home-charts');
    if (cont) cont.innerHTML = _charts();
  }

  function aplicarFiltroSexo() {
    const sel = document.querySelector('#home-sexo-opts input[name=home-sexo-edad]:checked');
    _fSexoEdad = sel ? sel.value : '';
    cerrarModal();
    _repintar();
  }

  function limpiarFiltroSexo() {
    _fSexoEdad = '';
    _repintar();
  }

  // Estado vacío de "Alianzas por etapa": mensaje + botón a la sección Alianzas
  function _emptyAlianzas() {
    return '<div class="empty-ali">' +
      '<div class="empty-ali-ico">' + icoHTML('handshake') + '</div>' +
      '<div class="empty-ali-txt">No existen alianzas registradas aún.</div>' +
      '<button class="empty-ali-btn" onclick="navTo(\'alianzas\')">Registrar alianza ' + icoHTML('chevRight') + '</button>' +
    '</div>';
  }

  // ── Barras horizontales ──
  function _barsBlock(items, total) {
    if (!total || !items.length) return '<div class="chart-empty">Sin datos para mostrar</div>';
    return '<div class="bars">' + items.map(function (it) {
      // Un valor en 0 no debe dibujar barra (si no, 0% aparenta tener algo).
      const ancho = it.pct > 0 ? Math.max(it.pct, 1.5) : 0;
      return '<div class="bar-row">' +
        '<div class="bar-top"><span class="bar-lbl">' + esc(it.label) + '</span>' +
          '<span class="bar-val">' + fmtPct(it.pct) + ' <em>(' + it.value + ')</em></span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + ancho + '%;background:' + it.color + '"></div></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // Alianzas por etapa: filas de etapa (más altas) + recuadro "Total".
  // Cada etapa es un % independiente (una alianza puede tener varias etapas).
  function _stagesBlockAlianzas(items, total) {
    if (!total) return _emptyAlianzas();
    const filas = items.map(function (it) {
      const ancho = it.pct > 0 ? Math.max(it.pct, 3) : 0;
      return '<div class="ali-stage">' +
        '<div class="ali-stage-top">' +
          '<span class="ali-stage-dot" style="background:' + it.color + '"></span>' +
          '<span class="ali-stage-lbl">' + esc(it.label) + '</span>' +
          '<span class="ali-stage-pct">' + fmtPct(it.pct) + '</span>' +
          '<span class="ali-stage-n">' + it.value + '</span>' +
        '</div>' +
        '<div class="ali-stage-track"><div class="ali-stage-fill" style="width:' + ancho + '%;background:' + it.color + '"></div></div>' +
      '</div>';
    }).join('');
    return '<div class="ali-stages">' + filas + '</div>' +
      '<div class="bars-total">' +
        '<span class="bars-total-lbl">' + icoHTML('handshake') + ' Total</span>' +
        '<span class="bars-total-val">' + fmtNum(total) + ' <em>alianza' + (total !== 1 ? 's' : '') + '</em></span>' +
      '</div>';
  }

  // Barras de provincia + recuadro "Total" abajo
  function _barsBlockProv(items, total) {
    if (!total || !items.length) return '<div class="chart-empty">Sin datos para mostrar</div>';
    return _barsBlock(items, total) +
      '<div class="bars-total">' +
        '<span class="bars-total-lbl">' + icoHTML('mapPin') + ' Total</span>' +
        '<span class="bars-total-val">' + fmtNum(total) + ' <em>recicladores</em></span>' +
      '</div>';
  }

  // Barras por rango etario + recuadro "Total" del grupo (con/sin SECAP)
  function _barsBlockEdad(items, total, sufijo) {
    if (!total) return '<div class="chart-empty">Sin recicladores en este grupo</div>';
    return _barsBlock(items, total) +
      '<div class="bars-total">' +
        '<span class="bars-total-lbl">' + icoHTML('cap') + ' Total</span>' +
        '<span class="bars-total-val">' + fmtNum(total) + ' <em>' + esc(sufijo) + '</em></span>' +
      '</div>';
  }

  // ── Dona (SVG) + leyenda ──
  function _donutBlock(segments, centerTop, centerSub) {
    const tot = segments.reduce(function (a, s) { return a + s.value; }, 0);
    if (!tot) return '<div class="chart-empty">Sin datos para mostrar</div>';
    const legend = segments.filter(function (s) { return s.value > 0; }).map(function (s) {
      return '<div class="lg-item"><span class="lg-dot" style="background:' + s.color + '"></span>' +
        '<span class="lg-lbl">' + esc(s.label) + '</span>' +
        '<span class="lg-val">' + s.value + ' · ' + fmtPct(s.value / tot * 100) + '</span></div>';
    }).join('');
    return '<div class="donut-wrap">' + _donutSVG(segments, centerTop, centerSub) + '<div class="lg">' + legend + '</div></div>';
  }

  function _donutSVG(segments, centerTop, centerSub) {
    const tot = segments.reduce(function (a, s) { return a + s.value; }, 0);
    const cx = 84, cy = 84, r = 66, C = 2 * Math.PI * r;
    let acc = 0;
    const arcs = segments.map(function (s) {
      const frac = tot ? s.value / tot : 0;
      const len = frac * C;
      const seg = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color +
        '" stroke-width="18" stroke-linecap="round" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-acc) +
        '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
      acc += len;
      return seg;
    }).join('');
    return '<svg viewBox="0 0 168 168" class="donut">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#eef0f4" stroke-width="18"/>' +
      arcs +
      '<text x="84" y="80" text-anchor="middle" class="donut-top">' + esc(centerTop) + '</text>' +
      '<text x="84" y="101" text-anchor="middle" class="donut-sub">' + esc(centerSub) + '</text>' +
    '</svg>';
  }

  // ── Filtros (drawer) ──
  function _registrarFiltros() {
    registerFilterConfig('home', {
      badgeId: 'home-filter-badge',
      sections: [
        { key: 'prov', title: 'Provincia',  type: 'options', options: _provincias() },
        { key: 'asoc', title: 'Asociación', type: 'searchselect', placeholder: 'Buscar asociación…', options: _asociaciones() },
      ],
      getValue: function (k) { return k === 'prov' ? _fProvs : _fAsocs; },
      setValue: function (k, v) { if (k === 'prov') _fProvs = v; else _fAsocs = v; },
      apply: _repintar,
    });
  }

  return {
    render: render,
    abrirFiltroSexo: abrirFiltroSexo,
    aplicarFiltroSexo: aplicarFiltroSexo,
    limpiarFiltroSexo: limpiarFiltroSexo,
  };
})();

function renderHome() { HOME.render(); }

// ── Estilos propios ──
(function () {
  if (document.getElementById('home-styles')) return;
  const s = document.createElement('style');
  s.id = 'home-styles';
  s.textContent = `
    .charts-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; align-items:start; }
    .chart-card { background:var(--surface); border-radius:20px; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,.04),0 4px 14px rgba(0,0,0,.04); }
    .chart-head { display:flex; align-items:center; gap:11px; margin-bottom:18px; }
    .chart-ico { width:38px; height:38px; border-radius:11px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
    .chart-ico svg { width:20px; height:20px; }
    .chart-ico-users  { background:rgba(80,108,255,.12);  color:#506CFF; }
    .chart-ico-mapPin { background:rgba(51,168,222,.12);  color:#33A8DE; }
    .chart-ico-user   { background:rgba(155,108,255,.12); color:#7B5CFF; }
    .chart-ico-file   { background:rgba(24,174,151,.12);  color:#18AE97; }
    .chart-ico-wallet { background:rgba(80,108,255,.12);  color:#506CFF; }
    .chart-ico-cap    { background:rgba(255,117,31,.12);  color:#FF751F; }
    .chart-ico-capOff { background:rgba(120,124,140,.13); color:#787c8c; }
    .chart-title { font-size:14px; font-weight:700; color:var(--text); min-width:0; }
    .chart-empty { text-align:center; padding:34px 0; color:var(--text-dim); font-size:13px; }

    /* Acción pequeña en la cabecera (filtro por sexo) */
    .chart-act { margin-left:auto; width:30px; height:30px; border-radius:9px; flex-shrink:0;
      display:inline-flex; align-items:center; justify-content:center; padding:0; cursor:pointer;
      border:1px solid var(--border); background:var(--surface); color:var(--text-dim); transition:all .15s; }
    .chart-act svg { width:15px; height:15px; }
    .chart-act:hover { border-color:#506CFF; color:#506CFF; background:rgba(80,108,255,.06); }
    .chart-act-on { border-color:#506CFF; background:rgba(80,108,255,.1); color:#506CFF; }

    /* Chip de filtro activo (clic = quitar) */
    .chart-chip { display:inline-flex; align-items:center; gap:6px; margin:-4px 0 14px; padding:5px 10px;
      border:none; border-radius:20px; background:rgba(80,108,255,.1); color:#506CFF;
      font-family:inherit; font-size:11.5px; font-weight:700; cursor:pointer; }
    .chart-chip svg { width:13px; height:13px; }
    .chart-chip-x { display:inline-flex; opacity:.65; }
    .chart-chip:hover { background:rgba(80,108,255,.18); }
    .chart-chip:hover .chart-chip-x { opacity:1; }

    /* Barras */
    .bars { display:flex; flex-direction:column; gap:14px; }
    .bar-top { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:6px; }
    .bar-lbl { font-size:13px; font-weight:600; color:var(--text); }
    .bar-val { font-size:12px; font-weight:700; color:var(--text-muted); }
    .bar-val em { font-style:normal; color:var(--text-dim); font-weight:600; }
    .bar-track { height:10px; background:#eef0f4; border-radius:20px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:20px; transition:width .5s ease; }

    /* Alianzas por etapa — filas de etapa más altas (evita espacios fantasmas) */
    .ali-stages { display:flex; flex-direction:column; gap:16px; }
    .ali-stage { display:flex; flex-direction:column; gap:8px; }
    .ali-stage-top { display:flex; align-items:center; gap:9px; }
    .ali-stage-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
    .ali-stage-lbl { font-size:13.5px; font-weight:700; color:var(--text); flex:1; min-width:0; }
    .ali-stage-pct { font-size:13.5px; font-weight:800; color:var(--text); font-variant-numeric:tabular-nums; }
    .ali-stage-n { font-size:11.5px; font-weight:700; color:var(--text-muted); background:rgba(0,0,0,.05); padding:2px 9px; border-radius:20px; min-width:26px; text-align:center; }
    .ali-stage-track { height:14px; background:#eef0f4; border-radius:20px; overflow:hidden; }
    .ali-stage-fill { height:100%; border-radius:20px; transition:width .5s ease; min-width:0; }

    /* Recuadro Total (barras de provincia) */
    .bars-total { display:flex; align-items:center; justify-content:space-between; margin-top:16px; padding:12px 14px; background:rgba(51,168,222,.07); border-radius:12px; }
    .bars-total-lbl { display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; color:#33A8DE; }
    .bars-total-lbl svg { width:15px; height:15px; }
    .bars-total-val { font-size:14px; font-weight:800; color:var(--text); }
    .bars-total-val em { font-style:normal; font-size:12px; font-weight:600; color:var(--text-muted); }

    /* Dona */
    .donut-wrap { display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
    .donut { width:164px; height:164px; flex-shrink:0; }
    .donut-top { font-size:30px; font-weight:800; fill:var(--text); }
    .donut-sub { font-size:10px; font-weight:600; fill:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; }
    .lg { display:flex; flex-direction:column; gap:9px; flex:1; min-width:120px; }
    .lg-item { display:flex; align-items:center; gap:8px; font-size:13px; }
    .lg-dot { width:11px; height:11px; border-radius:3px; flex-shrink:0; }
    .lg-lbl { color:var(--text); font-weight:600; flex:1; }
    .lg-val { color:var(--text-muted); font-weight:600; font-size:12px; }

    /* Estado vacío: Alianzas por etapa */
    .empty-ali { display:flex; flex-direction:column; align-items:center; text-align:center; padding:20px 10px 8px; }
    .empty-ali-ico { width:64px; height:64px; border-radius:18px; background:rgba(80,108,255,.09); color:#506CFF; display:flex; align-items:center; justify-content:center; margin-bottom:14px; }
    .empty-ali-ico svg { width:30px; height:30px; }
    .empty-ali-txt { font-size:13px; color:var(--text-muted); line-height:1.5; margin-bottom:16px; max-width:200px; }
    .empty-ali-btn { display:inline-flex; align-items:center; gap:6px; background:none; border:1.5px solid #506CFF; color:#506CFF; font-family:inherit; font-size:13px; font-weight:700; padding:9px 16px; border-radius:12px; cursor:pointer; transition:background .15s,color .15s; }
    .empty-ali-btn svg { width:16px; height:16px; }
    .empty-ali-btn:hover { background:#506CFF; color:#fff; }

    @media (max-width:768px) {
      .charts-grid { grid-template-columns:1fr; }
      .donut-wrap { justify-content:center; }
    }
  `;
  document.head.appendChild(s);
})();
