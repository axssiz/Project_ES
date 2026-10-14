'use strict';

/* =========================================================================
   Запись на услуги — студия «Лаванда»
   Учебный проект: HTML + CSS + JavaScript + localStorage, без фреймворков.
   ========================================================================= */

// ---------- Справочники ----------

// Услуги в учебной версии хранятся в коде (логическая сущность «Услуга»).
// По каждой услуге работает один мастер, поэтому в ленте дня у услуги своя строка.
const SERVICES = [
  { id: 's1', name: 'Женская стрижка', category: 'Волосы', duration: 60, price: 8000 },
  { id: 's2', name: 'Мужская стрижка', category: 'Волосы', duration: 40, price: 5000 },
  { id: 's3', name: 'Окрашивание', category: 'Волосы', duration: 120, price: 20000 },
  { id: 's4', name: 'Укладка', category: 'Волосы', duration: 45, price: 6000 },
  { id: 's5', name: 'Маникюр', category: 'Ногти', duration: 60, price: 7000 },
  { id: 's6', name: 'Педикюр', category: 'Ногти', duration: 75, price: 9000 }
];

const CATEGORY_CLASS = { 'Волосы': 'hair', 'Ногти': 'nails' };

const STATUSES = {
  planned: 'Запланирована',
  done: 'Выполнена',
  cancelled: 'Отменена'
};

const WORK_START = '09:00';
const WORK_END = '21:00';
const DAY_START = 9 * 60;
const DAY_END = 21 * 60;
const SLOT_STEP = 15;
const STORAGE_KEY = 'lavanda.bookings';

// ---------- Вспомогательные функции ----------

function getService(id) {
  return SERVICES.find(s => s.id === id) || null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Сегодняшняя дата в формате YYYY-MM-DD по местному времени (не UTC).
function todayISO() {
  return isoOf(new Date());
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysISO(days, from) {
  const d = from ? parseISO(from) : new Date();
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${pad(d)}.${pad(m)}.${y}`;
}

// «Четверг, 15 октября» (год добавляется, если он не текущий)
function dayLabel(iso) {
  const date = parseISO(iso);
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  const text = date.toLocaleDateString('ru-RU', options);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Цены в тенге
function formatPrice(value) {
  return value.toLocaleString('ru-RU') + ' ₸';
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function generateId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// Создание элемента. Текст всегда выводится через textContent,
// поэтому введённые пользователем данные не интерпретируются как HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Перезапуск CSS-анимации на элементе
function replay(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

let toastTimer = null;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('toast-visible'), 2800);
}

// ---------- Хранилище (localStorage) ----------

const Store = {
  corrupted: false,

  load() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      this.corrupted = true;
      return [];
    }
    if (!raw) return [];
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) throw new Error('not an array');
      // Отбрасываем объекты неправильной структуры.
      return data.filter(b => b && typeof b.id === 'string' && typeof b.date === 'string' &&
        typeof b.time === 'string' && STATUSES[b.status] && getService(b.serviceId));
    } catch (e) {
      // Данные повреждены: сохраняем копию, чтобы ничего не потерять, и работаем с пустым списком.
      this.corrupted = true;
      try { localStorage.setItem(STORAGE_KEY + '.backup', raw); } catch (ignored) { /* нет места */ }
      return [];
    }
  },

  save(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    this.corrupted = false;
  },

  getAll() {
    return this.load();
  },

  getById(id) {
    return this.load().find(b => b.id === id) || null;
  },

  add(data) {
    const list = this.load();
    const now = new Date().toISOString();
    const booking = { id: generateId(), ...data, status: 'planned', createdAt: now, updatedAt: now };
    list.push(booking);
    this.save(list);
    return booking;
  },

  update(id, changes) {
    const list = this.load();
    const index = list.findIndex(b => b.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...changes, updatedAt: new Date().toISOString() };
    this.save(list);
    return list[index];
  },

  remove(id) {
    const list = this.load();
    const next = list.filter(b => b.id !== id);
    this.save(next);
    return next.length !== list.length;
  },

  clear() {
    this.save([]);
  }
};

// ---------- Проверка данных ----------

// Буквы латиницы, русского и казахского алфавитов
const NAME_PATTERN = /^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі][A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі\s.'-]*$/;

// Возвращает объект ошибок { поле: сообщение }. Пустой объект — данные корректны.
function validateBooking(data, editingId) {
  const errors = {};
  const original = editingId ? Store.getById(editingId) : null;

  if (!data.clientName) {
    errors.clientName = 'Укажите имя клиента.';
  } else if (data.clientName.length < 2) {
    errors.clientName = 'Имя должно содержать не менее 2 символов.';
  } else if (!NAME_PATTERN.test(data.clientName)) {
    errors.clientName = 'Имя может содержать только буквы, пробел, точку и дефис.';
  }

  const digits = data.phone.replace(/\D/g, '');
  if (!data.phone) {
    errors.phone = 'Укажите номер телефона.';
  } else if (!/^[\d\s()+-]+$/.test(data.phone) || digits.length < 10 || digits.length > 11) {
    errors.phone = 'Телефон должен содержать 10–11 цифр, например +7 701 000-00-00.';
  }

  const service = getService(data.serviceId);
  if (!service) {
    errors.serviceId = 'Выберите услугу из списка.';
  }

  if (!data.date) {
    errors.date = 'Выберите дату.';
  } else if (data.date < todayISO() && (!original || original.date !== data.date)) {
    // Прошедшую дату нельзя выбрать для новой записи; у старой записи её можно оставить.
    errors.date = 'Нельзя записать клиента на прошедшую дату.';
  }

  if (!data.time) {
    errors.time = 'Выберите время.';
  } else if (service) {
    const start = toMinutes(data.time);
    const end = start + service.duration;
    if (start < toMinutes(WORK_START) || end > toMinutes(WORK_END)) {
      errors.time = `Студия работает с ${WORK_START} до ${WORK_END}. ` +
        `Услуга длится ${service.duration} мин — начните не позже ${fromMinutes(toMinutes(WORK_END) - service.duration)}.`;
    } else if (data.date === todayISO() && !original && start < nowMinutes()) {
      errors.time = 'Это время сегодня уже прошло.';
    }
  }

  if (data.comment.length > 200) {
    errors.comment = 'Комментарий не должен превышать 200 символов.';
  }

  // Проверка занятости (изменение требований №1): по каждой услуге работает один мастер,
  // поэтому активные записи на одну услугу не должны пересекаться по времени.
  if (!errors.serviceId && !errors.date && !errors.time && data.status === 'planned') {
    const conflict = findConflict(data, editingId);
    if (conflict) {
      const s = getService(conflict.serviceId);
      const from = conflict.time;
      const to = fromMinutes(toMinutes(conflict.time) + s.duration);
      errors.time = `Мастер по услуге «${s.name}» занят с ${from} до ${to}. Выберите другое время.`;
    }
  }

  return errors;
}

function findConflict(data, editingId) {
  const service = getService(data.serviceId);
  const start = toMinutes(data.time);
  const end = start + service.duration;
  return Store.getAll().find(b => {
    if (b.id === editingId || b.status !== 'planned') return false;
    if (b.serviceId !== data.serviceId || b.date !== data.date) return false;
    const bStart = toMinutes(b.time);
    const bEnd = bStart + getService(b.serviceId).duration;
    return start < bEnd && bStart < end;
  }) || null;
}

// ---------- Навигация ----------

function markActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll('.main-nav a').forEach(link => {
    if (link.dataset.nav === page) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

// ---------- Лента дня (изменение требований №3) ----------

// Записи выбранного дня, кроме отменённых (отмена освобождает время).
function bookingsOn(date) {
  return Store.getAll()
    .filter(b => b.date === date && b.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time));
}

// День, который показывать при открытии: сегодня, если на сегодня есть записи,
// иначе ближайший день с запланированными записями.
function pickInitialDay() {
  const today = todayISO();
  const upcoming = Store.getAll()
    .filter(b => b.status === 'planned' && b.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!upcoming.length || upcoming.some(b => b.date === today)) return today;
  return upcoming[0].date;
}

// Интервал под курсором: начало (с шагом 15 минут), конец и свободен ли он
function slotAt(event, track, service, date) {
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 0.9999);
  let start = DAY_START + Math.floor(ratio * (DAY_END - DAY_START) / SLOT_STEP) * SLOT_STEP;
  start = Math.min(start, DAY_END - service.duration);
  const end = start + service.duration;
  const clash = Store.getAll().find(b => b.date === date && b.serviceId === service.id &&
    b.status === 'planned' && b.id !== editingId &&
    start < toMinutes(b.time) + service.duration && toMinutes(b.time) < end);
  const past = date < todayISO() || (date === todayISO() && start < nowMinutes());
  let reason = '';
  if (clash) reason = `Мастер занят с ${clash.time} до ${fromMinutes(toMinutes(clash.time) + service.duration)}.`;
  else if (past) reason = 'Это время уже прошло.';
  return { start, end, busy: Boolean(reason), clash: Boolean(clash), reason };
}

function renderTimeline(container, date, { animate = false, highlightId = null, onSlot, onBlock } = {}) {
  const span = DAY_END - DAY_START;
  const pct = minutes => ((minutes - DAY_START) / span) * 100;
  const day = bookingsOn(date);
  const order = new Map(day.map((b, i) => [b.id, i]));

  const root = el('div', 'tl');
  if (animate && !reducedMotion()) root.classList.add('is-drawing');

  const scale = el('div', 'tl-scale');
  const hours = el('div', 'tl-hours');
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) {
    const mark = el('span', '', pad(h));
    mark.style.left = pct(h * 60) + '%';
    hours.append(mark);
  }
  scale.append(el('span'), hours);
  root.append(scale);

  const body = el('div', 'tl-body');
  SERVICES.forEach(service => {
    const row = el('div', `tl-row cat-${CATEGORY_CLASS[service.category]}`);
    const label = el('div', 'tl-label');
    label.append(el('span', 'tl-name', service.name), el('span', 'tl-dur', `${service.duration} мин`));

    const track = el('div', 'tl-track');
    track.dataset.service = service.id;
    track.title = 'Нажмите на свободное время, чтобы записать клиента';

    day.filter(b => b.serviceId === service.id).forEach(b => {
      const start = toMinutes(b.time);
      const end = fromMinutes(start + service.duration);
      const block = el('button', `tl-block cat-${CATEGORY_CLASS[service.category]} st-${b.status}`);
      block.type = 'button';
      block.dataset.id = b.id;
      block.style.left = pct(start) + '%';
      block.style.width = (service.duration / span) * 100 + '%';
      block.style.setProperty('--order', order.get(b.id));
      // В узком блоке помещается только имя; полностью — в подсказке
      block.append(el('span', 'tl-time', b.status === 'done' ? `✓ ${b.time}` : b.time), el('span', 'tl-who', b.clientName.split(' ')[0]));
      block.title = `${b.time}–${end}, ${b.clientName}, ${service.name}`;
      block.setAttribute('aria-label', `${b.time}–${end}, ${b.clientName}, ${service.name}, ${STATUSES[b.status].toLowerCase()}. Открыть запись`);
      if (b.id === highlightId && !reducedMotion()) block.classList.add('is-new');
      if (b.id === editingId) block.classList.add('is-editing');
      block.addEventListener('click', e => {
        e.stopPropagation();
        if (onBlock) onBlock(b.id);
      });
      track.append(block);
    });

    // «Призрак» показывает, сколько места займёт запись, если нажать здесь
    const ghost = el('div', 'tl-ghost');
    ghost.hidden = true;
    track.append(ghost);

    track.addEventListener('pointermove', e => {
      if (e.target.closest('.tl-block')) { ghost.hidden = true; return; }
      const slot = slotAt(e, track, service, date);
      ghost.hidden = false;
      ghost.style.left = pct(slot.start) + '%';
      ghost.style.width = (service.duration / span) * 100 + '%';
      ghost.classList.toggle('is-busy', slot.busy);
      ghost.dataset.label = slot.busy ? (slot.clash ? 'занято' : 'прошло') : `${fromMinutes(slot.start)}–${fromMinutes(slot.end)}`;
    });
    track.addEventListener('pointerleave', () => { ghost.hidden = true; });
    track.addEventListener('click', e => {
      if (e.target.closest('.tl-block')) return;
      const slot = slotAt(e, track, service, date);
      if (slot.busy) {
        showToast(slot.reason, 'error');
        return;
      }
      if (onSlot) onSlot(service.id, date, fromMinutes(slot.start));
    });

    row.append(label, track);
    body.append(row);
  });

  if (date === todayISO()) {
    const m = nowMinutes();
    if (m >= DAY_START && m <= DAY_END) {
      const now = el('div', 'tl-now');
      now.style.setProperty('--now', (m - DAY_START) / span);
      now.append(el('span', '', fromMinutes(m)));
      body.append(now);
    }
  }

  root.append(body);
  container.replaceChildren(root);
}

// «Сегодня», «Завтра», «Вчера» или null для остальных дней
function relativeDay(date) {
  if (date === todayISO()) return 'Сегодня';
  if (date === addDaysISO(1)) return 'Завтра';
  if (date === addDaysISO(-1)) return 'Вчера';
  return null;
}

function inMinutes(total) {
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

// Заголовок и пояснение для выбранного дня
function dayHeadline(date) {
  const day = bookingsOn(date);
  const today = todayISO();
  const rel = relativeDay(date);
  const past = date < today;
  const n = day.length;
  // неразрывный пробел: число не отрывается от слова при переносе
  const count = `${n} ${plural(n, 'запись', 'записи', 'записей')}`;

  if (!n) {
    return past
      ? { title: rel ? `${rel} записей не было` : 'Записей не было', text: 'В этот день никто не записывался.' }
      : { title: rel ? `${rel} свободно` : 'День свободен', text: 'Нажмите на свободное время в ленте, чтобы записать клиента.' };
  }

  const planned = day.filter(b => b.status === 'planned');
  const done = day.filter(b => b.status === 'done').length;
  const describe = b => `${getService(b.serviceId).name.toLowerCase()}, ${b.clientName}`;

  if (past) {
    return { title: rel ? `${rel} было ${count}` : `Было ${count}`, text: `Выполнено ${done} из ${n}.` };
  }
  const title = rel ? `${rel} ${count}` : `${count} в этот день`;
  if (date === today) {
    const now = nowMinutes();
    const next = planned.find(b => toMinutes(b.time) >= now);
    if (next) return { title, text: `Ближайшая через ${inMinutes(toMinutes(next.time) - now)}, в ${next.time}: ${describe(next)}.` };
    return { title, text: done ? `Выполнено ${done}, запланированных записей больше нет.` : 'Запланированных записей больше нет.' };
  }
  const first = planned[0];
  return { title, text: first ? `Первая в ${first.time}: ${describe(first)}.` : `Выполнено ${done}.` };
}

// Выбранный день: заголовок, сводка, лента и кнопки перехода
const Day = {
  date: null,
  onSlot: null,
  onBlock: null,

  init({ onSlot, onBlock, date }) {
    this.onSlot = onSlot;
    this.onBlock = onBlock;
    this.date = date;
    document.getElementById('dayPrev').addEventListener('click', () => this.go(addDaysISO(-1, this.date)));
    document.getElementById('dayNext').addEventListener('click', () => this.go(addDaysISO(1, this.date)));
    document.getElementById('dayToday').addEventListener('click', () => this.go(todayISO()));
    const page = document.getElementById('calPage');
    if (page && !reducedMotion()) replay(page, 'drop-in');
    this.show({ animate: true });
    // Линия «сейчас» сдвигается раз в минуту
    setInterval(() => { if (this.date === todayISO()) this.show(); }, 60000);
  },

  // Переход по дням: при движении вперёд листок календаря отрывается и улетает,
  // при движении назад предыдущий листок опускается сверху на стопку
  go(date) {
    if (date === this.date) return;
    const page = document.getElementById('calPage');
    if (page && !reducedMotion()) {
      const forward = date > this.date;
      const ghost = page.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      ghost.classList.remove('drop-in');
      ghost.classList.add('cal-ghost', forward ? 'tear-next' : 'tear-prev');
      page.parentNode.append(ghost);
      ghost.addEventListener('animationend', () => ghost.remove());
      if (!forward) replay(page, 'drop-in');
    }
    this.date = date;
    this.show({ animate: true });
  },

  show({ animate = false, highlightId = null } = {}) {
    const head = dayHeadline(this.date);
    document.getElementById('dayTitle').textContent = head.title;
    document.getElementById('daySummary').textContent = head.text;
    const date = parseISO(this.date);
    const page = document.getElementById('calPage');
    if (page) {
      document.getElementById('calMonth').textContent = date.toLocaleDateString('ru-RU', { month: 'long' });
      document.getElementById('calDay').textContent = date.getDate();
      document.getElementById('calWeekday').textContent = date.toLocaleDateString('ru-RU', { weekday: 'long' });
      page.removeAttribute('aria-hidden');
      page.setAttribute('role', 'img');
      page.setAttribute('aria-label', dayLabel(this.date));
    }
    document.getElementById('dayToday').disabled = this.date === todayISO();
    renderTimeline(document.getElementById('timeline'), this.date, {
      animate, highlightId, onSlot: this.onSlot, onBlock: this.onBlock
    });
  }
};

// ---------- Главная ----------

function initHome() {
  renderPrices();
  Day.init({
    date: pickInitialDay(),
    onSlot: (serviceId, date, time) => {
      const params = new URLSearchParams({ service: serviceId, date, time });
      location.href = `bookings.html?${params}`;
    },
    onBlock: id => { location.href = `bookings.html?edit=${encodeURIComponent(id)}`; }
  });
}

function renderPrices() {
  const root = document.getElementById('priceList');
  Object.keys(CATEGORY_CLASS).forEach(category => {
    const group = el('div', `price-group cat-${CATEGORY_CLASS[category]}`);
    group.append(el('h3', '', category));
    const list = el('ul', 'price-list');
    SERVICES.filter(s => s.category === category).forEach(s => {
      const item = el('li', 'price-item');
      const duration = el('span', 'price-dur');
      const bar = el('i');
      bar.style.setProperty('--d', s.duration);
      duration.append(bar, document.createTextNode(`${s.duration} мин`));
      item.append(el('span', 'price-name', s.name), el('span', 'price-dots'), duration, el('span', 'price-cost', formatPrice(s.price)));
      list.append(item);
    });
    group.append(list);
    root.append(group);
  });
}

// ---------- Записи ----------

const form = {};
let editingId = null;

function initBookings() {
  ['bookingForm', 'bookingId', 'clientName', 'phone', 'serviceId', 'date', 'time', 'status',
    'statusField', 'comment', 'commentCounter', 'submitBtn', 'resetBtn', 'formTitle']
    .forEach(id => { form[id] = document.getElementById(id); });

  SERVICES.forEach(s => {
    form.serviceId.append(new Option(`${s.name}, ${s.duration} мин`, s.id));
  });
  Object.entries(STATUSES).forEach(([value, label]) => {
    form.status.append(new Option(label, value));
    document.getElementById('statusFilter').append(new Option(label, value));
  });

  form.date.min = todayISO();
  form.time.min = WORK_START;
  form.time.max = WORK_END;

  form.bookingForm.addEventListener('submit', onSubmit);
  form.resetBtn.addEventListener('click', () => resetForm());
  form.comment.addEventListener('input', () => {
    form.commentCounter.textContent = form.comment.value.length;
  });
  // Ошибка у поля исчезает, как только пользователь начинает его исправлять.
  form.bookingForm.addEventListener('input', e => setFieldError(e.target.id, ''));

  document.getElementById('searchInput').addEventListener('input', () => renderList());
  document.getElementById('statusFilter').addEventListener('change', () => renderList());
  document.getElementById('dateFilter').addEventListener('change', () => renderList());
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('dateFilter').value = '';
    renderList();
  });
  document.getElementById('bookingsBody').addEventListener('click', onRowAction);
  document.getElementById('demoBtn').addEventListener('click', addDemoData);

  // Переход с главной: ?edit=<id> или ?service=&date=&time=
  const params = new URLSearchParams(location.search);
  const editTarget = params.get('edit') ? Store.getById(params.get('edit')) : null;
  const slot = parseSlotParams(params);

  Day.init({
    date: editTarget ? editTarget.date : (slot ? slot.date : pickInitialDay()),
    onSlot: fillSlot,
    onBlock: startEdit
  });
  renderList();

  if (editTarget) startEdit(editTarget.id);
  else if (slot) fillSlot(slot.serviceId, slot.date, slot.time);
  else if (location.hash === '#new') form.clientName.focus();

  if (Store.corrupted) {
    const warning = document.getElementById('storageWarning');
    warning.textContent = 'Сохранённые данные повреждены и не могут быть прочитаны. ' +
      'Резервная копия сохранена под ключом «lavanda.bookings.backup». Новые записи будут сохраняться как обычно.';
    warning.hidden = false;
  }
}

function parseSlotParams(params) {
  const serviceId = params.get('service');
  const date = params.get('date') || '';
  const time = params.get('time') || '';
  if (!getService(serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return { serviceId, date, time };
}

// Щелчок по свободному времени в ленте заполняет услугу, дату и время в форме
function fillSlot(serviceId, date, time) {
  form.serviceId.value = serviceId;
  form.date.value = date;
  form.time.value = time;
  ['serviceId', 'date', 'time'].forEach(id => {
    setFieldError(id, '');
    if (!reducedMotion()) replay(form[id], 'is-filled');
  });
  form.bookingForm.closest('.slip').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  (form.clientName.value ? form.submitBtn : form.clientName).focus({ preventScroll: true });
}

function readForm() {
  return {
    clientName: form.clientName.value.trim().replace(/\s+/g, ' '),
    phone: form.phone.value.trim(),
    serviceId: form.serviceId.value,
    date: form.date.value,
    time: form.time.value,
    comment: form.comment.value.trim(),
    status: editingId ? form.status.value : 'planned'
  };
}

function setFieldError(field, message) {
  const input = document.getElementById(field);
  const error = document.getElementById(field + 'Error');
  if (!input || !error) return;
  error.textContent = message;
  if (message) replay(input, 'invalid');
  else input.classList.remove('invalid');
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function clearErrors() {
  ['clientName', 'phone', 'serviceId', 'date', 'time'].forEach(f => setFieldError(f, ''));
}

function onSubmit(event) {
  event.preventDefault();
  clearErrors();
  const data = readForm();
  const errors = validateBooking(data, editingId);

  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));
    document.getElementById(Object.keys(errors)[0]).focus();
    showToast('Запись не сохранена: исправьте выделенные поля.', 'error');
    return;
  }

  let saved;
  try {
    if (editingId) {
      saved = Store.update(editingId, data);
      showToast('Изменения сохранены.');
    } else {
      const { status, ...fields } = data;
      saved = Store.add(fields);
      showToast('Запись создана.');
    }
  } catch (e) {
    showToast('Не удалось сохранить: хранилище браузера недоступно или переполнено.', 'error');
    return;
  }

  document.getElementById('storageWarning').hidden = true;
  resetForm({ render: false });
  Day.date = saved.date;
  refresh({ highlightId: saved.id, flashId: saved.id });
}

function startEdit(id) {
  const booking = Store.getById(id);
  if (!booking) return;
  editingId = id;
  clearErrors();
  form.bookingId.value = id;
  form.clientName.value = booking.clientName;
  form.phone.value = booking.phone;
  form.serviceId.value = booking.serviceId;
  form.date.value = booking.date;
  form.date.min = booking.date < todayISO() ? booking.date : todayISO();
  form.time.value = booking.time;
  form.status.value = booking.status;
  form.comment.value = booking.comment || '';
  form.commentCounter.textContent = form.comment.value.length;
  form.statusField.hidden = false;
  form.formTitle.textContent = 'Редактирование записи';
  form.submitBtn.textContent = 'Сохранить изменения';
  form.resetBtn.textContent = 'Отменить редактирование';
  const slip = form.bookingForm.closest('.slip');
  slip.classList.add('editing');
  slip.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  form.clientName.focus({ preventScroll: true });
  Day.date = booking.date;
  refresh();
}

function resetForm({ render = true } = {}) {
  editingId = null;
  form.bookingForm.reset();
  form.bookingId.value = '';
  form.date.min = todayISO();
  form.commentCounter.textContent = '0';
  form.statusField.hidden = true;
  form.formTitle.textContent = 'Новая запись';
  form.submitBtn.textContent = 'Создать запись';
  form.resetBtn.textContent = 'Очистить';
  form.bookingForm.closest('.slip').classList.remove('editing');
  clearErrors();
  if (render) refresh();
}

function refresh({ highlightId = null, flashId = null, cancelledId = null } = {}) {
  Day.show({ highlightId });
  renderList({ flashId, cancelledId });
}

function onRowAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const booking = Store.getById(id);
  if (!booking) return;
  const service = getService(booking.serviceId);
  const summary = `${booking.clientName}, ${service.name}, ${formatDate(booking.date)} ${booking.time}`;

  switch (button.dataset.action) {
    case 'edit':
      startEdit(id);
      break;
    case 'done':
      Store.update(id, { status: 'done' });
      showToast('Запись отмечена как выполненная.');
      refresh({ flashId: id });
      break;
    case 'cancel':
      if (confirm(`Отменить запись?\n${summary}`)) {
        Store.update(id, { status: 'cancelled' });
        if (editingId === id) resetForm({ render: false });
        showToast('Запись отменена.');
        refresh({ cancelledId: id });
      }
      break;
    case 'delete':
      if (confirm(`Удалить запись без возможности восстановления?\n${summary}`)) {
        const finish = () => {
          Store.remove(id);
          if (editingId === id) resetForm({ render: false });
          showToast('Запись удалена.');
          refresh();
        };
        if (reducedMotion()) {
          finish();
        } else {
          button.closest('tr').classList.add('is-leaving');
          setTimeout(finish, 260);
        }
      }
      break;
  }
}

function getFilteredBookings() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const date = document.getElementById('dateFilter').value;
  const queryDigits = query.replace(/\D/g, '');

  return Store.getAll()
    .filter(b => status === 'all' || b.status === status)
    .filter(b => !date || b.date === date)
    .filter(b => !query ||
      b.clientName.toLowerCase().includes(query) ||
      (queryDigits.length > 0 && b.phone.replace(/\D/g, '').includes(queryDigits)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function renderList({ flashId = null, cancelledId = null } = {}) {
  const body = document.getElementById('bookingsBody');
  if (!body) return;
  const all = Store.getAll();
  const list = getFilteredBookings();
  const now = `${todayISO()} ${fromMinutes(nowMinutes())}`;

  body.replaceChildren();
  let currentDate = null;
  list.forEach(b => {
    // Записи сгруппированы по дням, как страницы журнала
    if (b.date !== currentDate) {
      currentDate = b.date;
      const count = list.filter(x => x.date === b.date).length;
      const dayRow = el('tr', 'day-row');
      const th = el('th');
      th.colSpan = 5;
      th.append(el('span', 'day-name', dayLabel(b.date)), el('span', 'day-count', `${count} ${plural(count, 'запись', 'записи', 'записей')}`));
      dayRow.append(th);
      body.append(dayRow);
    }

    const s = getService(b.serviceId);
    const tr = el('tr', `booking-row row-${b.status}`);
    if (b.id === editingId) tr.classList.add('row-editing');
    if (b.id === flashId && !reducedMotion()) tr.classList.add('is-flash');
    if (b.id === cancelledId) tr.classList.add('just-cancelled');

    const when = el('td', 'cell-time');
    when.append(el('span', 't-start', b.time), el('span', 't-end', `до ${fromMinutes(toMinutes(b.time) + s.duration)}`));
    if (b.status === 'planned' && `${b.date} ${b.time}` < now) {
      when.append(el('span', 'tag-overdue', 'время прошло'));
    }

    const client = el('td', 'cell-client');
    client.append(el('strong', '', b.clientName), el('span', 'muted', b.phone));
    if (b.comment) client.append(el('span', 'comment', b.comment));

    const service = el('td', 'cell-service');
    service.append(el('span', '', s.name), el('span', 'muted', formatPrice(s.price)));

    const statusCell = el('td');
    statusCell.append(el('span', `status status-${b.status}`, STATUSES[b.status]));

    const actions = el('td', 'col-actions');
    const group = el('div', 'actions');
    group.append(actionButton('edit', b.id, 'Изменить'));
    if (b.status === 'planned') {
      group.append(actionButton('done', b.id, 'Выполнена'), actionButton('cancel', b.id, 'Отменить'));
    }
    group.append(actionButton('delete', b.id, 'Удалить'));
    actions.append(group);

    tr.append(when, client, service, statusCell, actions);
    body.append(tr);
  });

  document.getElementById('listCounter').textContent =
    all.length ? `Показано ${list.length} из ${all.length}` : '';

  const empty = document.getElementById('emptyState');
  empty.hidden = list.length > 0;
  document.getElementById('emptyText').textContent = all.length
    ? 'По заданным условиям записей не найдено. Измените поиск или сбросьте фильтры.'
    : 'Записей пока нет. Нажмите на свободное время в ленте или заполните форму.';
  document.getElementById('demoBtn').hidden = all.length > 0;
  document.querySelector('.table-wrap').hidden = list.length === 0;
}

function actionButton(action, id, label) {
  const button = el('button', `btn-action btn-${action}`, label);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

// Демонстрационные записи с вымышленными данными — для показа работы системы.
function addDemoData() {
  const demo = [
    { clientName: 'Айгерим Сапарова', phone: '+7 701 000-00-01', serviceId: 's1', date: addDaysISO(1), time: '10:00', comment: 'Хочет каре' },
    { clientName: 'Данияр Ахметов', phone: '+7 705 000-00-02', serviceId: 's2', date: addDaysISO(1), time: '11:30', comment: '' },
    { clientName: 'Мария Кузнецова', phone: '+7 707 000-00-03', serviceId: 's5', date: addDaysISO(1), time: '14:00', comment: 'Покрытие гель-лаком' },
    { clientName: 'Әлия Нұрланқызы', phone: '+7 747 000-00-04', serviceId: 's3', date: addDaysISO(1), time: '12:00', comment: '' },
    { clientName: 'Ержан Касымов', phone: '+7 777 000-00-05', serviceId: 's2', date: addDaysISO(2), time: '18:00', comment: 'Перезвонить за день' }
  ];
  demo.forEach(d => Store.add(d));
  showToast('Добавлено 5 демонстрационных записей.');
  Day.date = addDaysISO(1);
  Day.show({ animate: true });
  renderList();
}

// ---------- О проекте ----------

function initAbout() {
  const count = document.getElementById('aboutCount');
  const update = () => {
    const n = Store.getAll().length;
    count.textContent = `${n} ${plural(n, 'запись', 'записи', 'записей')}`;
  };
  update();

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (Store.getAll().length === 0) {
      showToast('Хранилище уже пустое.', 'info');
      return;
    }
    if (confirm('Удалить все записи из хранилища браузера? Действие нельзя отменить.')) {
      Store.clear();
      update();
      showToast('Все записи удалены.');
    }
  });
}

// ---------- Запуск ----------

document.addEventListener('DOMContentLoaded', () => {
  markActiveNav();
  const page = document.body.dataset.page;
  if (page === 'home') initHome();
  if (page === 'bookings') initBookings();
  if (page === 'about') initAbout();
});
