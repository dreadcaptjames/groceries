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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `groceries-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
});

$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.list) || !Array.isArray(data.meals)) throw new Error('Not a backup file');
    withUndo('Backup imported', () => { state = { ...defaultState(), ...data }; });
  } catch (err) {
    alert('Could not import: ' + err.message);
  }
  e.target.value = '';
});

$('#reset-all').addEventListener('click', () => {
  if (!confirm('Erase all staples, meals, and your list on this device?')) return;
  withUndo('Everything erased', () => { state = defaultState(); });
});

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
