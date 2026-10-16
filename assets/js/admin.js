/* admin.js — общий для demo и prod. */
(function () {
  'use strict';

  var STORAGE_KEY = 'potolki_overrides';
  var baseConfig = null;
  var config = null;

  // ---------- Утилиты ----------
  function deepMerge(base, override) {
    if (Array.isArray(override)) return override;
    if (override && typeof override === 'object' && !Array.isArray(override)) {
      var out = {};
      Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
      Object.keys(override).forEach(function (k) { out[k] = deepMerge(base ? base[k] : undefined, override[k]); });
      return out;
    }
    return override === undefined ? base : override;
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function toast(el, msg, ok) {
    el.hidden = false;
    el.textContent = msg;
    el.className = 'status-msg ' + (ok ? 'ok' : 'err');
    if (ok) setTimeout(function () { el.hidden = true; }, 3000);
  }

  function apiUrl(action, params) {
    var base = (config && config.apiUrl) || 'api.php';
    var u = base + '?action=' + encodeURIComponent(action);
    if (params) {
      Object.keys(params).forEach(function (k) { u += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); });
    }
    return u;
  }

  function apiGet(action, params) {
    return fetch(apiUrl(action, params), { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); })
      .then(function (out) {
        if (!out.json || !out.json.ok) {
          var e = new Error((out.json && out.json.error) || 'Ошибка API');
          e.status = out.status;
          throw e;
        }
        return out.json.data;
      });
  }

  function apiPost(action, body) {
    return fetch(apiUrl(action), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    })
    .then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); })
    .then(function (out) {
      if (!out.json || !out.json.ok) {
        var e = new Error((out.json && out.json.error) || 'Ошибка API');
        e.status = out.status;
        throw e;
      }
      return out.json.data;
    });
  }

  // ---------- Загрузка ----------
  function loadBase() {
    return fetch('config.json', { cache: 'no-store' }).then(function (r) { return r.json(); });
  }

  function applyLocalOverrides(base) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      return deepMerge(base, JSON.parse(raw));
    } catch (e) { return base; }
  }

  function loadProd() {
    return apiGet('admin_get_settings').then(function (data) {
      return deepMerge(baseConfig, data);
    });
  }

  // ---------- Заполнение форм ----------
  function setVal(id, v) { var el = $(id); if (el) el.value = v == null ? '' : v; }
  function getVal(id) { var el = $(id); return el ? el.value : ''; }
  function getNum(id) { var v = parseFloat(getVal(id)); return isFinite(v) ? v : 0; }
  function getInt(id) { var v = parseInt(getVal(id), 10); return isFinite(v) ? v : 0; }

  function fillForm(cfg) {
    setVal('s_company_name', cfg.company.name);
    setVal('s_company_city', cfg.company.city);
    setVal('s_heroTitle', cfg.company.heroTitle);
    setVal('s_heroSubtitle', cfg.company.heroSubtitle);
    setVal('s_about', cfg.company.about);
    setVal('s_buttonText', cfg.company.buttonText);
    setVal('s_phone', cfg.company.phone);
    setVal('s_email', cfg.company.email);
    setVal('s_disclaimer', cfg.company.disclaimer);

    setVal('s_installationPricePerM2', cfg.calc.installationPricePerM2);
    setVal('s_includedCorners', cfg.calc.includedCorners);
    setVal('s_extraCornerPrice', cfg.calc.extraCornerPrice);
    setVal('s_spotlightPrice', cfg.calc.spotlightPrice);
    setVal('s_chandelierPrice', cfg.calc.chandelierPrice);
    setVal('s_pipeBypassPrice', cfg.calc.pipeBypassPrice);
    setVal('s_minOrder', cfg.calc.minOrder);
    setVal('s_heightThreshold', cfg.calc.heightThreshold);
    setVal('s_heightSurchargePercent', cfg.calc.heightSurchargePercent);

    setVal('s_messenger_type', cfg.messenger.type);
    setVal('s_messenger_username', cfg.messenger.username);
    setVal('s_messenger_template', cfg.messenger.template);

    setVal('s_seo_title', cfg.seo.title);
    setVal('s_seo_description', cfg.seo.description);

    renderMaterials(cfg.calc.materials || []);
    renderProfiles(cfg.calc.profiles || []);
    renderImages(cfg.images || []);
    updatePreview();
  }

  function renderMaterials(list) {
    var wrap = $('materialsList');
    wrap.textContent = '';
    list.forEach(function (m, i) {
      var row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML =
        '<input type="text" data-k="name" placeholder="Название" value="' + esc(m.name) + '">' +
        '<input type="number" data-k="pricePerM2" min="0" step="1" placeholder="₽/м²" value="' + esc(m.pricePerM2) + '">' +
        '<label style="margin:0;display:flex;align-items:center;gap:4px;font-size:.8rem"><input type="checkbox" data-k="enabled"' + (m.enabled ? ' checked' : '') + '> вкл</label>' +
        '<button type="button" class="btn btn-sm" data-remove>×</button>';
      row.dataset.id = m.id || '';
      row.querySelector('[data-remove]').addEventListener('click', function () { row.remove(); });
      wrap.appendChild(row);
    });
  }

  function renderProfiles(list) {
    var wrap = $('profilesList');
    wrap.textContent = '';
    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML =
        '<input type="text" data-k="name" placeholder="Название" value="' + esc(p.name) + '">' +
        '<input type="number" data-k="pricePerMeter" min="0" step="1" placeholder="₽/м" value="' + esc(p.pricePerMeter) + '">' +
        '<label style="margin:0;display:flex;align-items:center;gap:4px;font-size:.8rem"><input type="checkbox" data-k="enabled"' + (p.enabled ? ' checked' : '') + '> вкл</label>' +
        '<button type="button" class="btn btn-sm" data-remove>×</button>';
      row.dataset.id = p.id || '';
      row.querySelector('[data-remove]').addEventListener('click', function () { row.remove(); });
      wrap.appendChild(row);
    });
  }

  function slug(s) {
    return String(s).toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '_')
      .replace(/^_+|_+$/g, '') || ('id_' + Math.random().toString(36).slice(2, 8));
  }

  function collectList(wrapId, priceKey) {
    var out = [];
    var rows = $(wrapId).querySelectorAll('.list-item');
    rows.forEach(function (row, i) {
      var name = row.querySelector('[data-k="name"]').value.trim();
      if (!name) return;
      var price = parseFloat(row.querySelector('[data-k="' + priceKey + '"]').value) || 0;
      var enabled = row.querySelector('[data-k="enabled"]').checked;
      var id = row.dataset.id || slug(name) || ('id_' + i);
      // гарантируем уникальность id
      var existing = out.find(function (x) { return x.id === id; });
      if (existing) id = id + '_' + i;
      var item = { id: id, name: name, enabled: enabled };
      item[priceKey] = price;
      out.push(item);
    });
    return out;
  }

  function collectConfig() {
    var cfg = JSON.parse(JSON.stringify(config));
    cfg.company.name = getVal('s_company_name');
    cfg.company.city = getVal('s_company_city');
    cfg.company.heroTitle = getVal('s_heroTitle');
    cfg.company.heroSubtitle = getVal('s_heroSubtitle');
    cfg.company.about = getVal('s_about');
    cfg.company.buttonText = getVal('s_buttonText');
    cfg.company.phone = getVal('s_phone');
    cfg.company.email = getVal('s_email');
    cfg.company.disclaimer = getVal('s_disclaimer');

    cfg.calc.installationPricePerM2 = getNum('s_installationPricePerM2');
    cfg.calc.includedCorners = getInt('s_includedCorners');
    cfg.calc.extraCornerPrice = getNum('s_extraCornerPrice');
    cfg.calc.spotlightPrice = getNum('s_spotlightPrice');
    cfg.calc.chandelierPrice = getNum('s_chandelierPrice');
    cfg.calc.pipeBypassPrice = getNum('s_pipeBypassPrice');
    cfg.calc.minOrder = getNum('s_minOrder');
    cfg.calc.heightThreshold = getNum('s_heightThreshold');
    cfg.calc.heightSurchargePercent = getNum('s_heightSurchargePercent');
    cfg.calc.materials = collectList('materialsList', 'pricePerM2');
    cfg.calc.profiles = collectList('profilesList', 'pricePerMeter');

    cfg.messenger.type = getVal('s_messenger_type');
    cfg.messenger.username = getVal('s_messenger_username').replace(/^@/, '').trim();
    cfg.messenger.template = getVal('s_messenger_template');

    cfg.seo.title = getVal('s_seo_title');
    cfg.seo.description = getVal('s_seo_description');

    return cfg;
  }

  // ---------- Превью мессенджера ----------
  function updatePreview() {
    var tpl = getVal('s_messenger_template');
    var sample = tpl
      .replace('{name}', 'Иван')
      .replace('{phone}', '+7 (999) 123-45-67')
      .replace('{price}', '17 300')
      .replace('{details}', 'Площадь: 12,00 м²\nПериметр: 14,00 м\nМатериал: Матовое полотно — 6 600 ₽\n…');
    $('messengerPreview').textContent = sample;
  }

  // ---------- Images ----------
  function renderImages(list) {
    var wrap = $('imagesList');
    wrap.textContent = '';
    list.forEach(function (img) {
      var div = document.createElement('div');
      div.className = 'img-item';
      div.dataset.id = img.id || '';
      div.dataset.path = img.path;
      var thumb = document.createElement('img');
      thumb.src = img.path;
      thumb.alt = img.alt || img.title || '';
      div.appendChild(thumb);
      var altInput = document.createElement('input');
      altInput.type = 'text';
      altInput.placeholder = 'Alt-текст';
      altInput.value = img.alt || '';
      div.appendChild(altInput);
      var actions = document.createElement('div');
      actions.className = 'img-actions';
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Удалить';
      del.addEventListener('click', function () {
        if (!confirm('Удалить фото?')) return;
        del.disabled = true;
        if (config.mode === 'prod') {
          apiPost('admin_delete_image', { id: img.id }).then(function () {
            div.remove();
          }).catch(function (e) { alert(e.message); del.disabled = false; });
        } else {
          div.remove();
          // Обновим локальный список изображений
          config.images = config.images.filter(function (x) { return x.path !== img.path; });
          persistDemoOverrides();
        }
      });
      actions.appendChild(del);
      div.appendChild(actions);
      wrap.appendChild(div);
    });
  }

  function fileToDataURL(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(file);
    });
  }

  function handleUpload(files) {
    if (!files || !files.length) return;
    var hint = $('imageHint');
    if (config.mode === 'prod') {
      // по одному через FormData
      var fd = new FormData();
      for (var i = 0; i < files.length; i++) fd.append('files[]', files[i]);
      hint.textContent = 'Загрузка…';
      fetch(apiUrl('admin_upload_image'), { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || 'Ошибка загрузки');
          hint.textContent = 'Загружено файлов: ' + (j.data.uploaded || []).length;
          config.images = (config.images || []).concat(j.data.uploaded || []);
          renderImages(config.images);
        })
        .catch(function (e) { hint.textContent = 'Ошибка: ' + e.message; });
    } else {
      // demo: base64 в localStorage, ограничение по размеру
      var totalLimit = 4 * 1024 * 1024; // 4 МБ на всё
      var used = JSON.stringify(config.images || []).length;
      var chain = Promise.resolve();
      var uploaded = [];
      for (var k = 0; k < files.length; k++) {
        (function (file) {
          chain = chain.then(function () {
            if (file.size > 1500 * 1024) throw new Error('«' + file.name + '» > 1.5 МБ — уменьшите фото');
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('«' + file.name + '» — не JPEG/PNG/WebP');
            return fileToDataURL(file).then(function (dataUrl) {
              used += dataUrl.length;
              if (used > totalLimit) throw new Error('Превышен общий лимит localStorage ~4 МБ');
              var item = {
                id: 'demo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                path: dataUrl,
                title: file.name,
                alt: '',
                sort_order: (config.images || []).length
              };
              config.images = (config.images || []).concat([item]);
              uploaded.push(item);
            });
          });
        })(files[k]);
      }
      hint.textContent = 'Загрузка…';
      chain.then(function () {
        hint.textContent = 'Загружено: ' + uploaded.length;
        renderImages(config.images);
        persistDemoOverrides();
      }).catch(function (e) { hint.textContent = 'Ошибка: ' + e.message; });
    }
  }

  // ---------- Сохранение ----------
  function persistDemoOverrides() {
    // Сохраняем только то, что отличается от baseConfig, как оверрайд
    var cfg = collectConfig();
    // images берём из config напрямую
    cfg.images = config.images || [];
    var overrides = buildOverrides(cfg);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {
      throw new Error('Не удалось сохранить: ' + e.message);
    }
    // Обновляем текущий config
    config = deepMerge(baseConfig, overrides);
  }

  // Собираем оверрайд, сравнивая с baseConfig (по примитивам)
  function buildOverrides(cfg) {
    var ov = {};
    function cmp(path, value) {
      var cur = path.reduce(function (o, k) { return o == null ? undefined : o[k]; }, baseConfig);
      var diff = JSON.stringify(cur) !== JSON.stringify(value);
      if (diff) {
        var root = ov;
        path.slice(0, -1).forEach(function (k) { root[k] = root[k] || {}; root = root[k]; });
        root[path[path.length - 1]] = value;
      }
    }
    ['name','city','heroTitle','heroSubtitle','about','buttonText','phone','email','disclaimer']
      .forEach(function (k) { cmp(['company', k], cfg.company[k]); });
    ['installationPricePerM2','includedCorners','extraCornerPrice','spotlightPrice','chandelierPrice','pipeBypassPrice','minOrder','heightThreshold','heightSurchargePercent','materials','profiles']
      .forEach(function (k) { cmp(['calc', k], cfg.calc[k]); });
    ['type','username','template'].forEach(function (k) { cmp(['messenger', k], cfg.messenger[k]); });
    ['title','description'].forEach(function (k) { cmp(['seo', k], cfg.seo[k]); });
    cmp(['images'], cfg.images);
    return ov;
  }

  function saveSettings() {
    var status = $('saveStatus');
    var cfg;
    try { cfg = collectConfig(); } catch (e) { toast(status, e.message, false); return; }
    cfg.images = config.images || [];

    var btn = $('saveBtn');
    btn.disabled = true;
    status.hidden = false; status.className = 'status-msg'; status.textContent = 'Сохранение…';

    if (config.mode === 'prod') {
      apiPost('admin_save_settings', { settings: cfg })
        .then(function () {
          config = deepMerge(baseConfig, cfg);
          toast(status, 'Сохранено', true);
        })
        .catch(function (e) {
          toast(status, 'Ошибка: ' + e.message, false);
        })
        .finally(function () { btn.disabled = false; });
    } else {
      try {
        persistDemoOverrides();
        toast(status, 'Сохранено локально (только в этом браузере)', true);
      } catch (e) {
        toast(status, e.message, false);
      }
      btn.disabled = false;
    }
  }

  // ---------- Заявки ----------
  function statusLabel(s) {
    return ({ new: 'Новая', in_progress: 'В работе', completed: 'Завершена' })[s] || s;
  }

  function loadRequests() {
    var wrap = $('requestsList');
    wrap.textContent = 'Загрузка…';
    var filter = $('statusFilter').value;

    if (config.mode === 'prod') {
      apiGet('admin_list_requests', filter ? { status: filter } : null)
        .then(function (data) { renderRequests(data.requests || []); })
        .catch(function (e) { wrap.textContent = 'Ошибка: ' + e.message; });
    } else {
      var list = JSON.parse(localStorage.getItem('potolki_requests') || '[]');
      if (filter) list = list.filter(function (r) { return r.status === filter; });
      renderRequests(list);
    }
  }

  function renderRequests(list) {
    var wrap = $('requestsList');
    wrap.textContent = '';
    if (!list.length) { wrap.textContent = 'Заявок нет'; return; }
    list.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'req-card';
      var details = r.details || r.details_json || [];
      if (typeof details === 'string') { try { details = JSON.parse(details); } catch (e) { details = [details]; } }
      var detailsText = Array.isArray(details) ? details.join('\n') : String(details);

      var head = document.createElement('div');
      head.className = 'req-head';
      head.innerHTML =
        '<span class="req-id">№' + esc(r.id) + ' — ' + esc(r.name) + '</span>' +
        '<span class="req-status ' + esc(r.status) + '">' + esc(statusLabel(r.status)) + '</span>';
      card.appendChild(head);

      var meta = document.createElement('div');
      meta.className = 'req-meta';
      meta.textContent = (r.created_at || '') + ' · ' + (r.phone || '') + ' · ' + Math.round(r.estimate_total || r.total || 0).toLocaleString('ru-RU') + ' ₽';
      card.appendChild(meta);

      var body = document.createElement('div');
      body.className = 'req-body';
      body.textContent = detailsText;
      card.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'req-actions';
      ['new','in_progress','completed'].forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm' + (s === r.status ? ' btn-primary' : '');
        b.textContent = statusLabel(s);
        b.disabled = s === r.status;
        b.addEventListener('click', function () { changeStatus(r, s, card); });
        actions.appendChild(b);
      });
      card.appendChild(actions);

      wrap.appendChild(card);
    });
  }

  function changeStatus(req, newStatus, card) {
    if (config.mode === 'prod') {
      apiPost('admin_update_request_status', { id: req.id, status: newStatus })
        .then(function () { req.status = newStatus; loadRequests(); })
        .catch(function (e) { alert('Ошибка: ' + e.message); });
    } else {
      var list = JSON.parse(localStorage.getItem('potolki_requests') || '[]');
      var found = list.find(function (x) { return x.id === req.id; });
      if (found) { found.status = newStatus; localStorage.setItem('potolki_requests', JSON.stringify(list)); }
      loadRequests();
    }
  }

  // ---------- Tabs ----------
  function initTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var name = tab.dataset.tab;
        $('tab-settings').hidden = name !== 'settings';
        $('tab-requests').hidden = name !== 'requests';
        if (name === 'requests') loadRequests();
      });
    });
  }

  // ---------- Авторизация (prod) ----------
  function showLogin() {
    $('loginBox').hidden = false;
    $('adminContent').hidden = true;
    $('logoutBtn').hidden = true;
  }

  function showAdmin() {
    $('loginBox').hidden = true;
    $('adminContent').hidden = false;
    $('logoutBtn').hidden = false;
  }

  function doLogin(password) {
    return apiPost('login', { password: password });
  }

  function checkAuth() {
    // Проверяем сессию без пароля — просто пробуем admin_get_settings
    return apiGet('admin_get_settings').then(function (data) { return data; });
  }

  // ---------- Старт ----------
  document.addEventListener('DOMContentLoaded', function () {
    loadBase().then(function (base) {
      baseConfig = base;

      if (base.mode === 'prod') {
        config = base;
        initTabs();

        // Пробуем проверить сессию
        checkAuth().then(function (data) {
          config = deepMerge(base, data);
          showAdmin();
          fillForm(config);
        }).catch(function (e) {
          showLogin();
        });

        $('loginForm').addEventListener('submit', function (e) {
          e.preventDefault();
          var pw = $('loginPassword').value;
          var err = $('loginError'); err.hidden = true;
          doLogin(pw).then(function () {
            return checkAuth().then(function (data) {
              config = deepMerge(base, data);
              showAdmin();
              fillForm(config);
            });
          }).catch(function (err2) {
            err.hidden = false;
            err.textContent = err2.message || 'Неверный пароль';
          });
        });

        $('logoutBtn').addEventListener('click', function () {
          apiPost('logout', {}).finally(function () { location.reload(); });
        });

      } else {
        // DEMO
        config = applyLocalOverrides(base);
        $('demoBadge').hidden = false;
        $('resetBtn').hidden = false;
        showAdmin();
        initTabs();
        fillForm(config);

        $('resetBtn').addEventListener('click', function () {
          if (!confirm('Сбросить все локальные изменения?')) return;
          localStorage.removeItem(STORAGE_KEY);
          config = deepMerge(base, {});
          fillForm(config);
          toast($('saveStatus'), 'Сброшено к config.json', true);
        });
      }

      // Общие обработчики
      $('saveBtn').addEventListener('click', saveSettings);
      $('addMaterial').addEventListener('click', function () {
        var list = collectList('materialsList', 'pricePerM2');
        list.push({ id: 'new_' + Date.now(), name: 'Новый материал', pricePerM2: 0, enabled: true });
        renderMaterials(list);
      });
      $('addProfile').addEventListener('click', function () {
        var list = collectList('profilesList', 'pricePerMeter');
        list.push({ id: 'new_' + Date.now(), name: 'Новый профиль', pricePerMeter: 0, enabled: true });
        renderProfiles(list);
      });
      $('s_messenger_template').addEventListener('input', updatePreview);
      $('refreshRequests').addEventListener('click', loadRequests);
      $('statusFilter').addEventListener('change', loadRequests);

      var fileInput = $('imageUpload');
      $('imagesList').parentElement.querySelector('.upload-label').addEventListener('click', function (e) {
        if (e.target.tagName !== 'INPUT') return;
      });
      fileInput.addEventListener('change', function () {
        handleUpload(fileInput.files);
        fileInput.value = '';
      });
    }).catch(function (err) {
      alert('Не удалось загрузить config.json: ' + err.message);
    });
  });
})();
