/* app.js — общий для demo и prod.
   Режим берётся из config.json (mode: "demo" | "prod"). */

(function () {
  'use strict';

  var STORAGE_KEY = 'potolki_overrides';
  var state = { config: null, calc: null };

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

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (!isFinite(n)) n = fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function clampNum(v, min, max, fallback) {
    var n = parseFloat(v);
    if (!isFinite(n)) n = fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  // ---------- Загрузка конфигурации ----------
  function loadBaseConfig() {
    return fetch('config.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('config.json не найден');
      return r.json();
    });
  }

  function applyDemoOverrides(base) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      var override = JSON.parse(raw);
      return deepMerge(base, override);
    } catch (e) {
      console.warn('Некорректные оверрайды в localStorage', e);
      return base;
    }
  }

  function loadProdConfig(base) {
    var url = (base.apiUrl || 'api.php') + '?action=public_config';
    return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('API недоступен (' + r.status + ')');
        return r.json();
      })
      .then(function (json) {
        if (!json || !json.ok || !json.data) throw new Error('Некорректный ответ API');
        return deepMerge(base, json.data);
      });
  }

  function loadConfig() {
    return loadBaseConfig().then(function (base) {
      if (base.mode === 'prod') return loadProdConfig(base);
      return applyDemoOverrides(base);
    });
  }

  // ---------- Калькулятор ----------
  function calcParamsFromUI() {
    return {
      length: parseFloat(document.getElementById('length').value),
      width: parseFloat(document.getElementById('width').value),
      height: parseFloat(document.getElementById('height').value),
      materialId: document.getElementById('material').value,
      profileId: document.getElementById('profile').value,
      corners: parseInt(document.getElementById('corners').value, 10) || 0,
      spotlights: parseInt(document.getElementById('spotlights').value, 10) || 0,
      chandeliers: parseInt(document.getElementById('chandeliers').value, 10) || 0,
      pipes: parseInt(document.getElementById('pipes').value, 10) || 0
    };
  }

  function validateParams(p, c) {
    var errors = [];
    if (!isFinite(p.length) || p.length < c.minLength || p.length > c.maxLength)
      errors.push('Длина: от ' + c.minLength + ' до ' + c.maxLength + ' м');
    if (!isFinite(p.width) || p.width < c.minLength || p.width > c.maxLength)
      errors.push('Ширина: от ' + c.minLength + ' до ' + c.maxLength + ' м');
    if (!isFinite(p.height) || p.height < c.minHeight || p.height > c.maxHeight)
      errors.push('Высота: от ' + c.minHeight + ' до ' + c.maxHeight + ' м');
    var area = p.length * p.width;
    if (isFinite(area) && area > c.maxArea)
      errors.push('Площадь одной комнаты не более ' + c.maxArea + ' м²');
    if (p.corners < 0 || p.corners > c.maxCorners) errors.push('Некорректное число углов');
    if (p.spotlights < 0 || p.spotlights > c.maxSpotlights) errors.push('Некорректное число светильников');
    if (p.chandeliers < 0 || p.chandeliers > c.maxChandeliers) errors.push('Некорректное число люстр');
    if (p.pipes < 0 || p.pipes > c.maxPipes) errors.push('Некорректное число обходов труб');
    var m = (c.materials || []).find(function (x) { return x.id === p.materialId && x.enabled; });
    if (!m) errors.push('Выберите материал');
    var pr = (c.profiles || []).find(function (x) { return x.id === p.profileId && x.enabled; });
    if (!pr) errors.push('Выберите профиль');
    return errors;
  }

  function calculate(p, c) {
    var material = (c.materials || []).find(function (x) { return x.id === p.materialId && x.enabled; });
    var profile = (c.profiles || []).find(function (x) { return x.id === p.profileId && x.enabled; });
    if (!material || !profile) throw new Error('Неизвестный материал/профиль');

    var area = p.length * p.width;
    var perimeter = 2 * (p.length + p.width);

    var materialCost = area * material.pricePerM2;
    var installCost = area * c.installationPricePerM2;
    var profileCost = perimeter * profile.pricePerMeter;
    var extraCorners = Math.max(0, p.corners - c.includedCorners);
    var cornerCost = extraCorners * c.extraCornerPrice;
    var spotCost = p.spotlights * c.spotlightPrice;
    var chandCost = p.chandeliers * c.chandelierPrice;
    var pipeCost = p.pipes * c.pipeBypassPrice;

    var base = materialCost + installCost + profileCost + cornerCost + spotCost + chandCost + pipeCost;

    var heightApplied = p.height > c.heightThreshold;
    var surcharge = heightApplied ? base * (c.heightSurchargePercent / 100) : 0;
    var subtotal = base + surcharge;
    var minApplied = subtotal < c.minOrder;
    var total = Math.round(Math.max(subtotal, c.minOrder));

    return {
      area: area, perimeter: perimeter,
      material: material, profile: profile,
      materialCost: materialCost, installCost: installCost, profileCost: profileCost,
      extraCorners: extraCorners, cornerCost: cornerCost,
      spotCost: spotCost, chandCost: chandCost, pipeCost: pipeCost,
      base: base, surcharge: surcharge, heightApplied: heightApplied,
      subtotal: subtotal, minApplied: minApplied, minOrder: c.minOrder,
      total: total,
      params: p
    };
  }

  // ---------- Форматирование ----------
  function fmt(n) {
    return Math.round(n).toLocaleString('ru-RU');
  }
  function fmtNum(n, digits) {
    digits = digits == null ? 2 : digits;
    return Number(n).toFixed(digits).replace('.', ',');
  }

  function buildDetailsLines(res) {
    var p = res.params;
    var lines = [];
    lines.push('Площадь: ' + fmtNum(res.area) + ' м²');
    lines.push('Периметр: ' + fmtNum(res.perimeter) + ' м');
    lines.push('Материал: ' + res.material.name + ' — ' + fmt(res.materialCost) + ' ₽');
    lines.push('Монтаж: ' + fmt(res.installCost) + ' ₽');
    lines.push('Профиль: ' + res.profile.name + ' — ' + fmt(res.profileCost) + ' ₽');
    if (res.extraCorners > 0) lines.push('Доп. углы (' + res.extraCorners + '): ' + fmt(res.cornerCost) + ' ₽');
    if (p.spotlights > 0) lines.push('Светильники (' + p.spotlights + '): ' + fmt(res.spotCost) + ' ₽');
    if (p.chandeliers > 0) lines.push('Люстры (' + p.chandeliers + '): ' + fmt(res.chandCost) + ' ₽');
    if (p.pipes > 0) lines.push('Обходы труб (' + p.pipes + '): ' + fmt(res.pipeCost) + ' ₽');
    if (res.heightApplied) lines.push('Наценка за высоту ' + fmtNum(p.height) + ' м: +' + fmt(res.surcharge) + ' ₽');
    if (res.minApplied) lines.push('Применена минимальная стоимость заказа: ' + fmt(res.minOrder) + ' ₽');
    lines.push('Итого: ' + fmt(res.total) + ' ₽');
    return lines;
  }

  function renderDetails(res) {
    var wrap = document.getElementById('detailsList');
    var p = res.params;
    var html = '';
    function row(label, value, cls) {
      return '<div class="row' + (cls ? ' ' + cls : '') + '"><span>' + escapeHtml(label) + '</span><span class="v">' + escapeHtml(value) + '</span></div>';
    }
    html += row('Площадь', fmtNum(res.area) + ' м²');
    html += row('Периметр', fmtNum(res.perimeter) + ' м');
    html += row('Материал (' + res.material.name + ')', fmt(res.materialCost) + ' ₽');
    html += row('Монтаж', fmt(res.installCost) + ' ₽');
    html += row('Профиль (' + res.profile.name + ')', fmt(res.profileCost) + ' ₽');
    if (res.extraCorners > 0) html += row('Доп. углы × ' + res.extraCorners, fmt(res.cornerCost) + ' ₽');
    if (p.spotlights > 0) html += row('Светильники × ' + p.spotlights, fmt(res.spotCost) + ' ₽');
    if (p.chandeliers > 0) html += row('Люстры × ' + p.chandeliers, fmt(res.chandCost) + ' ₽');
    if (p.pipes > 0) html += row('Обходы труб × ' + p.pipes, fmt(res.pipeCost) + ' ₽');
    if (res.heightApplied) html += row('Наценка за высоту ' + fmtNum(p.height) + ' м (+' + res.surchargePercent + '%)', '+' + fmt(res.surcharge) + ' ₽');
    if (res.minApplied) html += row('Минимальный заказ', fmt(res.minOrder) + ' ₽');
    html += row('Итого', fmt(res.total) + ' ₽', 'total');
    wrap.innerHTML = html;
    document.getElementById('totalPrice').textContent = fmt(res.total);
  }

  function recalc() {
    var c = state.config.calc;
    var p = calcParamsFromUI();
    var errors = validateParams(p, c);
    var errBox = document.getElementById('calcError');
    if (errors.length) {
      errBox.hidden = false;
      errBox.textContent = errors.join('. ');
      state.calc = null;
      return;
    }
    errBox.hidden = true;
    try {
      var res = calculate(p, c);
      res.surchargePercent = c.heightSurchargePercent;
      state.calc = res;
      renderDetails(res);
    } catch (e) {
      errBox.hidden = false;
      errBox.textContent = e.message;
      state.calc = null;
    }
  }

  // ---------- Рендер публичной страницы ----------
  function fillSelect(el, list, selectedId) {
    el.textContent = '';
    list.filter(function (x) { return x.enabled; }).forEach(function (x) {
      var o = document.createElement('option');
      o.value = x.id;
      o.textContent = x.name + ' — ' + x.pricePerM2 != null ? '' : '';
      o.textContent = x.name;
      if (x.id === selectedId) o.selected = true;
      el.appendChild(o);
    });
  }

  function renderPublic(cfg) {
    document.getElementById('companyName').textContent = cfg.company.name || '';
    document.getElementById('companyCity').textContent = cfg.company.city || '';
    document.getElementById('heroTitle').textContent = cfg.company.heroTitle || '';
    document.getElementById('heroSubtitle').textContent = cfg.company.heroSubtitle || '';
    document.getElementById('aboutText').textContent = cfg.company.about || '';
    document.getElementById('disclaimerText').textContent = cfg.company.disclaimer || '';
    document.getElementById('footerName').textContent = '© ' + (cfg.company.name || '');
    document.getElementById('openFormBtn').textContent = cfg.company.buttonText || 'Оставить заявку';

    var phoneEl = document.getElementById('contactPhone');
    phoneEl.textContent = cfg.company.phone || '';
    phoneEl.href = 'tel:' + (cfg.company.phone || '').replace(/[^+\d]/g, '');

    var emailEl = document.getElementById('contactEmail');
    emailEl.textContent = cfg.company.email || '';
    emailEl.href = 'mailto:' + (cfg.company.email || '');

    // SEO
    if (cfg.seo && cfg.seo.title) document.title = cfg.seo.title;
    var md = document.querySelector('meta[name="description"]');
    if (md && cfg.seo && cfg.seo.description) md.setAttribute('content', cfg.seo.description);

    // Селекты
    var matSel = document.getElementById('material');
    var profSel = document.getElementById('profile');
    fillSelect(matSel, cfg.calc.materials || [], (cfg.calc.materials[0] || {}).id);
    fillSelect(profSel, cfg.calc.profiles || [], (cfg.calc.profiles[0] || {}).id);

    // Значения по умолчанию
    document.getElementById('corners').value = cfg.calc.defaultCorners;
    ['corners','spotlights','chandeliers','pipes'].forEach(function (id) {
      var el = document.getElementById(id);
      el.max = cfg.calc['max' + id.charAt(0).toUpperCase() + id.slice(1)] || 999;
    });

    // Галерея
    var gallery = document.getElementById('gallery');
    var imgs = (cfg.images || []).slice().sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    if (imgs.length) {
      document.getElementById('gallerySection').hidden = false;
      gallery.textContent = '';
      imgs.forEach(function (img) {
        var fig = document.createElement('figure');
        var im = document.createElement('img');
        im.src = img.path;
        im.alt = img.alt || img.title || '';
        im.loading = 'lazy';
        fig.appendChild(im);
        gallery.appendChild(fig);
      });
    } else {
      document.getElementById('gallerySection').hidden = true;
    }

    // Слушатели
    ['length','width','height','corners','spotlights','chandeliers','pipes','material','profile'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });

    recalc();

    document.getElementById('openFormBtn').addEventListener('click', function () {
      document.getElementById('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { document.getElementById('clientName').focus(); }, 400);
    });

    document.getElementById('requestForm').addEventListener('submit', onSubmit);
  }

  // ---------- Мессенджер ----------
  function renderTemplate(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : '';
    });
  }

  function buildMessengerUrl(messenger, text) {
    var user = String(messenger.username || '').replace(/^@/, '').trim();
    if (!/^[A-Za-z0-9_.-]{2,64}$/.test(user)) {
      throw new Error('Некорректный username мессенджера в настройках');
    }
    var encoded = encodeURIComponent(text);
    if (messenger.type === 'telegram') return 'https://t.me/' + user + '?text=' + encoded;
    if (messenger.type === 'vk') return 'https://vk.me/' + user + '?text=' + encoded;
    throw new Error('Неизвестный тип мессенджера');
  }

  function buildMessage(cfg, res, name, phone) {
    var details = buildDetailsLines(res).join('\n');
    return renderTemplate(cfg.messenger.template, {
      name: name,
      phone: phone,
      price: fmt(res.total),
      details: details
    });
  }

  // ---------- Отправка ----------
  function setBusy(busy) {
    var btn = document.getElementById('submitBtn');
    btn.disabled = busy;
    btn.querySelector('.btn-label').textContent = busy ? 'Отправляем…' : 'Отправить';
  }

  function showFormError(msg) {
    var el = document.getElementById('formError');
    el.hidden = false; el.textContent = msg;
  }
  function clearFormMessages() {
    document.getElementById('formError').hidden = true;
    document.getElementById('formSuccess').hidden = true;
  }

  function validateForm() {
    var name = document.getElementById('clientName').value.trim();
    var phone = document.getElementById('clientPhone').value.trim();
    var consent = document.getElementById('consent').checked;
    if (name.length < 2) return { error: 'Укажите имя' };
    if (name.length > 100) return { error: 'Имя слишком длинное' };
    var digits = (phone.match(/\d/g) || []).length;
    if (digits < 10) return { error: 'Укажите корректный телефон (минимум 10 цифр)' };
    if (phone.length > 30) return { error: 'Телефон слишком длинный' };
    if (!consent) return { error: 'Подтвердите согласие на обработку персональных данных' };
    return { name: name, phone: phone };
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    clearFormMessages();

    if (!state.calc) {
      showFormError('Сначала проверьте параметры калькулятора');
      return;
    }
    var v = validateForm();
    if (v.error) { showFormError(v.error); return; }

    var cfg = state.config;
    var res = state.calc;
    var message = buildMessage(cfg, res, v.name, v.phone);
    var messengerUrl;
    try { messengerUrl = buildMessengerUrl(cfg.messenger, message); }
    catch (err) { showFormError(err.message); return; }

    setBusy(true);
    var promise;
    if (cfg.mode === 'prod') {
      promise = submitProd(cfg, res, v, message, messengerUrl);
    } else {
      promise = submitDemo(cfg, res, v, message, messengerUrl);
    }
    promise.finally(function () { setBusy(false); });
  }

  function submitDemo(cfg, res, v, message, messengerUrl) {
    // Сохраняем в localStorage как демо-«базу заявок»
    try {
      var key = 'potolki_requests';
      var list = JSON.parse(localStorage.getItem(key) || '[]');
      list.unshift({
        id: list.length + 1,
        uuid: uuid(),
        name: v.name, phone: v.phone,
        area: res.area, perimeter: res.perimeter,
        estimate_total: res.total,
        details: buildDetailsLines(res),
        message_text: message,
        status: 'new',
        created_at: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(list.slice(0, 200)));
    } catch (err) {
      console.warn('Не удалось сохранить демо-заявку', err);
    }
    var s = document.getElementById('formSuccess');
    s.hidden = false;
    s.textContent = 'Заявка сохранена (демо). Сейчас откроется ' +
      (cfg.messenger.type === 'telegram' ? 'Telegram' : 'VK') + '. Не забудьте отправить сообщение.';
    setTimeout(function () { window.open(messengerUrl, '_blank', 'noopener'); }, 600);
    return Promise.resolve();
  }

  function submitProd(cfg, res, v, message, messengerUrl) {
    var idem = uuid();
    var payload = {
      action: 'create_request',
      request_uuid: idem,
      name: v.name,
      phone: v.phone,
      consent: 1,
      params: res.params
    };
    return fetch(cfg.apiUrl || 'api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, json: j }; }); })
    .then(function (out) {
      if (!out.json || !out.json.ok) {
        throw new Error((out.json && out.json.error) || 'Ошибка сервера');
      }
      var data = out.json.data || {};
      var url = data.messenger_url || messengerUrl;
      var s = document.getElementById('formSuccess');
      s.hidden = false;
      s.textContent = 'Заявка №' + (data.id || '') + ' сохранена. Предварительная сумма: ' +
        fmt(data.total || res.total) + ' ₽. Сейчас откроется мессенджер.';
      setTimeout(function () { window.open(url, '_blank', 'noopener'); }, 600);
    })
    .catch(function (err) {
      showFormError('Не удалось сохранить заявку: ' + err.message);
      throw err;
    });
  }

  // ---------- Ошибки ----------
  function showFatal(msg) {
    var el = document.getElementById('calcError');
    if (el) { el.hidden = false; el.textContent = msg; }
    document.getElementById('totalPrice').textContent = '—';
  }

  // ---------- Старт ----------
  document.addEventListener('DOMContentLoaded', function () {
    loadConfig().then(function (cfg) {
      state.config = cfg;
      renderPublic(cfg);
    }).catch(function (err) {
      console.error(err);
      showFatal('Не удалось загрузить настройки: ' + err.message);
    });
  });
})();
