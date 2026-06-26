/**
 * GERENCIA - API Apps Script SOLO LECTURA
 *
 * Este script esta pensado para un Google Sheet que NO pertenece al proyecto
 * y al que el usuario/script no tiene permiso de edicion.
 *
 * Importante:
 * - No usa SpreadsheetApp.openById(), porque eso exige permiso directo al Sheet.
 * - Lee las hojas publicas mediante export CSV con UrlFetchApp.
 * - Bloquea todas las acciones de escritura.
 *
 * Sheet fuente:
 * https://docs.google.com/spreadsheets/d/10utr40MF-F-3b0ouxNGDQaCw08sRLjmD6f1EYUaI344/edit
 */

const GERENCIA = {
  SHEET_ID: '10utr40MF-F-3b0ouxNGDQaCw08sRLjmD6f1EYUaI344',
  SHEETS: {
    DIAS: 'Dias',
    PAGOS: 'Pagos',
    CONFIG: 'Config'
  }
};

function doGet(e) {
  return handle_(e);
}

function doPost(e) {
  return handle_(e);
}

/**
 * Compatibilidad con el flujo anterior.
 * En modo solo lectura no se crean hojas ni encabezados.
 */
function configurarSistema() {
  return 'Sistema Gerencia configurado en modo solo lectura.';
}

function handle_(e) {
  try {
    const req = parseRequest_(e);
    const action = String(req.action || 'getAll').trim();

    const readActions = ['ping', 'getDias', 'getPagos', 'getCfg', 'getAll'];
    const writeActions = ['saveDia', 'savePago', 'updatePago', 'editPago', 'deletePago', 'saveCfg'];

    if (writeActions.includes(action)) {
      throw new Error('Este modulo esta en modo solo lectura. El Sheet fuente lo actualiza otra persona.');
    }

    if (!readActions.includes(action)) {
      throw new Error('Accion no permitida.');
    }

    requireReadAccess_(req);

    if (action === 'ping') return json_({ ok: true, message: 'Gerencia API solo lectura activa.' });
    if (action === 'getDias') return json_({ ok: true, dias: getDias_() });
    if (action === 'getPagos') return json_({ ok: true, pagos: getPagos_() });
    if (action === 'getCfg') return json_({ ok: true, cfg: getCfg_() });

    return json_({
      ok: true,
      dias: getDias_(),
      pagos: getPagos_(),
      cfg: getCfg_()
    });
  } catch (err) {
    return json_({ ok: false, error: cleanMessage_(err) });
  }
}

function getDias_() {
  return csvRows_(GERENCIA.SHEETS.DIAS).map(row => ({
    fecha: dateText_(row.fecha),
    ventaTotal: num_(row.ventaTotal),
    contado: num_(row.contado),
    credito: num_(row.credito),
    cartera: num_(row.cartera),
    cartRef: str_(row.cartRef),
    ts: str_(row.ts)
  }));
}

function getPagos_() {
  return csvRows_(GERENCIA.SHEETS.PAGOS).map(row => ({
    id: str_(row.id),
    prov: str_(row.prov),
    cat: str_(row.cat),
    fecha: dateText_(row.fecha),
    monto: num_(row.monto),
    pp: num_(row.pp),
    montoFinal: num_(row.montoFinal),
    notas: str_(row.notas),
    estado: str_(row.estado || 'pendiente'),
    fechaPago: dateText_(row.fechaPago)
  }));
}

function getCfg_() {
  const cfg = {};
  csvRows_(GERENCIA.SHEETS.CONFIG).forEach(row => {
    const key = str_(row.clave);
    if (!key) return;
    cfg[key] = parseCfg_(row.valor);
  });
  return cfg;
}

function csvRows_(sheetName) {
  const url = 'https://docs.google.com/spreadsheets/d/' +
    encodeURIComponent(GERENCIA.SHEET_ID) +
    '/gviz/tq?tqx=out:csv&sheet=' +
    encodeURIComponent(sheetName);

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { 'Cache-Control': 'no-cache' }
  });

  const status = response.getResponseCode();
  const text = response.getContentText('UTF-8');
  if (status !== 200) {
    throw new Error('No se pudo leer la hoja ' + sheetName + '. Estado HTTP: ' + status);
  }
  if (/You need access|permission|request access|No tienes acceso/i.test(text)) {
    throw new Error('El Sheet no esta publicado para lectura publica. Solicita que lo compartan como lector o como enlace visible.');
  }

  const matrix = Utilities.parseCsv(text);
  if (!matrix.length) return [];

  const headers = matrix[0].map(normalizeHeader_);
  return matrix.slice(1)
    .filter(row => row.some(cell => str_(cell) !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => obj[header] = row[index]);
      return obj;
    });
}

function requireReadAccess_(req) {
  const expected = prop_('GERENCIA_API_KEY');
  const requireKey = prop_('GERENCIA_REQUIRE_KEY_FOR_READ') === 'true';
  if (!expected || !requireKey) return;
  const received = str_(req.apiKey || req.key);
  if (received !== expected) throw new Error('Acceso no autorizado.');
}

function parseRequest_(e) {
  const params = (e && e.parameter) || {};
  let body = {};
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      body = {};
    }
  }
  return {
    action: body.action || params.action,
    apiKey: body.apiKey || params.apiKey || params.key,
    key: body.key || params.key
  };
}

function normalizeHeader_(value) {
  return str_(value)
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '')
    .trim();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function str_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function num_(value) {
  let clean = str_(value).replace(/[$\s]/g, '');
  if (clean.includes(',') && !clean.includes('.')) clean = clean.replace(',', '.');
  else clean = clean.replace(/,/g, '');
  const n = Number(clean);
  return isFinite(n) ? n : 0;
}

function parseCfg_(value) {
  const text = str_(value);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function dateText_(value) {
  const text = str_(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!isNaN(parsed)) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return text.slice(0, 10);
}

function cleanMessage_(err) {
  return err && err.message ? err.message : String(err);
}
