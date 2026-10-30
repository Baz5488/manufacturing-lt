/**
 * PROTO CONTROL Tracker — 未完製品入荷フロー (incomplete.html) shared store.
 *
 * Add this file to the Tracker Apps Script project (File → New → Script, name it IncompleteCases),
 * then add ONE line at the top of the existing doGet(e) and doPost(e) — see "V3.15 update" in the README.
 *
 *   doGet(e):   var inc = incompleteGet_(e);  if (inc) return inc;
 *   doPost(e):  var inc = incompletePost_(e); if (inc) return inc;
 *
 * Cases are kept in the sheet tab INCOMPLETE_CASES of the Tracker spreadsheet: one row per case,
 * readable columns for people who open the sheet, and the full case as JSON in the last column.
 *
 * Access is by key, separate from the Tracker owner key:
 *   edit key — every department (and the 作業担当) that stamps / reports / registers cases
 *   view key — read only (e.g. the factory side that only needs to see the status)
 * Run createIncompleteLinks() in the editor to make the keys and log the two links to share.
 */

var INC_SHEET = 'INCOMPLETE_CASES';
// The published incomplete.html page; used only to build the links logged by createIncompleteLinks().
var INC_PAGE_URL = 'https://baz5488.github.io/manufacturing-lt/incomplete.html';
var INC_HEAD = ['id', 'ハーネス品番', '顧客', '数量', '未完箇所', '顧客納期', '調整後納期', '国内作業', '作業部署', '作業担当者',
  'インボイス番号', 'ETA', '状態', '現在のステップ', '対応待ち部署', '登録日時', '更新日時', '更新者', 'rev', 'json'];
var INC_JSON_COL = INC_HEAD.length;      // 1-based column of the JSON
var INC_REV_COL = INC_HEAD.indexOf('rev') + 1;
var INC_MAX_JSON = 48000;                // a sheet cell holds 50,000 characters

/** Run once in the editor: creates the keys (if missing) and logs the links to share. */
function createIncompleteLinks() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('INC_EDIT_KEY')) p.setProperty('INC_EDIT_KEY', incNewKey_());
  if (!p.getProperty('INC_VIEW_KEY')) p.setProperty('INC_VIEW_KEY', incNewKey_());
  var exec = ScriptApp.getService().getUrl();
  incSheet_();
  var link = function (key) { return INC_PAGE_URL + '?tracker=' + encodeURIComponent(exec) + '&key=' + key; };
  Logger.log('編集リンク (各部署・作業担当):\n' + link(p.getProperty('INC_EDIT_KEY')));
  Logger.log('閲覧リンク (見るだけ):\n' + link(p.getProperty('INC_VIEW_KEY')));
  if (/\/dev$/.test(exec)) Logger.log('⚠ The web app URL above ends in /dev. Deploy the web app and use its /exec URL.');
}

/** Run to stop old links working (e.g. someone left). Then run createIncompleteLinks() and share the new links. */
function resetIncompleteKeys() {
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty('INC_EDIT_KEY');
  p.deleteProperty('INC_VIEW_KEY');
  createIncompleteLinks();
}

/** doGet hook: ?api=incomplete&key=…[&callback=…] → all cases. Returns null for other requests. */
function incompleteGet_(e) {
  var q = (e && e.parameter) || {};
  if (q.api !== 'incomplete') return null;
  var role = incRole_(q.key);
  if (!role) return incOut_({ ok: false, error: 'キーが違います。Tracker 管理者に新しいリンクをもらってください。' }, q.callback);
  return incOut_({ ok: true, role: role, cases: incReadAll_().map(function (r) { return r.c; }), serverTime: new Date().toISOString() }, q.callback);
}

/** doPost hook: body {api:"incomplete.save" | "incomplete.delete" | "incomplete.import", key, …}. Returns null for other requests. */
function incompletePost_(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return null; }
  if (!body || typeof body.api !== 'string' || body.api.indexOf('incomplete.') !== 0) return null;
  var role = incRole_(body.key);
  if (!role) return incOut_({ ok: false, error: 'キーが違います。Tracker 管理者に新しいリンクをもらってください。' });
  if (role !== 'edit') return incOut_({ ok: false, error: '閲覧専用のリンクです。変更はできません。' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return incOut_({ ok: false, error: 'Tracker が混み合っています。もう一度お試しください。' });
  try {
    if (body.api === 'incomplete.save') return incOut_(incSave_(body));
    if (body.api === 'incomplete.delete') return incOut_(incDelete_(body));
    if (body.api === 'incomplete.import') return incOut_(incImport_(body));
    return incOut_({ ok: false, error: 'Unknown api ' + body.api });
  } finally {
    lock.releaseLock();
  }
}

// Save one case. baseRev must match the stored rev, otherwise someone else saved first: send theirs back.
function incSave_(body) {
  var c = body['case'];
  if (!c || !c.id) return { ok: false, error: 'case がありません。' };
  var sh = incSheet_(), found = incFind_(sh, c.id), baseRev = Number(body.baseRev) || 0;
  if (found) {
    if (found.c.rev !== baseRev) return { ok: false, conflict: true, 'case': found.c };
  } else if (baseRev) {
    return { ok: false, deleted: true };
  }
  c.rev = baseRev + 1;
  incWrite_(sh, found ? found.row : sh.getLastRow() + 1, c, body.summary || {});
  return { ok: true, rev: c.rev };
}

function incDelete_(body) {
  var sh = incSheet_(), found = incFind_(sh, String(body.id || ''));
  if (found) sh.deleteRow(found.row);
  return { ok: true };
}

// Upload cases from a browser (local mode / JSON file). Cases already in the sheet are left as they are.
function incImport_(body) {
  var sh = incSheet_(), have = {}, added = 0;
  incReadAll_().forEach(function (r) { have[r.c.id] = true; });
  (body.cases || []).forEach(function (x) {
    if (!x || !x.c || !x.c.id || have[x.c.id]) return;
    x.c.rev = 1;
    incWrite_(sh, sh.getLastRow() + 1, x.c, x.summary || {});
    have[x.c.id] = true;
    added++;
  });
  return { ok: true, added: added };
}

function incWrite_(sh, row, c, sum) {
  c.log = (c.log || []).slice(0, 300);
  var json = JSON.stringify(c);
  while (json.length > INC_MAX_JSON && c.log.length > 20) { c.log = c.log.slice(0, Math.floor(c.log.length * 0.7)); json = JSON.stringify(c); }
  var s = c.steps || {}, g = function (k) { return s[k] || {}; }, last = (c.log || [])[0] || {};
  sh.getRange(row, 1, 1, INC_HEAD.length).setValues([[
    c.id, c.partNo || '', c.customer || '', c.qty || '', c.area || '', c.dueDate || '', g('schedule').newDue || '',
    g('work').value || '', g('workDept').dept || '', g('workDept').worker || '', g('arrival').invoice || '', g('arrival').eta || '',
    sum.status || '', sum.current || '', sum.waiting || '', (c.createdAt || '').slice(0, 16).replace('T', ' '),
    (last.at || '').slice(0, 16).replace('T', ' '), ((last.dept || '') + ' ' + (last.name || '')).trim(), c.rev, json
  ]]);
}

function incReadAll_() {
  var sh = incSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, INC_JSON_COL, n, 1).getValues().map(function (v, i) {
    try { return { row: i + 2, c: JSON.parse(v[0]) }; } catch (err) { return null; }
  }).filter(function (r) { return r && r.c && r.c.id; });
}

function incFind_(sh, id) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return null;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      var json = sh.getRange(i + 2, INC_JSON_COL).getValue();
      try { return { row: i + 2, c: JSON.parse(json) }; } catch (err) { return { row: i + 2, c: { id: id, rev: Number(sh.getRange(i + 2, INC_REV_COL).getValue()) || 0 } }; }
    }
  }
  return null;
}

function incSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(INC_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INC_SHEET);
    sh.getRange(1, 1, 1, INC_HEAD.length).setValues([INC_HEAD]).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.hideColumns(INC_JSON_COL);
  }
  return sh;
}

function incRole_(key) {
  key = String(key || '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(key)) return '';
  var p = PropertiesService.getScriptProperties();
  if (key === p.getProperty('INC_EDIT_KEY')) return 'edit';
  if (key === p.getProperty('INC_VIEW_KEY')) return 'view';
  return '';
}

function incNewKey_() { return Utilities.getUuid().replace(/-/g, '').toLowerCase(); }

function incOut_(obj, callback) {
  var text = JSON.stringify(obj);
  if (callback && /^[\w.]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + text + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
