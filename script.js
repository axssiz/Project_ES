'use strict';

/* =========================================================================
   Запись на услуги — студия «Лаванда»
   Учебный проект: HTML + CSS + JavaScript + localStorage, без фреймворков.
   ========================================================================= */

// ---------- Справочники ----------

// Услуги в учебной версии хранятся в коде (логическая сущность «Услуга»).
const SERVICES = [
  { id: 's1', name: 'Женская стрижка', category: 'Волосы', duration: 60, price: 1500 },
  { id: 's2', name: 'Мужская стрижка', category: 'Волосы', duration: 40, price: 900 },
  { id: 's3', name: 'Окрашивание', category: 'Волосы', duration: 120, price: 3500 },
  { id: 's4', name: 'Укладка', category: 'Волосы', duration: 45, price: 1100 },
  { id: 's5', name: 'Маникюр', category: 'Ногти', duration: 60, price: 1300 },
  { id: 's6', name: 'Педикюр', category: 'Ногти', duration: 75, price: 1700 }
];

const STATUSES = {
  planned: 'Запланирована',
  done: 'Выполнена',
  cancelled: 'Отменена'
};

const WORK_START = '09:00';
const WORK_END = '21:00';
const STORAGE_KEY = 'lavanda.bookings';

// ---------- Вспомогательные функции ----------

function getService(id) {
  return SERVICES.find(s => s.id === id) || null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Сегодняшняя дата в формате YYYY-MM-DD по местному времени (не UTC).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${pad(d)}.${pad(m)}.${y}`;
}

function weekday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'short' });
}

function formatPrice(value) {
  return value.toLocaleString('ru-RU') + ' ₽';
}

function generateId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Создание элемента. Текст всегда выводится через textContent,
// поэтому введённые пользователем данные не интерпретируются как HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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

const NAME_PATTERN = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s.'-]*$/;

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
    errors.phone = 'Телефон должен содержать 10–11 цифр, например +7 900 000-00-00.';
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
    } else if (data.date === todayISO() && !original && start < new Date().getHours() * 60 + new Date().getMinutes()) {
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

// ---------- Главная ----------

function initHome() {
  const grid = document.getElementById('servicesGrid');
  SERVICES.forEach(s => {
    const card = el('article', 'service-card');
    card.append(
      el('span', 'service-category', s.category),
      el('h3', '', s.name),
      el('p', 'service-meta', `${s.duration} мин`),
      el('p', 'service-price', formatPrice(s.price))
    );
    grid.append(card);
  });

  const planned = Store.getAll()
    .filter(b => b.status === 'planned')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const today = todayISO();
  const nowTime = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;

  document.getElementById('statPlanned').textContent = planned.length;
  document.getElementById('statToday').textContent = planned.filter(b => b.date === today).length;

  const next = planned.find(b => b.date > today || (b.date === today && b.time >= nowTime));
  if (next) {
    const s = getService(next.serviceId);
    document.getElementById('statNext').textContent =
      `${formatDate(next.date)} (${weekday(next.date)}), ${next.time} — ${s.name}, ${next.clientName}`;
  }
}

// ---------- Записи ----------

const form = {};
let editingId = null;

function initBookings() {
  ['bookingForm', 'bookingId', 'clientName', 'phone', 'serviceId', 'date', 'time', 'status',
    'statusField', 'comment', 'commentCounter', 'submitBtn', 'resetBtn', 'formTitle']
    .forEach(id => { form[id] = document.getElementById(id); });

  SERVICES.forEach(s => {
    form.serviceId.append(new Option(`${s.name} · ${s.duration} мин`, s.id));
  });
  Object.entries(STATUSES).forEach(([value, label]) => {
    form.status.append(new Option(label, value));
    document.getElementById('statusFilter').append(new Option(label, value));
  });

  form.date.min = todayISO();
  form.time.min = WORK_START;
  form.time.max = WORK_END;

  form.bookingForm.addEventListener('submit', onSubmit);
  form.resetBtn.addEventListener('click', resetForm);
  form.comment.addEventListener('input', () => {
    form.commentCounter.textContent = form.comment.value.length;
  });
  // Ошибка у поля исчезает, как только пользователь начинает его исправлять.
  form.bookingForm.addEventListener('input', e => setFieldError(e.target.id, ''));

  document.getElementById('searchInput').addEventListener('input', renderList);
  document.getElementById('statusFilter').addEventListener('change', renderList);
  document.getElementById('dateFilter').addEventListener('change', renderList);
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('dateFilter').value = '';
    renderList();
  });
  document.getElementById('bookingsBody').addEventListener('click', onRowAction);
  document.getElementById('demoBtn').addEventListener('click', addDemoData);

  renderList();

  if (Store.corrupted) {
    const warning = document.getElementById('storageWarning');
    warning.textContent = 'Сохранённые данные повреждены и не могут быть прочитаны. ' +
      'Резервная копия сохранена под ключом «lavanda.bookings.backup». Новые записи будут сохраняться как обычно.';
    warning.hidden = false;
  }

  if (location.hash === '#new') {
    form.clientName.focus();
  }
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
  input.classList.toggle('invalid', Boolean(message));
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
    const first = Object.keys(errors)[0];
    document.getElementById(first).focus();
    showToast('Запись не сохранена: исправьте выделенные поля.', 'error');
    return;
  }

  try {
    if (editingId) {
      Store.update(editingId, data);
      showToast('Изменения сохранены.');
    } else {
      const { status, ...fields } = data;
      Store.add(fields);
      showToast('Запись создана.');
    }
  } catch (e) {
    showToast('Не удалось сохранить: хранилище браузера недоступно или переполнено.', 'error');
    return;
  }

  document.getElementById('storageWarning').hidden = true;
  resetForm();
  renderList();
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
  form.bookingForm.closest('.card').classList.add('editing');
  form.bookingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.clientName.focus({ preventScroll: true });
  renderList();
}

function resetForm() {
  editingId = null;
  form.bookingForm.reset();
  form.bookingId.value = '';
  form.date.min = todayISO();
  form.commentCounter.textContent = '0';
  form.statusField.hidden = true;
  form.formTitle.textContent = 'Новая запись';
  form.submitBtn.textContent = 'Создать запись';
  form.resetBtn.textContent = 'Очистить';
  form.bookingForm.closest('.card').classList.remove('editing');
  clearErrors();
  renderList();
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
      break;
    case 'cancel':
      if (confirm(`Отменить запись?\n${summary}`)) {
        Store.update(id, { status: 'cancelled' });
        showToast('Запись отменена.');
      }
      break;
    case 'delete':
      if (confirm(`Удалить запись без возможности восстановления?\n${summary}`)) {
        Store.remove(id);
        if (editingId === id) resetForm();
        showToast('Запись удалена.');
      }
      break;
  }
  renderList();
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

function renderList() {
  const body = document.getElementById('bookingsBody');
  if (!body) return;
  const all = Store.getAll();
  const list = getFilteredBookings();
  const now = `${todayISO()} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;

  body.replaceChildren();
  list.forEach(b => {
    const s = getService(b.serviceId);
    const tr = el('tr', `row-${b.status}`);
    if (b.id === editingId) tr.classList.add('row-editing');

    const when = el('td', 'cell-when');
    when.append(el('strong', '', formatDate(b.date)), el('span', 'muted',
      `${weekday(b.date)}, ${b.time}–${fromMinutes(toMinutes(b.time) + s.duration)}`));
    if (b.status === 'planned' && `${b.date} ${b.time}` < now) {
      when.append(el('span', 'tag-overdue', 'время прошло'));
    }

    const client = el('td', 'cell-client');
    client.append(el('strong', '', b.clientName), el('span', 'muted', b.phone));
    if (b.comment) client.append(el('span', 'comment', b.comment));

    const service = el('td', 'cell-service');
    service.append(el('span', '', s.name), el('span', 'muted', formatPrice(s.price)));

    const statusCell = el('td');
    statusCell.append(el('span', `badge badge-${b.status}`, STATUSES[b.status]));

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
    ? 'По заданным условиям записей не найдено.'
    : 'Записей пока нет. Создайте первую запись с помощью формы.';
  document.getElementById('demoBtn').hidden = all.length > 0;
  document.querySelector('.table-wrap').hidden = list.length === 0;
}

function actionButton(action, id, label) {
  const button = el('button', `btn btn-small btn-action btn-${action}`, label);
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

// Демонстрационные записи с вымышленными данными — для показа работы системы.
function addDemoData() {
  const demo = [
    { clientName: 'Анна Смирнова', phone: '+7 900 000-00-01', serviceId: 's1', date: addDaysISO(1), time: '10:00', comment: 'Хочет каре' },
    { clientName: 'Сергей Петров', phone: '+7 900 000-00-02', serviceId: 's2', date: addDaysISO(1), time: '11:30', comment: '' },
    { clientName: 'Мария Кузнецова', phone: '+7 900 000-00-03', serviceId: 's5', date: addDaysISO(2), time: '14:00', comment: 'Покрытие гель-лаком' },
    { clientName: 'Ольга Новикова', phone: '+7 900 000-00-04', serviceId: 's3', date: addDaysISO(3), time: '12:00', comment: '' },
    { clientName: 'Дмитрий Орлов', phone: '+7 900 000-00-05', serviceId: 's2', date: addDaysISO(4), time: '18:00', comment: 'Перезвонить за день' }
  ];
  demo.forEach(d => Store.add(d));
  showToast('Добавлено 5 демонстрационных записей.');
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

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// ---------- Запуск ----------

document.addEventListener('DOMContentLoaded', () => {
  markActiveNav();
  const page = document.body.dataset.page;
  if (page === 'home') initHome();
  if (page === 'bookings') initBookings();
  if (page === 'about') initAbout();
});
