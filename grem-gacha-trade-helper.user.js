// ==UserScript==
// @name         Grem Gacha Trade Helper
// @namespace    http://tampermonkey.net/
// @version      2026-02-28
// @description  optimize grem gacha trade experience
// @author       zerounit-dev
// @match        https://gremgacha.club/*
// @match        https://www.gremgacha.club/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
	'use strict';

	const elementId = 'grem-gacha-trade-helper';
	const storageKey = 'grem_gacha_trade_helper_pos_v1';
	const sizeStorageKey = 'grem_gacha_trade_helper_size_v1';
	const dataStorageKey = 'grem_gacha_trade_helper_data_v1';
	const dataVersion = 1;
	const marketStorageKey = 'grem_gacha_trade_helper_market_v1';
	const lastAccountStorageKey = 'grem_gacha_trade_helper_last_account_v1';
	const lastStreamerStorageKey = 'grem_gacha_trade_helper_last_streamer_v1';
	const lastPartnerStorageKey = 'grem_gacha_trade_helper_last_partner_v1';
	// Kept for potential future use; currently not required.
	const accountUsernameMapStorageKey = 'grem_gacha_trade_helper_account_username_map_v1';
	const debugStorageKey = 'grem_gacha_trade_helper_debug_v1';
	const heroModeStorageKey = 'grem_gacha_trade_helper_hero_mode_v1';
	const paneModeStorageKey = 'grem_gacha_trade_helper_pane_mode_v1';
	const paneCollapsedStorageKey = 'grem_gacha_trade_helper_pane_collapsed_v1';

	/* ---------------- NAV / ROUTING ---------------- */

	function isDebugEnabled() {
		try {
			return localStorage.getItem(debugStorageKey) === '1';
		} catch {
			return false;
		}
	}

	function isHeroModeEnabled() {
		try {
			return sessionStorage.getItem(heroModeStorageKey) === '1';
		} catch {
			return false;
		}
	}

	function enableHeroMode() {
		try {
			sessionStorage.setItem(heroModeStorageKey, '1');
		} catch {
			// ignore
		}
		updateHelperUi();
	}

	function disableHeroMode() {
		try {
			sessionStorage.removeItem(heroModeStorageKey);
		} catch {
			// ignore
		}
		updateHelperUi();
	}

	function debugLog(...args) {
		if (!isDebugEnabled()) return;
		console.log('[TradeHelper]', ...args);
	}

	function loadPaneModes() {
		try {
			const raw = localStorage.getItem(paneModeStorageKey);
			if (!raw) return {};
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	}

	function savePaneModes(modes) {
		try {
			localStorage.setItem(paneModeStorageKey, JSON.stringify(modes || {}));
		} catch {
			// ignore
		}
	}

	function getPaneMode(paneId) {
		const pid = String(paneId || '');
		if (!pid) return 'wishlist';
		const modes = loadPaneModes();
		const v = modes[pid];
		return v === 'duplicates' ? 'duplicates' : 'wishlist';
	}

	function setPaneMode(paneId, mode) {
		const pid = String(paneId || '');
		if (!pid) return;
		const m = mode === 'duplicates' ? 'duplicates' : 'wishlist';
		const modes = loadPaneModes();
		modes[pid] = m;
		savePaneModes(modes);
		updateHelperUi();
	}

	function loadPaneCollapsedMap() {
		try {
			const raw = localStorage.getItem(paneCollapsedStorageKey);
			if (!raw) return {};
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	}

	function savePaneCollapsedMap(map) {
		try {
			localStorage.setItem(paneCollapsedStorageKey, JSON.stringify(map || {}));
		} catch {
			// ignore
		}
	}

	function isPaneCollapsed(paneId) {
		const pid = String(paneId || '');
		if (!pid) return false;
		const map = loadPaneCollapsedMap();
		return map[pid] === 1 || map[pid] === true;
	}

	function setPaneCollapsed(paneId, collapsed) {
		const pid = String(paneId || '');
		if (!pid) return;
		const map = loadPaneCollapsedMap();
		map[pid] = collapsed ? 1 : 0;
		savePaneCollapsedMap(map);
	}

	function hookNavigation() {
		const pushState = history.pushState;
		const replaceState = history.replaceState;

		history.pushState = function () {
			pushState.apply(this, arguments);
			onRouteChange();
		};

		history.replaceState = function () {
			replaceState.apply(this, arguments);
			onRouteChange();
		};

		window.addEventListener('popstate', () => {
			onRouteChange();
		});
		window.addEventListener('hashchange', () => {
			onRouteChange();
		});
	}

	/* ---------------- STORAGE ---------------- */

	function loadData() {
		try {
			const raw = localStorage.getItem(dataStorageKey);
			if (!raw) return { version: dataVersion, scraped: {} };
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return { version: dataVersion, scraped: {} };
			if (!parsed.scraped || typeof parsed.scraped !== 'object') parsed.scraped = {};
			if (!parsed.version) parsed.version = dataVersion;
			return parsed;
		} catch (e) {
			console.warn('[TradeHelper] Failed to load stored data:', e);
			return { version: dataVersion, scraped: {} };
		}
	}

	function loadMarketData() {
		try {
			const raw = localStorage.getItem(marketStorageKey);
			if (!raw) return { version: 1, scraped: {} };
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return { version: 1, scraped: {} };
			if (!parsed.scraped || typeof parsed.scraped !== 'object') parsed.scraped = {};
			if (!parsed.version) parsed.version = 1;
			return parsed;
		} catch {
			return { version: 1, scraped: {} };
		}
	}

	function saveMarketData(data) {
		try {
			localStorage.setItem(marketStorageKey, JSON.stringify(data));
		} catch {
			// ignore
		}
	}

	function clearMarketplaceCacheForMode(mode) {
		try {
			const md = loadMarketData();
			const scraped = md && md.scraped ? md.scraped : {};
			for (const streamer of Object.keys(scraped)) {
				if (!scraped[streamer] || typeof scraped[streamer] !== 'object') continue;
				if (scraped[streamer][mode]) delete scraped[streamer][mode];
			}
			md.scraped = scraped;
			saveMarketData(md);
		} catch {
			// ignore
		}
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	let marketScrapeState = {
		running: false,
		mode: null,
		page: 0,
		total: 0,
		rows: 0,
		error: null,
		startedAt: 0
	};

	let marketUiState = {
		streamerQuery: '',
		iWantQuery: '',
		theyWantQuery: ''
	};

	function getMarketplaceStreamerNames(marketData) {
		try {
			const scraped = (marketData && marketData.scraped) || {};
			return Object.keys(scraped).sort((a, b) => a.localeCompare(b));
		} catch {
			return [];
		}
	}

	function getMarketRowGremlinKey(row) {
		const id = row && typeof row.gremlinId === 'number' ? row.gremlinId : null;
		if (id != null) return `id:${id}`;
		const name = row && row.gremlinName ? normalizeName(row.gremlinName) : '';
		return name ? `name:${name.toLowerCase()}` : '';
	}

	function getMarketRowOwner(row) {
		if (row && row.owner) return normalizeName(row.owner);
		// Back-compat with older DOM-scraped schema.
		if (row && row.kind === 'belongsTo' && row.user) return normalizeName(row.user);
		return '';
	}

	function getMarketRowWishlistedBy(row) {
		if (row && row.wishlistedBy) return normalizeName(row.wishlistedBy);
		// Back-compat: earlier versions stored the JSON field name directly.
		if (row && row.wishlisted) return normalizeName(row.wishlisted);
		// Back-compat with older DOM-scraped schema.
		if (row && row.kind === 'wishlistedBy' && row.user) return normalizeName(row.user);
		return '';
	}

	function getMarketUserForMode(row, mode) {
		if (mode === 'wishlist') return getMarketRowOwner(row);
		return getMarketRowWishlistedBy(row);
	}

	function computeMarketModeMetrics(md, mode) {
		let pages = 0;
		let rows = 0;
		let lastAt = 0;
		const users = new Set();
		const gremlins = new Set();
		const scraped = (md && md.scraped) || {};
		for (const streamerKey of Object.keys(scraped)) {
			const perStreamer = scraped[streamerKey];
			const perMode = perStreamer ? perStreamer[mode] : null;
			const pageMap = perMode && perMode.pages ? perMode.pages : null;
			if (!pageMap) continue;
			for (const k of Object.keys(pageMap)) {
				const p = pageMap[k];
				if (!p) continue;
				pages++;
				rows += p.count || 0;
				lastAt = Math.max(lastAt, p.scrapedAt || 0);
				for (const r of p.rows || []) {
					const u = getMarketUserForMode(r, mode);
					if (u) users.add(u);
					const gk = getMarketRowGremlinKey(r);
					if (gk) gremlins.add(gk);
				}
			}
		}
		return { pages, rows, users: users.size, gremlins: gremlins.size, lastAt };
	}

	function loadAccountUsernameMap() {
		try {
			const raw = localStorage.getItem(accountUsernameMapStorageKey);
			if (!raw) return {};
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	}

	function saveAccountUsernameMap(map) {
		try {
			localStorage.setItem(accountUsernameMapStorageKey, JSON.stringify(map));
		} catch {}
	}

	function rememberSelfUsernameFromUrl() {
		try {
			const accountId = getCurrentAccountId();
			if (!accountId) return;
			const m = window.location.pathname.match(/^\/user\/([^/]+)\/start-trade\/?$/);
			if (!m) return;
			const username = String(m[1] || '').trim();
			if (!username) return;
			const map = loadAccountUsernameMap();
			map[accountId] = username;
			saveAccountUsernameMap(map);
		} catch {
			// ignore
		}
	}

	function getRememberedSelfUsername() {
		try {
			const accountId = getCurrentAccountId();
			if (!accountId) return null;
			const map = loadAccountUsernameMap();
			const username = map[accountId];
			return username ? String(username) : null;
		} catch {
			return null;
		}
	}

	function saveData(data) {
		try {
			localStorage.setItem(dataStorageKey, JSON.stringify(data));
		} catch (e) {
			console.warn('[TradeHelper] Failed to save stored data:', e);
		}
	}

	function ensureUserStreamerSlot(data, username, streamer) {
		if (!data.scraped[username]) data.scraped[username] = {};
		if (!data.scraped[username][streamer]) data.scraped[username][streamer] = {};
		return data.scraped[username][streamer];
	}

	function upsertScrape(username, streamer, kind, items, sourceUrl) {
		const data = loadData();
		const slot = ensureUserStreamerSlot(data, username, streamer);
		slot[kind] = {
			scrapedAt: Date.now(),
			sourceUrl,
			count: items.length,
			items
		};
		saveData(data);
	}

	/* ---------------- URL / ROUTING ---------------- */

	function getStreamerFromUrl(url) {
		try {
			const u = url instanceof URL ? url : new URL(url, window.location.origin);
			const qsStreamer = u.searchParams.get('streamer');
			if (qsStreamer) return qsStreamer;
			const m = u.pathname.match(/^\/gremlins\/([^/]+)\/?$/);
			if (m) return m[1];
			return null;
		} catch {
			return null;
		}
	}

	function getLastKnownStreamer() {
		try {
			const raw = localStorage.getItem(lastStreamerStorageKey);
			const s = raw ? String(raw).trim() : '';
			return s || null;
		} catch {
			return null;
		}
	}

	function setLastKnownStreamer(streamer) {
		try {
			localStorage.setItem(lastStreamerStorageKey, streamer);
		} catch {}
	}

	function getCurrentStreamer() {
		const fromUrl = getStreamerFromUrl(window.location.href);
		if (fromUrl) {
			setLastKnownStreamer(fromUrl);
			return fromUrl;
		}
		return getLastKnownStreamer();
	}

	function getUsernameFromPath(pathname) {
		const m = pathname.match(/^\/user\/([^/]+)\//);
		return m ? m[1] : null;
	}

	function getLastKnownAccountId() {
		try {
			const raw = localStorage.getItem(lastAccountStorageKey);
			const a = raw ? String(raw).trim() : '';
			return a || null;
		} catch {
			return null;
		}
	}

	function setLastKnownAccountId(accountId) {
		try {
			localStorage.setItem(lastAccountStorageKey, accountId);
		} catch {}
	}

	function getAccountIdFromNav() {
		try {
			// The nav avatar uses a twitch URL like:
			// https://static-cdn.jtvnw.net/jtv_user_pictures/<uuid>-profile_image-300x300.png
			const img = document.querySelector('nav img[src*="jtv_user_pictures/"]');
			const src = img ? String(img.getAttribute('src') || '') : '';
			if (!src) return null;
			const m = src.match(/jtv_user_pictures\/([a-f0-9-]{12,})-profile_image/i);
			return m ? m[1] : null;
		} catch {
			return null;
		}
	}

	function getCurrentAccountId() {
		const fromNav = getAccountIdFromNav();
		if (fromNav) {
			setLastKnownAccountId(fromNav);
			return fromNav;
		}
		return getLastKnownAccountId();
	}

	function getSelfKey() {
		const accountId = getCurrentAccountId();
		return accountId ? `self:${accountId}` : 'self:unknown';
	}

	function getTradePartnerFromPath(pathname) {
		const m = pathname.match(/^\/user\/([^/]+)\/(collection|wishlist|start-trade)\b/);
		return m ? m[1] : null;
	}

	function getLastKnownPartner() {
		try {
			const raw = localStorage.getItem(lastPartnerStorageKey);
			const p = raw ? String(raw).trim() : '';
			return p || null;
		} catch {
			return null;
		}
	}

	function setLastKnownPartner(partnerUsername) {
		try {
			localStorage.setItem(lastPartnerStorageKey, String(partnerUsername || ''));
		} catch {}
	}

	function getProfileHeaderUsername() {
		try {
			const el = document.querySelector('h1 p.inline.font-semibold');
			return el ? normalizeName(el.textContent) : '';
		} catch {
			return '';
		}
	}

	function isPartnerTabActive(partnerUsername, tabKind) {
		try {
			const u = String(partnerUsername || '');
			if (!u) return false;
			const want = tabKind === 'wishlist' ? 'wishlist' : 'collection';
			const a = document.querySelector(`a[href^="/user/${CSS.escape(u)}/${want}"][aria-current="page"]`);
			return !!a;
		} catch {
			return false;
		}
	}

	function getPartnerPageKind(pathname) {
		const m = pathname.match(/^\/user\/[^/]+\/(collection|wishlist)\b/);
		return m ? m[1] : null;
	}

	function getPageKind(url) {
		const u = url instanceof URL ? url : new URL(url, window.location.origin);
		const pathname = u.pathname;
		let m;
		m = pathname.match(/^\/user\/[^/]+\/collection\/?$/);
		if (m) return 'collection';
		m = pathname.match(/^\/user\/[^/]+\/wishlist\/?$/);
		if (m) return 'wishlist';
		m = pathname.match(/^\/user\/[^/]+\/start-trade\/?$/);
		if (m) return 'start-trade';
		m = pathname.match(/^\/gremlins\/?$/);
		if (m) return 'gremlins';
		m = pathname.match(/^\/gremlins\/[^/]+\/?$/);
		if (m) return 'gremlins-streamer';
		m = pathname.match(/^\/marketplace\/?$/);
		if (m) return 'marketplace';
		m = pathname.match(/^\/marketplace\/search\/?$/);
		if (m) return 'marketplace-search';
		return 'other';
	}

	/* ---------------- SCRAPERS ---------------- */

	function normalizeName(name) {
		return String(name || '').replace(/\s+/g, ' ').trim();
	}

	function normalizePolicyLabel(label) {
		const l = String(label || '').toLowerCase();
		if (!l) return null;
		if (l.includes('do not trade') && (l.includes('all') || l.includes('everything'))) return 'all';
		if (l.includes('duplicate') || l.includes('dupe')) return 'dupes-only';
		if (l.includes('no restriction') || l.includes('no restrictions') || l.includes('none')) return 'none';
		if (l.includes('do not trade')) return 'all';
		return 'unknown';
	}

	function normalizeDntConfigValue(value) {
		const v = String(value || '').toLowerCase().trim();
		if (!v) return null;
		if (v === 'none') return 'none';
		if (v === 'all') return 'all';
		if (v === 'dupes' || v === 'duplicates' || v === 'dupe') return 'dupes-only';
		return 'unknown';
	}

	function getMakerName(wrapper) {
		try {
			const madeByP = Array.from(wrapper.querySelectorAll('p')).find((p) =>
				String(p.textContent || '').toLowerCase().includes('made by')
			);
			if (!madeByP) return '';
			const strong = madeByP.querySelector('.font-semibold');
			if (strong) return normalizeName(strong.textContent);
			return normalizeName(madeByP.textContent.replace(/made by/i, ''));
		} catch {
			return '';
		}
	}

	function getOwnedCount(wrapper) {
		try {
			const counter = wrapper.querySelector('p.font-counter');
			if (!counter) return null;
			const t = normalizeName(counter.textContent);
			if (!t) return null;
			const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
			return Number.isFinite(n) ? n : null;
		} catch {
			return null;
		}
	}

	function getAcquiredAt(wrapper) {
		try {
			const acquiredP = Array.from(wrapper.querySelectorAll('p')).find((p) =>
				String(p.textContent || '').toLowerCase().includes('acquired at')
			);
			if (!acquiredP) return '';
			const bold = acquiredP.querySelector('.font-bold');
			if (bold) return normalizeName(bold.textContent);
			return normalizeName(acquiredP.textContent.replace(/acquired at/i, ''));
		} catch {
			return '';
		}
	}

	function getQuoteLine(wrapper) {
		try {
			const quoteP = wrapper.querySelector('p.italic');
			return quoteP ? normalizeName(quoteP.textContent) : '';
		} catch {
			return '';
		}
	}

	function guessNameFromImageUrl(imgUrl) {
		try {
			const u = new URL(imgUrl, window.location.origin);
			const filename = u.pathname.split('/').pop() || '';
			const noExt = filename.replace(/\.(webp|png|jpg|jpeg|gif)$/i, '');
			return normalizeName(noExt.replace(/^thumb-/, ''));
		} catch {
			return '';
		}
	}

	function findGremlinPaneRootByHeader(headerText) {
		const wanted = normalizeName(headerText);
		if (!wanted) return null;
		const btn = findDisclosureButtonByHeader(wanted);
		if (!btn) return null;
		const expanded = String(btn.getAttribute('aria-expanded') || '').toLowerCase() === 'true';
		if (!expanded) return null;
		const panelId = btn.getAttribute('aria-controls');
		if (!panelId) return null;
		return document.getElementById(panelId);
	}

	function findDisclosureButtonByHeader(wantedHeader) {
		try {
			const wanted = normalizeName(wantedHeader);
			if (!wanted) return null;
			const btns = Array.from(document.querySelectorAll('button[aria-controls]'));
			for (const btn of btns) {
				const h2 = btn.querySelector('h2');
				if (!h2) continue;
				if (normalizeName(h2.textContent) === wanted) return btn;
			}
			return null;
		} catch {
			return null;
		}
	}

	function getWishlistPaneDebugInfo() {
		try {
			const btn = findDisclosureButtonByHeader('Wishlisted');
			if (!btn) return { ok: false, reason: 'Wishlisted header not found' };
			const expanded = String(btn.getAttribute('aria-expanded') || '').toLowerCase() === 'true';
			if (!expanded) return { ok: false, reason: 'Wishlisted pane not open (aria-expanded=false)' };
			const panelId = btn.getAttribute('aria-controls');
			if (!panelId) return { ok: false, reason: 'Wishlisted pane missing aria-controls' };
			const panel = document.getElementById(panelId);
			if (!panel) return { ok: false, reason: `Wishlisted panel not found (#${panelId})` };
			const idCount = panel.querySelectorAll('input[name="id"][value]').length;
			const imgCount = panel.querySelectorAll('img[src*="media.gremgacha.club"]').length;
			const nameCount = panel.querySelectorAll('p.font-semibold').length;
			if (!idCount) {
				return {
					ok: false,
					reason: `Wishlisted pane open but 0 id inputs (imgs=${imgCount}, names=${nameCount})`
				};
			}
			return { ok: true, reason: `Wishlisted pane OK (ids=${idCount}, imgs=${imgCount}, names=${nameCount})` };
		} catch (e) {
			return { ok: false, reason: `Exception: ${e && e.message ? e.message : String(e)}` };
		}
	}

	function getGremlinPaneInfoByHeader(headerText) {
		try {
			const wanted = normalizeName(headerText);
			const btn = findDisclosureButtonByHeader(wanted);
			if (!btn) return { header: wanted, found: false, open: false, count: 0 };
			const open = String(btn.getAttribute('aria-expanded') || '').toLowerCase() === 'true';
			const panelId = btn.getAttribute('aria-controls');
			const panel = panelId ? document.getElementById(panelId) : null;
			const count = open && panel ? panel.querySelectorAll('input[name="id"][value]').length : 0;
			return { header: wanted, found: true, open, count };
		} catch {
			return { header: normalizeName(headerText), found: false, open: false, count: 0 };
		}
	}

	let lastPaneCountLogKey = null;
	let lastPaneCountReadyLogKey = null;
	function logStreamerPaneCountsOnce(url) {
		try {
			const u = url instanceof URL ? url : new URL(url, window.location.origin);
			const streamer = getStreamerFromUrl(u);
			if (!streamer) return;
			const key = `${streamer}|${u.pathname}${u.search}`;
			if (lastPaneCountLogKey === key) return;
			lastPaneCountLogKey = key;

			const acquired = getGremlinPaneInfoByHeader('Acquired');
			const wishlisted = getGremlinPaneInfoByHeader('Wishlisted');
			const missing = getGremlinPaneInfoByHeader('Missing');

			const fmt = (p) => {
				if (!p.found) return 'not found';
				if (!p.open) return 'closed';
				return String(p.count);
			};

			const msg = `[TradeHelper] /gremlins/${streamer} panes: Acquired=${fmt(acquired)}, Wishlisted=${fmt(wishlisted)}, Missing=${fmt(missing)}`;
			console.log(msg);
		} catch {
			// ignore
		}
	}

	function logStreamerPaneCountsWhenReady(url) {
		try {
			const u = url instanceof URL ? url : new URL(url, window.location.origin);
			const streamer = getStreamerFromUrl(u);
			if (!streamer) return;
			const key = `${streamer}|${u.pathname}${u.search}`;
			if (lastPaneCountReadyLogKey === key) return;
			const acquired = getGremlinPaneInfoByHeader('Acquired');
			const wishlisted = getGremlinPaneInfoByHeader('Wishlisted');
			const missing = getGremlinPaneInfoByHeader('Missing');
			if (!acquired.found && !wishlisted.found && !missing.found) return;
			lastPaneCountReadyLogKey = key;
			const fmt = (p) => {
				if (!p.found) return 'not found';
				if (!p.open) return 'closed';
				return String(p.count);
			};
			console.log(
				`[TradeHelper] /gremlins/${streamer} panes (ready): Acquired=${fmt(acquired)}, Wishlisted=${fmt(wishlisted)}, Missing=${fmt(missing)}`
			);
		} catch {
			// ignore
		}
	}

	function scrapeGremlinCardsFromDom(root, boardId) {
		/** @type {Array<{id:string|null,name:string,img:string|null,action:string|null,title:string|null,board:string|null,maker:string,quote:string,acquiredAt:string,countOwned:number|null,doNotTradePolicy:string|null,doNotTradeConfigRaw:string|null}>} */
		const items = [];
		const seen = new Set();

		const scope = root || document;
		const idInputs = Array.from(scope.querySelectorAll('input[name="id"][value]'));
		for (const input of idInputs) {
			const wrapper = input.closest('div.relative') || input.closest('div');
			if (!wrapper) continue;
			if (seen.has(wrapper)) continue;
			seen.add(wrapper);

			const imgEl = wrapper.querySelector('img');
			const img = imgEl ? (imgEl.currentSrc || imgEl.src || null) : null;
			if (img && !String(img).includes('media.gremgacha.club')) {
				// Avoid grabbing unrelated forms/inputs.
				continue;
			}

			const rawId = input.getAttribute('value');
			const id = rawId ? String(rawId).trim() : null;

			const actionInput = wrapper.querySelector('input[name="action"][value]');
			const action = actionInput ? String(actionInput.getAttribute('value') || '').trim() : null;
			const actionButton = actionInput ? actionInput.closest('form')?.querySelector('button[title]') : null;
			const title = actionButton ? String(actionButton.getAttribute('title') || '').trim() : null;
			const configInput = wrapper.querySelector('input[name="config"][value]');
			const doNotTradeConfigRaw = configInput ? String(configInput.getAttribute('value') || '').trim() : null;
			const doNotTradePolicy = doNotTradeConfigRaw ? normalizeDntConfigValue(doNotTradeConfigRaw) : null;

			let name = '';
			const nameEl = wrapper.querySelector('p.font-semibold');
			if (nameEl) name = normalizeName(nameEl.textContent);
			if (!name && img) name = guessNameFromImageUrl(img);
			const maker = getMakerName(wrapper);
			const quote = getQuoteLine(wrapper);
			const acquiredAt = getAcquiredAt(wrapper);
			const countOwned = getOwnedCount(wrapper);

			if (!id && !name) continue;
			items.push({
				id,
				name,
				img,
				action,
				title,
				board: boardId || null,
				maker,
				quote,
				acquiredAt,
				countOwned,
				doNotTradePolicy,
				doNotTradeConfigRaw
			});
		}

		return items;
	}

	function scrapeGremlinCardsFromGrid(root, streamerId) {
		/** @type {Array<{id:string|null,name:string,img:string|null,action:string|null,title:string|null,board:string|null,maker:string,quote:string,acquiredAt:string,countOwned:number|null,doNotTradePolicy:string|null,doNotTradeConfigRaw:string|null}>} */
		const items = [];
		const scope = root || document;
		const imgs = Array.from(scope.querySelectorAll('img[src*="media.gremgacha.club"]'));
		const seen = new Set();

		for (const imgEl of imgs) {
			const wrapper = imgEl.closest('div.relative') || imgEl.closest('div');
			if (!wrapper) continue;
			if (seen.has(wrapper)) continue;
			seen.add(wrapper);

			const img = imgEl.currentSrc || imgEl.src || null;
			let name = '';
			const nameEl = wrapper.querySelector('p.font-semibold');
			if (nameEl) name = normalizeName(nameEl.textContent);
			if (!name && img) name = guessNameFromImageUrl(img);
			if (!name && !img) continue;

			items.push({
				id: null,
				name,
				img,
				action: null,
				title: null,
				board: streamerId || null,
				maker: getMakerName(wrapper),
				quote: getQuoteLine(wrapper),
				acquiredAt: getAcquiredAt(wrapper),
				countOwned: getOwnedCount(wrapper),
				doNotTradePolicy: null,
				doNotTradeConfigRaw: null
			});
		}

		return items;
	}

	function findPartnerGridByHeading(headingText) {
		const wanted = normalizeName(headingText);
		if (!wanted) return null;
		const h2 = Array.from(document.querySelectorAll('h2')).find((el) => normalizeName(el.textContent) === wanted);
		if (!h2) return null;
		const headingDiv = h2.closest('div');
		if (!headingDiv) return null;
		const grid = headingDiv.nextElementSibling;
		if (!grid) return null;
		return grid;
	}

	function scrapePartnerCollectionAndStore(url, partnerUsername) {
		const u = url instanceof URL ? url : new URL(url, window.location.origin);
		const streamer = u.searchParams.get('streamer');
		if (!streamer) return false;
		// Guard against SPA transition or mismatched content.
		const headerUser = getProfileHeaderUsername();
		if (headerUser && headerUser.toLowerCase() !== String(partnerUsername).toLowerCase()) return false;
		if (!isPartnerTabActive(partnerUsername, 'collection')) return false;
		const upHeading = 'Up for trade';
		const naHeading = 'Not available';

		const upGrid = findPartnerGridByHeading(upHeading);
		const naGrid = findPartnerGridByHeading(naHeading);

		const upItems = upGrid ? scrapeGremlinCardsFromGrid(upGrid, streamer) : [];
		const naItems = naGrid ? scrapeGremlinCardsFromGrid(naGrid, streamer) : [];

		if (!upItems.length && !naItems.length) return false;

		upsertScrape(partnerUsername, streamer, 'inventory', upItems, u.href);
		upsertScrape(partnerUsername, streamer, 'inventoryNotAvailable', naItems, u.href);
		debugLog(`Scraped partner collection for ${partnerUsername} (${streamer}): up=${upItems.length}, na=${naItems.length}`);
		return true;
	}

	function scrapePartnerWishlistAndStore(url, partnerUsername) {
		const u = url instanceof URL ? url : new URL(url, window.location.origin);
		const streamer = u.searchParams.get('streamer');
		if (!streamer) return false;
		// Guard against SPA transition or mismatched content.
		const headerUser = getProfileHeaderUsername();
		if (headerUser && headerUser.toLowerCase() !== String(partnerUsername).toLowerCase()) return false;
		if (!isPartnerTabActive(partnerUsername, 'wishlist')) return false;

		// Explicit empty state.
		const emptyEl = Array.from(document.querySelectorAll('p.text-xl')).find((p) =>
			String(p.textContent || '').toLowerCase().includes("hasn't wishlisted anything")
		);
		if (emptyEl) {
			upsertScrape(partnerUsername, streamer, 'wishlist', [], u.href);
			debugLog(`Scraped partner wishlist empty for ${partnerUsername} (${streamer})`);
			return true;
		}

		// If collection headings are still present, we're likely seeing stale collection DOM.
		if (findPartnerGridByHeading('Up for trade') || findPartnerGridByHeading('Not available')) return false;

		const main = document.querySelector('main') || document;
		const items = scrapeGremlinCardsFromGrid(main, streamer);
		if (!items.length) return false;
		upsertScrape(partnerUsername, streamer, 'wishlist', items, u.href);
		debugLog(`Scraped partner wishlist for ${partnerUsername} (${streamer}):`, items.length);
		return true;
	}

	/* ---------------- MARKETPLACE ---------------- */

	function getMarketplaceSearchType(url) {
		try {
			const u = url instanceof URL ? url : new URL(url, window.location.origin);
			const t = String(u.searchParams.get('searchType') || '').trim();
			if (t === 'wishlist' || t === 'tradeable') return t;
			return null;
		} catch {
			return null;
		}
	}

	function getMarketplacePageNumber(url) {
		try {
			const u = url instanceof URL ? url : new URL(url, window.location.origin);
			const p = parseInt(String(u.searchParams.get('page') || '1'), 10);
			return Number.isFinite(p) && p > 0 ? p : 1;
		} catch {
			return 1;
		}
	}

	function upsertMarketplacePage(streamer, searchType, page, rows, sourceUrl) {
		const data = loadMarketData();
		if (!data.scraped[streamer]) data.scraped[streamer] = {};
		if (!data.scraped[streamer][searchType]) data.scraped[streamer][searchType] = { pages: {} };
		if (!data.scraped[streamer][searchType].pages) data.scraped[streamer][searchType].pages = {};
		data.scraped[streamer][searchType].pages[String(page)] = {
			scrapedAt: Date.now(),
			sourceUrl,
			count: rows.length,
			rows
		};
		saveMarketData(data);
	}

	function computeMarketplaceMutualRowsWithFilters(marketData, filters) {
		const streamerQ = normalizeName(filters && filters.streamerQuery ? filters.streamerQuery : '').toLowerCase();
		const iWantQ = normalizeName(filters && filters.iWantQuery ? filters.iWantQuery : '').toLowerCase();
		const theyWantQ = normalizeName(filters && filters.theyWantQuery ? filters.theyWantQuery : '').toLowerCase();
		/** @type {Map<string, Set<string>>} */
		const iWantFrom = new Map();
		/** @type {Map<string, Set<string>>} */
		const theyWantFromMe = new Map();
		/** @type {Map<string, Map<string, {name:string,img:string|null}>>} */
		const gremlinsByKey = new Map();

		function add(dirMap, key, gremlinKey, gremlinName, gremlinImg) {
			if (!dirMap.has(key)) dirMap.set(key, new Set());
			dirMap.get(key).add(gremlinKey);
			if (!gremlinsByKey.has(key)) gremlinsByKey.set(key, new Map());
			const gmap = gremlinsByKey.get(key);
			if (!gmap.has(gremlinKey)) gmap.set(gremlinKey, { name: gremlinName, img: gremlinImg || null });
		}

		const scraped = (marketData && marketData.scraped) || {};
		for (const streamer of Object.keys(scraped)) {
			if (streamerQ && String(streamer).toLowerCase() !== streamerQ) continue;
			const perStreamer = scraped[streamer];
			if (!perStreamer) continue;

			// wishlist mode: owner has gremlin I want
			const wishPages = perStreamer.wishlist && perStreamer.wishlist.pages ? perStreamer.wishlist.pages : null;
			if (wishPages) {
				for (const pk of Object.keys(wishPages)) {
					const p = wishPages[pk];
					for (const row of (p && p.rows) || []) {
						const owner = getMarketRowOwner(row).toLowerCase();
						if (!owner) continue;
						const name = row && row.gremlinName ? String(row.gremlinName) : '';
						const nameKey = name ? name.toLowerCase() : '';
						const gk = getMarketRowGremlinKey(row) || `name:${nameKey}`;
						add(iWantFrom, `${streamer}::${owner}`, gk, name, row.gremlinImg);
					}
				}
			}

			// tradeable mode: wishlistedBy wants something I have
			const tradPages = perStreamer.tradeable && perStreamer.tradeable.pages ? perStreamer.tradeable.pages : null;
			if (tradPages) {
				for (const pk of Object.keys(tradPages)) {
					const p = tradPages[pk];
					for (const row of (p && p.rows) || []) {
						const wishlister = getMarketRowWishlistedBy(row).toLowerCase();
						if (!wishlister) continue;
						const name = row && row.gremlinName ? String(row.gremlinName) : '';
						const nameKey = name ? name.toLowerCase() : '';
						const gk = getMarketRowGremlinKey(row) || `name:${nameKey}`;
						add(theyWantFromMe, `${streamer}::${wishlister}`, gk, name, row.gremlinImg);
					}
				}
			}
		}

		function keyMatchesSideQuery(key, side, query) {
			if (!query) return true;
			const gmap = gremlinsByKey.get(key);
			if (!gmap) return false;
			const set = side === 'theyWant' ? (theyWantFromMe.get(key) || new Set()) : (iWantFrom.get(key) || new Set());
			for (const gk of set) {
				const meta = gmap.get(gk);
				const n = meta && meta.name ? String(meta.name).toLowerCase() : '';
				if (n && n.includes(query)) return true;
			}
			return false;
		}

		/** @type {Array<{user:string, streamer:string, mutual:number, iWant:number, theyWant:number, href:string}>} */
		const out = [];
		for (const [key, iWantSet] of iWantFrom.entries()) {
			const theyWantSet = theyWantFromMe.get(key);
			if (!theyWantSet) continue;
			const iWant = iWantSet.size;
			const theyWant = theyWantSet.size;
			if (!iWant || !theyWant) continue;
			// Side-specific collectable filters.
			if (iWantQ && !keyMatchesSideQuery(key, 'iWant', iWantQ)) continue;
			if (theyWantQ && !keyMatchesSideQuery(key, 'theyWant', theyWantQ)) continue;
			const mutual = Math.min(iWant, theyWant);
			const [streamer, user] = key.split('::');
			out.push({
				user,
				streamer,
				mutual,
				iWant,
				theyWant,
				href: `/user/${encodeURIComponent(user)}/collection?streamer=${encodeURIComponent(streamer)}`
			});
		}
		// Prefer "balanced" mutual interest: maximize the limiting side, then prefer smaller gaps.
		out.sort((a, b) =>
			(b.mutual - a.mutual) ||
			(Math.abs(a.iWant - a.theyWant) - Math.abs(b.iWant - b.theyWant)) ||
			((b.iWant + b.theyWant) - (a.iWant + a.theyWant)) ||
			a.user.localeCompare(b.user)
		);
		return out;
	}

	function getMarketplaceMutualCollectableNamesBySide(marketData, streamerQuery, side, limit) {
		const streamerQ = normalizeName(streamerQuery || '').toLowerCase();
		const max = typeof limit === 'number' ? limit : 2000;
		/** @type {Map<string, Set<string>>} */
		const iWantFrom = new Map();
		/** @type {Map<string, Set<string>>} */
		const theyWantFromMe = new Map();
		/** @type {Map<string, Map<string, string>>} */
		const nameByKey = new Map();

		function add(dirMap, key, gremlinKey, gremlinName) {
			if (!dirMap.has(key)) dirMap.set(key, new Set());
			dirMap.get(key).add(gremlinKey);
			if (!nameByKey.has(key)) nameByKey.set(key, new Map());
			const m = nameByKey.get(key);
			if (!m.has(gremlinKey) && gremlinName) m.set(gremlinKey, gremlinName);
		}

		const scraped = (marketData && marketData.scraped) || {};
		for (const streamer of Object.keys(scraped)) {
			if (streamerQ && String(streamer).toLowerCase() !== streamerQ) continue;
			const perStreamer = scraped[streamer];
			if (!perStreamer) continue;

			const wishPages = perStreamer.wishlist && perStreamer.wishlist.pages ? perStreamer.wishlist.pages : null;
			if (wishPages) {
				for (const pk of Object.keys(wishPages)) {
					const p = wishPages[pk];
					for (const row of (p && p.rows) || []) {
						const owner = getMarketRowOwner(row).toLowerCase();
						if (!owner) continue;
						const name = row && row.gremlinName ? normalizeName(row.gremlinName) : '';
						const gk = getMarketRowGremlinKey(row);
						if (!gk) continue;
						add(iWantFrom, `${streamer}::${owner}`, gk, name);
					}
				}
			}

			const tradPages = perStreamer.tradeable && perStreamer.tradeable.pages ? perStreamer.tradeable.pages : null;
			if (tradPages) {
				for (const pk of Object.keys(tradPages)) {
					const p = tradPages[pk];
					for (const row of (p && p.rows) || []) {
						const wishlister = getMarketRowWishlistedBy(row).toLowerCase();
						if (!wishlister) continue;
						const name = row && row.gremlinName ? normalizeName(row.gremlinName) : '';
						const gk = getMarketRowGremlinKey(row);
						if (!gk) continue;
						add(theyWantFromMe, `${streamer}::${wishlister}`, gk, name);
					}
				}
			}
		}

		const out = new Set();
		for (const [key, iWantSet] of iWantFrom.entries()) {
			const theyWantSet = theyWantFromMe.get(key);
			if (!theyWantSet) continue;
			if (!iWantSet.size || !theyWantSet.size) continue;
			const names = nameByKey.get(key);
			const wantSet = side === 'theyWant' ? theyWantSet : iWantSet;
			for (const gk of wantSet) {
				const n = names && names.get(gk) ? names.get(gk) : '';
				if (n) out.add(n);
				if (out.size >= max) return Array.from(out).sort((a, b) => a.localeCompare(b));
			}
		}
		return Array.from(out).sort((a, b) => a.localeCompare(b));
	}

	function getMarketplaceGremlinNamesForAutocomplete(marketData, limit) {
		const max = typeof limit === 'number' ? limit : 2000;
		const names = new Set();
		const scraped = (marketData && marketData.scraped) || {};
		for (const streamer of Object.keys(scraped)) {
			const perStreamer = scraped[streamer];
			if (!perStreamer) continue;
			for (const mode of ['wishlist', 'tradeable']) {
				const pages = perStreamer[mode] && perStreamer[mode].pages ? perStreamer[mode].pages : null;
				if (!pages) continue;
				for (const pk of Object.keys(pages)) {
					const p = pages[pk];
					for (const row of (p && p.rows) || []) {
						const n = row && row.gremlinName ? normalizeName(row.gremlinName) : '';
						if (!n) continue;
						names.add(n);
						if (names.size >= max) return Array.from(names).sort((a, b) => a.localeCompare(b));
					}
				}
			}
		}
		return Array.from(names).sort((a, b) => a.localeCompare(b));
	}

	function extractGremlinsPage(payload) {
		if (!payload) return null;
		if (payload.gremlins && typeof payload.gremlins === 'object') return payload.gremlins;
		if (
			Object.prototype.hasOwnProperty.call(payload, 'results') &&
			Object.prototype.hasOwnProperty.call(payload, 'count')
		) {
			return payload;
		}
		return null;
	}

	function resultsToMarketplaceRows(results) {
		/** @type {Array<{streamer:string, gremlinId:number|null, gremlinName:string, gremlinImg:string|null, maker:string, owner:string, wishlistedBy:string}>} */
		const rows = [];
		for (const r of results || []) {
			const g = r && r.gremlin ? r.gremlin : null;
			const streamer = g && g.streamer && g.streamer.username ? String(g.streamer.username) : '';
			if (!streamer) continue;
			const gremlinId = g && typeof g.id === 'number' ? g.id : null;
			const gremlinName = g && g.name ? String(g.name) : '';
			const maker = g && g.author ? String(g.author) : '';
			const thumbPath = g && g.image_thumbnail ? String(g.image_thumbnail) : '';
			const gremlinImg = thumbPath ? `https://media.gremgacha.club/${thumbPath}` : null;
			const owner = r && r.user && r.user.display_name ? String(r.user.display_name) : '';
			const other = r && typeof r.wishlisted === 'string' ? String(r.wishlisted) : '';
			rows.push({ streamer, gremlinId, gremlinName, gremlinImg, maker, owner, wishlistedBy: other });
		}
		return rows;
	}

	async function scrapeMarketplaceAllPages(searchType) {
		if (!isHeroModeEnabled()) return;
		if (marketScrapeState.running) return;
		clearMarketplaceCacheForMode(searchType);
		marketScrapeState = { running: true, mode: searchType, page: 0, total: 0, rows: 0, error: null, startedAt: Date.now() };
		updateHelperUi();
		try {
			let pageIndex = 1;
			let total = 0;
			let inferredStreamer = null;
			let hasNext = true;

			while (hasNext) {
				marketScrapeState.page = pageIndex;
				updateHelperUi();
				const pageUrl = new URL('/marketplace/search', window.location.origin);
				pageUrl.searchParams.set('searchType', searchType);
				pageUrl.searchParams.set('page', String(pageIndex));
				pageUrl.searchParams.set('_data', 'routes/marketplace.search');

				const res = await fetch(pageUrl.toString(), { credentials: 'include' });
				if (!res.ok) throw new Error(`HTTP ${res.status} on ${pageUrl.toString()}`);
				const payload = await res.json();
				const pageObj = extractGremlinsPage(payload);
				if (!pageObj) throw new Error('Unexpected marketplace JSON shape');

				if (!total) total = pageObj.count || 0;
				if (!inferredStreamer && pageObj.results && pageObj.results[0] && pageObj.results[0].gremlin && pageObj.results[0].gremlin.streamer) {
					inferredStreamer = String(pageObj.results[0].gremlin.streamer.username || '');
				}
				marketScrapeState.total = total;

				const rows = resultsToMarketplaceRows(pageObj.results || []);
				marketScrapeState.rows += rows.length;
				updateHelperUi();
				// Store per streamer (in case results ever span multiple).
				const byStreamer = new Map();
				for (const r of rows) {
					if (!r.streamer) continue;
					if (!byStreamer.has(r.streamer)) byStreamer.set(r.streamer, []);
					byStreamer.get(r.streamer).push(r);
				}
				if (!byStreamer.size && inferredStreamer) byStreamer.set(inferredStreamer, []);
				for (const [s, rs] of byStreamer.entries()) {
					upsertMarketplacePage(s, searchType, pageIndex, rs, pageUrl.toString());
				}
				hasNext = !!pageObj.next;
				pageIndex++;
				if (hasNext) await sleep(10);
			}
		} catch (e) {
			marketScrapeState.error = e && e.message ? e.message : String(e);
		} finally {
			marketScrapeState.running = false;
			updateHelperUi();
		}
	}

	function scrapeGremlinsIndexAndStore(u, selfKey) {
		// /gremlins contains multiple sub-board sections. Each has an id matching the board name.
		const boardEls = Array.from(document.querySelectorAll('div[id]'));
		let wroteAny = false;
		for (const el of boardEls) {
			const boardId = String(el.getAttribute('id') || '').trim();
			if (!boardId) continue;
			// Only treat it as a board section if it contains dnt config forms.
			const hasDnt = !!el.querySelector('form[action="/gremlins"] input[name="action"][value="dnt"]');
			if (!hasDnt) continue;
			const items = scrapeGremlinCardsFromDom(el, boardId);
			if (!items.length) continue;
			upsertScrape(selfKey, boardId, 'inventory', items, u.href);
			wroteAny = true;
		}
		return wroteAny;
	}

	function scrapeAndStoreIfApplicable(url) {
		const pageKind = getPageKind(url);
		if (pageKind !== 'gremlins' && pageKind !== 'gremlins-streamer' && pageKind !== 'collection' && pageKind !== 'wishlist' && pageKind !== 'start-trade') {
			return false;
		}

		if (pageKind === 'start-trade') {
			return false;
		}

		if (pageKind === 'collection' || pageKind === 'wishlist') {
			const u = url instanceof URL ? url : new URL(url, window.location.origin);
			const partner = getUsernameFromPath(u.pathname);
			if (!partner) return false;
			// Always store partner pages by username to avoid collisions/overwrites.
			if (pageKind === 'collection') return scrapePartnerCollectionAndStore(u, partner);
			return scrapePartnerWishlistAndStore(u, partner);
		}

		const u = url instanceof URL ? url : new URL(url, window.location.origin);
		let streamer = getStreamerFromUrl(u) || '_global';
		const selfKey = getSelfKey();

		if (pageKind === 'gremlins') {
			const ok = scrapeGremlinsIndexAndStore(u, selfKey);
			if (ok) debugLog('Scraped inventory from /gremlins');
			return ok;
		}

		if (!streamer || streamer === '_global') return false;
		setLastKnownStreamer(streamer);
		const wishlistedRoot = findGremlinPaneRootByHeader('Wishlisted');
		if (!wishlistedRoot) {
			// Some streamer pages omit the Wishlisted pane entirely when empty.
			// If we can see other panes, treat it as an empty wishlist and persist that.
			const hasAcquired = !!findDisclosureButtonByHeader('Acquired');
			const hasMissing = !!findDisclosureButtonByHeader('Missing');
			if (hasAcquired || hasMissing) {
				upsertScrape(selfKey, streamer, 'wishlist', [], u.href);
				debugLog(`Scraped wishlist empty for ${selfKey} (${streamer}) (Wishlisted pane missing)`);
				return true;
			}
			const info = getWishlistPaneDebugInfo();
			debugLog('Wishlist scrape blocked:', info.reason);
			return false;
		}
		const items = scrapeGremlinCardsFromDom(wishlistedRoot, streamer);
		if (!items.length) return false;
		upsertScrape(selfKey, streamer, 'wishlist', items, u.href);
		debugLog(`Scraped wishlist for ${selfKey} (${streamer}):`, items.length);
		return true;
	}

	function runScrapeAttempts(url) {
		const pageKind = getPageKind(url);
		const shouldAttemptScrape =
			pageKind === 'gremlins-streamer' ||
			pageKind === 'gremlins' ||
			pageKind === 'collection' ||
			pageKind === 'wishlist';
		if (!shouldAttemptScrape) {
			updateHelperUi({ attempts: 0, maxAttempts: 0, lastReason: '', pageKind });
			return;
		}
		const maxAttempts =
			pageKind === 'gremlins-streamer'
				? 80
				: pageKind === 'collection'
					? 40
					: 30;
		const delayMs = pageKind === 'gremlins-streamer' ? 500 : 250;
		let attempts = 0;
		let lastReason = '';

		const tryScrape = () => {
			attempts++;
			if (attempts === 1 && pageKind === 'gremlins-streamer') logStreamerPaneCountsOnce(url);
			if (pageKind === 'gremlins-streamer') logStreamerPaneCountsWhenReady(url);
			const ok = scrapeAndStoreIfApplicable(url);
			if (!ok && isDebugEnabled() && pageKind === 'gremlins-streamer') {
				const info = getWishlistPaneDebugInfo();
				lastReason = info.reason;
				if (attempts === 1 || attempts % 10 === 0) {
					debugLog(`Wishlist attempts: ${attempts}/${maxAttempts} - ${lastReason}`);
				}
			}
			updateHelperUi({ attempts, maxAttempts, lastReason, pageKind });
			if (ok) return;
			if (attempts >= maxAttempts) {
				if (isDebugEnabled() && lastReason) debugLog('Stopped scraping:', lastReason);
				return;
			}
			setTimeout(tryScrape, delayMs);
		};
		setTimeout(tryScrape, 0);
	}

	/* ---------------- HELPER UI ---------------- */

	let helperEl = null;
	let helperRefs = null;

	function formatAgeShort(ts) {
		if (!ts || !Number.isFinite(ts)) return 'unknown';
		const ageMs = Date.now() - ts;
		if (ageMs < 0) return 'just now';
		const s = Math.floor(ageMs / 1000);
		if (s < 10) return 'just now';
		if (s < 60) return `${s}s ago`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	}

	function setScrapeBlock(block, scrape) {
		if (!block) return;
		if (!scrape) {
			block.countMainEl.textContent = '--';
			if (block.countUnitEl) block.countUnitEl.textContent = '';
			block.countExtraEl.textContent = '';
			block.countExtraEl.style.display = 'none';
			block.ageEl.textContent = 'not scraped';
			return;
		}
		block.countMainEl.textContent = String(scrape.count ?? 0);
		if (block.countUnitEl) block.countUnitEl.textContent = 'collectables';
		block.countExtraEl.textContent = '';
		block.countExtraEl.style.display = 'none';
		block.ageEl.textContent = `as of ${formatAgeShort(scrape.scrapedAt)}`;
	}

	function sumQuantity(items) {
		if (!Array.isArray(items)) return 0;
		let total = 0;
		for (const it of items) {
			const n = it && Number.isFinite(it.countOwned) ? it.countOwned : 1;
			total += n;
		}
		return total;
	}

	function setPartnerCollectionBlock(block, availableScrape, notAvailableScrape) {
		if (!block) return;
		if (!availableScrape && !notAvailableScrape) {
			block.countMainEl.textContent = '--';
			block.countExtraEl.textContent = '';
			block.countExtraEl.style.display = 'none';
			block.ageEl.textContent = 'not scraped';
			return;
		}
		const availQty = availableScrape ? sumQuantity(availableScrape.items) : 0;
		const naQty = notAvailableScrape ? sumQuantity(notAvailableScrape.items) : 0;
		block.countMainEl.textContent = String(availQty);
		if (block.countUnitEl) block.countUnitEl.textContent = 'collectables';
		block.countExtraEl.textContent = naQty ? `${naQty} unavailable` : '';
		block.countExtraEl.style.display = naQty ? 'block' : 'none';
		block.ageEl.textContent = `as of ${formatAgeShort((availableScrape || notAvailableScrape).scrapedAt)}`;
	}

	function createScrapeBlock(label) {
		const root = document.createElement('div');
		Object.assign(root.style, {
			display: 'flex',
			flexDirection: 'column',
			gap: '2px',
			padding: '8px',
			border: '1px solid rgba(0,0,0,0.15)',
			borderRadius: '10px',
			background: 'rgba(255,255,255,0.65)',
			transition: 'background 120ms ease'
		});

		root.addEventListener('mouseenter', () => {
			if (root.dataset.thDisabled === '1') return;
			root.style.background = 'rgba(255,255,255,0.85)';
		});
		root.addEventListener('mouseleave', () => {
			root.style.background = 'rgba(255,255,255,0.65)';
		});

		const labelEl = document.createElement('div');
		labelEl.textContent = label;
		Object.assign(labelEl.style, {
			fontSize: '12px',
			letterSpacing: '0.02em',
			textTransform: 'uppercase',
			color: 'rgba(0,0,0,0.65)'
		});

		const countEl = document.createElement('div');
		Object.assign(countEl.style, {
			display: 'flex',
			alignItems: 'baseline',
			gap: '6px'
		});
		const countMainEl = document.createElement('span');
		countMainEl.textContent = '--';
		Object.assign(countMainEl.style, {
			fontSize: '22px',
			fontWeight: '700',
			lineHeight: '1.1'
		});
		const countUnitEl = document.createElement('span');
		countUnitEl.textContent = '';
		Object.assign(countUnitEl.style, {
			fontSize: '12px',
			fontWeight: '500',
			color: 'rgba(0,0,0,0.65)'
		});
		const countExtraEl = document.createElement('span');
		countExtraEl.textContent = '';
		Object.assign(countExtraEl.style, {
			fontSize: '12px',
			color: '#b00020',
			textDecoration: 'line-through',
			display: 'none'
		});
		countEl.appendChild(countMainEl);
		countEl.appendChild(countUnitEl);

		const ageEl = document.createElement('div');
		ageEl.textContent = 'not scraped';
		Object.assign(ageEl.style, {
			fontSize: '12px',
			color: 'rgba(0,0,0,0.55)'
		});

		root.appendChild(labelEl);
		root.appendChild(countEl);
		root.appendChild(countExtraEl);
		root.appendChild(ageEl);

		return { root, labelEl, countEl, countMainEl, countUnitEl, countExtraEl, ageEl };
	}

	function createUi() {
		const el = document.createElement('div');
		el.id = elementId;

		Object.assign(el.style, {
			position: 'fixed',
			top: '0',
			right: '0',
			width: '22em',
			height: '100vh',
			overflow: 'auto',
			borderLeft: '4px solid black',
			borderTop: '0',
			borderRight: '0',
			borderBottom: '0',
			borderRadius: '0',
			background: 'rgba(255,255,255,0.92)',
			zIndex: '2147483647',
			boxSizing: 'border-box',
			padding: '10px 10px 14px 10px',
			color: '#000',
			fontFamily: 'system-ui, Segoe UI, Roboto, Arial, sans-serif',
			fontSize: '14px',
			userSelect: 'none',
			cursor: 'default'
		});

		const resizeHandle = document.createElement('div');
		resizeHandle.dataset.thResizeHandle = '1';
		Object.assign(resizeHandle.style, {
			position: 'absolute',
			left: '0',
			top: '0',
			height: '100%',
			width: '10px',
			cursor: 'col-resize',
			background: 'linear-gradient(to right, rgba(0,0,0,0.08), rgba(0,0,0,0))'
		});
		el.appendChild(resizeHandle);

		const headerEl = document.createElement('div');
		Object.assign(headerEl.style, {
			display: 'flex',
			flexDirection: 'column',
			gap: '2px',
			marginBottom: '10px',
			cursor: 'default'
		});

		const titleEl = document.createElement('div');
		titleEl.textContent = 'Trade Helper';
		Object.assign(titleEl.style, {
			fontWeight: '800',
			fontSize: '14px',
			letterSpacing: '0.02em',
			marginBottom: '2px'
		});

		const youNameEl = document.createElement('div');
		Object.assign(youNameEl.style, {
			fontSize: '13px',
			fontWeight: '700'
		});

		const pageEl = document.createElement('div');
		Object.assign(pageEl.style, {
			fontSize: '12px',
			color: 'rgba(0,0,0,0.65)'
		});

		const streamerEl = document.createElement('div');
		Object.assign(streamerEl.style, {
			fontSize: '12px',
			color: 'rgba(0,0,0,0.65)'
		});

		const youGrid = document.createElement('div');
		Object.assign(youGrid.style, {
			display: 'grid',
			gridTemplateColumns: '1fr 1fr',
			gap: '8px'
		});

		const youCollection = createScrapeBlock('Collection');
		const youWishlist = createScrapeBlock('Wishlist');
		youGrid.appendChild(youCollection.root);
		youGrid.appendChild(youWishlist.root);

		const partnerSection = document.createElement('div');
		Object.assign(partnerSection.style, {
			marginTop: '10px',
			paddingTop: '10px',
			borderTop: '1px solid rgba(0,0,0,0.15)',
			display: 'none'
		});

		const partnerNameEl = document.createElement('div');
		Object.assign(partnerNameEl.style, {
			fontSize: '13px',
			fontWeight: '700',
			marginBottom: '8px'
		});

		const partnerGrid = document.createElement('div');
		Object.assign(partnerGrid.style, {
			display: 'grid',
			gridTemplateColumns: '1fr 1fr',
			gap: '8px'
		});

		const partnerCollection = createScrapeBlock('Collection');
		const partnerWishlist = createScrapeBlock('Wishlist');
		partnerGrid.appendChild(partnerCollection.root);
		partnerGrid.appendChild(partnerWishlist.root);

		partnerSection.appendChild(partnerNameEl);
		partnerSection.appendChild(partnerGrid);

		const tradeSection = document.createElement('div');
		Object.assign(tradeSection.style, {
			marginTop: '10px',
			display: 'none'
		});

		const selfOverlapSection = document.createElement('div');
		Object.assign(selfOverlapSection.style, {
			marginTop: '10px',
			paddingTop: '10px',
			borderTop: '1px solid rgba(0,0,0,0.15)',
			display: 'none'
		});
		const selfOverlapTitle = document.createElement('div');
		selfOverlapTitle.textContent = 'Still Wishlisted';
		Object.assign(selfOverlapTitle.style, { fontSize: '13px', fontWeight: '800', marginBottom: '6px' });
		const selfOverlapHint = document.createElement('div');
		selfOverlapHint.textContent = 'Items you own and also have on your wishlist (trade allowed).';
		Object.assign(selfOverlapHint.style, { fontSize: '12px', color: 'rgba(0,0,0,0.55)', marginBottom: '6px' });
		const selfOverlapBody = document.createElement('div');
		Object.assign(selfOverlapBody.style, {
			border: '1px solid rgba(0,0,0,0.15)',
			borderRadius: '12px',
			background: 'rgba(255,255,255,0.65)',
			padding: '8px'
		});
		selfOverlapBody.appendChild(selfOverlapTitle);
		selfOverlapBody.appendChild(selfOverlapHint);
		const selfOverlapTableHeader = document.createElement('div');
		Object.assign(selfOverlapTableHeader.style, {
			display: 'grid',
			gridTemplateColumns: '18px 1fr 62px',
			gap: '8px',
			alignItems: 'center',
			position: 'sticky',
			top: '0',
			background: 'rgba(255,255,255,0.92)',
			padding: '6px 2px',
			borderBottom: '1px solid rgba(0,0,0,0.12)',
			zIndex: '1'
		});
		const sohIcon = document.createElement('div');
		const sohName = document.createElement('div');
		sohName.textContent = 'Collectable';
		Object.assign(sohName.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700' });
		const sohOwned = document.createElement('div');
		sohOwned.textContent = 'Owned';
		Object.assign(sohOwned.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700', textAlign: 'right' });
		selfOverlapTableHeader.appendChild(sohIcon);
		selfOverlapTableHeader.appendChild(sohName);
		selfOverlapTableHeader.appendChild(sohOwned);
		const selfOverlapList = document.createElement('div');
		Object.assign(selfOverlapList.style, { display: 'flex', flexDirection: 'column' });
		selfOverlapBody.appendChild(selfOverlapTableHeader);
		selfOverlapBody.appendChild(selfOverlapList);
		selfOverlapSection.appendChild(selfOverlapBody);

		const helpSection = document.createElement('div');
		Object.assign(helpSection.style, {
			marginTop: '10px',
			display: 'none'
		});
		const helpBody = document.createElement('div');
		Object.assign(helpBody.style, {
			border: '1px solid rgba(0,0,0,0.15)',
			borderRadius: '12px',
			background: 'rgba(255,255,255,0.65)',
			padding: '8px'
		});
		const helpTitle = document.createElement('div');
		helpTitle.textContent = 'How To Use';
		Object.assign(helpTitle.style, { fontSize: '13px', fontWeight: '800', marginBottom: '6px' });
		const helpText = document.createElement('div');
		helpText.textContent = '';
		Object.assign(helpText.style, {
			fontSize: '12px',
			color: 'rgba(0,0,0,0.75)',
			lineHeight: '1.35',
			whiteSpace: 'pre-line'
		});
		helpBody.appendChild(helpTitle);
		helpBody.appendChild(helpText);
		helpSection.appendChild(helpBody);
		const tradeNoticeEl = document.createElement('div');
		tradeNoticeEl.textContent = '';
		Object.assign(tradeNoticeEl.style, {
			display: 'none',
			fontSize: '12px',
			color: '#b00020',
			padding: '8px',
			border: '1px solid rgba(176,0,32,0.35)',
			borderRadius: '12px',
			background: 'rgba(176,0,32,0.06)',
			whiteSpace: 'pre-line'
		});
		tradeSection.appendChild(tradeNoticeEl);

		const marketSection = document.createElement('div');
		Object.assign(marketSection.style, {
			marginTop: '10px',
			paddingTop: '10px',
			borderTop: '1px solid rgba(0,0,0,0.15)',
			display: 'none'
		});
		const marketTitle = document.createElement('div');
		const marketHeader = document.createElement('div');
		Object.assign(marketHeader.style, {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: '8px',
			marginBottom: '6px'
		});
		marketTitle.textContent = 'Marketplace';
		Object.assign(marketTitle.style, {
			fontSize: '13px',
			fontWeight: '800'
		});
		const marketDisableHeroBtn = document.createElement('button');
		marketDisableHeroBtn.type = 'button';
		marketDisableHeroBtn.textContent = 'Disable Marketplace Mode';
		Object.assign(marketDisableHeroBtn.style, {
			fontSize: '12px',
			padding: '4px 8px',
			border: '1px solid rgba(0,0,0,0.25)',
			borderRadius: '10px',
			background: 'rgba(255,255,255,0.8)',
			cursor: 'pointer',
			whiteSpace: 'nowrap'
		});
		marketDisableHeroBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			disableHeroMode();
		});
		marketHeader.appendChild(marketTitle);
		marketHeader.appendChild(marketDisableHeroBtn);
		const marketInfo = document.createElement('div');
		marketInfo.textContent = '';
		Object.assign(marketInfo.style, {
			fontSize: '12px',
			color: 'rgba(0,0,0,0.65)',
			whiteSpace: 'pre-line'
		});

		function createMarketButton(label, onClick) {
			const b = document.createElement('button');
			b.type = 'button';
			b.textContent = label;
			Object.assign(b.style, {
				fontSize: '12px',
				padding: '4px 8px',
				border: '1px solid rgba(0,0,0,0.25)',
				borderRadius: '10px',
				background: 'rgba(255,255,255,0.8)',
				cursor: 'pointer'
			});
			b.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick();
			});
			return b;
		}

		function createMarketMetricBox(label, onScrape) {
			const box = document.createElement('div');
			Object.assign(box.style, {
				border: '1px solid rgba(0,0,0,0.15)',
				borderRadius: '12px',
				background: 'rgba(255,255,255,0.65)',
				padding: '8px'
			});

			const top = document.createElement('div');
			Object.assign(top.style, {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: '8px'
			});
			const l = document.createElement('div');
			l.textContent = label;
			Object.assign(l.style, { fontSize: '12px', fontWeight: '700', color: 'rgba(0,0,0,0.65)' });
			const scrapeBtn = createMarketButton('scrape', onScrape);
			top.appendChild(l);
			top.appendChild(scrapeBtn);

			const main = document.createElement('div');
			Object.assign(main.style, {
				display: 'flex',
				alignItems: 'baseline',
				gap: '6px'
			});
			const mainNum = document.createElement('span');
			mainNum.textContent = '--';
			Object.assign(mainNum.style, { fontSize: '18px', fontWeight: '800' });
			const mainUnit = document.createElement('span');
			mainUnit.textContent = 'users';
			Object.assign(mainUnit.style, { fontSize: '12px', fontWeight: '500', color: 'rgba(0,0,0,0.65)' });
			main.appendChild(mainNum);
			main.appendChild(mainUnit);

			const line1 = document.createElement('div');
			line1.textContent = '';
			Object.assign(line1.style, { fontSize: '12px', color: 'rgba(0,0,0,0.55)' });
			const line2 = document.createElement('div');
			line2.textContent = '';
			Object.assign(line2.style, { fontSize: '12px', color: 'rgba(0,0,0,0.55)' });

			box.appendChild(top);
			box.appendChild(main);
			box.appendChild(line1);
			box.appendChild(line2);
			return { box, main, mainNum, mainUnit, line1, line2, scrapeBtn };
		}

		const marketMetricsGrid = document.createElement('div');
		Object.assign(marketMetricsGrid.style, {
			display: 'grid',
			gridTemplateColumns: '1fr 1fr',
			gap: '8px',
			marginBottom: '10px'
		});
		const marketWishlistBox = createMarketMetricBox('Wishlist', () => scrapeMarketplaceAllPages('wishlist'));
		const marketTradeableBox = createMarketMetricBox('Tradeable', () => scrapeMarketplaceAllPages('tradeable'));
		marketMetricsGrid.appendChild(marketWishlistBox.box);
		marketMetricsGrid.appendChild(marketTradeableBox.box);

		const marketStreamerWrap = document.createElement('div');
		Object.assign(marketStreamerWrap.style, {
			display: 'flex',
			flexDirection: 'column',
			gap: '6px',
			marginBottom: '10px'
		});
		const marketStreamerLabel = document.createElement('div');
		marketStreamerLabel.textContent = 'Filter by streamer';
		Object.assign(marketStreamerLabel.style, {
			fontSize: '12px',
			fontWeight: '700',
			color: 'rgba(0,0,0,0.65)'
		});
		const marketStreamerSearch = document.createElement('input');
		marketStreamerSearch.type = 'text';
		marketStreamerSearch.placeholder = 'All streamers';
		marketStreamerSearch.autocomplete = 'off';
		marketStreamerSearch.spellcheck = false;
		const marketStreamerDatalist = document.createElement('datalist');
		const marketStreamerDatalistId = `${elementId}-market-streamers`;
		marketStreamerDatalist.id = marketStreamerDatalistId;
		marketStreamerSearch.setAttribute('list', marketStreamerDatalistId);
		marketStreamerSearch.style.width = '100%';
		Object.assign(marketStreamerSearch.style, {
			fontSize: '13px',
			padding: '8px 10px',
			borderRadius: '10px',
			border: '1px solid rgba(0,0,0,0.25)',
			background: 'rgba(255,255,255,0.85)',
			boxSizing: 'border-box'
		});
		marketStreamerSearch.addEventListener('input', () => {
			marketUiState.streamerQuery = marketStreamerSearch.value;
			updateHelperUi();
		});
		marketStreamerWrap.appendChild(marketStreamerLabel);
		marketStreamerWrap.appendChild(marketStreamerSearch);
		marketStreamerWrap.appendChild(marketStreamerDatalist);

		const marketCollectableWrap = document.createElement('div');
		Object.assign(marketCollectableWrap.style, {
			display: 'flex',
			flexDirection: 'column',
			gap: '8px',
			marginBottom: '10px'
		});
		const marketCollectableLabel = document.createElement('div');
		marketCollectableLabel.textContent = 'Filter by collectable';
		Object.assign(marketCollectableLabel.style, {
			fontSize: '12px',
			fontWeight: '700',
			color: 'rgba(0,0,0,0.65)'
		});
		marketCollectableWrap.appendChild(marketCollectableLabel);
		const marketCollectableGrid = document.createElement('div');
		Object.assign(marketCollectableGrid.style, {
			display: 'grid',
			gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
			gap: '8px'
		});

		function createMarketSearchField(label, placeholder, datalistId, onInput) {
			const wrap = document.createElement('div');
			Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
			const l = document.createElement('div');
			l.textContent = label;
			Object.assign(l.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700' });
			const input = document.createElement('input');
			input.type = 'text';
			input.placeholder = placeholder;
			input.autocomplete = 'off';
			input.spellcheck = false;
			input.style.width = '100%';
			Object.assign(input.style, {
				fontSize: '13px',
				padding: '8px 10px',
				borderRadius: '10px',
				border: '1px solid rgba(0,0,0,0.25)',
				background: 'rgba(255,255,255,0.85)',
				boxSizing: 'border-box'
			});
			const dl = document.createElement('datalist');
			dl.id = datalistId;
			input.setAttribute('list', datalistId);
			input.addEventListener('input', onInput);
			wrap.appendChild(l);
			wrap.appendChild(input);
			wrap.appendChild(dl);
			return { wrap, input, datalist: dl };
		}

		const marketIWantField = createMarketSearchField(
			'I want',
			'Type a collectable name...',
			`${elementId}-market-gremlins-iwant`,
			() => {
				marketUiState.iWantQuery = marketIWantField.input.value;
				updateHelperUi();
			}
		);
		const marketTheyWantField = createMarketSearchField(
			'They want',
			'Type a collectable name...',
			`${elementId}-market-gremlins-theywant`,
			() => {
				marketUiState.theyWantQuery = marketTheyWantField.input.value;
				updateHelperUi();
			}
		);
		marketCollectableGrid.appendChild(marketIWantField.wrap);
		marketCollectableGrid.appendChild(marketTheyWantField.wrap);
		marketCollectableWrap.appendChild(marketCollectableGrid);

		const marketMatches = document.createElement('div');
		Object.assign(marketMatches.style, {
			border: '1px solid rgba(0,0,0,0.15)',
			borderRadius: '12px',
			background: 'rgba(255,255,255,0.65)',
			padding: '8px',
			marginTop: '8px'
		});
		const marketMatchesTitle = document.createElement('div');
		marketMatchesTitle.textContent = 'Common Interests';
		Object.assign(marketMatchesTitle.style, {
			fontSize: '13px',
			fontWeight: '800',
			marginBottom: '6px'
		});
		const marketMatchesBody = document.createElement('div');
		Object.assign(marketMatchesBody.style, {
			maxHeight: '240px',
			overflow: 'auto'
		});
		const marketMatchesTableHeader = document.createElement('div');
		Object.assign(marketMatchesTableHeader.style, {
			display: 'grid',
			gridTemplateColumns: '1fr 70px',
			gap: '8px',
			alignItems: 'center',
			position: 'sticky',
			top: '0',
			background: 'rgba(255,255,255,0.92)',
			padding: '6px 2px',
			borderBottom: '1px solid rgba(0,0,0,0.12)',
			zIndex: '1'
		});
		const mhUser = document.createElement('div');
		mhUser.textContent = 'User / streamer';
		Object.assign(mhUser.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700' });
		const mhMutual = document.createElement('div');
		mhMutual.textContent = 'Mutual';
		Object.assign(mhMutual.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700', textAlign: 'right' });
		marketMatchesTableHeader.appendChild(mhUser);
		marketMatchesTableHeader.appendChild(mhMutual);
		const marketMatchesList = document.createElement('div');
		Object.assign(marketMatchesList.style, {
			display: 'flex',
			flexDirection: 'column'
		});
		marketMatchesBody.appendChild(marketMatchesTableHeader);
		marketMatchesBody.appendChild(marketMatchesList);
		marketMatches.appendChild(marketMatchesTitle);
		marketMatches.appendChild(marketMatchesBody);



		marketSection.appendChild(marketHeader);
		marketSection.appendChild(marketMetricsGrid);
		marketSection.appendChild(marketStreamerWrap);
		marketSection.appendChild(marketCollectableWrap);
		marketSection.appendChild(marketMatches);
		marketSection.appendChild(marketInfo);


		function createMatchPane(title) {
			const root = document.createElement('div');
			Object.assign(root.style, {
				border: '1px solid rgba(0,0,0,0.15)',
				borderRadius: '12px',
				background: 'rgba(255,255,255,0.65)',
				padding: '8px',
				marginTop: '8px'
			});

			const header = document.createElement('div');
			Object.assign(header.style, {
				display: 'flex',
				alignItems: 'flex-start',
				justifyContent: 'space-between',
				gap: '8px'
			});

			const titleWrap = document.createElement('div');
			Object.assign(titleWrap.style, {
				display: 'flex',
				flexDirection: 'column',
				gap: '2px'
			});

			const titleEl = document.createElement('div');
			titleEl.textContent = title;
			Object.assign(titleEl.style, {
				fontSize: '13px',
				fontWeight: '800'
			});

			const countEl = document.createElement('div');
			countEl.textContent = '0';
			Object.assign(countEl.style, {
				fontSize: '12px',
				color: 'rgba(0,0,0,0.65)'
			});

			titleWrap.appendChild(titleEl);

			const modeRow = document.createElement('div');
			Object.assign(modeRow.style, {
				display: 'flex',
				alignItems: 'center',
				gap: '8px',
				marginTop: '2px'
			});
			const modeGroup = document.createElement('div');
			Object.assign(modeGroup.style, {
				display: 'flex',
				border: '1px solid rgba(0,0,0,0.25)',
				borderRadius: '999px',
				overflow: 'hidden',
				background: 'rgba(255,255,255,0.75)'
			});
			const modeHint = document.createElement('div');
			modeHint.textContent = '';
			Object.assign(modeHint.style, { fontSize: '12px', color: 'rgba(0,0,0,0.55)' });

			function makeModeOption(labelText) {
				const label = document.createElement('label');
				Object.assign(label.style, {
					padding: '4px 8px',
					fontSize: '12px',
					fontWeight: '700',
					cursor: 'pointer',
					userSelect: 'none'
				});
				const input = document.createElement('input');
				input.type = 'radio';
				input.style.display = 'none';
				const text = document.createElement('span');
				text.textContent = labelText;
				label.appendChild(input);
				label.appendChild(text);
				return { label, input, text };
			}

			const optWishlist = makeModeOption('Wishlist');
			const optDupes = makeModeOption('Duplicates');
			modeGroup.appendChild(optWishlist.label);
			modeGroup.appendChild(optDupes.label);
			modeRow.appendChild(modeGroup);
			titleWrap.appendChild(modeRow);
			titleWrap.appendChild(modeHint);
			titleWrap.appendChild(countEl);

			const toggleBtn = document.createElement('button');
			toggleBtn.type = 'button';
			toggleBtn.textContent = '-';
			toggleBtn.title = 'Minimize';
			Object.assign(toggleBtn.style, {
				fontSize: '14px',
				lineHeight: '1',
				padding: '2px 6px',
				border: '1px solid rgba(0,0,0,0.25)',
				borderRadius: '10px',
				background: 'rgba(255,255,255,0.8)',
				cursor: 'pointer',
				alignSelf: 'flex-start'
			});

			const body = document.createElement('div');
			Object.assign(body.style, {
				marginTop: '8px',
				maxHeight: '140px',
				overflow: 'auto',
				display: 'block'
			});

			const tableHeader = document.createElement('div');
			Object.assign(tableHeader.style, {
				display: 'grid',
				gridTemplateColumns: '18px 1fr 62px 62px',
				gap: '8px',
				alignItems: 'center',
				position: 'sticky',
				top: '0',
				background: 'rgba(255,255,255,0.92)',
				padding: '6px 2px',
				borderBottom: '1px solid rgba(0,0,0,0.12)',
				zIndex: '1'
			});

			const hIcon = document.createElement('div');
			const hName = document.createElement('div');
			hName.textContent = 'Gremlin';
			Object.assign(hName.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700' });
			const hA = document.createElement('div');
			hA.textContent = 'A';
			Object.assign(hA.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700', textAlign: 'right' });
			const hB = document.createElement('div');
			hB.textContent = 'B';
			Object.assign(hB.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700', textAlign: 'right' });
			tableHeader.appendChild(hIcon);
			tableHeader.appendChild(hName);
			tableHeader.appendChild(hA);
			tableHeader.appendChild(hB);

			const list = document.createElement('div');
			Object.assign(list.style, {
				display: 'flex',
				flexDirection: 'column',
				gap: '0px'
			});
			body.appendChild(tableHeader);
			body.appendChild(list);

			header.appendChild(titleWrap);
			header.appendChild(toggleBtn);
			root.appendChild(header);
			root.appendChild(body);

			return {
				root,
				titleWrap,
				titleEl,
				countEl,
				toggleBtn,
				body,
				tableHeader,
				headerA: hA,
				headerB: hB,
				list,
				modeHint,
				modeOptWishlist: optWishlist,
				modeOptDupes: optDupes
			};
		}

		const paneTheyHaveYouWant = createMatchPane('They have / You want');
		const paneYouHaveTheyWant = createMatchPane('You have / They want');
		// Tag panes so we can apply special click behavior.
		paneTheyHaveYouWant.paneId = 'they-have-you-want';
		paneYouHaveTheyWant.paneId = 'you-have-they-want';

		function wirePaneCollapseControls(pane) {
			try {
				const pid = pane && pane.paneId ? String(pane.paneId) : '';
				if (!pid) return;
				if (pane._collapseWired) return;
				pane._collapseWired = true;

				function applyCollapsed(collapsed) {
					pane.body.style.display = collapsed ? 'none' : 'block';
					pane.toggleBtn.textContent = collapsed ? '+' : '-';
					pane.toggleBtn.title = collapsed ? 'Show' : 'Minimize';
				}

				applyCollapsed(isPaneCollapsed(pid));
				pane.toggleBtn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					const next = !isPaneCollapsed(pid);
					setPaneCollapsed(pid, next);
					applyCollapsed(next);
				});
				pane._applyCollapsed = applyCollapsed;
			} catch {
				// ignore
			}
		}

		function wirePaneModeControls(pane) {
			try {
				const pid = pane && pane.paneId ? String(pane.paneId) : '';
				if (!pid) return;
				const groupName = `${elementId}-pane-mode-${pid}`;
				pane.modeOptWishlist.input.name = groupName;
				pane.modeOptDupes.input.name = groupName;
				pane.modeOptWishlist.input.value = 'wishlist';
				pane.modeOptDupes.input.value = 'duplicates';

				// Pane-specific wording for clarity.
				if (pid === 'they-have-you-want') {
					pane.modeOptWishlist.text.textContent = 'On My Wishlist';
					pane.modeOptDupes.text.textContent = 'Their Duplicates';
				} else if (pid === 'you-have-they-want') {
					pane.modeOptWishlist.text.textContent = 'On Their Wishlist';
					pane.modeOptDupes.text.textContent = 'My Duplicates';
				}

				function applyStyles() {
					const isWl = !!pane.modeOptWishlist.input.checked;
					const isDu = !!pane.modeOptDupes.input.checked;
					Object.assign(pane.modeOptWishlist.label.style, {
						background: isWl ? 'rgba(0,0,0,0.85)' : 'transparent',
						color: isWl ? '#fff' : 'rgba(0,0,0,0.75)'
					});
					Object.assign(pane.modeOptDupes.label.style, {
						background: isDu ? 'rgba(0,0,0,0.85)' : 'transparent',
						color: isDu ? '#fff' : 'rgba(0,0,0,0.75)'
					});
				}

				function onChange() {
					const mode = pane.modeOptDupes.input.checked ? 'duplicates' : 'wishlist';
					setPaneMode(pid, mode);
					applyStyles();
				}

				pane.modeOptWishlist.input.addEventListener('change', onChange);
				pane.modeOptDupes.input.addEventListener('change', onChange);
				pane._applyModeStyles = applyStyles;
			} catch {
				// ignore
			}
		}
		wirePaneModeControls(paneTheyHaveYouWant);
		wirePaneModeControls(paneYouHaveTheyWant);
		wirePaneCollapseControls(paneTheyHaveYouWant);
		wirePaneCollapseControls(paneYouHaveTheyWant);
		tradeSection.appendChild(paneTheyHaveYouWant.root);
		tradeSection.appendChild(paneYouHaveTheyWant.root);

		headerEl.appendChild(titleEl);
		headerEl.appendChild(youNameEl);
		headerEl.appendChild(pageEl);
		headerEl.appendChild(streamerEl);
		el.appendChild(headerEl);
		el.appendChild(youGrid);
		el.appendChild(selfOverlapSection);
		el.appendChild(partnerSection);
		el.appendChild(tradeSection);
		el.appendChild(marketSection);
		el.appendChild(helpSection);

		return {
			el,
			headerEl,
			youNameEl,
			pageEl,
			streamerEl,
			youGrid,
			youCollection,
			youWishlist,
			partnerSection,
			partnerNameEl,
			partnerCollection,
			partnerWishlist,
			selfOverlapSection,
			selfOverlapList,
			helpSection,
			helpText,
			tradeSection,
			tradeNoticeEl,
			paneTheyHaveYouWant,
			paneYouHaveTheyWant,
			marketSection,
			marketInfo,
			marketDisableHeroBtn,
			marketWishlistBox,
			marketTradeableBox,
			marketStreamerSearch,
			marketStreamerDatalist,
			marketIWantSearch: marketIWantField.input,
			marketIWantDatalist: marketIWantField.datalist,
			marketTheyWantSearch: marketTheyWantField.input,
			marketTheyWantDatalist: marketTheyWantField.datalist,
			marketMatchesList,
			marketMatchesBody
		};
	}

	function scrollToPartnerCollectionGremlin(gremlinName) {
		try {
			const wanted = normalizeName(gremlinName).toLowerCase();
			if (!wanted) return false;
			const upGrid = findPartnerGridByHeading('Up for trade');
			const scope = upGrid || document;
			const candidates = Array.from(scope.querySelectorAll('p.font-semibold'));
			const target = candidates.find((p) => normalizeName(p.textContent).toLowerCase() === wanted);
			if (!target) return false;
			const card = target.closest('div.relative') || target.parentElement;
			(target).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
			if (card && card.style) {
				const prev = card.style.outline;
				card.style.outline = '3px solid #ffcc00';
				card.style.outlineOffset = '2px';
				setTimeout(() => {
					try {
						card.style.outline = prev;
						card.style.outlineOffset = '';
					} catch {}
				}, 1500);
			}
			return true;
		} catch {
			return false;
		}
	}

	function ensureDisclosureOpen(headerText) {
		try {
			const btn = findDisclosureButtonByHeader(headerText);
			if (!btn) return false;
			const expanded = String(btn.getAttribute('aria-expanded') || '').toLowerCase() === 'true';
			if (expanded) return true;
			btn.click();
			return true;
		} catch {
			return false;
		}
	}

	function scrollToSelfWishlistedGremlin(gremlinName) {
		try {
			const wanted = normalizeName(gremlinName).toLowerCase();
			if (!wanted) return false;
			ensureDisclosureOpen('Wishlisted');

			let attempts = 0;
			function tryFindAndScroll() {
				attempts++;
				const root = findGremlinPaneRootByHeader('Wishlisted');
				if (!root) {
					if (attempts < 12) return setTimeout(tryFindAndScroll, 80);
					return;
				}
				const candidates = Array.from(root.querySelectorAll('p.font-semibold'));
				const target = candidates.find((p) => normalizeName(p.textContent).toLowerCase() === wanted);
				if (!target) {
					if (attempts < 12) return setTimeout(tryFindAndScroll, 80);
					return;
				}
				const card = target.closest('div.relative') || target.parentElement;
				target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
				if (card && card.style) {
					const prev = card.style.outline;
					card.style.outline = '3px solid #ffcc00';
					card.style.outlineOffset = '2px';
					setTimeout(() => {
						try {
							card.style.outline = prev;
							card.style.outlineOffset = '';
						} catch {}
					}, 1500);
				}
			}
			tryFindAndScroll();
			return true;
		} catch {
			return false;
		}
	}

	function scrollToStartTradeGremlin(gremlinName) {
		try {
			const wanted = normalizeName(gremlinName).toLowerCase();
			if (!wanted) return false;
			const scope = document.querySelector('main') || document;
			const candidates = Array.from(scope.querySelectorAll('p.font-semibold'));
			let bestCard = null;
			for (const p of candidates) {
				if (!p || p.tagName !== 'P') continue;
				if (normalizeName(p.textContent).toLowerCase() !== wanted) continue;
				const card =
					p.closest('div.relative.rounded-lg') ||
					p.closest('div.rounded-lg') ||
					p.closest('div.relative') ||
					p.closest('div');
				if (!card) continue;
				const hasImg = !!card.querySelector('img[src*="media.gremgacha.club"]');
				const hasCounter = !!card.querySelector('p.font-counter');
				if (!hasImg) continue;
				bestCard = card;
				if (hasCounter) break;
			}
			if (!bestCard) return false;
			bestCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
			const prevShadow = bestCard.style.boxShadow;
			const prevTransition = bestCard.style.transition;
			bestCard.style.transition = 'box-shadow 120ms ease';
			bestCard.style.boxShadow = '0 0 0 3px #ffcc00, 0 10px 26px rgba(0,0,0,0.25)';
			setTimeout(() => {
				try {
					bestCard.style.boxShadow = prevShadow;
					bestCard.style.transition = prevTransition;
				} catch {}
			}, 1500);
			return true;
		} catch {
			return false;
		}
	}

	function computeItemKey(item) {
		const name = item && item.name ? normalizeName(item.name) : '';
		return name ? name.toLowerCase() : '';
	}

	function getItemQty(item) {
		if (!item) return 0;
		if (Number.isFinite(item.countOwned)) return item.countOwned;
		return 1;
	}

	function getTradableQtyFromInventoryItem(item) {
		const qty = getItemQty(item);
		const policy = item && item.doNotTradePolicy ? String(item.doNotTradePolicy) : null;
		if (policy === 'all') return 0;
		if (policy === 'dupes-only') return Math.max(0, qty - 1);
		return qty;
	}

	function setPaneHeaders(pane, colA, colB, colC) {
		if (!pane || !pane.tableHeader) return;
		if (colC) {
			pane.tableHeader.style.gridTemplateColumns = '18px 1fr 62px 62px 62px';
			if (!pane.headerC) {
				const hC = document.createElement('div');
				hC.textContent = colC;
				Object.assign(hC.style, { fontSize: '12px', color: 'rgba(0,0,0,0.65)', fontWeight: '700', textAlign: 'right' });
				pane.tableHeader.appendChild(hC);
				pane.headerC = hC;
			} else {
				pane.headerC.textContent = colC;
				pane.headerC.style.display = '';
			}
		} else {
			pane.tableHeader.style.gridTemplateColumns = '18px 1fr 62px 62px';
			if (pane.headerC) pane.headerC.style.display = 'none';
		}
		pane.headerA.textContent = colA;
		pane.headerB.textContent = colB;
	}

	function renderMatchPane(pane, rows, primaryKey, onRowClick, emptyText) {
		if (!pane) return;
		const list = pane.list;
		while (list.firstChild) list.removeChild(list.firstChild);
		const totalPrimary = rows.reduce((sum, r) => {
			if (!r) return sum;
			const v = r[primaryKey];
			if (typeof v === 'number') return sum + v;
			if (v && typeof v === 'object' && typeof v.available === 'number') return sum + v.available;
			return sum;
		}, 0);
		pane.countEl.textContent = `${rows.length} items | ${totalPrimary} qty`;
		if (!rows.length) {
			const empty = document.createElement('div');
			empty.textContent = emptyText || 'No matches yet.';
			Object.assign(empty.style, {
				fontSize: '12px',
				color: 'rgba(0,0,0,0.55)'
			});
			list.appendChild(empty);
			return;
		}

		function renderQtyInto(cellEl, value, baseStyle) {
			while (cellEl.firstChild) cellEl.removeChild(cellEl.firstChild);
			Object.assign(cellEl.style, baseStyle || {});
			if (typeof value === 'number') {
				cellEl.textContent = String(value);
				return;
			}
			if (!value || typeof value !== 'object') {
				cellEl.textContent = String(value ?? 0);
				return;
			}
			const total = typeof value.total === 'number' ? value.total : null;
			const available = typeof value.available === 'number' ? value.available : null;
			if (total == null && available == null) {
				cellEl.textContent = '0';
				return;
			}
			if (total == null || available == null || total === available) {
				cellEl.textContent = String(available != null ? available : total);
				return;
			}
			const totalEl = document.createElement('span');
			totalEl.textContent = String(total);
			Object.assign(totalEl.style, {
				color: '#b00020',
				textDecoration: 'line-through',
				fontWeight: '400',
				marginRight: '6px'
			});
			const availEl = document.createElement('span');
			availEl.textContent = String(available);
			Object.assign(availEl.style, { fontWeight: '800', color: 'rgba(0,0,0,0.85)' });
			cellEl.appendChild(totalEl);
			cellEl.appendChild(availEl);
		}

		for (let i = 0; i < rows.length; i++) {
			const e = rows[i];
			const row = document.createElement('div');
			Object.assign(row.style, {
				display: 'grid',
				gridTemplateColumns: pane.tableHeader.style.gridTemplateColumns,
				gap: '8px',
				alignItems: 'center',
				padding: '6px 2px',
				borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(0,0,0,0.10)'
			});

			const thumb = document.createElement('img');
			thumb.alt = '';
			thumb.src = e.img || '';
			Object.assign(thumb.style, {
				width: '16px',
				height: '16px',
				objectFit: 'contain',
				borderRadius: '3px',
				background: 'rgba(0,0,0,0.04)',
				flex: '0 0 auto'
			});
			if (!e.img) thumb.style.display = 'none';

			const nameEl = document.createElement('div');
			nameEl.textContent = e.name;
			Object.assign(nameEl.style, {
				fontSize: '13px',
				fontWeight: '600',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				whiteSpace: 'nowrap'
			});

			const aEl = document.createElement('div');
			renderQtyInto(aEl, e.a, { fontSize: '13px', fontWeight: '800', textAlign: 'right' });
			const bEl = document.createElement('div');
			renderQtyInto(bEl, e.b, {
				fontSize: '13px',
				fontWeight: '400',
				color: 'rgba(0,0,0,0.65)',
				textAlign: 'right'
			});

			row.appendChild(thumb);
			row.appendChild(nameEl);
			row.appendChild(aEl);
			row.appendChild(bEl);
			if (pane.headerC && pane.headerC.style.display !== 'none') {
				const cEl = document.createElement('div');
				renderQtyInto(cEl, e.c, {
					fontSize: '13px',
					fontWeight: '400',
					color: 'rgba(0,0,0,0.65)',
					textAlign: 'right'
				});
				row.appendChild(cEl);
			}
			list.appendChild(row);
			if (typeof onRowClick === 'function') {
				row.style.cursor = 'pointer';
				row.addEventListener('click', (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					onRowClick(e);
				});
			}
		}
	}

	function setBlockLink(block, href) {
		if (!block || !block.root) return;
		if (!href) {
			block.root.dataset.thDisabled = '1';
			block.root.style.cursor = 'not-allowed';
			block.root.style.opacity = '0.75';
			block.root.onclick = null;
			return;
		}
		block.root.dataset.thDisabled = '0';
		block.root.style.cursor = 'pointer';
		block.root.style.opacity = '1';
		block.root.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			window.location.assign(href);
		};
	}

	function updateHelperUi(debugState) {
		if (!helperEl || !helperRefs) return;

		const accountId = getCurrentAccountId();
		const selfKey = getSelfKey();
		const pageKind = getPageKind(window.location.href);
		const showHelpOnly =
			pageKind !== 'gremlins' &&
			pageKind !== 'gremlins-streamer' &&
			pageKind !== 'collection' &&
			pageKind !== 'wishlist' &&
			pageKind !== 'start-trade' &&
			pageKind !== 'marketplace' &&
			pageKind !== 'marketplace-search';
		const pagePartner = getTradePartnerFromPath(window.location.pathname);
		if (pagePartner) setLastKnownPartner(pagePartner);
		const tradePartner = pagePartner || (pageKind === 'start-trade' ? getLastKnownPartner() : null);
		const board = getStreamerFromUrl(window.location.href) || getCurrentStreamer();
		const streamerLabel = board ? String(board) : '';
		const pageIndicator = `${pageKind} (${window.location.pathname}${window.location.search || ''})`;

		const shortId = accountId ? `${accountId.slice(0, 8)}...${accountId.slice(-4)}` : null;
		const debugOn = isDebugEnabled();
		helperRefs.youNameEl.style.display = debugOn ? 'block' : 'none';
		helperRefs.pageEl.style.display = debugOn ? 'block' : 'none';
		helperRefs.youNameEl.textContent = shortId ? `Account: ${shortId}` : 'Account: (unknown)';
		const dbgSuffix =
			debugState && isDebugEnabled()
				? ` | scrape ${debugState.attempts || 0}/${debugState.maxAttempts || 0}`
				: '';
		helperRefs.pageEl.textContent = `Page: ${pageIndicator}${dbgSuffix}`;

		const data = loadData();
		helperRefs.streamerEl.textContent = streamerLabel ? `Streamer: ${streamerLabel}` : '';

		const youInventory = streamerLabel && data.scraped[selfKey] && data.scraped[selfKey][streamerLabel]
			? data.scraped[selfKey][streamerLabel].inventory
			: null;
		const youWishlist = streamerLabel && data.scraped[selfKey] && data.scraped[selfKey][streamerLabel]
			? data.scraped[selfKey][streamerLabel].wishlist
			: null;

		setScrapeBlock(helperRefs.youCollection, youInventory);
		setScrapeBlock(helperRefs.youWishlist, youWishlist);
		setBlockLink(helperRefs.youCollection, '/gremlins');
		setBlockLink(helperRefs.youWishlist, streamerLabel ? `/gremlins/${encodeURIComponent(streamerLabel)}` : null);

		// If we're on a page with no helper functionality, show a simple guide.
		if (showHelpOnly) {
			helperRefs.youGrid.style.display = 'grid';
			helperRefs.youCollection.root.style.display = '';
			helperRefs.youWishlist.root.style.display = '';
			helperRefs.selfOverlapSection.style.display = 'none';
			helperRefs.partnerSection.style.display = 'none';
			helperRefs.tradeSection.style.display = 'none';
			helperRefs.marketSection.style.display = 'none';
			helperRefs.helpSection.style.display = 'block';
			const lines = [];
			lines.push('1) Open your Collection page so the helper can read your items.');
			lines.push('2) Open your Wishlist page for a streamer and open the "Wishlisted" section.');
			lines.push('3) Open the other user\'s Collection and Wishlist for the same streamer.');
			lines.push('4) Open their Start Trade page and use the panes.');
			lines.push('Tip: switch between "On X Wishlist" and "X Duplicates" for common trade strategies.');
			if (isHeroModeEnabled()) {
				lines.push('');
				lines.push('Marketplace: visit Marketplace and use the Scrape buttons, then filter by streamer/collectable.');
			}
			helperRefs.helpText.textContent = lines.join('\n');
			return;
		}
		helperRefs.helpSection.style.display = 'none';
		helperRefs.youGrid.style.display = 'grid';
		helperRefs.youCollection.root.style.display = '';
		helperRefs.youWishlist.root.style.display = '';

		// Self overlap: acquired + wishlisted (excluding DNT=all)
		if (pageKind === 'gremlins' || pageKind === 'gremlins-streamer') {
			helperRefs.selfOverlapSection.style.display = 'block';
			const list = helperRefs.selfOverlapList;
			while (list.firstChild) list.removeChild(list.firstChild);
			const rows = [];
			const selfSlots = data && data.scraped ? data.scraped[selfKey] : null;
			if (pageKind === 'gremlins-streamer') {
				const s = streamerLabel;
				const inv = s && selfSlots && selfSlots[s] ? selfSlots[s].inventory : null;
				const wl = s && selfSlots && selfSlots[s] ? selfSlots[s].wishlist : null;
				if (inv && wl) {
					const wishKeys = new Set((wl.items || []).map(computeItemKey).filter(Boolean));
					for (const it of inv.items || []) {
						const key = computeItemKey(it);
						if (!key) continue;
						if (!wishKeys.has(key)) continue;
						if (it && it.doNotTradePolicy === 'all') continue;
						rows.push({
							key,
							name: normalizeName(it.name) || key,
							img: it.img || null,
							owned: getItemQty(it),
							streamer: s
						});
					}
				}
			} else {
				if (selfSlots && typeof selfSlots === 'object') {
					for (const s of Object.keys(selfSlots)) {
						const slot = selfSlots[s];
						const inv = slot ? slot.inventory : null;
						const wl = slot ? slot.wishlist : null;
						if (!inv || !wl) continue;
						const wishKeys = new Set((wl.items || []).map(computeItemKey).filter(Boolean));
						for (const it of inv.items || []) {
							const key = computeItemKey(it);
							if (!key) continue;
							if (!wishKeys.has(key)) continue;
							if (it && it.doNotTradePolicy === 'all') continue;
							rows.push({
								key,
								name: normalizeName(it.name) || key,
								img: it.img || null,
								owned: getItemQty(it),
								streamer: s
							});
						}
					}
				}
			}

			rows.sort((a, b) => (b.owned - a.owned) || a.name.localeCompare(b.name));
			if (!rows.length) {
				const empty = document.createElement('div');
				empty.textContent = pageKind === 'gremlins-streamer'
					? 'No items found (or your collection/wishlist info is missing for this streamer).'
					: 'No items found (or your wishlist info is missing).';
				Object.assign(empty.style, { fontSize: '12px', color: 'rgba(0,0,0,0.55)', padding: '8px 2px' });
				list.appendChild(empty);
			} else {
				for (let i = 0; i < rows.length; i++) {
					const r = rows[i];
					const row = document.createElement('div');
					Object.assign(row.style, {
						display: 'grid',
						gridTemplateColumns: '18px 1fr 62px',
						gap: '8px',
						alignItems: 'center',
						padding: '8px 2px',
						borderBottom: i === rows.length - 1 ? 'none' : '1px solid rgba(0,0,0,0.10)',
						cursor: 'pointer'
					});
					row.addEventListener('click', (e) => {
						e.preventDefault();
						e.stopPropagation();
						if (pageKind === 'gremlins-streamer') {
							// Scroll within the current streamer wishlist page.
							setTimeout(() => scrollToSelfWishlistedGremlin(r.name), 0);
							return;
						}
						// On /gremlins index, take the user to the streamer page.
						if (r.streamer) window.location.assign(`/gremlins/${encodeURIComponent(r.streamer)}`);
					});

					const thumb = document.createElement('img');
					thumb.alt = '';
					thumb.src = r.img || '';
					Object.assign(thumb.style, {
						width: '16px',
						height: '16px',
						objectFit: 'contain',
						borderRadius: '3px',
						background: 'rgba(0,0,0,0.04)'
					});
					if (!r.img) thumb.style.display = 'none';

					const nameCell = document.createElement('div');
					Object.assign(nameCell.style, { minWidth: '0' });
					const nameLine = document.createElement('div');
					nameLine.textContent = r.name;
					Object.assign(nameLine.style, {
						fontSize: '13px',
						fontWeight: '700',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap'
					});
					nameCell.appendChild(nameLine);
					if (pageKind === 'gremlins') {
						const sub = document.createElement('div');
						sub.textContent = r.streamer;
						Object.assign(sub.style, {
							fontSize: '12px',
							color: 'rgba(0,0,0,0.65)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap'
						});
						nameCell.appendChild(sub);
					}

					const ownedCell = document.createElement('div');
					ownedCell.textContent = String(r.owned || 0);
					Object.assign(ownedCell.style, { fontSize: '13px', fontWeight: '800', textAlign: 'right' });

					row.appendChild(thumb);
					row.appendChild(nameCell);
					row.appendChild(ownedCell);
					list.appendChild(row);
				}
			}
		} else {
			helperRefs.selfOverlapSection.style.display = 'none';
		}

		// Marketplace section (hero mode gated)
		if ((pageKind === 'marketplace' || pageKind === 'marketplace-search') && isHeroModeEnabled()) {
			helperRefs.marketSection.style.display = 'block';
			if (helperRefs.marketDisableHeroBtn) helperRefs.marketDisableHeroBtn.style.display = 'inline-block';
			try {
				const u = new URL(window.location.href);
				const searchType = getMarketplaceSearchType(u);
				const md = loadMarketData();
				const lines = [];
				const wishlistM = computeMarketModeMetrics(md, 'wishlist');
				const tradeableM = computeMarketModeMetrics(md, 'tradeable');
				helperRefs.marketWishlistBox.mainNum.textContent = String(wishlistM.users);
				helperRefs.marketTradeableBox.mainNum.textContent = String(tradeableM.users);
				lines.push('');
				lines.push(`Wishlist pages: ${wishlistM.pages} | items: ${wishlistM.rows}`);
				lines.push(`Tradeable pages: ${tradeableM.pages} | items: ${tradeableM.rows}`);
				helperRefs.marketInfo.textContent = lines.join('\n');

				// Streamer autocomplete
				const streamerNames = getMarketplaceStreamerNames(md);
				const sdl = helperRefs.marketStreamerDatalist;
				if (sdl) {
					while (sdl.firstChild) sdl.removeChild(sdl.firstChild);
					for (const s of streamerNames) {
						const opt = document.createElement('option');
						opt.value = s;
						sdl.appendChild(opt);
					}
				}

				// Autocomplete and common interests
				const iWantNames = getMarketplaceMutualCollectableNamesBySide(md, marketUiState.streamerQuery, 'iWant', 2000);
				const theyWantNames = getMarketplaceMutualCollectableNamesBySide(md, marketUiState.streamerQuery, 'theyWant', 2000);
				const active = document.activeElement;
				const iwDl = helperRefs.marketIWantDatalist;
				if (iwDl && active !== helperRefs.marketIWantSearch) {
					while (iwDl.firstChild) iwDl.removeChild(iwDl.firstChild);
					for (const n of iWantNames) {
						const opt = document.createElement('option');
						opt.value = n;
						iwDl.appendChild(opt);
					}
				}
				const twDl = helperRefs.marketTheyWantDatalist;
				if (twDl && active !== helperRefs.marketTheyWantSearch) {
					while (twDl.firstChild) twDl.removeChild(twDl.firstChild);
					for (const n of theyWantNames) {
						const opt = document.createElement('option');
						opt.value = n;
						twDl.appendChild(opt);
					}
				}

				if (helperRefs.marketStreamerSearch && helperRefs.marketStreamerSearch.value !== marketUiState.streamerQuery) {
					marketUiState.streamerQuery = helperRefs.marketStreamerSearch.value;
				}
				if (helperRefs.marketIWantSearch && helperRefs.marketIWantSearch.value !== marketUiState.iWantQuery) {
					marketUiState.iWantQuery = helperRefs.marketIWantSearch.value;
				}
				if (helperRefs.marketTheyWantSearch && helperRefs.marketTheyWantSearch.value !== marketUiState.theyWantQuery) {
					marketUiState.theyWantQuery = helperRefs.marketTheyWantSearch.value;
				}

				const mutual = computeMarketplaceMutualRowsWithFilters(md, {
					streamerQuery: marketUiState.streamerQuery,
					iWantQuery: marketUiState.iWantQuery,
					theyWantQuery: marketUiState.theyWantQuery
				});
				const list = helperRefs.marketMatchesList;
				if (list) {
					while (list.firstChild) list.removeChild(list.firstChild);
						if (!mutual.length) {
							const empty = document.createElement('div');
							const hasAny = (wishlistM.rows || 0) + (tradeableM.rows || 0);
							empty.textContent = hasAny
								? 'No mutual matches (with current filter).'
								: 'No marketplace data yet. Use the scrape buttons.';
							Object.assign(empty.style, { fontSize: '12px', color: 'rgba(0,0,0,0.55)', padding: '8px 2px' });
							list.appendChild(empty);
						} else {
						for (let i = 0; i < mutual.length; i++) {
							const r = mutual[i];
							const row = document.createElement('a');
							row.href = r.href;
							row.textContent = '';
							Object.assign(row.style, {
								display: 'grid',
								gridTemplateColumns: '1fr 70px',
								gap: '8px',
								alignItems: 'center',
								padding: '8px 2px',
								borderBottom: i === mutual.length - 1 ? 'none' : '1px solid rgba(0,0,0,0.10)',
								color: 'inherit',
								textDecoration: 'none'
							});
							row.addEventListener('click', (e) => {
								e.preventDefault();
								e.stopPropagation();
								window.location.assign(r.href);
							});

							const userCell = document.createElement('div');
							Object.assign(userCell.style, { minWidth: '0' });
							const userLine = document.createElement('div');
							userLine.textContent = r.user;
							Object.assign(userLine.style, {
								fontSize: '13px',
								fontWeight: '700',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap'
							});
							const streamerLine = document.createElement('div');
							streamerLine.textContent = r.streamer;
							Object.assign(streamerLine.style, {
								fontSize: '12px',
								color: 'rgba(0,0,0,0.65)',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap'
							});
							userCell.appendChild(userLine);
							userCell.appendChild(streamerLine);

							const mutualCell = document.createElement('div');
							mutualCell.textContent = String(r.mutual);
							Object.assign(mutualCell.style, { fontSize: '13px', fontWeight: '800', textAlign: 'right' });

							row.appendChild(userCell);
							row.appendChild(mutualCell);
							list.appendChild(row);
						}
					}
				}

				// Update scrape status in the metric boxes (replace "Last" line while scraping)
				const runningMode = marketScrapeState.running ? marketScrapeState.mode : null;
				const statusLine = marketScrapeState.running
					? `Scraping: p${marketScrapeState.page} (${marketScrapeState.rows}/${marketScrapeState.total || '?'})`
					: (marketScrapeState.error ? `Error: ${marketScrapeState.error}` : null);
				const disableAll = !!marketScrapeState.running;
				function setBoxStatus(box, mode, metrics) {
					if (!box) return;
					box.scrapeBtn.disabled = disableAll;
					box.scrapeBtn.style.opacity = disableAll ? '0.6' : '1';
					box.scrapeBtn.style.cursor = disableAll ? 'not-allowed' : 'pointer';
					box.line1.textContent = `${metrics.gremlins} collectables`;
					if (runningMode === mode) box.line2.textContent = statusLine;
					else box.line2.textContent = `as of ${metrics.lastAt ? formatAgeShort(metrics.lastAt) : 'never'}`;
				}
				setBoxStatus(helperRefs.marketWishlistBox, 'wishlist', wishlistM);
				setBoxStatus(helperRefs.marketTradeableBox, 'tradeable', tradeableM);
			} catch {
				helperRefs.marketInfo.textContent = '';
				// ignore
			}
		} else {
			helperRefs.marketSection.style.display = 'none';
		}

		// Trade panes should only appear on partner collection/wishlist pages or start-trade.
		const allowTradePanes = pageKind === 'collection' || pageKind === 'wishlist' || pageKind === 'start-trade';
		const isPartnerCollectionTab =
			pageKind === 'collection' &&
			!!pagePartner &&
			isPartnerTabActive(pagePartner, 'collection');
		const isStartTradePage = pageKind === 'start-trade';
		if (!allowTradePanes || !tradePartner) {
			helperRefs.tradeSection.style.display = 'none';
		} else {
			helperRefs.tradeSection.style.display = 'block';
		}

		if (!pagePartner) {
			helperRefs.partnerSection.style.display = 'none';
			// If we're on start-trade, we may still show trade panes using last known partner.
			if (pageKind !== 'start-trade' || !tradePartner) return;
		}
		if (!pagePartner) {
			// Ensure partner stats stay hidden on non-partner pages.
			helperRefs.partnerSection.style.display = 'none';
		}

		helperRefs.partnerSection.style.display = 'block';
		helperRefs.partnerNameEl.textContent = `Trade Candidate: ${tradePartner}`;

		const partnerKey = tradePartner;
		const partnerInventory = streamerLabel && partnerKey && data.scraped[partnerKey] && data.scraped[partnerKey][streamerLabel]
			? data.scraped[partnerKey][streamerLabel].inventory
			: null;
		const partnerNotAvailable = streamerLabel && partnerKey && data.scraped[partnerKey] && data.scraped[partnerKey][streamerLabel]
			? data.scraped[partnerKey][streamerLabel].inventoryNotAvailable
			: null;
		const partnerWishlist = streamerLabel && partnerKey && data.scraped[partnerKey] && data.scraped[partnerKey][streamerLabel]
			? data.scraped[partnerKey][streamerLabel].wishlist
			: null;

		// Build owned maps once (re-used by all panes).
		const selfOwnedByKey = new Map();
		const selfTradableByKey = new Map();
		if (youInventory && Array.isArray(youInventory.items)) {
			for (const it of youInventory.items) {
				const key = computeItemKey(it);
				if (!key) continue;
				selfOwnedByKey.set(key, (selfOwnedByKey.get(key) || 0) + getItemQty(it));
				selfTradableByKey.set(key, (selfTradableByKey.get(key) || 0) + getTradableQtyFromInventoryItem(it));
			}
		}
		const partnerOwnedByKey = new Map();
		const partnerAllItems = [
			...(partnerInventory && Array.isArray(partnerInventory.items) ? partnerInventory.items : []),
			...(partnerNotAvailable && Array.isArray(partnerNotAvailable.items) ? partnerNotAvailable.items : [])
		];
		for (const it of partnerAllItems) {
			const key = computeItemKey(it);
			if (!key) continue;
			partnerOwnedByKey.set(key, (partnerOwnedByKey.get(key) || 0) + getItemQty(it));
		}

		if (pagePartner || pageKind === 'start-trade') {
			setPartnerCollectionBlock(helperRefs.partnerCollection, partnerInventory, partnerNotAvailable);
			setScrapeBlock(helperRefs.partnerWishlist, partnerWishlist);
			setBlockLink(
				helperRefs.partnerCollection,
				streamerLabel && tradePartner
					? `/user/${encodeURIComponent(tradePartner)}/collection?streamer=${encodeURIComponent(streamerLabel)}`
					: null
			);
			setBlockLink(
				helperRefs.partnerWishlist,
				streamerLabel && tradePartner
					? `/user/${encodeURIComponent(tradePartner)}/wishlist?streamer=${encodeURIComponent(streamerLabel)}`
					: null
			);
		}

		// Per-pane mode + hint sync
		const modeThey = getPaneMode('they-have-you-want');
		const modeYou = getPaneMode('you-have-they-want');
		function syncPaneModeUi(pane, mode) {
			if (!pane) return;
			if (pane.modeOptWishlist && pane.modeOptWishlist.input) pane.modeOptWishlist.input.checked = mode === 'wishlist';
			if (pane.modeOptDupes && pane.modeOptDupes.input) pane.modeOptDupes.input.checked = mode === 'duplicates';
			if (typeof pane._applyModeStyles === 'function') pane._applyModeStyles();
			if (pane.modeHint) {
				pane.modeHint.textContent =
					mode === 'duplicates'
						? 'Shows tradeable extras where the other person has 0.'
						: 'Shows matches based on wishlists.';
			}
		}
		syncPaneModeUi(helperRefs.paneTheyHaveYouWant, modeThey);
		syncPaneModeUi(helperRefs.paneYouHaveTheyWant, modeYou);
		try {
			if (helperRefs.paneTheyHaveYouWant && typeof helperRefs.paneTheyHaveYouWant._applyCollapsed === 'function') {
				helperRefs.paneTheyHaveYouWant._applyCollapsed(isPaneCollapsed(helperRefs.paneTheyHaveYouWant.paneId));
			}
			if (helperRefs.paneYouHaveTheyWant && typeof helperRefs.paneYouHaveTheyWant._applyCollapsed === 'function') {
				helperRefs.paneYouHaveTheyWant._applyCollapsed(isPaneCollapsed(helperRefs.paneYouHaveTheyWant.paneId));
			}
		} catch {
			// ignore
		}

		// Determine what info is needed based on selected modes.
		const needsStreamer = !streamerLabel;
		const needYouInventory = !youInventory;
		const needPartnerCollectionForThey = !partnerInventory;
		const needYouWishlistForThey = modeThey === 'wishlist' && !youWishlist;
		const needPartnerWishlistForYou = modeYou === 'wishlist' && !partnerWishlist;
		const needPartnerCollectionForYouDupes = modeYou === 'duplicates' && !(partnerInventory || partnerNotAvailable);

		// Show the trade panes (with empty states if blocked).
		helperRefs.paneTheyHaveYouWant.root.style.display = allowTradePanes && tradePartner ? 'block' : 'none';
		helperRefs.paneYouHaveTheyWant.root.style.display = allowTradePanes && tradePartner ? 'block' : 'none';

		// Show a red notice on trade pages when required info is missing for the selected modes.
		if (allowTradePanes && tradePartner) {
			/** @type {Array<{label:string, href:string|null}>} */
			const actions = [];
			if (needYouInventory) actions.push({ label: 'Open your Collection', href: '/gremlins' });
			if (!needsStreamer && streamerLabel) {
				if (needYouWishlistForThey) {
					actions.push({ label: 'Open your Wishlist (Wishlisted)', href: `/gremlins/${encodeURIComponent(streamerLabel)}` });
				}
				if (needPartnerCollectionForThey || needPartnerCollectionForYouDupes) {
					actions.push({
						label: 'Open their Collection',
						href: `/user/${encodeURIComponent(tradePartner)}/collection?streamer=${encodeURIComponent(streamerLabel)}`
					});
				}
				if (needPartnerWishlistForYou) {
					actions.push({
						label: 'Open their Wishlist',
						href: `/user/${encodeURIComponent(tradePartner)}/wishlist?streamer=${encodeURIComponent(streamerLabel)}`
					});
				}
			}

			const ready = !needsStreamer && !actions.length;
			helperRefs.tradeNoticeEl.style.display = ready ? 'none' : 'block';
			if (!ready) {
				const notice = helperRefs.tradeNoticeEl;
				while (notice.firstChild) notice.removeChild(notice.firstChild);

				const title = document.createElement('div');
				title.textContent = 'Trade panes need more information.';
				Object.assign(title.style, { fontSize: '12px', fontWeight: '800', marginBottom: '6px' });
				notice.appendChild(title);

				if (needsStreamer) {
					const t = document.createElement('div');
					t.textContent = 'Open any collection or wishlist page to pick a streamer, then come back.';
					Object.assign(t.style, { fontSize: '12px' });
					notice.appendChild(t);
				} else {
					const sub = document.createElement('div');
					sub.textContent = 'Open these pages, then come back:';
					Object.assign(sub.style, { fontSize: '12px', marginBottom: '6px' });
					notice.appendChild(sub);

					for (const a of actions) {
						const row = document.createElement('div');
						Object.assign(row.style, { display: 'flex', gap: '6px', alignItems: 'baseline' });
						const bullet = document.createElement('span');
						bullet.textContent = '-';
						Object.assign(bullet.style, { opacity: '0.85' });
						row.appendChild(bullet);

						if (a.href) {
							const link = document.createElement('a');
							link.href = a.href;
							link.textContent = a.label;
							Object.assign(link.style, { color: '#b00020', textDecoration: 'underline' });
							link.addEventListener('click', (e) => {
								e.preventDefault();
								e.stopPropagation();
								window.location.assign(a.href);
							});
							row.appendChild(link);
						} else {
							const text = document.createElement('span');
							text.textContent = a.label;
							row.appendChild(text);
						}
						notice.appendChild(row);
					}
				}
			}
		}

		// Build key sets and meta maps
		const youWishlistKeys = youWishlist && Array.isArray(youWishlist.items)
			? new Set((youWishlist.items || []).map(computeItemKey).filter(Boolean))
			: new Set();
		const partnerWishlistKeys = partnerWishlist && Array.isArray(partnerWishlist.items)
			? new Set((partnerWishlist.items || []).map(computeItemKey).filter(Boolean))
			: new Set();
		const selfMetaByKey = new Map();
		if (youInventory && Array.isArray(youInventory.items)) {
			for (const it of youInventory.items) {
				const k = computeItemKey(it);
				if (!k) continue;
				if (!selfMetaByKey.has(k)) selfMetaByKey.set(k, { name: normalizeName(it.name) || k, img: it.img || null });
			}
		}
		const partnerMetaByKey = new Map();
		for (const it of partnerAllItems) {
			const k = computeItemKey(it);
			if (!k) continue;
			if (!partnerMetaByKey.has(k)) partnerMetaByKey.set(k, { name: normalizeName(it.name) || k, img: it.img || null });
		}
		const partnerAvailableByKey = new Map();
		if (partnerInventory && Array.isArray(partnerInventory.items)) {
			for (const it of partnerInventory.items) {
				const k = computeItemKey(it);
				if (!k) continue;
				partnerAvailableByKey.set(k, (partnerAvailableByKey.get(k) || 0) + getItemQty(it));
				if (!partnerMetaByKey.has(k)) partnerMetaByKey.set(k, { name: normalizeName(it.name) || k, img: it.img || null });
			}
		}

		// Render panes
		setPaneHeaders(helperRefs.paneTheyHaveYouWant, 'They have', 'I have');
		setPaneHeaders(helperRefs.paneYouHaveTheyWant, 'I have', 'They have');

		const canThey = !needsStreamer && !needYouInventory && !needPartnerCollectionForThey && !needYouWishlistForThey;
		const canYou =
			!needsStreamer &&
			!needYouInventory &&
			(modeYou === 'duplicates' ? !needPartnerCollectionForYouDupes : !needPartnerWishlistForYou);

		if (canThey) {
			const rows = [];
			if (modeThey === 'duplicates') {
				for (const [k, avail] of partnerAvailableByKey.entries()) {
					const total = partnerOwnedByKey.get(k) || avail;
					if (total < 2) continue;
					if ((selfOwnedByKey.get(k) || 0) !== 0) continue;
					const meta = partnerMetaByKey.get(k) || { name: k, img: null };
					rows.push({ name: meta.name, img: meta.img, a: { total, available: avail }, b: 0, _sortAvail: avail });
				}
			} else {
				for (const [k, avail] of partnerAvailableByKey.entries()) {
					if (!youWishlistKeys.has(k)) continue;
					const total = partnerOwnedByKey.get(k) || avail;
					const meta = partnerMetaByKey.get(k) || { name: k, img: null };
					rows.push({
						name: meta.name,
						img: meta.img,
						a: { total, available: avail },
						b: selfOwnedByKey.get(k) || 0,
						_sortAvail: avail
					});
				}
			}
			rows.sort((a, b) => (b._sortAvail - a._sortAvail) || a.name.localeCompare(b.name));
			renderMatchPane(helperRefs.paneTheyHaveYouWant, rows, 'a', (entry) => {
				if (!isPartnerCollectionTab) return;
				scrollToPartnerCollectionGremlin(entry.name);
			});
		} else {
			renderMatchPane(
				helperRefs.paneTheyHaveYouWant,
				[],
				'a',
				null,
				modeThey === 'duplicates'
					? 'Duplicates mode needs both collections.'
					: 'Wishlist mode needs your wishlist and their collection.'
			);
		}

		if (canYou) {
			const rows = [];
			if (modeYou === 'duplicates') {
				for (const [k, tradable] of selfTradableByKey.entries()) {
					const total = selfOwnedByKey.get(k) || 0;
					if (total < 2) continue;
					if (!tradable) continue;
					if ((partnerOwnedByKey.get(k) || 0) !== 0) continue;
					const meta = selfMetaByKey.get(k) || { name: k, img: null };
					rows.push({
						name: meta.name,
						img: meta.img,
						a: { total, available: tradable },
						b: 0,
						_sortTradable: tradable,
						_sortTheyTotal: 0
					});
				}
			} else {
				for (const [k, tradable] of selfTradableByKey.entries()) {
					if (!tradable) continue;
					if (!partnerWishlistKeys.has(k)) continue;
					const total = selfOwnedByKey.get(k) || 0;
					const theirTotal = partnerOwnedByKey.get(k) || 0;
					const meta = selfMetaByKey.get(k) || { name: k, img: null };
					rows.push({
						name: meta.name,
						img: meta.img,
						a: { total, available: tradable },
						b: theirTotal,
						_sortTradable: tradable,
						_sortTheyTotal: theirTotal
					});
				}
			}
			rows.sort(
				(a, b) =>
					(b._sortTradable - a._sortTradable) ||
					((a._sortTheyTotal || 0) - (b._sortTheyTotal || 0)) ||
					a.name.localeCompare(b.name)
			);
			renderMatchPane(helperRefs.paneYouHaveTheyWant, rows, 'a', (entry) => {
				if (!isStartTradePage) return;
				scrollToStartTradeGremlin(entry.name);
			});
		} else {
			renderMatchPane(
				helperRefs.paneYouHaveTheyWant,
				[],
				'a',
				null,
				modeYou === 'duplicates'
					? 'Duplicates mode needs your collection and their collection.'
					: 'Wishlist mode needs their wishlist and your collection.'
			);
		}

		// Expand pane heights to use available sidebar space.
		try {
			const sidebarRect = helperEl.getBoundingClientRect();
			const tradeRect = helperRefs.tradeSection.getBoundingClientRect();
			const available = Math.max(0, Math.floor(sidebarRect.bottom - tradeRect.top - 16));
			const panes = [helperRefs.paneTheyHaveYouWant, helperRefs.paneYouHaveTheyWant].filter(
				(p) => p && p.root && p.root.style.display !== 'none'
			);
			const n = Math.max(1, panes.length);
			const each = Math.max(120, Math.floor((available - 16) / n));
			for (const p of panes) {
				p.body.style.maxHeight = `${each}px`;
			}
		} catch {
			// ignore
		}
	}

	/* ---------------- HELPER ELEMENT ---------------- */

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function ensureBody() {
		return new Promise((resolve) => {
			if (document.body) return resolve();

			const intervalId = setInterval(() => {
				if (document.body) {
					clearInterval(intervalId);
					resolve();
				}
			}, 25);
		});
	}

	function createHelperElement() {
		const ui = createUi();
		helperRefs = ui;
		return ui.el;
	}

	function loadPosition(el) {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return;
			const pos = JSON.parse(raw);
			el.style.left = `${pos.left}px`;
			el.style.top = `${pos.top}px`;
			el.style.right = 'auto';
		} catch {}
	}

	function savePosition(left, top) {
		localStorage.setItem(storageKey, JSON.stringify({ left, top }));
	}

	function loadSize(el) {
		try {
			const raw = localStorage.getItem(sizeStorageKey);
			if (!raw) return;
			const s = JSON.parse(raw);
			if (!s || typeof s !== 'object') return;
			if (typeof s.width === 'number' && s.width > 200) el.style.width = `${s.width}px`;
		} catch {}
	}

	function saveSize(el) {
		try {
			const rect = el.getBoundingClientRect();
			localStorage.setItem(sizeStorageKey, JSON.stringify({ width: rect.width }));
		} catch {}
	}

	function applySidebarOffset() {
		try {
			if (!helperEl) return;
			const w = Math.round(helperEl.getBoundingClientRect().width);
			document.documentElement.style.paddingRight = `${w}px`;

			// The site nav uses `position: fixed` + `inset-x-0` + `w-screen`, which ignores
			// padding-right on the root. Force it to respect the sidebar width.
			const navs = Array.from(document.querySelectorAll('nav.fixed'));
			for (const nav of navs) {
				const cls = String(nav.className || '');
				if (!cls.includes('inset-x-0') || !cls.includes('w-screen')) continue;
				nav.style.right = `${w}px`;
				nav.style.left = '0px';
				nav.style.width = `calc(100vw - ${w}px)`;
				nav.style.boxSizing = 'border-box';
			}
		} catch {
			// ignore
		}
	}

	function makeDraggable(el, handleEl) {
		let dragging = false;
		let pointerId = null;
		let offsetX = 0;
		let offsetY = 0;
		const handle = handleEl || el;

		handle.addEventListener('pointerdown', (e) => {
			if (e.button !== 0 && e.pointerType === 'mouse') return;

			dragging = true;
			pointerId = e.pointerId;

			const rect = el.getBoundingClientRect();
			offsetX = e.clientX - rect.left;
			offsetY = e.clientY - rect.top;

			handle.setPointerCapture(pointerId);
		});

		handle.addEventListener('pointermove', (e) => {
			if (!dragging || e.pointerId !== pointerId) return;

			const rect = el.getBoundingClientRect();
			const maxLeft = window.innerWidth - rect.width;
			const maxTop = window.innerHeight - rect.height;

			const left = clamp(e.clientX - offsetX, 0, maxLeft);
			const top = clamp(e.clientY - offsetY, 0, maxTop);

			el.style.left = `${left}px`;
			el.style.top = `${top}px`;
			el.style.right = 'auto';
		});

		function stopDrag(e) {
			if (!dragging || e.pointerId !== pointerId) return;
			dragging = false;

			const rect = el.getBoundingClientRect();
			savePosition(rect.left, rect.top);

			handle.releasePointerCapture(pointerId);
			pointerId = null;
		}

		handle.addEventListener('pointerup', stopDrag);
		handle.addEventListener('pointercancel', stopDrag);
	}

	function makeResizableSidebar(el) {
		const handle = el.querySelector('[data-th-resize-handle="1"]');
		if (!handle) return;

		let resizing = false;
		let pointerId = null;
		let startX = 0;
		let startWidth = 0;
		let rafId = null;
		let pendingWidth = null;

		function clampWidth(px) {
			const min = 280;
			const max = Math.max(min, Math.floor(window.innerWidth * 0.6));
			return Math.min(Math.max(px, min), max);
		}

		function commitWidth(px) {
			const w = clampWidth(px);
			el.style.width = `${w}px`;
			applySidebarOffset();
		}

		handle.addEventListener('pointerdown', (e) => {
			if (e.button !== 0 && e.pointerType === 'mouse') return;
			resizing = true;
			pointerId = e.pointerId;
			startX = e.clientX;
			startWidth = el.getBoundingClientRect().width;
			handle.setPointerCapture(pointerId);
		});

		handle.addEventListener('pointermove', (e) => {
			if (!resizing || e.pointerId !== pointerId) return;
			const dx = startX - e.clientX;
			pendingWidth = startWidth + dx;
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				commitWidth(pendingWidth);
			});
		});

		function stopResize(e) {
			if (!resizing || e.pointerId !== pointerId) return;
			resizing = false;
			try {
				handle.releasePointerCapture(pointerId);
			} catch {}
			pointerId = null;
			saveSize(el);
		}

		handle.addEventListener('pointerup', stopResize);
		handle.addEventListener('pointercancel', stopResize);
		window.addEventListener('resize', () => applySidebarOffset());
	}

	function attachOrReattach(el) {
		if (!document.body) return;
		if (!el.isConnected) document.body.appendChild(el);
	}

	let uiReattachTimerId = null;
	function scheduleReattach() {
		if (uiReattachTimerId) return;
		uiReattachTimerId = setTimeout(() => {
			uiReattachTimerId = null;
			try {
				if (!helperEl) return;
				attachOrReattach(helperEl);
			} catch {
				// ignore
			}
		}, 100);
	}

	let domObserver = null;
	let domObserverTarget = null;
	function installDomObserver() {
		try {
			const target = document.documentElement;
			if (!target) return;
			if (domObserver && domObserverTarget === target) return;
			if (domObserver) domObserver.disconnect();
			domObserverTarget = target;
			domObserver = new MutationObserver((mutations) => {
				// Avoid reacting to our own UI updates.
				if (helperEl && mutations.every((m) => m.target && helperEl.contains(m.target))) return;
				scheduleReattach();
			});
			domObserver.observe(target, { childList: true, subtree: true });
		} catch {
			// ignore
		}
	}

	let heartbeatId = null;
	function startHeartbeat() {
		if (heartbeatId) return;
		heartbeatId = setInterval(() => {
			try {
				// If React blows away <html>/<body>, our observer can end up attached
				// to the old tree. Reinstall when the target changes.
				installDomObserver();
				if (!helperEl) return;
				if (!helperEl.isConnected) attachOrReattach(helperEl);
				applySidebarOffset();
			} catch {
				// ignore
			}
		}, 2000);
	}

	/* ---------------- HERO MODE (MARKETPLACE GATE) ---------------- */

	let heroModeBuffer = '';
	function handleHeroModeKeydown(e) {
		if (isHeroModeEnabled()) return;
		if (!e || e.ctrlKey || e.metaKey || e.altKey) return;
		const k = e.key;
		if (typeof k !== 'string') return;
		if (k.length === 1) {
			heroModeBuffer += k;
			if (heroModeBuffer.length > 64) heroModeBuffer = heroModeBuffer.slice(-64);
		} else if (k === 'Backspace') {
			heroModeBuffer = heroModeBuffer.slice(0, -1);
		} else if (k === 'Enter') {
			heroModeBuffer += '\n';
			if (heroModeBuffer.length > 64) heroModeBuffer = heroModeBuffer.slice(-64);
		} else {
			return;
		}
		if (heroModeBuffer.toLowerCase().includes('hero mode')) {
			enableHeroMode();
			heroModeBuffer = '';
		}
	}

	/* ---------------- ROUTE CHANGE ---------------- */

	let routeTimerId = null;
	function onRouteChange() {
		if (routeTimerId) clearTimeout(routeTimerId);
		routeTimerId = setTimeout(() => {
			routeTimerId = null;
			const url = new URL(window.location.href);
			runScrapeAttempts(url);
			updateHelperUi();
		}, 50);
	}

	/* ---------------- INIT ---------------- */

	(async function init() {
		hookNavigation();
		window.addEventListener('keydown', handleHeroModeKeydown, true);

		// If the site throws and React remounts, ensure we re-attach.
		window.addEventListener('error', () => {
			scheduleReattach();
			installDomObserver();
		});
		window.addEventListener('unhandledrejection', () => {
			scheduleReattach();
			installDomObserver();
		});

		await ensureBody();

		helperEl = createHelperElement();
		loadSize(helperEl);
		makeResizableSidebar(helperEl);
		attachOrReattach(helperEl);
		applySidebarOffset();
		updateHelperUi();
		onRouteChange();
		installDomObserver();
		startHeartbeat();

		let sizeSaveTimer = null;
		const ro = new ResizeObserver(() => {
			if (sizeSaveTimer) clearTimeout(sizeSaveTimer);
			sizeSaveTimer = setTimeout(() => {
				sizeSaveTimer = null;
				saveSize(helperEl);
				applySidebarOffset();
			}, 150);
		});
		ro.observe(helperEl);

		// DOM observer installed via installDomObserver().
	})();
})();
