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
    if (raw) {
      const s = { ...defaultState(), ...JSON.parse(raw) };
      // List items and staples are identified by their (lower-cased) name.
      s.list.forEach((i) => { i.id = keyOf(i.name); });
      s.staples.forEach((x) => { x.id = keyOf(x.name); });
      return s;
    }
  } catch (e) { console.error(e); }
  return defaultState();
}

function save() {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  trackChanges();
  scheduleSync();
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

function guessCategory(name, cats = state.cats) {
  const k = keyOf(name);
  if (cats[k]) return cats[k];
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
    item = { id: k, name, cat: guessCategory(name), sources: [source], checked: false };
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
  renderSyncStatus();
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
      state.staples.push({ id: keyOf(name), name });
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


/* ---------- Google Sheet sync ---------- */
// The app keeps working from this device's storage and syncs with a Google Sheet through a
// small Apps Script web app (see apps-script/Code.gs). Every record (list item, staple, meal…)
// carries an updatedAt time; on conflict the newer change wins. Only records changed on this
// device are sent; the sheet answers with everything it has, so changes made on other phones
// or typed straight into the sheet come back here.

const SYNC_KEY = 'groceries.sync';
const SYNC_INTERVAL = 30000;

let sync = loadSyncMeta();   // {url, sheetUrl, stamps: {key: {h, t, v, dirty}}, tombs: [], lastSync, error}
let syncing = false;
let syncAgain = false;
let syncTimer = null;

function loadSyncMeta() {
  try { return { stamps: {}, tombs: [], ...JSON.parse(localStorage.getItem(SYNC_KEY)) }; }
  catch { return { stamps: {}, tombs: [] }; }
}
function saveSyncMeta() { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); }

const recKey = (r) => r.collection + ':' + r.id;
const isTrue = (v) => v === true || String(v).toUpperCase() === 'TRUE';

function hashRec(r) {
  const fields = Object.keys(r).filter((k) => !['collection', 'id', 'updatedAt'].includes(k)).sort();
  return JSON.stringify(r, fields);
}

function stateToRecords(s) {
  const out = [];
  s.list.forEach((i) => out.push({ collection: 'List', id: i.id, name: i.name, aisle: i.cat, inCart: !!i.checked, sources: i.sources.join(', ') }));
  s.staples.forEach((x) => out.push({ collection: 'Staples', id: x.id, name: x.name }));
  s.meals.forEach((m) => out.push({ collection: 'Meals', id: m.id, name: m.name, ingredients: m.ingredients.join('\n'), thisWeek: s.weekMeals.includes(m.id) }));
  Object.entries(s.cats).forEach(([k, v]) => out.push({ collection: 'Aisles', id: k, name: k, aisle: v }));
  Object.entries(s.history).forEach(([k, h]) => out.push({ collection: 'History', id: k, name: h.name, count: h.count, last: h.last || 0 }));
  out.push({ collection: 'Settings', id: 'weekStart', value: s.weekStart });
  return out;
}

function recordsToState(recs) {
  const s = defaultState();
  const of = (c) => recs.filter((r) => r.collection === c);
  of('Aisles').forEach((r) => { if (r.aisle) s.cats[String(r.id)] = String(r.aisle); });
  of('History').forEach((r) => {
    s.history[String(r.id)] = { name: String(r.name), count: Number(r.count) || 1, last: Number(r.last) || 0 };
  });
  of('Staples').forEach((r) => { const name = cleanName(String(r.name)); if (name) s.staples.push({ id: keyOf(name), name }); });
  of('Meals').forEach((r) => {
    const name = cleanName(String(r.name));
    if (!name) return;
    const ingredients = [...new Set(String(r.ingredients || '').split(/\n|,/).map(cleanName).filter(Boolean))];
    s.meals.push({ id: String(r.id), name, ingredients });
    if (isTrue(r.thisWeek)) s.weekMeals.push(String(r.id));
  });
  of('List').forEach((r) => {
    const name = cleanName(String(r.name));
    if (!name) return;
    const sources = String(r.sources || '').split(',').map((x) => x.trim()).filter(Boolean);
    s.list.push({
      id: keyOf(name), name,
      cat: r.aisle ? String(r.aisle) : guessCategory(name, s.cats),
      sources: sources.length ? sources : ['added'],
      checked: isTrue(r.inCart),
    });
  });
  const ws = of('Settings').find((r) => r.id === 'weekStart');
  if (ws && !isNaN(new Date(ws.value))) s.weekStart = new Date(ws.value).toISOString();
  return s;
}

// Compare the current state with what was last synced; stamp anything new or changed.
function trackChanges() {
  if (!sync.url) return;
  const now = Date.now();
  const seen = new Set();
  for (const r of stateToRecords(state)) {
    const k = recKey(r);
    seen.add(k);
    const h = hashRec(r);
    const st = sync.stamps[k];
    if (!st || st.h !== h) {
      sync.stamps[k] = { h, t: now, v: (st ? st.v : 0) + 1, dirty: true };
      sync.tombs = sync.tombs.filter((t) => recKey(t) !== k);
    }
  }
  for (const k of Object.keys(sync.stamps)) {
    if (seen.has(k)) continue;
    const i = k.indexOf(':');
    sync.tombs.push({ collection: k.slice(0, i), id: k.slice(i + 1), updatedAt: now });
    delete sync.stamps[k];
  }
  saveSyncMeta();
}

function scheduleSync() {
  if (!sync.url) return;
  renderSyncStatus();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}

async function callSheet(url, records) {
  let res;
  try {
    // text/plain keeps this a "simple" request, which Apps Script accepts from other sites.
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ records }) });
  } catch {
    throw new Error(navigator.onLine === false ? 'offline' : 'Could not reach the Google Sheet.');
  }
  let data;
  try { data = await res.json(); }
  catch { throw new Error('The Google Sheet link didn\'t answer correctly. Check the web app is deployed with access set to "Anyone".'); }
  if (!data.ok) throw new Error('Google Sheet error: ' + data.error);
  return data;
}

// Fold the sheet's answer into local state, keeping anything changed here while the request was out.
function applyResponse(resp, sentVersions, sentTombKeys) {
  sync.tombs = sync.tombs.filter((t) => !sentTombKeys.has(recKey(t)));
  const pendingTombs = new Set(sync.tombs.map(recKey));
  const local = new Map(stateToRecords(state).map((r) => [recKey(r), r]));
  const keepLocal = new Set(Object.entries(sync.stamps)
    .filter(([k, st]) => st.dirty && sentVersions[k] !== st.v)
    .map(([k]) => k));

  const server = new Map(resp.records.map((r) => [recKey(r), r]));
  const merged = [];
  for (const [k, r] of server) {
    if (pendingTombs.has(k)) continue;
    merged.push(keepLocal.has(k) && local.has(k) ? local.get(k) : r);
  }
  for (const k of keepLocal) if (!server.has(k) && local.has(k)) merged.push(local.get(k));

  const next = { ...recordsToState(merged), version: state.version, updatedAt: state.updatedAt };
  const stamps = {};
  for (const r of stateToRecords(next)) {
    const k = recKey(r);
    stamps[k] = keepLocal.has(k) && sync.stamps[k]
      ? sync.stamps[k]
      : { h: hashRec(r), t: Number((server.get(k) || {}).updatedAt) || Date.now(), v: 0, dirty: false };
  }
  sync.stamps = stamps;
  const changed = JSON.stringify(stateToRecords(next)) !== JSON.stringify(stateToRecords(state));
  state = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (changed) render();
}

async function syncNow() {
  if (!sync.url) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  clearTimeout(syncTimer);
  renderSyncStatus();
  try {
    const sentTombKeys = new Set(sync.tombs.map(recKey));
    const records = sync.tombs.map((t) => ({ ...t, deleted: true }));
    const sentVersions = {};
    for (const r of stateToRecords(state)) {
      const k = recKey(r);
      const st = sync.stamps[k];
      if (st && st.dirty) { records.push({ ...r, updatedAt: st.t }); sentVersions[k] = st.v; }
    }
    const resp = await callSheet(sync.url, records);
    sync.sheetUrl = resp.sheetUrl;
    applyResponse(resp, sentVersions, sentTombKeys);
    sync.lastSync = Date.now();
    sync.error = null;
  } catch (err) {
    sync.error = err.message;
  } finally {
    syncing = false;
    saveSyncMeta();
    renderSyncStatus();
    if (syncAgain) { syncAgain = false; syncNow(); }
  }
}

function isEmpty(s) {
  return !s.list.length && !s.staples.length && !s.meals.length;
}

async function connectSheet() {
  const url = $('#sheet-url').value.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    alert('That doesn\'t look like an Apps Script web app link. It should start with https://script.google.com/');
    return;
  }
  const btn = $('#sheet-connect');
  btn.disabled = true; btn.textContent = 'Connecting…';
  try {
    const resp = await callSheet(url, []);
    const hasData = resp.records.some((r) => ['List', 'Staples', 'Meals'].includes(r.collection));
    sync = { url, sheetUrl: resp.sheetUrl, stamps: {}, tombs: [], lastSync: null, error: null };
    if (hasData && (isEmpty(state) || confirm(
      'The Google Sheet already has groceries in it.\n\n' +
      'OK: use the sheet\'s data on this phone (recommended for a second phone).\n' +
      'Cancel: combine this phone\'s data with the sheet.'))) {
      applyResponse(resp, {}, new Set());
      sync.lastSync = Date.now();
      saveSyncMeta();
      render();
      toast('Connected. Loaded from Google Sheet');
    } else {
      trackChanges(); // everything on this phone is new to the sheet
      await syncNow();
      render();
      toast(sync.error ? 'Connected, but the first sync failed' : 'Connected to Google Sheet');
    }
  } catch (err) {
    alert(err.message === 'offline' ? 'You\'re offline. Connect to the internet and try again.' : err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Connect';
  }
}

function disconnectSheet() {
  if (!confirm('Stop syncing with the Google Sheet? Your data stays on this phone and in the sheet.')) return;
  sync = { stamps: {}, tombs: [] };
  saveSyncMeta();
  render();
  toast('Disconnected from Google Sheet');
}

function describeTime(ts) {
  if (!ts) return 'an unknown date';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? 'today at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderSyncStatus() {
  const badge = $('#sync-badge');
  const connected = !!sync.url;
  $('#sheet-setup').hidden = connected;
  $('#sheet-connected').hidden = !connected;
  const link = $('#sheet-open');
  link.hidden = !sync.sheetUrl;
  if (sync.sheetUrl) link.href = sync.sheetUrl;

  if (!connected) {
    badge.hidden = true;
    $('#sheet-status').textContent = 'Not connected. Connect a Google Sheet to back up your data and share one list with the whole family.';
    return;
  }
  const pending = Object.values(sync.stamps).some((st) => st.dirty) || sync.tombs.length > 0;
  let label; let detail;
  if (syncing) { label = '⟳ Syncing'; detail = 'Syncing now…'; }
  else if (sync.error === 'offline') { label = '⚠️ Offline'; detail = 'Offline. Changes are saved on this phone and will sync when you\'re back online.'; }
  else if (sync.error) { label = '⚠️ Not synced'; detail = sync.error; }
  else if (pending) { label = '⟳ Saving'; detail = 'Saving changes to the sheet…'; }
  else { label = '✓ Synced'; detail = `Synced with Google Sheet ${describeTime(sync.lastSync)}.`; }
  badge.hidden = false;
  badge.textContent = label;
  badge.classList.toggle('warn', !!sync.error && !syncing);
  $('#sheet-status').textContent = detail;
}

$('#sheet-connect').addEventListener('click', connectSheet);
$('#sheet-sync').addEventListener('click', syncNow);
$('#sheet-disconnect').addEventListener('click', disconnectSheet);
$('#sync-badge').addEventListener('click', () => { syncNow(); });

// Pick up changes from other phones: when the app comes to the front, and every 30 seconds while open.
document.addEventListener('visibilitychange', () => { if (sync.url) syncNow(); });
window.addEventListener('online', () => { if (sync.url) syncNow(); });
setInterval(() => { if (sync.url && document.visibilityState === 'visible') syncNow(); }, SYNC_INTERVAL);
if (sync.url) setTimeout(syncNow, 300);

// Ask the browser not to clear this app's storage when space runs low.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Keep multiple open tabs in sync.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { state = load(); render(); }
  if (e.key === SYNC_KEY) { sync = loadSyncMeta(); renderSyncStatus(); }
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
