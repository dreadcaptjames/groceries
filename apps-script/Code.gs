/**
 * Groceries app <-> Google Sheet sync.
 *
 * Setup (once):
 *   1. In your Google Sheet: Extensions -> Apps Script. Replace everything with this file. Save.
 *   2. Deploy -> New deployment -> type "Web app".
 *      Execute as: Me.   Who has access: Anyone.
 *   3. Authorize, then copy the "Web app" URL and paste it into the app (More -> Google Sheet).
 *
 * Tabs: List, Staples and Meals are for people. Aisles, History, Settings and Deleted are
 * hidden helper tabs the app uses. Each row has an id and an updatedAt time (milliseconds);
 * when the app and the sheet disagree, the most recently changed row wins.
 */

const SCHEMA = {
  Deleted: ['collection', 'id', 'updatedAt'], // read first: other tabs may add to it
  List: ['name', 'aisle', 'inCart', 'sources', 'id', 'updatedAt'],
  Staples: ['name', 'id', 'updatedAt'],
  Meals: ['name', 'ingredients', 'thisWeek', 'id', 'updatedAt'],
  Aisles: ['name', 'aisle', 'id', 'updatedAt'],
  History: ['name', 'count', 'last', 'id', 'updatedAt'],
  Settings: ['id', 'value', 'updatedAt'],
};
const HIDDEN_TABS = ['Aisles', 'History', 'Settings', 'Deleted'];
const CHECKBOX_COLS = { List: 'inCart', Meals: 'thisWeek' };
const NUMBER_COLS = ['updatedAt', 'count', 'last'];
const NAME_KEYED = ['List', 'Staples', 'Aisles', 'History']; // id is the lower-cased name
const TOMBSTONE_DAYS = 60;

function doGet() {
  return respond_(() => sync_([]));
}

function doPost(e) {
  return respond_(() => {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return sync_(Array.isArray(body.records) ? body.records : []);
  });
}

function respond_(fn) {
  let out;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    out = fn();
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function normalize_(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function sync_(incoming) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = Date.now();
  const dirty = {};
  const db = {};
  Object.keys(SCHEMA).forEach((tab) => { db[tab] = readTab_(ss, tab, now, dirty, db.Deleted); });
  const dead = db.Deleted; // keyed "collection:id"

  incoming.forEach((r) => {
    const tab = r && r.collection;
    if (!SCHEMA[tab] || tab === 'Deleted' || !r.id) return;
    const id = String(r.id);
    const t = Number(r.updatedAt) || 0;
    const cur = db[tab].get(id);
    const tomb = dead.get(tab + ':' + id);
    const newest = Math.max(cur ? Number(cur.updatedAt) || 0 : 0, tomb ? Number(tomb.updatedAt) || 0 : 0);
    if (t <= newest) return; // the sheet already has the same or a newer version

    if (r.deleted) {
      if (cur) { db[tab].delete(id); dirty[tab] = true; }
      dead.set(tab + ':' + id, { collection: tab, id: id, updatedAt: t });
      dirty.Deleted = true;
    } else {
      const rec = {};
      SCHEMA[tab].forEach((c) => { rec[c] = r[c] === undefined || r[c] === null ? '' : r[c]; });
      rec.id = id;
      rec.updatedAt = t;
      db[tab].set(id, rec);
      dirty[tab] = true;
      if (tomb) { dead.delete(tab + ':' + id); dirty.Deleted = true; }
    }
  });

  dead.forEach((v, k) => {
    if (now - Number(v.updatedAt) > TOMBSTONE_DAYS * 864e5) { dead.delete(k); dirty.Deleted = true; }
  });

  Object.keys(dirty).forEach((tab) => writeTab_(ss, tab, db[tab]));

  const records = [];
  Object.keys(SCHEMA).forEach((tab) => {
    if (tab === 'Deleted') return;
    db[tab].forEach((rec) => records.push(Object.assign({ collection: tab }, rec)));
  });
  return { ok: true, now: now, sheetUrl: ss.getUrl(), records: records };
}

function readTab_(ss, tab, now, dirty, dead) {
  const map = new Map();
  const sh = ss.getSheetByName(tab);
  if (!sh) { dirty[tab] = true; return map; }
  const values = sh.getDataRange().getValues();
  if (!values.length) { dirty[tab] = true; return map; }
  const header = values[0].map((h) => String(h).trim());
  if (header.join(',') !== SCHEMA[tab].join(',')) dirty[tab] = true;

  for (let i = 1; i < values.length; i++) {
    const row = {};
    header.forEach((h, j) => { if (h) row[h] = values[i][j]; });

    if (tab === 'Deleted') {
      if (row.id !== '' && row.collection) {
        map.set(row.collection + ':' + row.id, { collection: String(row.collection), id: String(row.id), updatedAt: Number(row.updatedAt) || 0 });
      }
      continue;
    }

    const name = row.name === undefined ? '' : String(row.name).trim();
    if (!name && (row.id === '' || row.id === undefined)) continue; // blank row
    if (tab !== 'Settings' && !name) continue; // a row with its name cleared counts as deleted
    if (name) row.name = name;

    if (row.id === '' || row.id === undefined) {
      // Typed into the sheet by hand.
      row.id = NAME_KEYED.indexOf(tab) >= 0 ? normalize_(name) : Utilities.getUuid().slice(0, 8);
      row.updatedAt = now;
      dirty[tab] = true;
    }
    row.id = String(row.id);

    if (NAME_KEYED.indexOf(tab) >= 0 && row.id !== normalize_(name)) {
      // Renamed in the sheet: re-key it so the app matches it by name.
      dead.set(tab + ':' + row.id, { collection: tab, id: row.id, updatedAt: now });
      row.id = normalize_(name);
      row.updatedAt = now;
      dirty[tab] = true;
      dirty.Deleted = true;
    }
    if (!Number(row.updatedAt)) { row.updatedAt = now; dirty[tab] = true; }
    row.updatedAt = Number(row.updatedAt);

    const prev = map.get(row.id);
    if (prev) {
      dirty[tab] = true; // duplicate row: keep the newer one
      if (Number(prev.updatedAt) > row.updatedAt) continue;
    }
    map.set(row.id, row);
  }
  return map;
}

function writeTab_(ss, tab, map) {
  let sh = ss.getSheetByName(tab);
  if (!sh) {
    sh = ss.insertSheet(tab);
    if (HIDDEN_TABS.indexOf(tab) >= 0) sh.hideSheet();
  }
  const cols = SCHEMA[tab];
  const rows = Array.from(map.values());
  const text = (v) => String(v === undefined || v === null ? '' : v);
  if (tab === 'List') {
    rows.sort((a, b) => text(a.aisle).localeCompare(text(b.aisle)) || text(a.name).localeCompare(text(b.name)));
  } else if (cols.indexOf('name') >= 0) {
    rows.sort((a, b) => text(a.name).localeCompare(text(b.name)));
  }
  const data = [cols].concat(rows.map((r) => cols.map((c) => (r[c] === undefined || r[c] === null ? '' : r[c]))));

  if (sh.getMaxRows() < data.length + 1) sh.insertRowsAfter(sh.getMaxRows(), data.length + 1 - sh.getMaxRows());
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());

  sh.clearContents();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  cols.forEach((c, j) => {
    if (CHECKBOX_COLS[tab] === c) return;
    sh.getRange(1, j + 1, data.length, 1).setNumberFormat(NUMBER_COLS.indexOf(c) >= 0 ? '0' : '@');
  });
  sh.getRange(1, 1, data.length, cols.length).setValues(data);
  sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  const cb = CHECKBOX_COLS[tab];
  if (cb && rows.length) sh.getRange(2, cols.indexOf(cb) + 1, rows.length, 1).insertCheckboxes();
}

/** Stamps rows edited by hand so the app knows they changed. Runs automatically. */
function onEdit(e) {
  const sh = e.range.getSheet();
  const tab = sh.getName();
  const cols = SCHEMA[tab];
  if (!cols || tab === 'Deleted') return;
  const uc = cols.indexOf('updatedAt') + 1;
  if (e.range.getColumn() === uc && e.range.getNumColumns() === 1) return;
  const first = Math.max(e.range.getRow(), 2);
  const last = e.range.getLastRow();
  if (last < first) return;
  const stamp = Date.now();
  const vals = [];
  for (let r = first; r <= last; r++) vals.push([stamp]);
  sh.getRange(first, uc, vals.length, 1).setValues(vals);
}
