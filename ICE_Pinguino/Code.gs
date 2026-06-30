/** CONTROL DE CABINETS · BACKEND GOOGLE APPS SCRIPT v3
 * Copiar todo este archivo directamente en Code.gs, sin envolverlo en myFunction().
 */

const APP = Object.freeze({
  VERSION: '3.0.0',
  SPREADSHEET_ID: '15BPSjGTr5pXe25aFFyskURKbE0-TZC8svSUTrHnpLzE',
  LOGIN_SPREADSHEET_ID: '1D4DzASd5yh-tMhKqJvshFcOV4gathx9yAsZ0xHV1F3I',
  LOGIN: 'BD_Login',
  INVENTORY: 'BD_Inventario_Cabinets',
  VISITS: 'BD_Control_Cabinets',
  HISTORY: 'BD_Historial_Cabinets',
  SESSION_SECONDS: 21600,
  MAX_DISTANCE_METERS: 3,
  DEFAULT_FREQUENCY_DAYS: 30,
  PROTECTED_STATES: ['DAÑADO', 'FUERA DE PRODUCCION', 'FUERA DE PRODUCCIÓN', 'RETIRADO', 'EN TALLER', 'EN BODEGA'],
  ACTIVE_RECORD: 'ACTIVO',
  VOID_RECORD: 'ANULADO'
});

function doGet() {
  return json_({ ok: true, service: 'Control de Cabinets API', version: APP.VERSION, date: new Date().toISOString() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').trim();
    if (action === 'login') return json_(login_(body));

    const session = requireSession_(body.token);
    const actions = {
      logout: () => logout_(body.token),
      buscarCabinet: () => buscarCabinet_(body, session),
      registrarVisita: () => registrarVisita_(body, session),
      misVisitas: () => misVisitas_(session),
      resumen: () => resumen_(session),
      inventario: () => inventario_(body, session),
      reportes: () => reportes_(body, session),
      actualizarCabinet: () => actualizarCabinet_(body, session),
      editarVisita: () => editarVisita_(body, session),
      anularVisita: () => anularVisita_(body, session)
    };
    if (!actions[action]) throw new Error('Acción no permitida.');
    return json_({ ok: true, data: actions[action]() });
  } catch (error) {
    return json_({ ok: false, message: error.message || String(error) });
  }
}

/** Ejecutar manualmente una vez antes de desplegar. No borra información. */
function configurarSistema() {
  const ss = db_();
  const login = requiredLoginSheet_();
  const inventory = requiredSheet_(APP.INVENTORY);
  const visits = requiredSheet_(APP.VISITS);

  renameHeader_(visits, 'Columna 1', 'Estado_Visita');
  ensureHeaders_(login, ['Activo', 'Password_Hash', 'Password_Salt']);
  ensureHeaders_(inventory, [
    'Ultima_Visita', 'Frecuencia_Dias', 'Motivo_Ultimo_Cambio',
    'Fecha_Ultimo_Cambio', 'Modificado_Por'
  ]);
  ensureHeaders_(visits, [
    'ID_Visita', 'Precision_GPS_Metros', 'Distancia_Metros', 'Estado_Registro',
    'Motivo_Modificacion', 'Fecha_Modificacion', 'Modificado_Por'
  ]);

  getOrCreateSheet_(ss, APP.HISTORY, [
    'ID_Evento', 'Fecha_Evento', 'Serie_Cabinet', 'Tipo_Evento', 'Usuario_Admin',
    'Motivo', 'Datos_Anteriores', 'Datos_Nuevos'
  ]);

  initializeDefaults_();
  createDailyTrigger_();
  return 'Sistema configurado correctamente.';
}

/** Opcional pero recomendado: migra contraseñas visibles a hash y limpia la columna original. */
function migrarContrasenas() {
  const sheet = requiredLoginSheet_();
  const headers = headers_(sheet);
  rows_(sheet).forEach(user => {
    const plain = String(user['Contraseña'] || '').trim();
    if (!plain || user.Password_Hash) return;
    const salt = Utilities.getUuid();
    updateRow_(sheet, user._row, headers, {
      Password_Salt: salt,
      Password_Hash: hashPassword_(plain, salt),
      'Contraseña': ''
    });
  });
  return 'Contraseñas migradas.';
}

function login_(body) {
  const usuario = text_(body.usuario);
  const password = text_(body.password);
  const requestedRole = role_(body.rol);
  if (!usuario || !password || !requestedRole) throw new Error('Usuario o contraseña incorrecta.');

  const user = rows_(requiredLoginSheet_()).find(row => {
    const validPassword = row.Password_Hash
      ? equals_(row.Password_Hash, hashPassword_(password, row.Password_Salt))
      : text_(row['Contraseña']) === password;
    return equals_(row.Usuario, usuario) && role_(row.Rol) === requestedRole && validPassword && !isInactive_(row.Activo);
  });
  if (!user) throw new Error('Usuario o contraseña incorrecta.');

  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = {
    usuario: text_(user.Usuario),
    razon: text_(user.Razon || user.Usuario),
    rol: role_(user.Rol),
    loginAt: new Date().toISOString()
  };
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(session), APP.SESSION_SECONDS);
  return { ok: true, token: token, user: session };
}

function requireSession_(token) {
  const key = 'session:' + text_(token);
  const cache = CacheService.getScriptCache();
  const raw = cache.get(key);
  if (!raw) throw new Error('La sesión venció. Inicia sesión nuevamente.');
  cache.put(key, raw, APP.SESSION_SECONDS);
  return JSON.parse(raw);
}

function logout_(token) {
  CacheService.getScriptCache().remove('session:' + text_(token));
  return { closed: true };
}

function buscarCabinet_(body, session) {
  const series = extractSeries_(body.serie || body.qrValue);
  if (!series) throw new Error('No se encontró una serie válida en el QR.');
  const cabinet = findInventory_(series);
  if (!cabinet) throw new Error('La serie no existe en el inventario.');
  assertSellerAssignment_(cabinet, session);
  return publicCabinet_(cabinet);
}

function registrarVisita_(body, session) {
  if (!['VENDEDOR', 'ADMIN'].includes(session.rol)) throw new Error('Rol no autorizado.');
  const series = extractSeries_(body.serie || body.qrValue);
  const cabinet = findInventory_(series);
  if (!cabinet) throw new Error('La serie no existe en el inventario.');
  assertSellerAssignment_(cabinet, session);

  const scanLat = number_(body.latitud);
  const scanLng = number_(body.longitud);
  const accuracy = number_(body.precisionGps);
  if (!Number.isFinite(scanLat) || !Number.isFinite(scanLng)) throw new Error('Activa la ubicación para confirmar la visita.');

  const cabinetLat = number_(cabinet.Latitud_y);
  const cabinetLng = number_(cabinet.Longitud_x);
  const distance = Number.isFinite(cabinetLat) && Number.isFinite(cabinetLng)
    ? haversine_(scanLat, scanLng, cabinetLat, cabinetLng)
    : '';
  const comparison = distance === '' ? 'SIN COORDENADAS DEL CABINET' : distance <= APP.MAX_DISTANCE_METERS ? 'OK' : 'FUERA DE RANGO';
  const visitId = Utilities.getUuid();
  const now = new Date();
  const visitSheet = requiredSheet_(APP.VISITS);
  const visitHeaders = headers_(visitSheet);
  const record = {
    Serie_Cabinet: text_(cabinet.Serie_Cabinet),
    Articulo: text_(cabinet.Articulo),
    Equipo: text_(cabinet.Equipo),
    Cod_Cliente: text_(cabinet.Cod_Cliente),
    Sucursal: text_(cabinet.Sucursal),
    Razon_Cliente: text_(cabinet.Razon_Cliente),
    Cod_Vendedor: session.usuario,
    Razon_Vendedor: session.razon,
    Direccion: text_(cabinet.Direccion),
    Latitud_y_Cabinet: valueOrBlank_(cabinet.Latitud_y),
    Longitud_x_Cabinet: valueOrBlank_(cabinet.Longitud_x),
    Estado_Visita: text_(cabinet.Estado),
    Fecha_Visita: now,
    Latitud_Escaneo: scanLat,
    Longitud_Escaneo: scanLng,
    Comparacion: comparison,
    ID_Visita: visitId,
    Precision_GPS_Metros: Number.isFinite(accuracy) ? accuracy : '',
    Distancia_Metros: distance,
    Estado_Registro: APP.ACTIVE_RECORD,
    Motivo_Modificacion: '',
    Fecha_Modificacion: '',
    Modificado_Por: ''
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    visitSheet.appendRow(visitHeaders.map(header => record[header] !== undefined ? record[header] : ''));
    updateInventory_(cabinet._row, {
      Ultima_Visita: now,
      Estado: isProtectedState_(cabinet.Estado) ? cabinet.Estado : 'Operativo'
    });
  } finally {
    lock.releaseLock();
  }

  return {
    idVisita: visitId,
    fechaVisita: now.toISOString(),
    comparacion: comparison,
    distanciaMetros: distance,
    mapsUrl: mapsUrl_(scanLat, scanLng)
  };
}

function misVisitas_(session) {
  if (session.rol !== 'VENDEDOR') throw new Error('Módulo disponible solo para vendedores.');
  const own = rows_(requiredSheet_(APP.VISITS))
    .filter(row => equals_(row.Cod_Vendedor, session.usuario) && recordIsActive_(row));
  const latest = {};
  own.forEach(row => {
    const key = text_(row.Serie_Cabinet);
    const date = date_(row.Fecha_Visita);
    if (!latest[key] || date > date_(latest[key].Fecha_Visita)) latest[key] = row;
  });
  return Object.values(latest).sort((a, b) => date_(b.Fecha_Visita) - date_(a.Fecha_Visita)).map(row => ({
    serie: text_(row.Serie_Cabinet),
    equipo: text_(row.Equipo),
    codCliente: text_(row.Cod_Cliente),
    sucursal: text_(row.Sucursal),
    razonCliente: text_(row.Razon_Cliente),
    ultimaVisita: iso_(row.Fecha_Visita)
  }));
}

function resumen_(session) {
  assertRead_(session);
  const data = rows_(requiredSheet_(APP.INVENTORY));
  const groups = { operativos: 0, tallerBodega: 0, danadosFuera: 0, otros: 0 };
  data.forEach(row => {
    const state = normalize_(row.Estado);
    if (state.includes('OPERATIVO')) groups.operativos++;
    else if (state.includes('TALLER') || state.includes('BODEGA')) groups.tallerBodega++;
    else if (state.includes('DAÑ') || state.includes('FUERA') || state.includes('RETIR')) groups.danadosFuera++;
    else groups.otros++;
  });
  return { ...groups, total: data.length };
}

function inventario_(body, session) {
  assertRead_(session);
  const query = normalize_(body.query);
  const stateFilter = normalize_(body.estado);
  return rows_(requiredSheet_(APP.INVENTORY))
    .filter(row => !stateFilter || stateGroup_(row.Estado) === stateFilter || normalize_(row.Estado) === stateFilter)
    .filter(row => !query || [row.Serie_Cabinet, row.Cod_Cliente, row.Razon_Cliente, row.Cod_Vendedor, row.Razon_Vendedor, row.Equipo, row.Sucursal].some(value => normalize_(value).includes(query)))
    .map(publicCabinet_);
}

function reportes_(body, session) {
  assertRead_(session);
  const query = normalize_(body.query);
  const limit = Math.min(Math.max(Number(body.limit || 1000), 1), 3000);
  return rows_(requiredSheet_(APP.VISITS))
    .filter(recordIsActive_)
    .filter(row => !query || [row.Serie_Cabinet, row.Cod_Cliente, row.Razon_Cliente, row.Cod_Vendedor, row.Razon_Vendedor, row.Equipo].some(value => normalize_(value).includes(query)))
    .slice(-limit)
    .reverse()
    .map(publicVisit_);
}

function actualizarCabinet_(body, session) {
  assertAdmin_(session);
  const series = text_(body.serie);
  const reason = text_(body.motivo);
  if (reason.length < 5) throw new Error('Debes explicar el motivo del cambio.');
  const sheet = requiredSheet_(APP.INVENTORY);
  const cabinet = findInventory_(series);
  if (!cabinet) throw new Error('Cabinet no encontrado.');

  const allowed = ['Estado', 'Cod_Cliente', 'Sucursal', 'Razon_Cliente', 'Cod_Vendedor', 'Razon_Vendedor', 'Direccion', 'Latitud_y', 'Longitud_x'];
  const changes = body.cambios || {};
  const update = {};
  allowed.forEach(key => { if (changes[key] !== undefined) update[key] = changes[key]; });
  update.Motivo_Ultimo_Cambio = reason;
  update.Fecha_Ultimo_Cambio = new Date();
  update.Modificado_Por = session.usuario;

  const before = snapshot_(cabinet, allowed);
  updateRow_(sheet, cabinet._row, headers_(sheet), update);
  appendHistory_({
    Serie_Cabinet: series,
    Tipo_Evento: 'ACTUALIZACION_INVENTARIO',
    Usuario_Admin: session.usuario,
    Motivo: reason,
    Datos_Anteriores: JSON.stringify(before),
    Datos_Nuevos: JSON.stringify(update)
  });
  return { updated: true };
}

function editarVisita_(body, session) {
  assertAdmin_(session);
  const id = text_(body.idVisita);
  const reason = text_(body.motivo);
  if (reason.length < 5) throw new Error('Debes explicar el motivo de la modificación.');
  const sheet = requiredSheet_(APP.VISITS);
  const visit = rows_(sheet).find(row => equals_(row.ID_Visita, id));
  if (!visit) throw new Error('Visita no encontrada.');

  const allowed = ['Serie_Cabinet', 'Cod_Cliente', 'Sucursal', 'Razon_Cliente', 'Estado_Visita', 'Fecha_Visita', 'Latitud_Escaneo', 'Longitud_Escaneo'];
  const changes = body.cambios || {};
  const update = {};
  allowed.forEach(key => { if (changes[key] !== undefined) update[key] = changes[key]; });
  const lat = number_(update.Latitud_Escaneo !== undefined ? update.Latitud_Escaneo : visit.Latitud_Escaneo);
  const lng = number_(update.Longitud_Escaneo !== undefined ? update.Longitud_Escaneo : visit.Longitud_Escaneo);
  const baseLat = number_(visit.Latitud_y_Cabinet);
  const baseLng = number_(visit.Longitud_x_Cabinet);
  const distance = Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(baseLat) && Number.isFinite(baseLng) ? haversine_(lat, lng, baseLat, baseLng) : '';
  update.Distancia_Metros = distance;
  update.Comparacion = distance === '' ? 'SIN COORDENADAS DEL CABINET' : distance <= APP.MAX_DISTANCE_METERS ? 'OK' : 'FUERA DE RANGO';
  update.Motivo_Modificacion = reason;
  update.Fecha_Modificacion = new Date();
  update.Modificado_Por = session.usuario;
  updateRow_(sheet, visit._row, headers_(sheet), update);
  appendHistory_({
    Serie_Cabinet: text_(visit.Serie_Cabinet), Tipo_Evento: 'EDICION_VISITA', Usuario_Admin: session.usuario,
    Motivo: reason, Datos_Anteriores: JSON.stringify(snapshot_(visit, allowed)), Datos_Nuevos: JSON.stringify(update)
  });
  refreshLastVisit_(text_(update.Serie_Cabinet || visit.Serie_Cabinet));
  return { updated: true };
}

function anularVisita_(body, session) {
  assertAdmin_(session);
  const id = text_(body.idVisita);
  const reason = text_(body.motivo);
  if (reason.length < 5) throw new Error('Debes explicar por qué se anula el registro.');
  const sheet = requiredSheet_(APP.VISITS);
  const visit = rows_(sheet).find(row => equals_(row.ID_Visita, id));
  if (!visit) throw new Error('Visita no encontrada.');
  updateRow_(sheet, visit._row, headers_(sheet), {
    Estado_Registro: APP.VOID_RECORD,
    Motivo_Modificacion: reason,
    Fecha_Modificacion: new Date(),
    Modificado_Por: session.usuario
  });
  appendHistory_({
    Serie_Cabinet: text_(visit.Serie_Cabinet), Tipo_Evento: 'ANULACION_VISITA', Usuario_Admin: session.usuario,
    Motivo: reason, Datos_Anteriores: JSON.stringify({ Estado_Registro: visit.Estado_Registro || APP.ACTIVE_RECORD }),
    Datos_Nuevos: JSON.stringify({ Estado_Registro: APP.VOID_RECORD })
  });
  refreshLastVisit_(text_(visit.Serie_Cabinet));
  return { voided: true };
}

function refreshLastVisit_(series) {
  const active = rows_(requiredSheet_(APP.VISITS))
    .filter(row => equals_(row.Serie_Cabinet, series) && recordIsActive_(row))
    .sort((a, b) => date_(b.Fecha_Visita) - date_(a.Fecha_Visita));
  const cabinet = findInventory_(series);
  if (cabinet) updateInventory_(cabinet._row, { Ultima_Visita: active.length ? date_(active[0].Fecha_Visita) : '' });
}

/** Trigger diario: no destruye estados administrativos. */
function actualizarActividadDiaria() {
  const sheet = requiredSheet_(APP.INVENTORY);
  const headers = headers_(sheet);
  const now = new Date();
  rows_(sheet).forEach(cabinet => {
    if (isProtectedState_(cabinet.Estado)) return;
    const last = dateOrNull_(cabinet.Ultima_Visita);
    const frequency = [7, 15, 30].includes(Number(cabinet.Frecuencia_Dias)) ? Number(cabinet.Frecuencia_Dias) : APP.DEFAULT_FREQUENCY_DAYS;
    const days = last ? Math.floor((now - last) / 86400000) : Infinity;
    const state = days <= frequency ? 'Operativo' : 'Pendiente de visita';
    if (!equals_(cabinet.Estado, state)) updateRow_(sheet, cabinet._row, headers, { Estado: state });
  });
}

function initializeDefaults_() {
  const inventory = requiredSheet_(APP.INVENTORY);
  const inventoryHeaders = headers_(inventory);
  rows_(inventory).forEach(row => {
    const changes = {};
    if (!row.Frecuencia_Dias) changes.Frecuencia_Dias = APP.DEFAULT_FREQUENCY_DAYS;
    if (Object.keys(changes).length) updateRow_(inventory, row._row, inventoryHeaders, changes);
  });
  const visits = requiredSheet_(APP.VISITS);
  const visitHeaders = headers_(visits);
  rows_(visits).forEach(row => {
    const changes = {};
    if (!row.ID_Visita) changes.ID_Visita = Utilities.getUuid();
    if (!row.Estado_Registro) changes.Estado_Registro = APP.ACTIVE_RECORD;
    if (Object.keys(changes).length) updateRow_(visits, row._row, visitHeaders, changes);
  });
}

function createDailyTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'actualizarActividadDiaria');
  if (!exists) ScriptApp.newTrigger('actualizarActividadDiaria').timeBased().everyDays(1).atHour(2).create();
}

function findInventory_(series) {
  return rows_(requiredSheet_(APP.INVENTORY)).find(row => equals_(row.Serie_Cabinet, series));
}

function updateInventory_(row, changes) {
  const sheet = requiredSheet_(APP.INVENTORY);
  updateRow_(sheet, row, headers_(sheet), changes);
}

function publicCabinet_(row) {
  return {
    bodega: text_(row.Bodega), serie: text_(row.Serie_Cabinet), articulo: text_(row.Articulo),
    equipo: text_(row.Equipo), codCliente: text_(row.Cod_Cliente), sucursal: text_(row.Sucursal),
    razonCliente: text_(row.Razon_Cliente), codVendedor: text_(row.Cod_Vendedor),
    razonVendedor: text_(row.Razon_Vendedor), estado: text_(row.Estado), direccion: text_(row.Direccion),
    latitudCabinet: valueOrBlank_(row.Latitud_y), longitudCabinet: valueOrBlank_(row.Longitud_x),
    ultimaVisita: iso_(row.Ultima_Visita), frecuenciaDias: Number(row.Frecuencia_Dias || APP.DEFAULT_FREQUENCY_DAYS)
  };
}

function publicVisit_(row) {
  const lat = number_(row.Latitud_Escaneo);
  const lng = number_(row.Longitud_Escaneo);
  return {
    idVisita: text_(row.ID_Visita), serie: text_(row.Serie_Cabinet), articulo: text_(row.Articulo),
    equipo: text_(row.Equipo), codCliente: text_(row.Cod_Cliente), sucursal: text_(row.Sucursal),
    razonCliente: text_(row.Razon_Cliente), codVendedor: text_(row.Cod_Vendedor), razonVendedor: text_(row.Razon_Vendedor),
    estado: text_(row.Estado_Visita), fechaVisita: iso_(row.Fecha_Visita), latitudEscaneo: valueOrBlank_(row.Latitud_Escaneo),
    longitudEscaneo: valueOrBlank_(row.Longitud_Escaneo), precisionGps: valueOrBlank_(row.Precision_GPS_Metros),
    distanciaMetros: valueOrBlank_(row.Distancia_Metros), comparacion: text_(row.Comparacion),
    mapsUrl: Number.isFinite(lat) && Number.isFinite(lng) ? mapsUrl_(lat, lng) : '', estadoRegistro: text_(row.Estado_Registro || APP.ACTIVE_RECORD)
  };
}

function appendHistory_(event) {
  const sheet = requiredSheet_(APP.HISTORY);
  const data = {
    ID_Evento: Utilities.getUuid(), Fecha_Evento: new Date(), Serie_Cabinet: event.Serie_Cabinet,
    Tipo_Evento: event.Tipo_Evento, Usuario_Admin: event.Usuario_Admin, Motivo: event.Motivo,
    Datos_Anteriores: event.Datos_Anteriores, Datos_Nuevos: event.Datos_Nuevos
  };
  const headers = headers_(sheet);
  sheet.appendRow(headers.map(header => data[header] !== undefined ? data[header] : ''));
}

function assertSellerAssignment_(cabinet, session) {
  if (session.rol === 'ADMIN') return;
  if (session.rol !== 'VENDEDOR' || !equals_(cabinet.Cod_Vendedor, session.usuario)) {
    throw new Error('Este cabinet no pertenece al vendedor ingresado.');
  }
}

function assertRead_(session) { if (!['ADMIN', 'GERENCIA'].includes(session.rol)) throw new Error('Operación no autorizada.'); }
function assertAdmin_(session) { if (session.rol !== 'ADMIN') throw new Error('Operación exclusiva del administrador.'); }
function recordIsActive_(row) { return !row.Estado_Registro || equals_(row.Estado_Registro, APP.ACTIVE_RECORD); }
function isProtectedState_(state) { return APP.PROTECTED_STATES.some(value => normalize_(value) === normalize_(state)); }
function stateGroup_(state) {
  const value = normalize_(state);
  if (value.includes('OPERATIVO')) return 'OPERATIVOS';
  if (value.includes('TALLER') || value.includes('BODEGA')) return 'TALLER_BODEGA';
  if (value.includes('DAÑ') || value.includes('FUERA') || value.includes('RETIR')) return 'DANADOS_FUERA';
  return 'OTROS';
}

function db_() { return SpreadsheetApp.openById(APP.SPREADSHEET_ID); }
function loginDb_() { return SpreadsheetApp.openById(APP.LOGIN_SPREADSHEET_ID || APP.SPREADSHEET_ID); }
function requiredLoginSheet_() { const sheet = loginDb_().getSheetByName(APP.LOGIN); if (!sheet) throw new Error('No existe la hoja ' + APP.LOGIN + ' en el archivo de login.'); return sheet; }
function requiredSheet_(name) { const sheet = db_().getSheetByName(name); if (!sheet) throw new Error('No existe la hoja ' + name + '.'); return sheet; }
function getOrCreateSheet_(ss, name, initialHeaders) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.getRange(1, 1, 1, initialHeaders.length).setValues([initialHeaders]); }
  return sheet;
}
function headers_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(text_); }
function rows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const heads = data[0].map(text_);
  return data.slice(1).map((values, index) => {
    const row = { _row: index + 2 };
    heads.forEach((head, column) => row[head] = values[column]);
    return row;
  });
}
function ensureHeaders_(sheet, required) {
  const current = headers_(sheet);
  const missing = required.filter(header => !current.includes(header));
  if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
}
function renameHeader_(sheet, oldName, newName) {
  const current = headers_(sheet); const index = current.indexOf(oldName);
  if (index >= 0 && !current.includes(newName)) sheet.getRange(1, index + 1).setValue(newName);
}
function updateRow_(sheet, rowNumber, heads, changes) {
  const range = sheet.getRange(rowNumber, 1, 1, heads.length);
  const values = range.getValues()[0];
  heads.forEach((head, index) => { if (Object.prototype.hasOwnProperty.call(changes, head)) values[index] = changes[head]; });
  range.setValues([values]);
}
function snapshot_(row, fields) { const result = {}; fields.forEach(field => result[field] = row[field]); return result; }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function text_(value) { return String(value ?? '').trim(); }
function normalize_(value) { return text_(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
function equals_(a, b) { return normalize_(a) === normalize_(b); }
function role_(value) { const role = normalize_(value); return role === 'ADMIN' || role === 'ADMINISTRADOR' ? 'ADMIN' : role === 'GERENCIA' || role === 'GERENTE' ? 'GERENCIA' : role === 'VENDEDOR' ? 'VENDEDOR' : ''; }
function isInactive_(value) { return ['NO', 'FALSE', '0', 'INACTIVO'].includes(normalize_(value)); }
function number_(value) { const raw = text_(value).replace(',', '.'); return raw === '' ? NaN : Number(raw); }
function valueOrBlank_(value) { const number = number_(value); return Number.isFinite(number) ? number : ''; }
function date_(value) { const date = value instanceof Date ? value : new Date(value); return isNaN(date.getTime()) ? new Date(0) : date; }
function dateOrNull_(value) { const date = date_(value); return date.getTime() ? date : null; }
function iso_(value) { const date = dateOrNull_(value); return date ? date.toISOString() : ''; }
function extractSeries_(value) {
  const raw = text_(value); if (!raw) return '';
  try {
    const data = JSON.parse(raw);
    const fromJson = data.Serie_Cabinet || data.serie_cabinet || data.serieCabinet || data.serie || data.id || data.codigo;
    if (fromJson !== undefined && fromJson !== null) return text_(fromJson);
  } catch (_) {}
  const match = raw.match(/[?&](?:serie_cabinet|serieCabinet|serie|qr|token|id)=([^&#]+)/i);
  if (match) {
    try { return decodeURIComponent(match[1]).trim(); } catch (_) { return match[1].trim(); }
  }
  return raw.replace(/^(?:CABINET|SERIE_CABINET|SERIE|QR)\s*[:=#-]\s*/i, '').trim();
}
function haversine_(lat1, lon1, lat2, lon2) {
  const radius = 6371000, p = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * p / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lon2 - lon1) * p / 2) ** 2;
  return Math.round(2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}
function mapsUrl_(lat, lng) { return 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng); }
function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text_(salt) + '|' + text_(password), Utilities.Charset.UTF_8);
  return bytes.map(byte => ('0' + ((byte < 0 ? byte + 256 : byte).toString(16))).slice(-2)).join('');
}
