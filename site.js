(function () {
  const DATA_URL = 'https://api.snapvideo.co/support/site_data.json';
  const STORAGE_KEY = 'snapVideoLocale';
  const page = document.body.dataset.page;
  let siteData = null;
  let locale = 'en';

  function getPath(source, path) {
    return path.split('.').reduce((value, key) => value?.[key], source);
  }

  function resolveLocale(value, data) {
    if (!value || !data) {
      return '';
    }

    const supported = data.supportedLocales || [data.defaultLocale || 'en'];
    const aliases = data.localeAliases || {};
    const normalized = String(value).toLowerCase();
    const base = normalized.split('-')[0];
    const aliased = aliases[normalized] || aliases[base];

    if (aliased && supported.includes(aliased)) {
      return aliased;
    }

    if (supported.includes(normalized)) {
      return normalized;
    }

    if (supported.includes(base)) {
      return base;
    }

    return '';
  }

  function readStoredLocale() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return '';
    }
  }

  function writeStoredLocale(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      // Ignore storage failures in private browsing modes.
    }
  }

  function removeStoredLocale() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Ignore storage failures in private browsing modes.
    }
  }

  function detectLocale(data) {
    const params = new URLSearchParams(window.location.search);
    const requestedLocale = params.get('lang') || params.get('locale');

    if (requestedLocale) {
      return resolveLocale(requestedLocale, data) || data.defaultLocale || 'en';
    }

    const forcedLocale = resolveLocale(document.body.dataset.locale, data);

    if (forcedLocale) {
      return forcedLocale;
    }

    const storedLocale = resolveLocale(readStoredLocale(), data);

    if (storedLocale) {
      return storedLocale;
    }

    const candidates = [
      ...(navigator.languages || []),
      navigator.language,
      navigator.userLanguage
    ].filter(Boolean);

    for (const candidate of candidates) {
      const resolvedLocale = resolveLocale(candidate, data);

      if (resolvedLocale) {
        return resolvedLocale;
      }
    }

    return data.defaultLocale || 'en';
  }

  function t(path, replacements) {
    const fallbackLocale = siteData.defaultLocale || 'en';
    const value =
      getPath(siteData.locales?.[locale], path) ??
      getPath(siteData.locales?.[fallbackLocale], path) ??
      '';

    return Object.entries(replacements || {}).reduce(
      (text, entry) => text.replaceAll(`{${entry[0]}}`, entry[1]),
      String(value)
    );
  }

  function localizedValue(valueByLocale) {
    if (typeof valueByLocale === 'string') {
      return valueByLocale;
    }

    if (!valueByLocale || typeof valueByLocale !== 'object') {
      return '';
    }

    const fallbackLocale = siteData.defaultLocale || 'en';
    return valueByLocale[locale] ?? valueByLocale[fallbackLocale] ?? '';
  }

  function applyTextTranslations() {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';

    if (page) {
      document.title = t(`${page}.metaTitle`);
    }

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-attr]').forEach((element) => {
      element.dataset.i18nAttr.split(';').forEach((rule) => {
        const [attribute, key] = rule.split(':').map((part) => part.trim());

        if (attribute && key) {
          element.setAttribute(attribute, t(key));
        }
      });
    });
  }

  function versionParts(version) {
    return String(version)
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  }

  function compareVersions(a, b) {
    const left = versionParts(a);
    const right = versionParts(b);
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index += 1) {
      const diff = (left[index] || 0) - (right[index] || 0);

      if (diff !== 0) {
        return diff;
      }
    }

    return 0;
  }

  function getLatestUpdate(updates) {
    return updates.find((update) => update.version && localizedValue(update.shortcutUrl));
  }

  function setShortcutState(shortcutBtn, shortcutLabel, url) {
    shortcutBtn.classList.remove('is-loading');

    if (url) {
      shortcutBtn.href = url;
      shortcutBtn.classList.remove('is-disabled');
      shortcutBtn.removeAttribute('aria-disabled');
      shortcutLabel.textContent = t('index.buttonGetShortcut');
      return;
    }

    shortcutBtn.removeAttribute('href');
    shortcutBtn.classList.add('is-disabled');
    shortcutBtn.setAttribute('aria-disabled', 'true');
    shortcutLabel.textContent = t('index.buttonUnavailable');
  }

  function renderUpdates() {
    if (page !== 'index') {
      return;
    }

    const shortcutBtn = document.getElementById('shortcutBtn');
    const shortcutLabel = shortcutBtn.querySelector('.btn-label');
    const sheetRows = document.getElementById('sheetRows');
    const statusText = document.getElementById('statusText');
    const updates = Array.isArray(siteData.updates) ? siteData.updates : [];
    const latestUpdate = getLatestUpdate(updates);

    setShortcutState(
      shortcutBtn,
      shortcutLabel,
      latestUpdate ? localizedValue(latestUpdate.shortcutUrl) : ''
    );

    if (!updates.length) {
      sheetRows.innerHTML = `<tr class="empty-row"><td colspan="2">${t('index.updatesEmpty')}</td></tr>`;
      statusText.textContent = t('index.statusNoData');
      return;
    }

    sheetRows.innerHTML = updates.map(() => `
        <tr>
          <td><span class="ver-badge"></span></td>
          <td class="update-info"></td>
        </tr>
      `).join('');

    sheetRows.querySelectorAll('tr').forEach((row, index) => {
      const update = updates[index];
      row.querySelector('.ver-badge').textContent = update.version || '-';
      row.querySelector('.update-info').textContent = localizedValue(update.info) || '-';
    });

    statusText.textContent = latestUpdate
      ? t('index.statusLatest', { version: latestUpdate.version })
      : t('index.statusNoData');
  }

  function renderLoadError() {
    if (page !== 'index') {
      return;
    }

    const shortcutBtn = document.getElementById('shortcutBtn');
    const shortcutLabel = shortcutBtn.querySelector('.btn-label');
    const sheetRows = document.getElementById('sheetRows');
    const statusText = document.getElementById('statusText');

    sheetRows.innerHTML = `<tr class="empty-row"><td colspan="2">Unable to load data</td></tr>`;
    statusText.textContent = 'Load failed';
    shortcutBtn.classList.remove('is-loading');
    shortcutBtn.classList.add('is-disabled');
    shortcutBtn.setAttribute('aria-disabled', 'true');
    shortcutLabel.textContent = 'Unavailable';
  }

  function changeLocale(nextLocale, shouldPersist) {
    const resolvedLocale = resolveLocale(nextLocale, siteData);

    if (!resolvedLocale) {
      return false;
    }

    locale = resolvedLocale;

    if (shouldPersist) {
      writeStoredLocale(locale);
    }

    applyTextTranslations();
    renderUpdates();
    return locale;
  }

  function exposeDemoControls() {
    window.setSnapVideoLocale = (nextLocale) => changeLocale(nextLocale, true);
    window.clearSnapVideoLocale = () => {
      removeStoredLocale();
      locale = detectLocale(siteData);
      applyTextTranslations();
      renderUpdates();
      return locale;
    };
    window.getSnapVideoLocale = () => locale;
  }

  async function initSite() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-cache' });

      if (!response.ok) {
        throw new Error(`Unable to load ${DATA_URL}`);
      }

      siteData = await response.json();
      locale = detectLocale(siteData);
      applyTextTranslations();
      renderUpdates();
      exposeDemoControls();
    } catch (error) {
      renderLoadError();
    }
  }

  initSite();
})();
