/**
 * BookingWidget embed.js
 * Drop-in booking widget for any website.
 *
 * Usage (inline):
 *   <div data-practitioner="username" data-mode="inline"></div>
 *   <script src="https://yourdomain.com/embed.js" async></script>
 *
 * Usage (modal):
 *   <div data-practitioner="username" data-mode="modal" data-trigger-text="Book Now"></div>
 *   <script src="https://yourdomain.com/embed.js" async></script>
 *
 * Public API:
 *   BookingWidget.open(containerId?)
 *   BookingWidget.close(containerId?)
 *   BookingWidget.on(event, callback)   // events: 'complete', 'close', 'error'
 *   BookingWidget.off(event, callback)
 */
(function () {
  'use strict';

  // ── Idempotency guard ───────────────────────────────────────────────────────
  if (window.__bookingWidgetLoaded) return;
  window.__bookingWidgetLoaded = true;

  // ── Config ──────────────────────────────────────────────────────────────────
  var DEFAULT_ACCENT = '#3b82f6';
  var HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  // Determine booking app origin from this script's src
  var _scriptEl = document.currentScript ||
    (function () {
      var scripts = document.querySelectorAll('script[src*="embed.js"]');
      return scripts[scripts.length - 1] || null;
    })();
  var BOOKING_ORIGIN = _scriptEl
    ? (function () {
        try { return new URL(_scriptEl.src).origin; } catch (e) { return window.location.origin; }
      })()
    : window.location.origin;

  // ── Event bus ───────────────────────────────────────────────────────────────
  var _listeners = {}; // { eventName: [callback] }

  function _emit(event, data) {
    var cbs = _listeners[event];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](data); } catch (e) { /* ignore callback errors */ }
    }
  }

  // ── Container registry ──────────────────────────────────────────────────────
  // key: container element (WeakMap for GC safety) → state object
  // We also keep a flat array for postMessage source lookup
  var _registry = []; // [{ el, mode, iframe, skeleton, overlay, practitioner, loaded }]

  function _findByIframe(win) {
    for (var i = 0; i < _registry.length; i++) {
      var entry = _registry[i];
      if (entry.iframe && entry.iframe.contentWindow === win) return entry;
    }
    return null;
  }

  function _findByEl(el) {
    for (var i = 0; i < _registry.length; i++) {
      if (_registry[i].el === el) return _registry[i];
    }
    return null;
  }

  function _findByContainerId(id) {
    if (!id) return _registry[0] || null;
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return null;
    return _findByEl(el);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function _buildIframeSrc(username, accent, sessionId) {
    var params = 'parentOrigin=' + encodeURIComponent(window.location.origin);
    if (accent) params += '&accent=' + encodeURIComponent(accent);
    if (sessionId) params += '&session=' + encodeURIComponent(sessionId);
    return BOOKING_ORIGIN + '/embed/' + encodeURIComponent(username) + '?' + params;
  }

  function _createIframe(src) {
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.style.width = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('title', 'Booking Widget');
    return iframe;
  }

  function _createSkeleton() {
    var sk = document.createElement('div');
    sk.style.cssText = [
      'min-height:500px',
      'background:linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)',
      'background-size:200% 100%',
      'animation:bw-shimmer 1.4s infinite',
      'border-radius:12px',
    ].join(';');
    sk.setAttribute('aria-label', 'Loading booking widget');
    sk.setAttribute('role', 'status');
    return sk;
  }

  // Inject shimmer keyframes once
  (function () {
    if (document.getElementById('bw-shimmer-styles')) return;
    var style = document.createElement('style');
    style.id = 'bw-shimmer-styles';
    style.textContent = '@keyframes bw-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    document.head.appendChild(style);
  })();

  function _createFallback(username) {
    var div = document.createElement('div');
    div.style.cssText = 'padding:20px;text-align:center;font-family:system-ui,sans-serif;color:#555;font-size:14px';
    div.innerHTML =
      'Loading is taking longer than expected. ' +
      '<a href="' + BOOKING_ORIGIN + '/book/' + encodeURIComponent(username) + '" ' +
      'target="_blank" rel="noopener" ' +
      'style="color:#3b82f6;text-decoration:underline">' +
      'Open booking page directly</a>';
    return div;
  }

  // ── iOS-safe scroll lock ────────────────────────────────────────────────────
  var _scrollY = 0;

  function _lockScroll() {
    _scrollY = window.scrollY || window.pageYOffset;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + _scrollY + 'px';
    document.body.style.width = '100%';
    document.body.style.overflowY = 'scroll';
  }

  function _unlockScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflowY = '';
    window.scrollTo(0, _scrollY);
  }

  // ── Inline mode ─────────────────────────────────────────────────────────────

  function _initInline(el, username, accent, sessionId) {
    var iframeSrc = _buildIframeSrc(username, accent, sessionId);
    var iframe = _createIframe(iframeSrc);
    iframe.style.height = '0';
    iframe.style.overflow = 'hidden';

    var skeleton = _createSkeleton();

    el.appendChild(skeleton);
    el.appendChild(iframe);

    var entry = {
      el: el, mode: 'inline', iframe: iframe,
      skeleton: skeleton, overlay: null,
      practitioner: username, loaded: false,
    };
    _registry.push(entry);

    // 10-second timeout
    var timeoutId = setTimeout(function () {
      if (!entry.loaded) {
        skeleton.remove();
        el.insertBefore(_createFallback(username), iframe);
        iframe.style.display = 'none';
      }
    }, 10000);

    // Store timeout so we can cancel on load
    entry._loadTimeoutId = timeoutId;
  }

  function _onInlineLoaded(entry, height) {
    if (entry.loaded) return;
    entry.loaded = true;
    clearTimeout(entry._loadTimeoutId);
    entry.iframe.style.height = height + 'px';
    entry.iframe.style.overflow = '';
    entry.skeleton.remove();
  }

  function _onInlineResized(entry, height) {
    if (entry.iframe) {
      entry.iframe.style.height = height + 'px';
    }
  }

  // ── Modal mode ──────────────────────────────────────────────────────────────

  function _createModalButton(triggerText, accent) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = triggerText;
    var bg = accent || DEFAULT_ACCENT;
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'padding:10px 20px',
      'background:' + bg,
      'color:#fff',
      'font-size:14px',
      'font-weight:600',
      'font-family:system-ui,sans-serif',
      'border:none',
      'border-radius:8px',
      'cursor:pointer',
      'min-height:44px',
      'transition:opacity 0.15s',
    ].join(';');
    btn.onmouseenter = function () { btn.style.opacity = '0.9'; };
    btn.onmouseleave = function () { btn.style.opacity = '1'; };
    return btn;
  }

  function _createModalOverlay() {
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,0.5)',
      'z-index:99999',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:16px',
    ].join(';');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Booking Widget');
    return overlay;
  }

  function _createModalContainer() {
    var container = document.createElement('div');
    container.style.cssText = [
      'position:relative',
      'width:100%',
      'max-width:480px',
      'max-height:90vh',
      'background:#fff',
      'border-radius:16px',
      'overflow:hidden',
      'display:flex',
      'flex-direction:column',
      // Mobile: full-screen
      '@media (max-width:480px){max-width:100%;max-height:100dvh;border-radius:0}',
    ].join(';');

    // For mobile full-screen, we detect via CSS
    var mq = window.matchMedia('(max-width: 480px)');
    function applyMobile(matches) {
      if (matches) {
        container.style.maxWidth = '100%';
        container.style.maxHeight = '100dvh';
        try { container.style.maxHeight = '100dvh'; } catch (e) { container.style.maxHeight = '100vh'; }
        container.style.borderRadius = '0';
      } else {
        container.style.maxWidth = '480px';
        container.style.maxHeight = '90vh';
        container.style.borderRadius = '16px';
      }
    }
    applyMobile(mq.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', function (e) { applyMobile(e.matches); });
    } else if (mq.addListener) {
      mq.addListener(function (e) { applyMobile(e.matches); }); // Safari <14
    }

    return container;
  }

  function _initModal(el, username, accent, triggerText, sessionId) {
    var btn = _createModalButton(triggerText, accent);
    el.appendChild(btn);

    var entry = {
      el: el, mode: 'modal', iframe: null,
      skeleton: null, overlay: null,
      practitioner: username, loaded: false,
      accent: accent, sessionId: sessionId,
    };
    _registry.push(entry);

    btn.addEventListener('click', function () {
      _openModal(entry);
    });

    entry._triggerBtn = btn;
  }

  function _openModal(entry) {
    if (entry.overlay) return; // already open

    var overlay = _createModalOverlay();
    var modalContainer = _createModalContainer();
    var iframeSrc = _buildIframeSrc(entry.practitioner, entry.accent, entry.sessionId);
    var iframe = _createIframe(iframeSrc);
    iframe.style.height = '500px';
    iframe.style.flex = '1';

    // Loading skeleton inside modal
    var skeleton = _createSkeleton();
    skeleton.style.minHeight = '500px';
    skeleton.style.flex = '1';

    modalContainer.appendChild(skeleton);
    modalContainer.appendChild(iframe);
    iframe.style.display = 'none';

    overlay.appendChild(modalContainer);
    document.body.appendChild(overlay);

    entry.iframe = iframe;
    entry.skeleton = skeleton;
    entry.overlay = overlay;
    entry.loaded = false;

    _lockScroll();

    // Close handlers
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeModal(entry);
    });

    var escHandler = function (e) {
      if (e.key === 'Escape') _closeModal(entry);
    };
    document.addEventListener('keydown', escHandler);
    entry._escHandler = escHandler;

    // 10-second timeout
    entry._loadTimeoutId = setTimeout(function () {
      if (!entry.loaded && entry.skeleton) {
        entry.skeleton.innerHTML =
          '<div style="padding:20px;text-align:center;font-family:system-ui,sans-serif;color:#555;font-size:14px">' +
          'Loading is taking longer than expected. ' +
          '<a href="' + BOOKING_ORIGIN + '/book/' + encodeURIComponent(entry.practitioner) + '" ' +
          'target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:underline">' +
          'Open booking page directly</a></div>';
        entry.skeleton.style.background = '#fff';
        entry.skeleton.style.animation = 'none';
        iframe.style.display = 'none';
      }
    }, 10000);
  }

  function _closeModal(entry) {
    if (!entry.overlay) return;

    // Clean up
    if (entry._escHandler) {
      document.removeEventListener('keydown', entry._escHandler);
      entry._escHandler = null;
    }
    clearTimeout(entry._loadTimeoutId);

    entry.overlay.remove();
    entry.overlay = null;
    entry.iframe = null;
    entry.skeleton = null;
    entry.loaded = false;

    _unlockScroll();
    _emit('close', { practitioner: entry.practitioner });
  }

  function _onModalLoaded(entry, height) {
    if (entry.loaded) return;
    entry.loaded = true;
    clearTimeout(entry._loadTimeoutId);
    if (entry.skeleton) { entry.skeleton.remove(); entry.skeleton = null; }
    if (entry.iframe) {
      entry.iframe.style.display = 'block';
      entry.iframe.style.height = height + 'px';
      entry.iframe.style.overflow = '';
    }
  }

  function _onModalResized(entry, height) {
    if (entry.iframe) {
      entry.iframe.style.height = height + 'px';
    }
  }

  // ── postMessage listener ────────────────────────────────────────────────────

  window.addEventListener('message', function (event) {
    // Only accept messages from our booking origin
    if (event.origin !== BOOKING_ORIGIN) return;

    var data = event.data;
    if (!data || typeof data.type !== 'string') return;
    if (!data.type.startsWith('booking:')) return;

    // Find which container this came from
    var entry = _findByIframe(event.source);
    if (!entry) return;

    var msgType = data.type;

    if (msgType === 'booking:loaded') {
      var height = typeof data.height === 'number' ? data.height : 500;
      if (entry.mode === 'inline') {
        _onInlineLoaded(entry, height);
      } else {
        _onModalLoaded(entry, height);
      }
    } else if (msgType === 'booking:resize') {
      var h = typeof data.height === 'number' ? data.height : null;
      if (h !== null) {
        if (entry.mode === 'inline') {
          _onInlineResized(entry, h);
        } else {
          _onModalResized(entry, h);
        }
      }
    } else if (msgType === 'booking:complete') {
      _emit('complete', {
        bookingToken: data.bookingToken,
        guestName: data.guestName,
        startsAt: data.startsAt,
        practitioner: entry.practitioner,
      });
    } else if (msgType === 'booking:close') {
      if (entry.mode === 'modal') {
        _closeModal(entry);
      }
      _emit('close', { practitioner: entry.practitioner });
    } else if (msgType === 'booking:error') {
      _emit('error', { message: data.message, practitioner: entry.practitioner });
    }
  });

  // ── Container initialization ────────────────────────────────────────────────

  function _initContainer(el) {
    // Idempotency: skip already-initialized containers
    if (el.getAttribute('data-booking-widget-init') === 'true') return;
    el.setAttribute('data-booking-widget-init', 'true');

    var username = el.getAttribute('data-practitioner');
    if (!username) return;

    var accentRaw = el.getAttribute('data-accent');
    var accent = (accentRaw && HEX_RE.test(accentRaw)) ? accentRaw : null;
    var mode = el.getAttribute('data-mode') || 'inline';
    var triggerText = el.getAttribute('data-trigger-text') || 'Book Now';
    var sessionId = el.getAttribute('data-session') || null;

    if (mode === 'modal') {
      _initModal(el, username, accent, triggerText, sessionId);
    } else {
      _initInline(el, username, accent, sessionId);
    }
  }

  function _scanAndInit() {
    var els = document.querySelectorAll('[data-practitioner]');
    for (var i = 0; i < els.length; i++) {
      _initContainer(els[i]);
    }
  }

  // ── DOMContentLoaded + MutationObserver ─────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scanAndInit);
  } else {
    _scanAndInit();
  }

  // MutationObserver for SPAs
  var _mo = new MutationObserver(function (mutations) {
    var needsScan = false;
    for (var i = 0; i < mutations.length; i++) {
      var mut = mutations[i];
      if (mut.type === 'childList' && mut.addedNodes.length > 0) {
        needsScan = true;
        break;
      }
    }
    if (needsScan) _scanAndInit();
  });
  _mo.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // ── Public API ──────────────────────────────────────────────────────────────

  window.BookingWidget = {
    /**
     * Open a modal widget.
     * @param {string|HTMLElement} [containerId] — id or element, defaults to first registered
     */
    open: function (containerId) {
      var entry = _findByContainerId(containerId);
      if (!entry) return;
      if (entry.mode === 'modal') _openModal(entry);
    },

    /**
     * Close a modal widget.
     * @param {string|HTMLElement} [containerId]
     */
    close: function (containerId) {
      var entry = _findByContainerId(containerId);
      if (!entry) return;
      if (entry.mode === 'modal') _closeModal(entry);
    },

    /**
     * Subscribe to widget events.
     * @param {'complete'|'close'|'error'} event
     * @param {Function} callback
     */
    on: function (event, callback) {
      if (typeof callback !== 'function') return;
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(callback);
    },

    /**
     * Unsubscribe from widget events.
     * @param {'complete'|'close'|'error'} event
     * @param {Function} callback
     */
    off: function (event, callback) {
      var cbs = _listeners[event];
      if (!cbs) return;
      _listeners[event] = cbs.filter(function (cb) { return cb !== callback; });
    },
  };

})();
