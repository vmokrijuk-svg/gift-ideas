// ========== КОНФИГУРАЦИЯ ==========
var GITHUB_RAW_URL = 'https://raw.githubusercontent.com/vmokrijuk-svg/gift-ideas/main/ideas.json';
var UPCOMING_DAYS_WINDOW = 90;
var UPCOMING_MAX_ITEMS = 5;

// ========== КЛЮЧИ ХРАНИЛИЩА ==========
var STORAGE_KEY = 'giftIdeas';
var PEOPLE_KEY = 'giftPeople';
var PHOTOS_KEY = 'giftPeoplePhotos';
var COLLAPSED_KEY = 'giftCollapsedGroups';
var SORT_KEY = 'giftSortMode';
var LAST_MODIFIED_KEY = 'giftLastModified';

// ========== СОСТОЯНИЕ ==========
var searchQuery = '';
var filterNotBought = false;
var currentPhotoPerson = null;

// ========== ЛОГ ==========
function log(msg, type) {
  try {
    var el = document.getElementById('log-content');
    if (!el) return;
    var line = document.createElement('div');
    line.className = 'log-entry ' + (type || '');
    var time = new Date().toLocaleTimeString('ru-RU');
    line.textContent = '[' + time + '] ' + msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  } catch (e) {}
  console.log(msg);
}

function showLog() {
  var logEl = document.getElementById('debug-log');
  if (logEl) logEl.classList.add('visible');
}

function setStatus(msg, type) {
  var el = document.getElementById('status-bar');
  if (!el) return;
  el.textContent = msg;
  el.className = type || '';
}

window.addEventListener('error', function(e) {
  log('ОШИБКА: ' + e.message + ' (строка ' + e.lineno + ')', 'error');
  showLog();
});

// ========== ХРАНИЛИЩЕ ==========
function loadIdeas() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    log('Ошибка чтения идей: ' + e.message, 'error');
    return [];
  }
}

function saveIdeas(ideas) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
    return true;
  } catch (e) {
    log('Ошибка записи: ' + e.message, 'error');
    alert('Не удалось сохранить. Возможно, переполнено хранилище.');
    return false;
  }
}

function loadPeople() {
  try {
    var raw = localStorage.getItem(PEOPLE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePeople(people) {
  try {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
    return true;
  } catch (e) {
    log('Ошибка записи людей: ' + e.message, 'error');
    return false;
  }
}

function loadPersonPhotos() {
  try {
    var raw = localStorage.getItem(PHOTOS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function savePersonPhotos(obj) {
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(obj));
    return true;
  } catch (e) {
    log('Ошибка записи фото: ' + e.message, 'error');
    return false;
  }
}

function getPersonPhoto(person) {
  var photos = loadPersonPhotos();
  return photos[person] || '';
}

function loadCollapsed() {
  try {
    var raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveCollapsed(obj) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(obj));
  } catch (e) {}
}

function loadSortMode() {
  return localStorage.getItem(SORT_KEY) || 'date';
}

function saveSortMode(mode) {
  localStorage.setItem(SORT_KEY, mode);
}

function getLastModified() {
  return localStorage.getItem(LAST_MODIFIED_KEY) || '';
}

function setLastModified(iso) {
  localStorage.setItem(LAST_MODIFIED_KEY, iso);
}

// ========== МИГРАЦИЯ ==========
function migratePeople() {
  var people = loadPeople();
  if (people.length > 0) return people;

  var ideas = loadIdeas();
  var seen = {};
  var result = [];
  for (var i = 0; i < ideas.length; i++) {
    var p = (ideas[i].person || '').trim();
    if (p && !seen[p]) {
      seen[p] = true;
      result.push(p);
    }
  }
  if (result.length > 0) {
    savePeople(result);
    log('Мигрировано людей: ' + result.length, 'ok');
  }
  return result;
}

// ========== ЦЕНЫ И СУММЫ ==========
function parsePrice(price) {
  if (!price) return 0;
  var cleaned = String(price).replace(/[^\d.,]/g, '').replace(',', '.');
  var num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatSum(num) {
  return num.toLocaleString('ru-RU') + ' ₽';
}

function sumPrices(ideas) {
  var total = 0;
  for (var i = 0; i < ideas.length; i++) {
    total += parsePrice(ideas[i].price);
  }
  return total;
}

// ========== ДАТЫ И ПРАЗДНИКИ ==========
var MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function parseDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  var parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { year: y, month: m - 1, day: d };
}

function formatHolidayShort(dateStr) {
  var p = parseDateParts(dateStr);
  if (!p) return '';
  return p.day + ' ' + MONTHS_GEN[p.month];
}

function nextOccurrence(dateStr) {
  var p = parseDateParts(dateStr);
  if (!p) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var year = today.getFullYear();
  var candidate = new Date(year, p.month, p.day);
  candidate.setHours(0, 0, 0, 0);
  if (candidate.getTime() < today.getTime()) {
    candidate = new Date(year + 1, p.month, p.day);
    candidate.setHours(0, 0, 0, 0);
  }
  return candidate;
}

function daysUntil(date) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function humanDays(d) {
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  if (d === 2) return 'послезавтра';
  return 'через ' + d + ' ' + plural(d, 'день', 'дня', 'дней');
}

function plural(n, one, few, many) {
  var mod10 = n % 10;
  var mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function renderUpcoming() {
  var container = document.getElementById('upcoming');
  if (!container) return;
  container.innerHTML = '';

  var ideas = loadIdeas();
  var groups = {};

  for (var i = 0; i < ideas.length; i++) {
    var idea = ideas[i];
    if (!idea.date) continue;
    var occ = nextOccurrence(idea.date);
    if (!occ) continue;
    var days = daysUntil(occ);
    if (days < 0 || days > UPCOMING_DAYS_WINDOW) continue;
    var key = (idea.person || '') + '|' + idea.date;
    if (!groups[key]) {
      groups[key] = {
        person: idea.person || 'Без категории',
        occasion: idea.occasion || '',
        date: idea.date,
        dateObj: occ,
        days: days,
        count: 0
      };
    }
    groups[key].count++;
  }

  var list = [];
  for (var k in groups) {
    if (groups.hasOwnProperty(k)) list.push(groups[k]);
  }

  list.sort(function(a, b) { return a.days - b.days; });
  list = list.slice(0, UPCOMING_MAX_ITEMS);

  if (list.length === 0) return;

  var block = document.createElement('div');
  block.className = 'upcoming-block';

  var html = '<div class="upcoming-title">🎂 Скоро</div>';

  for (var j = 0; j < list.length; j++) {
    var item = list[j];
    var daysClass = item.days <= 3 ? 'days urgent' : 'days';
    var occasionText = item.occasion ? ' — ' + escapeHtml(item.occasion) : '';
    var countText = item.count > 1 ? ' · ' + item.count + ' ' + plural(item.count, 'идея', 'идеи', 'идей') : '';
    html += '<div class="upcoming-item">' +
      '<span class="left"><span class="person">' + escapeHtml(item.person) + '</span>' + occasionText + '</span>' +
      '<span class="right"><span class="' + daysClass + '">' + humanDays(item.days) + '</span>' +
      ' · ' + formatHolidayShort(item.date) + countText + '</span>' +
      '</div>';
  }

  block.innerHTML = html;
  container.appendChild(block);
}

// ========== ФИЛЬТРЫ ==========
function onSearchInput(e) {
  searchQuery = (e.target.value || '').toLowerCase().trim();
  render();
}

function applySearch(ideas) {
  if (!searchQuery) return ideas;
  var result = [];
  for (var i = 0; i < ideas.length; i++) {
    var idea = ideas[i];
    var haystack = (
      (idea.person || '') + ' ' +
      (idea.title || '') + ' ' +
      (idea.occasion || '')
    ).toLowerCase();
    if (haystack.indexOf(searchQuery) !== -1) {
      result.push(idea);
    }
  }
  return result;
}

function applyStatusFilter(ideas) {
  if (!filterNotBought) return ideas;
  var result = [];
  for (var i = 0; i < ideas.length; i++) {
    if (!ideas[i].bought) result.push(ideas[i]);
  }
  return result;
}

// ========== РАБОТА С КАРТИНКОЙ ==========
function handleImagePick(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;

  log('Выбрана картинка: ' + file.name + ' (' + Math.round(file.size / 1024) + ' КБ)');

  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxSide = 400;
      var w = img.width;
      var h = img.height;
      if (w > h && w > maxSide) { h = h * maxSide / w; w = maxSide; }
      else if (h > maxSide) { w = w * maxSide / h; h = maxSide; }

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      log('Сжато до ' + Math.round(dataUrl.length / 1024) + ' КБ');

      document.querySelector('#idea-form [name="image"]').value = dataUrl;
      document.getElementById('image-preview').innerHTML = '<img src="' + dataUrl + '">';
      document.getElementById('clear-image-btn').style.display = 'inline-block';
    };
    img.onerror = function() {
      log('Не удалось прочитать картинку', 'error');
      alert('Не удалось загрузить картинку.');
    };
    img.src = e.target.result;
  };
  reader.onerror = function() {
    log('Ошибка чтения файла', 'error');
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  document.querySelector('#idea-form [name="image"]').value = '';
  document.querySelector('#idea-form [name="imageFile"]').value = '';
  document.getElementById('image-preview').innerHTML = '';
  document.getElementById('clear-image-btn').style.display = 'none';
  log('Картинка убрана');
}

// ========== ФОТО ЧЕЛОВЕКА ==========
function pickPersonPhoto(person) {
  currentPhotoPerson = person;
  document.getElementById('person-photo-input').click();
}

function handlePersonPhotoInput(event) {
  if (!currentPhotoPerson) return;
  var file = event.target.files && event.target.files[0];
  if (!file) {
    currentPhotoPerson = null;
    return;
  }

  var person = currentPhotoPerson;
  log('Фото для ' + person + ': ' + Math.round(file.size / 1024) + ' КБ');

  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxSide = 200;
      var w = img.width;
      var h = img.height;
      if (w > h && w > maxSide) { h = h * maxSide / w; w = maxSide; }
      else if (h > maxSide) { w = w * maxSide / h; h = maxSide; }

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      var photos = loadPersonPhotos();
      photos[person] = dataUrl;
      savePersonPhotos(photos);
      log('Фото обновлено: ' + person + ' (' + Math.round(dataUrl.length / 1024) + ' КБ)', 'ok');
      renderPeopleList();
      render();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
  currentPhotoPerson = null;
}

function removePersonPhoto(person) {
  var photos = loadPersonPhotos();
  delete photos[person];
  savePersonPhotos(photos);
  log('Фото удалено: ' + person, 'ok');
  renderPeopleList();
  render();
}

// ========== ФОРМА ==========
function openForm() {
  log('Открываю форму');
  refreshPersonSelect();
  document.getElementById('form-overlay').style.display = 'flex';
}

function closeForm() {
  log('Закрываю форму');
  document.getElementById('form-overlay').style.display = 'none';
  document.getElementById('idea-form').reset();
  document.getElementById('idea-form').querySelector('[name="id"]').value = '';
  document.getElementById('form-title').textContent = 'Новая идея';
  document.getElementById('image-preview').innerHTML = '';
  document.getElementById('clear-image-btn').style.display = 'none';
  document.getElementById('new-person-block').style.display = 'none';
  document.getElementById('toggle-new-person-btn').style.display = 'inline-block';
}

function refreshPersonSelect() {
  var select = document.getElementById('person-select');
  var people = loadPeople();
  var current = select.value;
  select.innerHTML = '';
  for (var i = 0; i < people.length; i++) {
    var opt = document.createElement('option');
    opt.value = people[i];
    opt.textContent = people[i];
    select.appendChild(opt);
  }
  if (current && people.indexOf(current) !== -1) select.value = current;
}

function toggleNewPerson() {
  var block = document.getElementById('new-person-block');
  var btn = document.getElementById('toggle-new-person-btn');
  if (block.style.display === 'none') {
    block.style.display = 'block';
    btn.style.display = 'none';
    block.querySelector('input').focus();
  } else {
    block.style.display = 'none';
    btn.style.display = 'inline-block';
    block.querySelector('input').value = '';
  }
}

function handleSubmit(e) {
  e.preventDefault();
  log('Submit перехвачен');

  try {
    var form = document.getElementById('idea-form');
    var data = {};
    var inputs = form.querySelectorAll('input, select');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].type === 'file') continue;
      data[inputs[i].name] = (inputs[i].value || '').trim();
    }

    var person = data.newPerson || data.person;
    if (!person) {
      alert('Укажите, для кого идея.');
      return false;
    }

    if (data.newPerson) {
      var people = loadPeople();
      if (people.indexOf(person) === -1) {
        people.push(person);
        people.sort(function(a, b) { return a.localeCompare(b, 'ru'); });
        savePeople(people);
        log('Добавлен новый человек: ' + person, 'ok');
      }
    }

    var ideas = loadIdeas();
    var now = new Date().toISOString();

    if (data.id) {
      for (var j = 0; j < ideas.length; j++) {
        if (ideas[j].id === data.id) {
          ideas[j].person = person;
          ideas[j].occasion = data.occasion;
          ideas[j].date = data.date;
          ideas[j].budget = data.budget;
          ideas[j].title = data.title;
          ideas[j].link = data.link;
          ideas[j].image = data.image;
          ideas[j].price = data.price;
          ideas[j].updatedAt = now;
          break;
        }
      }
      log('Идея обновлена: ' + person, 'ok');
    } else {
      ideas.unshift({
        id: String(Date.now()),
        bought: false,
        person: person,
        occasion: data.occasion,
        date: data.date,
        budget: data.budget,
        title: data.title,
        link: data.link,
        image: data.image,
        price: data.price,
        createdAt: now,
        updatedAt: now
      });
      log('Идея сохранена: ' + person + ' — ' + (data.title || 'без названия'), 'ok');
    }

    if (saveIdeas(ideas)) {
      setLastModified(now);
      closeForm();
      render();
    }
  } catch (err) {
    log('Ошибка в submit: ' + err.message, 'error');
    showLog();
  }

  return false;
}

// ========== СОРТИРОВКА ==========
function sortIdeas(ideas) {
  var mode = loadSortMode();
  var sorted = ideas.slice();
  if (mode === 'sum') {
    sorted.sort(function(a, b) {
      return parsePrice(b.price) - parsePrice(a.price);
    });
  } else {
    sorted.sort(function(a, b) {
      var da = a.createdAt || '';
      var db = b.createdAt || '';
      return db.localeCompare(da);
    });
  }
  return sorted;
}

function changeSortMode(mode) {
  saveSortMode(mode);
  render();
}

// ========== РЕНДЕР ==========
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function render() {
  try {
    renderUpcoming();

    var container = document.getElementById('ideas-container');
    var totalsEl = document.getElementById('totals');
    var allIdeas = loadIdeas();

    var searchedIdeas = applySearch(allIdeas);
    var visibleIdeas = applyStatusFilter(searchedIdeas);

    var totalSum = sumPrices(searchedIdeas);
    var notBoughtIdeas = [];
    for (var t = 0; t < searchedIdeas.length; t++) {
      if (!searchedIdeas[t].bought) notBoughtIdeas.push(searchedIdeas[t]);
    }
    var notBoughtSum = sumPrices(notBoughtIdeas);

    if (searchedIdeas.length > 0) {
      totalsEl.innerHTML =
        '<span>Всего: <strong>' + formatSum(totalSum) + '</strong></span>' +
        '<span>Не куплено: <strong>' + formatSum(notBoughtSum) + '</strong></span>';
    } else {
      totalsEl.innerHTML = '';
    }

    container.innerHTML = '';

    if (visibleIdeas.length === 0) {
      if (allIdeas.length === 0) {
        container.innerHTML = '<p class="empty-message">Пока пусто. Нажмите «+ Добавить».</p>';
      } else if (searchQuery || filterNotBought) {
        container.innerHTML = '<p class="empty-message">Ничего не найдено по заданным условиям.</p>';
      }
      return;
    }

    var groups = {};
    for (var i = 0; i < visibleIdeas.length; i++) {
      var p = (visibleIdeas[i].person || '').trim() || 'Без категории';
      if (!groups[p]) groups[p] = [];
      groups[p].push(visibleIdeas[i]);
    }

    var peopleList = Object.keys(groups);
    peopleList.sort(function(a, b) {
      var diff = groups[b].length - groups[a].length;
      if (diff !== 0) return diff;
      return a.localeCompare(b, 'ru');
    });

    var collapsed = loadCollapsed();

    for (var g = 0; g < peopleList.length; g++) {
      var person = peopleList[g];
      var personIdeas = groups[person];

      var boughtCount = 0;
      for (var b = 0; b < personIdeas.length; b++) {
        if (personIdeas[b].bought) boughtCount++;
      }
      var personSum = sumPrices(personIdeas);

      var group = document.createElement('div');
      group.className = 'group' + (collapsed[person] ? ' collapsed' : '');

      var metaParts = [personIdeas.length + ' ' + plural(personIdeas.length, 'идея', 'идеи', 'идей')];
      if (boughtCount > 0) metaParts.push(boughtCount + ' куплено');
      if (personSum > 0) metaParts.push(formatSum(personSum));

      var avatarHtml = '';
      var photo = getPersonPhoto(person);
      if (photo) {
        avatarHtml = '<img src="' + photo + '" class="group-avatar" alt="">';
      }

      var header = document.createElement('div');
      header.className = 'group-header';
      header.setAttribute('onclick', "toggleGroup('" + person.replace(/'/g, "\\'") + "')");
      header.innerHTML =
        '<span class="toggle-icon">▼</span>' +
        avatarHtml +
        '<h2>' + escapeHtml(person) + '</h2>' +
        '<span class="group-meta">' + metaParts.join(' · ') + '</span>';
      group.appendChild(header);

      var grid = document.createElement('div');
      grid.className = 'cards-grid';

      var sorted = sortIdeas(personIdeas);
      for (var k = 0; k < sorted.length; k++) {
        grid.appendChild(buildCard(sorted[k]));
      }

      group.appendChild(grid);
      container.appendChild(group);
    }
  } catch (err) {
    log('Ошибка рендера: ' + err.message, 'error');
    showLog();
  }
}

function buildCard(idea) {
  var card = document.createElement('div');
  card.className = 'card' + (idea.bought ? ' bought' : '');

  var html = '';
  if (idea.image) html += '<img src="' + escapeHtml(idea.image) + '" alt="">';
  html += '<div class="title">' + (escapeHtml(idea.title) || 'Без названия') + '</div>';

  var metaParts = [];
  if (idea.occasion) metaParts.push(escapeHtml(idea.occasion));
  if (idea.date) metaParts.push('<span class="holiday">🎂 ' + formatHolidayShort(idea.date) + '</span>');
  if (metaParts.length > 0) {
    html += '<div class="card-meta">' + metaParts.join(' · ') + '</div>';
  }

  if (idea.price) html += '<div class="price">' + escapeHtml(idea.price) + '</div>';
  if (idea.budget) html += '<div class="card-meta">Бюджет: ' + escapeHtml(idea.budget) + ' ₽</div>';
  if (idea.link) html += '<a href="' + escapeHtml(idea.link) + '" target="_blank" rel="noopener">Открыть ссылку</a>';
  html += '<div class="actions">';
  html += '<button type="button" class="' + (idea.bought ? 'bought' : '') + '" onclick="toggleBought(\'' + idea.id + '\')">' + (idea.bought ? '✓ Куплено' : 'Отметить купленным') + '</button>';
  html += '<button type="button" onclick="editIdea(\'' + idea.id + '\')">✏️ Изменить</button>';
  html += '<button type="button" onclick="deleteIdea(\'' + idea.id + '\')">Удалить</button>';
  html += '</div>';

  card.innerHTML = html;
  return card;
}

function toggleGroup(person) {
  var collapsed = loadCollapsed();
  collapsed[person] = !collapsed[person];
  saveCollapsed(collapsed);
  render();
}

// ========== ДЕЙСТВИЯ ==========
function toggleBought(id) {
  var ideas = loadIdeas();
  var now = new Date().toISOString();
  for (var i = 0; i < ideas.length; i++) {
    if (ideas[i].id === id) {
      ideas[i].bought = !ideas[i].bought;
      ideas[i].updatedAt = now;
      break;
    }
  }
  saveIdeas(ideas);
  setLastModified(now);
  render();
}

function editIdea(id) {
  log('Редактирую идею: ' + id);
  var ideas = loadIdeas();
  var idea = null;
  for (var i = 0; i < ideas.length; i++) {
    if (ideas[i].id === id) { idea = ideas[i]; break; }
  }
  if (!idea) {
    log('Идея не найдена', 'error');
    return;
  }

  refreshPersonSelect();

  var form = document.getElementById('idea-form');
  form.querySelector('[name="id"]').value = idea.id;
  form.querySelector('[name="person"]').value = idea.person || '';
  form.querySelector('[name="occasion"]').value = idea.occasion || '';
  form.querySelector('[name="date"]').value = idea.date || '';
  form.querySelector('[name="budget"]').value = idea.budget || '';
  form.querySelector('[name="title"]').value = idea.title || '';
  form.querySelector('[name="link"]').value = idea.link || '';
  form.querySelector('[name="image"]').value = idea.image || '';
  form.querySelector('[name="price"]').value = idea.price || '';

  if (idea.image) {
    document.getElementById('image-preview').innerHTML = '<img src="' + idea.image + '">';
    document.getElementById('clear-image-btn').style.display = 'inline-block';
  } else {
    document.getElementById('image-preview').innerHTML = '';
    document.getElementById('clear-image-btn').style.display = 'none';
  }

  document.getElementById('form-title').textContent = 'Редактировать идею';
  openForm();
}

function deleteIdea(id) {
  if (!confirm('Удалить эту идею?')) return;
  var ideas = loadIdeas().filter(function(i) { return i.id !== id; });
  saveIdeas(ideas);
  setLastModified(new Date().toISOString());
  log('Идея удалена', 'ok');
  render();
}

function resetAll() {
  if (!confirm('Удалить ВСЕ идеи, справочник и фото? Это нельзя отменить.')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PEOPLE_KEY);
  localStorage.removeItem(PHOTOS_KEY);
  localStorage.removeItem(COLLAPSED_KEY);
  localStorage.removeItem(LAST_MODIFIED_KEY);
  searchQuery = '';
  filterNotBought = false;
  document.getElementById('search-input').value = '';
  document.getElementById('filter-not-bought').checked = false;
  log('Все данные удалены', 'ok');
  render();
}

// ========== СПРАВОЧНИК ЛЮДЕЙ ==========
function openPeopleManager() {
  log('Открываю справочник');
  renderPeopleList();
  document.getElementById('people-manager-overlay').style.display = 'flex';
}

function closePeopleManager() {
  document.getElementById('people-manager-overlay').style.display = 'none';
}

function renderPeopleList() {
  var list = document.getElementById('people-list');
  var people = loadPeople();
  var ideas = loadIdeas();
  var photos = loadPersonPhotos();
  list.innerHTML = '';

  if (people.length === 0) {
    list.innerHTML = '<p style="color:#86868b">Справочник пуст. Добавьте человека через форму новой идеи.</p>';
    return;
  }

  for (var i = 0; i < people.length; i++) {
    var person = people[i];
    var count = 0;
    for (var j = 0; j < ideas.length; j++) {
      if (ideas[j].person === person) count++;
    }

    var avatarHtml = photos[person]
      ? '<img src="' + photos[person] + '" class="person-avatar" alt="">'
      : '<div class="person-avatar person-avatar-placeholder">' + escapeHtml((person.charAt(0) || '?').toUpperCase()) + '</div>';

    var escapedPerson = person.replace(/'/g, "\\'");

    var row = document.createElement('div');
    row.className = 'person-row';

    var actionsHtml = '';
    actionsHtml += '<button type="button" onclick="pickPersonPhoto(\'' + escapedPerson + '\')" title="Загрузить фото">📷</button>';
    if (photos[person]) {
      actionsHtml += '<button type="button" onclick="removePersonPhoto(\'' + escapedPerson + '\')" title="Убрать фото">✕</button>';
    }
    actionsHtml += '<button type="button" class="danger" onclick="deletePerson(\'' + escapedPerson + '\')" ' + (count > 0 ? 'disabled title="Есть идеи для этого человека"' : '') + '>Удалить</button>';

    row.innerHTML =
      '<div class="person-info">' +
        avatarHtml +
        '<span>' + escapeHtml(person) + ' <span style="color:#86868b;font-size:12px">(' + count + ')</span></span>' +
      '</div>' +
      '<div class="person-actions">' + actionsHtml + '</div>';

    list.appendChild(row);
  }
}

function deletePerson(person) {
  var ideas = loadIdeas();
  var count = 0;
  for (var i = 0; i < ideas.length; i++) {
    if (ideas[i].person === person) count++;
  }
  if (count > 0) {
    alert('Нельзя удалить: у этого человека есть идеи (' + count + ').');
    return;
  }
  if (!confirm('Удалить "' + person + '" из справочника?')) return;
  var people = loadPeople().filter(function(p) { return p !== person; });
  savePeople(people);
  var photos = loadPersonPhotos();
  delete photos[person];
  savePersonPhotos(photos);
  log('Человек удалён: ' + person, 'ok');
  renderPeopleList();
  refreshPersonSelect();
  render();
}

// ========== SHARE TARGET ==========
function handleShareTarget() {
  var params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch (e) {
    return false;
  }

  var sharedUrl = params.get('url') || '';
  var sharedText = params.get('text') || '';
  var sharedTitle = params.get('title') || '';

  if (!sharedUrl && !sharedText && !sharedTitle) return false;

  log('Share Target: url="' + sharedUrl + '", text="' + sharedText + '", title="' + sharedTitle + '"', 'ok');

  try {
    window.history.replaceState({}, '', window.location.pathname);
  } catch (e) {}

  // Если нет URL, но в text есть ссылка — вытащим
  if (!sharedUrl && sharedText) {
    var match = sharedText.match(/https?:\/\/[^\s]+/);
    if (match) {
      sharedUrl = match[0];
      sharedText = sharedText.replace(match[0], '').trim();
    }
  }

  var titleValue = '';
  if (sharedTitle && !/^https?:\/\//.test(sharedTitle)) {
    titleValue = sharedTitle;
  } else if (sharedText && !/^https?:\/\//.test(sharedText)) {
    titleValue = sharedText;
  }

  setTimeout(function() {
    openForm();
    var form = document.getElementById('idea-form');
    if (sharedUrl) form.querySelector('[name="link"]').value = sharedUrl;
    if (titleValue) form.querySelector('[name="title"]').value = titleValue;
    setStatus('🔗 Ссылка подставлена. Заполните остальное.', 'ok');
  }, 150);

  return true;
}

// ========== ЭКСПОРТ / ИМПОРТ / GITHUB ==========
function buildBackupObject() {
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    ideas: loadIdeas(),
    people: loadPeople(),
    peoplePhotos: loadPersonPhotos()
  };
}

function exportData() {
  try {
    var backup = buildBackupObject();
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ideas.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setLastModified(backup.lastModified);
    log('Экспортировано: ' + backup.ideas.length + ' идей', 'ok');
    setStatus('📤 Файл ideas.json скачан. Загрузите его в GitHub.', 'ok');
  } catch (e) {
    log('Ошибка экспорта: ' + e.message, 'error');
    alert('Не удалось экспортировать данные.');
  }
}

function importData() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.ideas || !Array.isArray(data.ideas)) {
        throw new Error('Неверный формат файла');
      }

      if (!confirm('Импортировать ' + data.ideas.length + ' идей? Текущие данные будут заменены.')) {
        event.target.value = '';
        return;
      }

      saveIdeas(data.ideas);
      if (data.people && Array.isArray(data.people)) {
        savePeople(data.people);
      }
      if (data.peoplePhotos && typeof data.peoplePhotos === 'object') {
        savePersonPhotos(data.peoplePhotos);
      }
      if (data.lastModified) {
        setLastModified(data.lastModified);
      } else {
        setLastModified(new Date().toISOString());
      }

      log('Импортировано: ' + data.ideas.length + ' идей', 'ok');
      setStatus('📥 Импортировано ' + data.ideas.length + ' идей', 'ok');
      render();
    } catch (err) {
      log('Ошибка импорта: ' + err.message, 'error');
      alert('Не удалось импортировать: ' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function fetchGitHubBackup() {
  log('Проверяю бэкап на GitHub...');

  var url = GITHUB_RAW_URL + '?t=' + Date.now();

  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      if (!data.ideas || !Array.isArray(data.ideas)) {
        throw new Error('Неверный формат бэкапа');
      }

      var remoteTime = data.lastModified || '';
      var localTime = getLastModified();

      log('GitHub: ' + data.ideas.length + ' идей, изменён ' + remoteTime);
      log('Локально: ' + loadIdeas().length + ' идей, изменён ' + (localTime || 'никогда'));

      if (remoteTime && (!localTime || remoteTime > localTime)) {
        var remoteDate = new Date(remoteTime).toLocaleString('ru-RU');
        var msg = 'В GitHub есть более свежие данные (от ' + remoteDate + ').\n\n' +
                  'Идей: ' + data.ideas.length + '\n' +
                  'Локально: ' + loadIdeas().length + '\n\n' +
                  'Загрузить из GitHub? Локальные данные будут заменены.';

        if (confirm(msg)) {
          saveIdeas(data.ideas);
          if (data.people && Array.isArray(data.people)) {
            savePeople(data.people);
          }
          if (data.peoplePhotos && typeof data.peoplePhotos === 'object') {
            savePersonPhotos(data.peoplePhotos);
          }
          setLastModified(remoteTime);
          log('Данные загружены из GitHub', 'ok');
          setStatus('✓ Загружено из GitHub (' + data.ideas.length + ' идей)', 'ok');
          render();
          return;
        } else {
          log('Пользователь отказался загружать');
          setStatus('Локальные данные (в GitHub свежее, но не загружено)', 'warn');
          return;
        }
      }

      if (localTime && remoteTime && localTime > remoteTime) {
        setStatus('Локальные данные новее, чем в GitHub. Не забудьте экспортировать.', 'warn');
      } else {
        setStatus('✓ Данные актуальны (' + data.ideas.length + ' идей)', 'ok');
      }
    })
    .catch(function(err) {
      log('GitHub недоступен: ' + err.message);
      setStatus('Офлайн-режим: работаем с локальными данными', '');
    });
}

// ========== СТАРТ ==========
(function start() {
  try {
    log('Приложение запущено', 'ok');

    try {
      localStorage.setItem('__test__', '1');
      localStorage.removeItem('__test__');
      log('LocalStorage доступен', 'ok');
    } catch (e) {
      log('LocalStorage НЕДОСТУПЕН: ' + e.message, 'error');
      showLog();
    }

    migratePeople();
    log('Идей в хранилище: ' + loadIdeas().length);
    log('Людей в справочнике: ' + loadPeople().length);

    document.getElementById('sort-select').value = loadSortMode();

    document.getElementById('filter-not-bought').addEventListener('change', function(e) {
      filterNotBought = e.target.checked;
      render();
    });

    document.getElementById('search-input').addEventListener('input', onSearchInput);

    document.getElementById('person-photo-input').addEventListener('change', handlePersonPhotoInput);

    render();

    var shared = handleShareTarget();

    if (!shared) {
      fetchGitHubBackup();
    } else {
      log('Share Target: авто-проверка GitHub отложена', 'ok');
    }

    document.getElementById('form-overlay').addEventListener('click', function(e) {
      if (e.target.id === 'form-overlay') closeForm();
    });

    document.getElementById('people-manager-overlay').addEventListener('click', function(e) {
      if (e.target.id === 'people-manager-overlay') closePeopleManager();
    });
  } catch (err) {
    log('Критическая ошибка запуска: ' + err.message, 'error');
    showLog();
  }
})();

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==========
window.openForm = openForm;
window.closeForm = closeForm;
window.handleSubmit = handleSubmit;
window.toggleBought = toggleBought;
window.editIdea = editIdea;
window.deleteIdea = deleteIdea;
window.resetAll = resetAll;
window.handleImagePick = handleImagePick;
window.clearImage = clearImage;
window.toggleNewPerson = toggleNewPerson;
window.toggleGroup = toggleGroup;
window.changeSortMode = changeSortMode;
window.openPeopleManager = openPeopleManager;
window.closePeopleManager = closePeopleManager;
window.deletePerson = deletePerson;
window.exportData = exportData;
window.importData = importData;
window.handleImportFile = handleImportFile;
window.pickPersonPhoto = pickPersonPhoto;
window.removePersonPhoto = removePersonPhoto;
