const APP = {
  DEFAULT_DB_ID: '1D4DzASd5yh-tMhKqJvshFcOV4gathx9yAsZ0xHV1F3I',
  DB_ID_PROPERTY: 'OPAUSTRO_DB_ID',
  LOGIN: 'BD_Login',
  INVENTORY: 'BD_Inventario',
  VISITS: 'BD_Visitas',
  HISTORY: 'BD_Historial',
  ACCESS_LOG: 'BD_Accesos_App',
  SESSIONS: 'BD_Sesiones_App',
  ACCESS_ARCHIVE_AUTO_FOLDER_ID: '1sv9Ezc7apnre6eNfHsu-h9Xuzhvq8p03',
  ACCESS_ARCHIVE_MANUAL_FOLDER_ID: '1XEwrZm8n6dDCs2KTrf1NTsmEuuOQrWFN'
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
    if (action === 'getConnectedUsers') return json_(getConnectedUsers({}));
    if (action === 'getUsers') return json_(getUsers({}));
    if (action === 'clearAccessLogs') return json_(clearAccessLogs({ token: e.parameter.token || '' }));
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
    if (body.action === 'recordSessionHeartbeat') return json_(recordSessionHeartbeat(body.payload || {}));
    if (body.action === 'endSession') return json_(endSession(body.payload || {}));
    if (body.action === 'getConnectedUsers') return json_(getConnectedUsers(body.payload || {}));
    if (body.action === 'getUsers') return json_(getUsers(body.payload || {}));
    if (body.action === 'saveUser') return json_(saveUser(body.payload || {}));
    if (body.action === 'deleteUser') return json_(deleteUser(body.payload || {}));
    if (body.action === 'clearAccessLogs') return json_(clearAccessLogs(body.payload || {}));
    if (body.action === 'exportAccessLogsBackup') return json_(exportAccessLogsBackup(body.payload || {}));
    if (body.action === 'getArchivedMonths') return json_(getArchivedMonths(body.payload || {}));
    if (body.action === 'getArchivedAccessLogs') return json_(getArchivedAccessLogs(body.payload || {}));
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
  ensureHeaders_(login, ['Activo', 'Estado', 'Password_Hash', 'Password_Salt']);
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
  getOrCreateSheet_(ss, APP.SESSIONS, sessionHeaders_());

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
    const estado = String(row.Estado || '').trim() || 'Activo';
    const estadoNormalizado = normalizeHeader_(estado);
    return {
      row: row._row,
      rol: String(row.Rol || '').trim(),
      razon: String(row.Razon || '').trim(),
      usuario: String(row.Usuario || '').trim(),
      contrasena: String(row['Contraseña'] || row.Contrasena || '').trim(),
      passwordHash: String(row.Password_Hash || '').trim(),
      passwordSalt: String(row.Password_Salt || '').trim(),
      estado,
      activo: (activo === '' || ['si', 'true', '1', 'activo'].includes(activo)) && (!estadoNormalizado || estadoNormalizado === 'activo')
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
      .filter((row) => row.user && row.role && row.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);
    return { success: true, logs };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo consultar el historial de accesos.' };
  }
}

function clearAccessLogs(payload) {
  try {
    if (!checkAdminToken_(payload)) return { success: false, message: 'No autorizado.' };

    const sheet = accessLogSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    return { success: true, message: 'Historial de accesos limpiado.', logs: [] };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo limpiar el historial.' };
  }
}

function checkAdminToken_(payload) {
  const token = String((payload && payload.token) || '').trim();
  const expected = String(PropertiesService.getScriptProperties().getProperty('OPAUSTRO_ADMIN_TOKEN') || '').trim();
  return Boolean(expected) && token === expected;
}

function autoArchiveFolder_() {
  return DriveApp.getFolderById(APP.ACCESS_ARCHIVE_AUTO_FOLDER_ID);
}

function manualArchiveFolder_() {
  return DriveApp.getFolderById(APP.ACCESS_ARCHIVE_MANUAL_FOLDER_ID);
}

function safeFileName_(rawName, fallbackPrefix) {
  const cleaned = String(rawName || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  const base = cleaned || `${fallbackPrefix}_${Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Guayaquil', 'yyyy-MM-dd_HHmmss')}`;
  return base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
}

function writeJsonFile_(folder, fileName) {
  const iterator = folder.getFilesByName(fileName);
  return iterator.hasNext() ? iterator.next() : null;
}

function monthKey_(date) {
  const d = date instanceof Date ? date : new Date(date);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'America/Guayaquil', 'yyyy-MM');
}

function readAllAccessRows_() {
  const sheet = accessLogSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((header) => String(header || '').trim());
  const index = (name) => headerIndex_(headers, name);
  const idIndex = index('ID_Acceso');
  const dateIndex = index('Fecha_Hora');
  const userIndex = index('Usuario');
  const roleIndex = index('Rol');
  const versionIndex = index('Version_App');
  const deviceIndex = index('Dispositivo');
  return values.slice(1)
    .map((row) => {
      const value = row[dateIndex];
      const date = value instanceof Date ? value : new Date(value);
      return {
        id: String(row[idIndex] || '').trim(),
        at: date,
        user: String(row[userIndex] || '').trim(),
        role: String(row[roleIndex] || '').trim(),
        version: String(row[versionIndex] || '').trim(),
        device: String(row[deviceIndex] || '').trim()
      };
    })
    .filter((row) => row.user && row.role && !Number.isNaN(row.at.getTime()));
}

function rowsToLogPayload_(rows) {
  return rows.map((row) => ({
    id: row.id,
    at: row.at.toISOString ? row.at.toISOString() : String(row.at),
    user: row.user,
    role: row.role,
    version: row.version,
    device: row.device
  }));
}

function writeMonthlyArchive_(month, rows) {
  const folder = autoArchiveFolder_();
  const fileName = `accesos_${month}.json`;
  const file = writeJsonFile_(folder, fileName);
  let existingLogs = [];
  if (file) {
    try { existingLogs = JSON.parse(file.getBlob().getDataAsString('UTF-8')).logs || []; } catch (error) { existingLogs = []; }
  }
  const incoming = rowsToLogPayload_(rows);
  const seen = new Set();
  const merged = existingLogs.concat(incoming).filter((row) => {
    const key = row.id || `${row.user}|${row.role}|${row.at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.at) - new Date(a.at));
  const content = JSON.stringify({ month, generatedAt: new Date().toISOString(), count: merged.length, logs: merged });
  if (file) {
    file.setContent(content);
  } else {
    folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  }
  return { month, count: merged.length };
}

function exportAccessLogsBackup(payload) {
  try {
    if (!checkAdminToken_(payload)) return { success: false, message: 'No autorizado.' };
    const rows = readAllAccessRows_();
    if (!rows.length) return { success: true, message: 'No hay accesos para respaldar.', fileName: null, total: 0 };
    const fileName = safeFileName_(payload && payload.fileName, 'respaldo_manual');
    const folder = manualArchiveFolder_();
    const content = JSON.stringify({ fileName, generatedAt: new Date().toISOString(), count: rows.length, logs: rowsToLogPayload_(rows) });
    const existing = writeJsonFile_(folder, fileName);
    if (existing) {
      existing.setContent(content);
    } else {
      folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    }
    return { success: true, fileName, total: rows.length };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo respaldar el historial.' };
  }
}

function getArchivedMonths(payload) {
  try {
    const folder = autoArchiveFolder_();
    const files = folder.getFilesByType(MimeType.PLAIN_TEXT);
    const months = [];
    while (files.hasNext()) {
      const file = files.next();
      const match = /^accesos_(\d{4}-\d{2})\.json$/.exec(file.getName());
      if (match) months.push(match[1]);
    }
    months.sort().reverse();
    return { success: true, months };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo listar el historial archivado.' };
  }
}

function getArchivedAccessLogs(payload) {
  try {
    const month = String((payload && payload.month) || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return { success: false, message: 'Mes invalido.' };
    const folder = autoArchiveFolder_();
    const files = folder.getFilesByName(`accesos_${month}.json`);
    if (!files.hasNext()) return { success: true, month, logs: [] };
    const file = files.next();
    const data = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    return { success: true, month, logs: data.logs || [] };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo leer el historial archivado.' };
  }
}

function runMonthlyAccessArchive() {
  try {
    const currentMonth = monthKey_(new Date());
    const rows = readAllAccessRows_().filter((row) => monthKey_(row.at) !== currentMonth);
    if (!rows.length) return { success: true, archived: 0, deletedRows: 0 };
    const groups = {};
    rows.forEach((row) => {
      const key = monthKey_(row.at);
      (groups[key] = groups[key] || []).push(row);
    });
    Object.keys(groups).forEach((month) => writeMonthlyArchive_(month, groups[month]));

    const sheet = accessLogSheet_();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map((header) => String(header || '').trim());
    const dateIndex = headerIndex_(headers, 'Fecha_Hora');
    const rowsToDelete = [];
    for (let i = 1; i < values.length; i++) {
      const value = values[i][dateIndex];
      const date = value instanceof Date ? value : new Date(value);
      if (!Number.isNaN(date.getTime()) && monthKey_(date) !== currentMonth) rowsToDelete.push(i + 1);
    }
    rowsToDelete.sort((a, b) => b - a).forEach((rowNumber) => sheet.deleteRow(rowNumber));
    return { success: true, archived: rows.length, deletedRows: rowsToDelete.length };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo archivar automaticamente.' };
  }
}

function installMonthlyAccessArchiveTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'runMonthlyAccessArchive')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('runMonthlyAccessArchive').timeBased().onMonthDay(1).atHour(2).create();
  return { success: true, message: 'Disparador mensual instalado: dia 1 de cada mes, 02:00.' };
}

function recordSessionHeartbeat(payload) {
  try {
    const sessionId = String(payload.sessionId || payload.id || '').trim();
    const user = String(payload.user || payload.usuario || '').trim();
    const role = String(payload.role || payload.rol || '').trim();
    if (!sessionId || !user || !role) return { success: false, message: 'Sesion incompleta.' };

    const sheet = sessionSheet_();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map((header) => String(header || '').trim());
    const idIndex = headerIndex_(headers, 'ID_Sesion');
    const now = new Date();
    let rowNumber = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idIndex] || '') === sessionId) {
        rowNumber = i + 1;
        break;
      }
    }

    const data = {
      ID_Sesion: sessionId,
      Usuario: user,
      Rol: role,
      Estado: 'CONECTADO',
      Inicio: payload.startedAt ? new Date(payload.startedAt) : now,
      Ultimo_Latido: now,
      Fin: '',
      Version_App: String(payload.version || ''),
      Dispositivo: String(payload.device || ''),
      User_Agent: String(payload.userAgent || '').slice(0, 500)
    };
    if (rowNumber === -1) {
      const currentHeaders = headers_(sheet);
      sheet.appendRow(currentHeaders.map((header) => data[header] !== undefined ? data[header] : ''));
    } else {
      updateRow_(sheet, rowNumber, headers, data);
    }
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo actualizar la sesion.' };
  }
}

function endSession(payload) {
  try {
    const sessionId = String(payload.sessionId || payload.id || '').trim();
    if (!sessionId) return { success: false, message: 'Sesion no indicada.' };
    const sheet = sessionSheet_();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map((header) => String(header || '').trim());
    const idIndex = headerIndex_(headers, 'ID_Sesion');
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idIndex] || '') === sessionId) {
        updateRow_(sheet, i + 1, headers, { Estado: 'DESCONECTADO', Fin: new Date(), Ultimo_Latido: new Date() });
        return { success: true };
      }
    }
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo cerrar la sesion.' };
  }
}

function getConnectedUsers(payload) {
  try {
    const thresholdSeconds = Math.max(Number(payload.thresholdSeconds || 90), 30);
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
    const sheet = sessionSheet_();
    const values = sheet.getDataRange().getValues();
    const totalUsers = readLoginRows_().filter((user) => user.activo).length;
    if (values.length < 2) return { success: true, connected: 0, total: totalUsers, sessions: [] };

    const headers = values[0].map((header) => String(header || '').trim());
    const index = (name) => headerIndex_(headers, name);
    const userIndex = index('Usuario');
    const roleIndex = index('Rol');
    const statusIndex = index('Estado');
    const heartbeatIndex = index('Ultimo_Latido');
    const sessionIndex = index('ID_Sesion');
    const byUser = {};
    values.slice(1).forEach((row) => {
      const last = row[heartbeatIndex] instanceof Date ? row[heartbeatIndex] : new Date(row[heartbeatIndex]);
      const status = normalizeHeader_(row[statusIndex]);
      if (status !== 'conectado' || Number.isNaN(last.getTime()) || last < cutoff) return;
      const user = String(row[userIndex] || '').trim();
      const role = String(row[roleIndex] || '').trim();
      if (!user || !role) return;
      const key = `${normalizeHeader_(role)}|${normalizeHeader_(user)}`;
      if (!byUser[key] || last > byUser[key].lastDate) {
        byUser[key] = {
          sessionId: String(row[sessionIndex] || ''),
          user,
          role,
          lastHeartbeat: last.toISOString(),
          lastDate: last
        };
      }
    });
    const sessions = Object.keys(byUser).map((key) => {
      const item = byUser[key];
      delete item.lastDate;
      return item;
    }).sort((a, b) => new Date(b.lastHeartbeat) - new Date(a.lastHeartbeat));
    return { success: true, connected: sessions.length, total: totalUsers, sessions };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo consultar usuarios conectados.' };
  }
}

function getUsers(payload) {
  try {
    const users = readLoginRows_().map((user) => ({
      row: user.row,
      rol: user.rol,
      razon: user.razon,
      usuario: user.usuario,
      estado: user.estado || (user.activo ? 'Activo' : 'Retirado'),
      activo: user.activo
    }));
    return { success: true, users };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo consultar usuarios.' };
  }
}

function saveUser(payload) {
  try {
    const role = String(payload.rol || payload.role || '').trim();
    const razon = String(payload.razon || payload.nombre || '').trim();
    const usuario = String(payload.usuario || payload.user || '').trim();
    const estado = normalizeUserStatus_(payload.estado || 'Activo');
    const rowNumber = Number(payload.row || 0);
    const password = String(payload.password || payload.contrasena || '').trim();
    if (!role || !usuario) return { success: false, message: 'Rol y usuario son obligatorios.' };

    const sheet = requiredSheet_(APP.LOGIN);
    ensureHeaders_(sheet, ['Rol', 'Razon', 'Usuario', 'Contraseña', 'Activo', 'Estado', 'Password_Hash', 'Password_Salt']);
    const headers = headers_(sheet);
    const rows = rows_(sheet);
    const existing = rows.find((row) => Number(row._row) === rowNumber) || rows.find((row) =>
      normalizeHeader_(row.Usuario) === normalizeHeader_(usuario) && normalizeHeader_(row.Rol) === normalizeHeader_(role)
    );
    const data = {
      Rol: role,
      Razon: razon,
      Usuario: usuario,
      Activo: estado === 'Activo' ? 'SI' : 'NO',
      Estado: estado
    };
    if (password) {
      const salt = Utilities.getUuid();
      data.Password_Salt = salt;
      data.Password_Hash = hashPassword_(password, salt);
      data['Contraseña'] = '';
    }

    if (existing) {
      updateRow_(sheet, existing._row, headers, data);
      return { success: true, message: 'Usuario actualizado.' };
    }
    if (!password) return { success: false, message: 'La contraseña es obligatoria para usuarios nuevos.' };
    const finalHeaders = headers_(sheet);
    sheet.appendRow(finalHeaders.map((header) => data[header] !== undefined ? data[header] : ''));
    return { success: true, message: 'Usuario creado.' };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo guardar el usuario.' };
  }
}

function deleteUser(payload) {
  try {
    const rowNumber = Number(payload.row || 0);
    if (!rowNumber || rowNumber < 2) return { success: false, message: 'Usuario no indicado.' };
    const sheet = requiredSheet_(APP.LOGIN);
    const headers = headers_(sheet);
    updateRow_(sheet, rowNumber, headers, { Activo: 'NO', Estado: 'Retirado' });
    return { success: true, message: 'Usuario retirado.' };
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo retirar el usuario.' };
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
  ensureHeaders_(login, ['Rol', 'Razon', 'Usuario', 'Contraseña', 'Activo', 'Estado', 'Password_Hash', 'Password_Salt']);
}

function createDailyTrigger_() {
  const handler = 'tareaDiariaSistema';
  const exists = ScriptApp.getProjectTriggers().some((trigger) => trigger.getHandlerFunction() === handler);
  if (!exists) ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(5).create();
}

function tareaDiariaSistema() {
  initializeDefaults_();
  accessLogSheet_();
  sessionSheet_();
  pruneAccessLogs(90);
}

function accessLogHeaders_() {
  return ['ID_Acceso', 'Fecha_Hora', 'Usuario', 'Rol', 'Version_App', 'Dispositivo', 'User_Agent'];
}

function accessLogSheet_() {
  return getOrCreateSheet_(db_(), APP.ACCESS_LOG, accessLogHeaders_());
}

function sessionHeaders_() {
  return ['ID_Sesion', 'Usuario', 'Rol', 'Estado', 'Inicio', 'Ultimo_Latido', 'Fin', 'Version_App', 'Dispositivo', 'User_Agent'];
}

function sessionSheet_() {
  return getOrCreateSheet_(db_(), APP.SESSIONS, sessionHeaders_());
}

function normalizeUserStatus_(value) {
  const normalized = normalizeHeader_(value);
  if (normalized === 'vacaciones') return 'Vacaciones';
  if (normalized === 'retirado' || normalized === 'eliminado' || normalized === 'inactivo') return 'Retirado';
  return 'Activo';
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



