'use strict';

/* ---------- Constants ---------- */

const STORAGE_KEY = 'groceries.v1';

const CATEGORIES = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread', 'Deli',
  'Pantry', 'Frozen', 'Snacks', 'Beverages', 'Household', 'Personal Care', 'Other',
];

// Keyword → category guesses. First match wins, so more specific words come first.
const CATEGORY_HINTS = [
  ['Personal Care', ['toothpaste', 'toothbrush', 'floss', 'mouthwash', 'shampoo', 'conditioner', 'soap', 'body wash', 'deodorant', 'lotion', 'razor', 'sunscreen', 'tampon', 'pad', 'vitamin', 'ibuprofen', 'tylenol', 'advil', 'band-aid', 'bandaid', 'cotton', 'q-tip', 'diaper', 'wipes', 'chapstick']],
  ['Household', ['paper towel', 'toilet paper', 'tissue', 'kleenex', 'napkin', 'trash bag', 'garbage bag', 'dish soap', 'dishwasher', 'detergent', 'laundry', 'bleach', 'cleaner', 'sponge', 'foil', 'plastic wrap', 'ziploc', 'zip bag', 'batteries', 'light bulb', 'dryer sheet', 'clorox', 'lysol']],
  ['Frozen', ['frozen', 'ice cream', 'popsicle', 'waffles', 'pizza rolls', 'tater tots']],
  ['Dairy & Eggs', ['milk', 'egg', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream', 'cottage', 'half and half', 'creamer']],
  ['Meat & Seafood', ['chicken', 'beef', 'steak', 'pork', 'bacon', 'sausage', 'turkey', 'ham', 'salmon', 'shrimp', 'fish', 'tilapia', 'ground', 'lamb', 'meatball', 'hot dog']],
  ['Deli', ['deli', 'lunch meat', 'salami', 'pepperoni', 'prosciutto', 'hummus', 'rotisserie']],
  ['Bakery & Bread', ['bread', 'bagel', 'bun', 'roll', 'tortilla', 'muffin', 'croissant', 'pita', 'english muffin', 'naan']],
  ['Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'berry', 'berries', 'grape', 'melon', 'avocado', 'tomato', 'potato', 'onion', 'garlic', 'lettuce', 'spinach', 'kale', 'carrot', 'celery', 'pepper', 'cucumber', 'broccoli', 'cauliflower', 'zucchini', 'squash', 'mushroom', 'cilantro', 'parsley', 'basil', 'ginger', 'corn', 'peach', 'pear', 'salad', 'green bean', 'asparagus', 'cabbage', 'jalapeno', 'scallion', 'green onion']],
  ['Beverages', ['juice', 'soda', 'coffee', 'tea', 'water', 'seltzer', 'la croix', 'beer', 'wine', 'gatorade', 'kombucha']],
  ['Snacks', ['chips', 'crackers', 'cookies', 'pretzels', 'popcorn', 'granola bar', 'goldfish', 'nuts', 'trail mix', 'candy', 'chocolate', 'fruit snack']],
  ['Pantry', ['pasta', 'spaghetti', 'rice', 'beans', 'flour', 'sugar', 'oil', 'vinegar', 'sauce', 'salsa', 'soup', 'broth', 'stock', 'cereal', 'oats', 'oatmeal', 'peanut butter', 'jelly', 'jam', 'honey', 'syrup', 'ketchup', 'mustard', 'mayo', 'spice', 'salt', 'seasoning', 'canned', 'noodle', 'taco shell', 'quinoa', 'baking']],
];

/* ---------- State ---------- */

const defaultState = () => ({
  version: 1,
  weekStart: startOfWeek(new Date()).toISOString(),
  list: [],        // {id, name, cat, sources: ['staple'|'added'|'meal:<id>'], checked}
  staples: [],     // {id, name}
  meals: [],       // {id, name, ingredients: [string]}
  weekMeals: [],   // meal ids picked for this week
  cats: {},        // remembered category per item key
  history: {},     // key -> {name, count, last}
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) { console.error(e); }
  return defaultState();
}

function save() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleDriveBackup();
}

function commit() { save(); render(); }

/* ---------- Helpers ---------- */

const $ = (sel) => document.querySelector(sel);
const keyOf = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const cleanName = (name) => name.trim().replace(/\s+/g, ' ');

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}

function guessCategory(name) {
  const k = keyOf(name);
  if (state.cats[k]) return state.cats[k];
  for (const [cat, words] of CATEGORY_HINTS) {
    if (words.some((w) => k.includes(w))) return cat;
  }
  return 'Other';
}

function htSearchUrl(name) {
  return 'https://www.harristeeter.com/search?query=' + encodeURIComponent(name) + '&searchType=default_search';
}

function sourceLabel(src) {
  if (src === 'staple') return 'Weekly';
  if (src === 'added') return 'Added';
  if (src.startsWith('meal:')) {
    const meal = state.meals.find((m) => m.id === src.slice(5));
    return meal ? meal.name : 'Meal';
  }
  return src;
}

function remember(name) {
  const k = keyOf(name);
  const h = state.history[k] || { name, count: 0 };
  h.name = name; h.count += 1; h.last = Date.now();
  state.history[k] = h;
}

/* ---------- List operations ---------- */

function addToList(name, source) {
  name = cleanName(name);
  if (!name) return null;
  const k = keyOf(name);
  let item = state.list.find((i) => keyOf(i.name) === k);
  if (item) {
    if (!item.sources.includes(source)) item.sources.push(source);
  } else {
    item = { id: uid(), name, cat: guessCategory(name), sources: [source], checked: false };
    state.list.push(item);
  }
  remember(name);
  return item;
}

function removeSource(name, source) {
  const k = keyOf(name);
  const item = state.list.find((i) => keyOf(i.name) === k);
  if (!item) return;
  item.sources = item.sources.filter((s) => s !== source);
  if (item.sources.length === 0) state.list = state.list.filter((i) => i !== item);
}

function setCategory(name, cat) {
  const k = keyOf(name);
  state.cats[k] = cat;
  state.list.forEach((i) => { if (keyOf(i.name) === k) i.cat = cat; });
}

function toggleMeal(mealId) {
  const meal = state.meals.find((m) => m.id === mealId);
  if (!meal) return;
  const src = 'meal:' + mealId;
  if (state.weekMeals.includes(mealId)) {
    state.weekMeals = state.weekMeals.filter((id) => id !== mealId);
    meal.ingredients.forEach((ing) => removeSource(ing, src));
    toast(`Removed ${meal.name}`);
  } else {
    state.weekMeals.push(mealId);
    meal.ingredients.forEach((ing) => addToList(ing, src));
    toast(`Added ${meal.name} (${meal.ingredients.length} items)`);
  }
}

function startNewWeek() {
  // Anything bought (checked) is cleared. Unchecked one-off items carry over
  // so they don't get forgotten. Meal picks reset. Staples get re-added.
  const carry = state.list
    .filter((i) => !i.checked && i.sources.includes('added'))
    .map((i) => ({ ...i, sources: ['added'] }));
  state.list = carry;
  state.weekMeals = [];
  state.weekStart = startOfWeek(new Date()).toISOString();
  state.staples.forEach((s) => addToList(s.name, 'staple'));
}

/* ---------- Undo + toast ---------- */

let toastTimer;
function toast(msg, undoFn) {
  const el = $('#toast');
  el.innerHTML = '';
  el.append(document.createTextNode(msg));
  if (undoFn) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.onclick = () => { undoFn(); el.classList.remove('show'); };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undoFn ? 5000 : 2200);
}

function withUndo(msg, mutate) {
  const before = JSON.stringify(state);
  mutate();
  commit();
  toast(msg, () => { state = JSON.parse(before); commit(); });
}

/* ---------- Rendering ---------- */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return node;
}

function render() {
  renderWeekLabel();
  renderSuggestions();
  renderList();
  renderStaples();
  renderMeals();
  renderBackupStatus();
}

function renderWeekLabel() {
  const d = new Date(state.weekStart);
  $('#week-label').textContent = 'Week of ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderSuggestions() {
  // Autocomplete from everything we've ever seen.
  const names = new Map();
  Object.values(state.history).forEach((h) => names.set(keyOf(h.name), h.name));
  state.staples.forEach((s) => names.set(keyOf(s.name), s.name));
  state.meals.forEach((m) => m.ingredients.forEach((i) => names.set(keyOf(i), i)));
  $('#known-items').replaceChildren(...[...names.values()].sort().map((n) => el('option', { value: n })));

  // "Usual items" chips: frequently added things not on the list right now.
  const onList = new Set(state.list.map((i) => keyOf(i.name)));
  const recent = Object.entries(state.history)
    .filter(([k]) => !onList.has(k))
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .slice(0, 10)
    .map(([, h]) => el('button', {
      class: 'chip', type: 'button', title: 'Add to list',
      onclick: () => { addToList(h.name, 'added'); commit(); toast(`Added ${h.name}`); },
    }, '+ ' + h.name));
  $('#recent').replaceChildren(...recent);
}

function renderList() {
  const list = $('#list');
  if (state.list.length === 0) {
    list.replaceChildren(el('div', { class: 'empty' },
      'Your list is empty.', el('br'),
      'Add items above, set up weekly staples, or pick meals.'));
    $('#list-summary').textContent = '';
    return;
  }
  const done = state.list.filter((i) => i.checked).length;
  $('#list-summary').textContent = `${state.list.length} items · ${done} in cart`;

  const groups = new Map(CATEGORIES.map((c) => [c, []]));
  state.list.forEach((i) => {
    if (!groups.has(i.cat)) groups.set(i.cat, []);
    groups.get(i.cat).push(i);
  });

  const nodes = [];
  for (const [cat, items] of groups) {
    if (!items.length) continue;
    items.sort((a, b) => (a.checked - b.checked) || a.name.localeCompare(b.name));
    nodes.push(el('div', { class: 'group' },
      el('h3', {}, cat),
      items.map(listRow)));
  }
  list.replaceChildren(...nodes);
}

function listRow(item) {
  return el('div', { class: 'row' + (item.checked ? ' done' : '') },
    el('input', {
      type: 'checkbox', checked: item.checked, 'aria-label': `In cart: ${item.name}`,
      onchange: (e) => { item.checked = e.target.checked; commit(); },
    }),
    el('div', { class: 'name' },
      el('span', {}, item.name),
      el('small', {}, item.sources.map(sourceLabel).join(' · '))),
    el('a', {
      class: 'icon-btn', href: htSearchUrl(item.name), target: '_blank', rel: 'noopener',
      title: 'Search Harris Teeter', 'aria-label': `Search Harris Teeter for ${item.name}`,
    }, '🔍'),
    el('button', {
      class: 'icon-btn', type: 'button', title: 'Change aisle', 'aria-label': `Change aisle for ${item.name}`,
      onclick: () => pickCategory(item.name, item.cat),
    }, '🏷️'),
    el('button', {
      class: 'icon-btn', type: 'button', title: 'Remove', 'aria-label': `Remove ${item.name}`,
      onclick: () => withUndo(`Removed ${item.name}`, () => {
        state.list = state.list.filter((i) => i !== item);
      }),
    }, '✕'));
}

function renderStaples() {
  const ul = $('#staples');
  if (!state.staples.length) {
    ul.replaceChildren(el('li', { class: 'empty' }, 'No staples yet. Add milk, eggs, bread…'));
    return;
  }
  const sorted = [...state.staples].sort((a, b) => a.name.localeCompare(b.name));
  ul.replaceChildren(...sorted.map((s) => el('li', { class: 'row' },
    el('div', { class: 'name' }, el('span', {}, s.name), el('small', {}, guessCategory(s.name))),
    el('button', {
      class: 'icon-btn', type: 'button', title: 'Change aisle', 'aria-label': `Change aisle for ${s.name}`,
      onclick: () => pickCategory(s.name, guessCategory(s.name)),
    }, '🏷️'),
    el('button', {
      class: 'icon-btn', type: 'button', title: 'Remove staple', 'aria-label': `Remove staple ${s.name}`,
      onclick: () => withUndo(`${s.name} is no longer a staple`, () => {
        state.staples = state.staples.filter((x) => x !== s);
        removeSource(s.name, 'staple');
      }),
    }, '✕'))));
}

function renderMeals() {
  const wrap = $('#meals');
  if (!state.meals.length) {
    wrap.replaceChildren(el('div', { class: 'empty' }, 'No meals saved yet. Add the meals you make often.'));
    return;
  }
  const sorted = [...state.meals].sort((a, b) =>
    (state.weekMeals.includes(b.id) - state.weekMeals.includes(a.id)) || a.name.localeCompare(b.name));
  const picked = state.weekMeals.length;
  wrap.replaceChildren(
    el('div', { class: 'summary' }, `${picked} meal${picked === 1 ? '' : 's'} picked this week`),
    ...sorted.map((m) => {
      const on = state.weekMeals.includes(m.id);
      return el('div', { class: 'meal' + (on ? ' on' : '') },
        el('div', { class: 'body', onclick: () => openMealEditor(m) },
          el('strong', {}, m.name),
          el('small', {}, m.ingredients.join(', ') || 'No ingredients yet')),
        el('button', { class: 'pick', type: 'button', onclick: () => { toggleMeal(m.id); commit(); } },
          on ? '✓ This week' : '+ Add'));
    }));
}

/* ---------- Dialogs ---------- */

let editingMeal = null;

function openMealEditor(meal) {
  editingMeal = meal;
  $('#meal-dialog-title').textContent = meal ? 'Edit meal' : 'New meal';
  $('#meal-name').value = meal ? meal.name : '';
  $('#meal-ingredients').value = meal ? meal.ingredients.join('\n') : '';
  $('#meal-delete').hidden = !meal;
  $('#meal-dialog').showModal();
}

function saveMeal() {
  const name = cleanName($('#meal-name').value);
  if (!name) return;
  const ingredients = [...new Set($('#meal-ingredients').value
    .split(/\n|,/).map(cleanName).filter(Boolean))];

  if (editingMeal) {
    const src = 'meal:' + editingMeal.id;
    const isPicked = state.weekMeals.includes(editingMeal.id);
    if (isPicked) editingMeal.ingredients.forEach((i) => removeSource(i, src));
    editingMeal.name = name;
    editingMeal.ingredients = ingredients;
    if (isPicked) ingredients.forEach((i) => addToList(i, src));
  } else {
    state.meals.push({ id: uid(), name, ingredients });
  }
  commit();
}

function deleteMeal() {
  const meal = editingMeal;
  if (!meal) return;
  $('#meal-dialog').close();
  withUndo(`Deleted ${meal.name}`, () => {
    if (state.weekMeals.includes(meal.id)) toggleMeal(meal.id);
    state.meals = state.meals.filter((m) => m.id !== meal.id);
  });
}

function pickCategory(name, current) {
  $('#cat-dialog-title').textContent = `Aisle for “${name}”`;
  $('#cat-options').replaceChildren(...CATEGORIES.map((c) => el('button', {
    class: 'btn' + (c === current ? ' current' : ''), value: c, type: 'submit',
  }, c)));
  const dlg = $('#cat-dialog');
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (CATEGORIES.includes(dlg.returnValue)) { setCategory(name, dlg.returnValue); commit(); }
  };
  dlg.showModal();
}

/* ---------- Text export ---------- */

function listAsText() {
  const lines = [];
  for (const cat of CATEGORIES) {
    const items = state.list.filter((i) => i.cat === cat && !i.checked);
    if (!items.length) continue;
    lines.push(cat.toUpperCase());
    items.sort((a, b) => a.name.localeCompare(b.name)).forEach((i) => lines.push('• ' + i.name));
    lines.push('');
  }
  return lines.join('\n').trim();
}

/* ---------- Wiring ---------- */

function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

$('#quick-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#quick-input');
  const names = input.value.split(',').map(cleanName).filter(Boolean);
  if (!names.length) return;
  names.forEach((n) => addToList(n, 'added'));
  input.value = '';
  commit();
  toast(`Added ${names.join(', ')}`);
});

$('#staple-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#staple-input');
  const names = input.value.split(',').map(cleanName).filter(Boolean);
  names.forEach((name) => {
    if (!state.staples.some((s) => keyOf(s.name) === keyOf(name))) {
      state.staples.push({ id: uid(), name });
    }
    addToList(name, 'staple'); // also put it on this week's list
  });
  input.value = '';
  commit();
});

$('#new-meal').addEventListener('click', () => openMealEditor(null));
$('#meal-cancel').addEventListener('click', () => $('#meal-dialog').close());
$('#meal-delete').addEventListener('click', deleteMeal);
$('#meal-form').addEventListener('submit', saveMeal);

$('#copy-list').addEventListener('click', async () => {
  const text = listAsText();
  if (!text) return toast('Nothing left to copy');
  try {
    await navigator.clipboard.writeText(text);
    toast('List copied');
  } catch {
    prompt('Copy your list:', text);
  }
});

$('#clear-checked').addEventListener('click', () => {
  const n = state.list.filter((i) => i.checked).length;
  if (!n) return toast('Nothing checked yet');
  withUndo(`Removed ${n} checked item${n === 1 ? '' : 's'}`, () => {
    state.list = state.list.filter((i) => !i.checked);
  });
});

$('#new-week').addEventListener('click', () => {
  if (!confirm('Start a new week?\n\nChecked items are cleared, meal picks reset, and your staples are added back. Unchecked extras carry over.')) return;
  withUndo('New week started', startNewWeek);
});

$('#export').addEventListener('click', async () => {
  // On iPhone this opens the share sheet, where "Save to Files" can put it in iCloud Drive.
  const name = `groceries-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify(state, null, 2);
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Groceries backup' }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = el('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click(); a.remove();
});

$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.list) || !Array.isArray(data.meals)) throw new Error('Not a backup file');
    if (!confirm(`Replace everything on this device with the backup from ${describeTime(data.updatedAt)}?`)) return;
    withUndo('Backup restored', () => { state = { ...defaultState(), ...data }; });
  } catch (err) {
    alert('Could not import: ' + err.message);
  }
  e.target.value = '';
});

$('#reset-all').addEventListener('click', () => {
  if (!confirm('Erase all staples, meals, and your list on this device?')) return;
  withUndo('Everything erased', () => { state = defaultState(); });
});


/* ---------- Google Drive backup ---------- */
// Saves the whole app state to "groceries-backup.json" in the user's Google Drive
// (drive.file scope: the app can only see files it created). Changes are uploaded
// a couple of seconds after they happen while a sign-in token is valid (~1 hour);
// after that, a banner asks for a tap to sign in again and finish the backup.

const DRIVE_KEY = 'groceries.drive';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILE = 'groceries-backup.json';
const CLIENT_ID = ((window.GROCERIES_CONFIG || {}).googleClientId || '').trim();

let drive = loadDriveMeta();
let driveTimer = null;
let driveBusy = false;

function loadDriveMeta() {
  try { return JSON.parse(localStorage.getItem(DRIVE_KEY)) || {}; } catch { return {}; }
}
function saveDriveMeta() {
  localStorage.setItem(DRIVE_KEY, JSON.stringify(drive));
  renderBackupStatus();
}

function describeTime(ts) {
  if (!ts) return 'an unknown date';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? 'today at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function loadGoogleScript() {
  if (!CLIENT_ID || document.getElementById('gis')) return;
  const sc = document.createElement('script');
  sc.id = 'gis'; sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
  document.head.append(sc);
}

function validToken() {
  return drive.token && drive.tokenExp > Date.now() + 60000 ? drive.token : null;
}

// Must be called directly from a tap so the Google sign-in popup isn't blocked.
function requestToken() {
  return new Promise((resolve, reject) => {
    if (!(window.google && google.accounts && google.accounts.oauth2)) {
      reject(new Error('Google sign-in is still loading. Check your connection and try again.'));
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        drive.token = r.access_token;
        drive.tokenExp = Date.now() + Number(r.expires_in || 3600) * 1000;
        saveDriveMeta();
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e && e.type === 'popup_closed' ? 'Sign-in was cancelled.' : 'Google sign-in failed.')),
    });
    client.requestAccessToken({ prompt: drive.connected ? '' : 'consent' });
  });
}

async function driveFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + drive.token },
  });
  if (res.status === 401) {
    drive.token = null; saveDriveMeta();
    throw new Error('Google sign-in expired. Tap to sign in again.');
  }
  return res;
}

async function findDriveFile() {
  if (drive.fileId) {
    const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${drive.fileId}?fields=id,trashed,modifiedTime`);
    if (r.ok) { const f = await r.json(); if (!f.trashed) return f; }
  }
  const q = encodeURIComponent(`name='${DRIVE_FILE}' and trashed=false`);
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`);
  if (!r.ok) throw new Error('Could not reach Google Drive.');
  const f = (await r.json()).files[0] || null;
  drive.fileId = f ? f.id : null;
  saveDriveMeta();
  return f;
}

async function uploadToDrive() {
  const body = JSON.stringify(state, null, 2);
  if (!drive.fileId) {
    const r = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FILE, mimeType: 'application/json' }),
    });
    if (!r.ok) throw new Error('Could not create the backup file in Google Drive.');
    drive.fileId = (await r.json()).id;
  }
  let r = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${drive.fileId}?uploadType=media`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
  });
  if (r.status === 404) { drive.fileId = null; return uploadToDrive(); } // file was deleted in Drive
  if (!r.ok) throw new Error('Google Drive backup failed.');
  drive.lastBackup = Date.now();
  drive.pending = false;
  drive.error = null;
  saveDriveMeta();
}

async function downloadFromDrive(fileId) {
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!r.ok) throw new Error('Could not download the backup from Google Drive.');
  const data = await r.json();
  if (!Array.isArray(data.list) || !Array.isArray(data.meals)) throw new Error('The Drive file is not a valid backup.');
  return data;
}

function scheduleDriveBackup() {
  if (!drive.connected) return;
  drive.pending = true;
  localStorage.setItem(DRIVE_KEY, JSON.stringify(drive));
  clearTimeout(driveTimer);
  driveTimer = setTimeout(() => backupToDrive(false), 2000);
}

async function backupToDrive(interactive) {
  if (!drive.connected || driveBusy) return;
  try {
    driveBusy = true;
    if (!validToken()) {
      if (!interactive) { renderBackupStatus(); return; }
      await requestToken();
    }
    await uploadToDrive();
    if (interactive) toast('Backed up to Google Drive');
  } catch (err) {
    drive.error = err.message; saveDriveMeta();
    if (interactive) alert(err.message);
  } finally {
    driveBusy = false;
  }
}

function isEmpty(s) {
  return !s.list.length && !s.staples.length && !s.meals.length;
}

async function connectDrive() {
  try {
    await requestToken();
    drive.connected = true;
    saveDriveMeta();
    const file = await findDriveFile();
    if (file) {
      const remote = await downloadFromDrive(file.id);
      const useRemote = isEmpty(state) || confirm(
        `Found a Google Drive backup from ${describeTime(remote.updatedAt)}.\n\n` +
        'OK: replace this phone\'s data with the Drive backup.\n' +
        'Cancel: keep this phone\'s data and save it to Drive.');
      if (useRemote) {
        state = { ...defaultState(), ...remote };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        drive.lastBackup = remote.updatedAt || Date.now();
        drive.pending = false;
        saveDriveMeta();
        render();
        toast('Restored from Google Drive');
        return;
      }
    }
    await uploadToDrive();
    toast('Google Drive backup is on');
  } catch (err) {
    alert(err.message);
  }
}

async function restoreFromDrive() {
  try {
    if (!validToken()) await requestToken();
    const file = await findDriveFile();
    if (!file) return alert('No backup found in Google Drive yet.');
    const remote = await downloadFromDrive(file.id);
    if (!confirm(`Replace everything on this phone with the Google Drive backup from ${describeTime(remote.updatedAt)}?`)) return;
    withUndo('Restored from Google Drive', () => { state = { ...defaultState(), ...remote }; });
  } catch (err) {
    alert(err.message);
  }
}

function disconnectDrive() {
  if (!confirm('Stop backing up to Google Drive? The backup file already in Drive is kept.')) return;
  if (drive.token && window.google && google.accounts) google.accounts.oauth2.revoke(drive.token, () => {});
  drive = {};
  saveDriveMeta();
  toast('Google Drive backup turned off');
}

function renderBackupStatus() {
  const status = $('#drive-status');
  const pill = $('#backup-pill');
  if (!status) return;
  const show = (id, on) => { $(id).hidden = !on; };

  if (!CLIENT_ID) {
    status.textContent = 'Google Drive backup hasn\'t been set up for this app yet (it needs a Google Client ID in config.js).';
    ['#drive-connect', '#drive-backup', '#drive-restore', '#drive-disconnect'].forEach((id) => show(id, false));
    pill.hidden = true;
    return;
  }
  show('#drive-connect', !drive.connected);
  show('#drive-backup', !!drive.connected);
  show('#drive-restore', !!drive.connected);
  show('#drive-disconnect', !!drive.connected);

  if (!drive.connected) {
    status.textContent = 'Connect Google Drive to back up automatically after every change. Restore on any device by connecting the same Google account.';
    pill.hidden = true;
    return;
  }
  const last = drive.lastBackup ? `Last backup: ${describeTime(drive.lastBackup)}.` : 'Not backed up yet.';
  status.textContent = drive.pending
    ? `${last} Some changes aren't backed up yet.`
    : `Backing up automatically. ${last}`;

  // Banner on the List tab when changes are waiting and we need a tap to sign in again.
  const needsTap = drive.pending && !validToken();
  pill.hidden = !needsTap;
  if (needsTap) pill.textContent = '☁️ Changes not backed up to Google Drive. Tap to back up.';
}

$('#drive-connect').addEventListener('click', connectDrive);
$('#drive-backup').addEventListener('click', () => backupToDrive(true));
$('#drive-restore').addEventListener('click', restoreFromDrive);
$('#drive-disconnect').addEventListener('click', disconnectDrive);
$('#backup-pill').addEventListener('click', () => backupToDrive(true));

// Flush right away when the app is closed or switched away from (iOS may suspend it).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && drive.pending && validToken()) {
    clearTimeout(driveTimer);
    backupToDrive(false);
  }
});

loadGoogleScript();
if (drive.connected && drive.pending) setTimeout(() => backupToDrive(false), 1500);

// Ask the browser not to clear this app's storage when space runs low.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Keep multiple open tabs in sync.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { state = load(); render(); }
});

// Support links like ?add=milk,eggs (handy for an iPhone Shortcut).
(function handleAddParam() {
  const params = new URLSearchParams(location.search);
  const add = params.get('add');
  if (!add) return;
  const names = add.split(',').map(cleanName).filter(Boolean);
  names.forEach((n) => addToList(n, 'added'));
  save();
  history.replaceState(null, '', location.pathname);
  setTimeout(() => toast(`Added ${names.join(', ')}`), 100);
})();

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(console.error);
}
