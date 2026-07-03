const APP = {
  DEFAULT_DB_ID: '1D4DzASd5yh-tMhKqJvshFcOV4gathx9yAsZ0xHV1F3I',
  DB_ID_PROPERTY: 'OPAUSTRO_DB_ID',
  LOGIN: 'BD_Login',
  INVENTORY: 'BD_Inventario',
  VISITS: 'BD_Visitas',
  HISTORY: 'BD_Historial',
  ACCESS_LOG: 'BD_Accesos_App'
};

const LOGIN_CONFIG = {
  modulesByRole: {
    admin: ['Admin', 'Ventas', 'Logistica', 'Gerencia'],
    Gerencia: ['Ventas', 'Logistica', 'Gerencia'],
    Ventas: ['Ventas'],
    Logistica: ['Logistica']
  }
};

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'getLoginData') return json_(getLoginData());
    if (action === 'getAccessLogs') return json_(getAccessLogs({}));
    if (action === 'diagnostico') return json_(diagnosticarLogin());

    return json_({
      success: true,
      service: 'OPAUSTRO Login API',
      message: 'API activa. Usa POST action=getLoginData o action=authenticate desde el frontend.'
    });
  } catch (error) {
    console.error(error);
    return json_({ success: false, message: 'No se pudo responder la solicitud.' });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'getLoginData') return json_(getLoginData());
    if (body.action === 'authenticate') return json_(authenticate(body.payload || {}));
    if (body.action === 'recordAccessLog') return json_(recordAccessLog(body.payload || {}));
    if (body.action === 'getAccessLogs') return json_(getAccessLogs(body.payload || {}));
    if (body.action === 'diagnostico') return json_(diagnosticarLogin());
    return json_({ success: false, message: 'Solicitud no valida.' });
  } catch (error) {
    console.error(error);
    return json_({ success: false, message: 'Solicitud no valida.' });
  }
}

function configurarSistema() {
  const ss = db_();
  const login = requiredSheet_(APP.LOGIN);
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
  getOrCreateSheet_(ss, APP.ACCESS_LOG, accessLogHeaders_());

  initializeDefaults_();
  createDailyTrigger_();
  return 'Sistema configurado correctamente.';
}

function configurarBaseDatos(spreadsheetId) {
  const id = String(spreadsheetId || '').trim();
  if (!id) throw new Error('Debe indicar el ID del archivo de Google Sheets.');
  PropertiesService.getScriptProperties().setProperty(APP.DB_ID_PROPERTY, id);
  return 'Base de datos configurada correctamente.';
}

function migrarContrasenas() {
  const sheet = requiredSheet_(APP.LOGIN);
  const headers = headers_(sheet);
  rows_(sheet).forEach((user) => {
    const plain = String(user['Contraseña'] || user.Contrasena || '').trim();
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

function getLoginData() {
  try {
    const users = readLoginRows_().filter((user) => user.activo);
    const usersByRole = users.reduce((acc, user) => {
      if (!acc[user.rol]) acc[user.rol] = [];
      acc[user.rol].push({
        usuario: user.usuario,
        razon: user.razon
      });
      return acc;
    }, {});

    return { success: true, usersByRole };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo preparar el acceso.', detail: publicError_(error) };
  }
}

function diagnosticarLogin() {
  const result = {
    success: true,
    service: 'OPAUSTRO Login API',
    checks: {}
  };

  try {
    const configuredId = PropertiesService.getScriptProperties().getProperty(APP.DB_ID_PROPERTY);
    const id = configuredId || APP.DEFAULT_DB_ID;
    result.checks.dbIdConfigurado = Boolean(configuredId);
    result.checks.dbIdFuente = configuredId ? 'Script Properties' : 'DEFAULT_DB_ID';
    result.checks.dbIdPreview = id ? id.slice(0, 6) + '...' + id.slice(-4) : '';
    if (!id) {
      result.success = false;
      result.message = 'Falta configurar OPAUSTRO_DB_ID. Ejecuta configurarBaseDatos("ID_DEL_SHEET").';
      return result;
    }

    const ss = SpreadsheetApp.openById(id);
    result.checks.archivoAbierto = true;
    result.checks.sheets = ss.getSheets().map((sheet) => sheet.getName());

    const login = ss.getSheetByName(APP.LOGIN);
    result.checks.loginSheetExiste = Boolean(login);
    if (!login) {
      result.success = false;
      result.message = 'No existe la hoja BD_Login en el archivo configurado.';
      return result;
    }

    const headers = headers_(login);
    result.checks.headers = headers;
    result.checks.filasLogin = Math.max(login.getLastRow() - 1, 0);
    result.checks.headersRequeridos = ['Rol', 'Razon', 'Usuario', 'Contraseña', 'Activo', 'Password_Hash', 'Password_Salt']
      .reduce((acc, name) => {
        acc[name] = headerIndex_(headers, name) !== -1;
        return acc;
      }, {});

    const users = readLoginRows_();
    result.checks.usuariosDetectados = users.length;
    result.checks.usuariosActivos = users.filter((user) => user.activo).length;
    result.message = 'Diagnostico completado.';
    return result;
  } catch (error) {
    console.error(error);
    result.success = false;
    result.message = 'Error al diagnosticar login.';
    result.detail = publicError_(error);
    return result;
  }
}

function authenticate(payload) {
  try {
    const role = String(payload.role || '').trim();
    const user = String(payload.user || '').trim();
    const password = String(payload.password || '').trim();

    if (!role || !user || !password) {
      return { success: false, message: 'Complete todos los campos.' };
    }

    const match = readLoginRows_().find((row) => row.activo && row.rol === role && row.usuario === user);
    if (!match || !isValidPassword_(password, match)) {
      return { success: false, message: 'Credenciales no validas.' };
    }

    const modules = LOGIN_CONFIG.modulesByRole[role] || [];
    const permissions = role === 'Gerencia' ? 'lectura' : 'edicion';

    return {
      success: true,
      user: match.razon || match.usuario,
      role,
      permissions,
      modules,
      token: createSessionToken_(match.usuario, role)
    };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo validar el acceso.' };
  }
}

function readLoginRows_() {
  return rows_(requiredSheet_(APP.LOGIN)).map((row) => {
    const activo = String(row.Activo || '').trim().toLowerCase();
    return {
      rol: String(row.Rol || '').trim(),
      razon: String(row.Razon || '').trim(),
      usuario: String(row.Usuario || '').trim(),
      contrasena: String(row['Contraseña'] || row.Contrasena || '').trim(),
      passwordHash: String(row.Password_Hash || '').trim(),
      passwordSalt: String(row.Password_Salt || '').trim(),
      activo: activo === '' || ['si', 'sí', 'true', '1', 'activo'].includes(activo)
    };
  }).filter((row) => row.rol && row.usuario);
}

function isValidPassword_(plain, user) {
  if (user.passwordHash && user.passwordSalt) {
    return hashPassword_(plain, user.passwordSalt) === user.passwordHash;
  }
  return plain === user.contrasena;
}

function hashPassword_(plain, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    `${salt}:${plain}`,
    Utilities.Charset.UTF_8
  );
  return raw.map((byte) => {
    const value = (byte < 0 ? byte + 256 : byte).toString(16);
    return value.length === 1 ? `0${value}` : value;
  }).join('');
}

function createSessionToken_(usuario, rol) {
  const payload = `${usuario}|${rol}|${Date.now()}|${Utilities.getUuid()}`;
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8)
  );
}

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty(APP.DB_ID_PROPERTY) || APP.DEFAULT_DB_ID;
  if (!id) throw new Error('Base de datos no configurada.');
  return SpreadsheetApp.openById(id);
}

function recordAccessLog(payload) {
  try {
    const user = String(payload.user || payload.usuario || '').trim();
    const role = String(payload.role || payload.rol || '').trim();
    if (!user || !role) return { success: false, message: 'Registro incompleto.' };
    if (isAdminRole_(role)) return { success: true, ignored: true };

    const at = payload.at ? new Date(payload.at) : new Date();
    const safeDate = Number.isNaN(at.getTime()) ? new Date() : at;
    const sheet = accessLogSheet_();
    sheet.appendRow([
      String(payload.id || Utilities.getUuid()),
      safeDate,
      user,
      role,
      String(payload.version || ''),
      String(payload.device || ''),
      String(payload.userAgent || '').slice(0, 500)
    ]);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo registrar el acceso.' };
  }
}

function getAccessLogs(payload) {
  try {
    const limit = Math.min(Math.max(Number(payload.limit || 5000), 1), 10000);
    const sheet = accessLogSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return { success: true, logs: [] };
    const headers = values[0].map((header) => String(header || '').trim());
    const index = (name) => headerIndex_(headers, name);
    const idIndex = index('ID_Acceso');
    const dateIndex = index('Fecha_Hora');
    const userIndex = index('Usuario');
    const roleIndex = index('Rol');
    const versionIndex = index('Version_App');
    const deviceIndex = index('Dispositivo');
    const logs = values.slice(1)
      .map((row) => {
        const value = row[dateIndex];
        const date = value instanceof Date ? value : new Date(value);
        return {
          id: String(row[idIndex] || '').trim(),
          at: Number.isNaN(date.getTime()) ? String(value || '').trim() : date.toISOString(),
          user: String(row[userIndex] || '').trim(),
          role: String(row[roleIndex] || '').trim(),
          version: String(row[versionIndex] || '').trim(),
          device: String(row[deviceIndex] || '').trim()
        };
      })
      .filter((row) => row.user && row.role && row.at && !isAdminRole_(row.role))
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);
    return { success: true, logs };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo consultar el historial de accesos.' };
  }
}

function pruneAccessLogs(daysToKeep) {
  const days = Math.max(Number(daysToKeep || 90), 30);
  const sheet = accessLogSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return 'Sin registros para depurar.';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  for (let row = values.length; row >= 2; row--) {
    const value = values[row - 1][1];
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime()) && date < cutoff) sheet.deleteRow(row);
  }
  return 'Historial de accesos depurado.';
}

function requiredSheet_(name) {
  return getOrCreateSheet_(db_(), name);
}

function getOrCreateSheet_(ss, name, defaultHeaders) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (defaultHeaders && defaultHeaders.length) ensureHeaders_(sheet, defaultHeaders);
  return sheet;
}

function headers_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map((header) => String(header || '').trim());
}

function headerIndex_(headers, name) {
  const normalizedName = normalizeHeader_(name);
  return headers.findIndex((header) => normalizeHeader_(header) === normalizedName);
}

function rows_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map((header) => String(header || '').trim());
  return values.slice(1).map((row, index) => {
    const item = { _row: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (header) item[header] = row[columnIndex];
    });
    return item;
  }).filter((row) => Object.keys(row).some((key) => key !== '_row' && row[key] !== ''));
}

function ensureHeaders_(sheet, names) {
  let headers = headers_(sheet);
  if (headers.length === 1 && !headers[0]) headers = [];

  const missing = names.filter((name) => headerIndex_(headers, name) === -1);
  if (!missing.length) return;

  const newHeaders = headers.concat(missing);
  sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
}

function renameHeader_(sheet, currentName, newName) {
  const headers = headers_(sheet);
  const index = headerIndex_(headers, currentName);
  if (index === -1) return;
  sheet.getRange(1, index + 1).setValue(newName);
}

function updateRow_(sheet, rowNumber, headers, data) {
  let currentHeaders = headers.slice();
  ensureHeaders_(sheet, Object.keys(data));
  currentHeaders = headers_(sheet);

  Object.keys(data).forEach((key) => {
    const index = headerIndex_(currentHeaders, key);
    if (index !== -1) sheet.getRange(rowNumber, index + 1).setValue(data[key]);
  });
}

function initializeDefaults_() {
  const login = requiredSheet_(APP.LOGIN);
  ensureHeaders_(login, ['Rol', 'Razon', 'Usuario', 'Contraseña', 'Activo', 'Password_Hash', 'Password_Salt']);
}

function createDailyTrigger_() {
  const handler = 'tareaDiariaSistema';
  const exists = ScriptApp.getProjectTriggers().some((trigger) => trigger.getHandlerFunction() === handler);
  if (!exists) ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(5).create();
}

function tareaDiariaSistema() {
  initializeDefaults_();
  accessLogSheet_();
  pruneAccessLogs(90);
}

function accessLogHeaders_() {
  return ['ID_Acceso', 'Fecha_Hora', 'Usuario', 'Rol', 'Version_App', 'Dispositivo', 'User_Agent'];
}

function accessLogSheet_() {
  return getOrCreateSheet_(db_(), APP.ACCESS_LOG, accessLogHeaders_());
}

function isAdminRole_(role) {
  const normalized = normalizeHeader_(role);
  return normalized === 'admin' || normalized === 'administrador';
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function publicError_(error) {
  return String(error && error.message ? error.message : error || '')
    .replace(/[A-Za-z0-9_-]{20,}/g, '[oculto]');
}
