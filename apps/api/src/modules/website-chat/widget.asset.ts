/**
 * Self-contained embeddable chat widget, served verbatim at
 * `GET /channels/website-chat/widget.js`. Vanilla JS, no dependencies, no build
 * step. Kept as a string constant so `nest build` ships it without asset config.
 *
 * Host page usage:
 *   <script src="https://api.example.com/channels/website-chat/widget.js"
 *           data-channel-id="chan_xxx" async></script>
 */
export const WIDGET_JS = `(function () {
  var script =
    document.currentScript ||
    (function () {
      var s = document.querySelectorAll('script[data-channel-id]');
      return s[s.length - 1];
    })();
  if (!script) return;
  // Idempotent: if a bubble is already on the page (script re-injected, SPA
  // re-mount), do nothing.
  if (document.querySelector('.aiemp-btn')) return;
  var channelId = script.getAttribute('data-channel-id');
  if (!channelId) return;
  var apiBase =
    script.getAttribute('data-api-base') ||
    (function () {
      try { return new URL(script.src).origin; } catch (e) { return ''; }
    })();
  var base = apiBase + '/channels/website-chat/' + encodeURIComponent(channelId);

  var storeKey = 'ai-employee.wc.' + channelId;
  var sessionId = '';
  try { sessionId = localStorage.getItem(storeKey) || ''; } catch (e) {}
  if (!sessionId) {
    sessionId = 'wc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(storeKey, sessionId); } catch (e) {}
  }

  var cfg = { title: 'Chat with us', accentColor: '#2a78d6', greeting: 'Hi! How can we help?' };
  var seen = {};
  var isOpen = false;
  var pollTimer = null;
  var lastAfter = '';

  var style = document.createElement('style');
  style.textContent =
    '.aiemp-btn{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);color:#fff;font-size:24px;z-index:2147483000}' +
    '.aiemp-panel{position:fixed;bottom:88px;right:20px;width:340px;max-width:calc(100vw - 40px);height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.aiemp-panel.aiemp-open{display:flex}' +
    '.aiemp-head{padding:14px 16px;color:#fff;font-weight:600;font-size:15px}' +
    '.aiemp-body{flex:1;overflow-y:auto;padding:12px;background:#f7f7f5}' +
    '.aiemp-msg{margin:6px 0;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;max-width:80%;white-space:pre-wrap;word-wrap:break-word}' +
    '.aiemp-msg.c{color:#fff;margin-left:auto;border-bottom-right-radius:4px}' +
    '.aiemp-msg.a{background:#fff;color:#111;border:1px solid #e1e0d9;border-bottom-left-radius:4px}' +
    '.aiemp-foot{display:flex;border-top:1px solid #e1e0d9;background:#fff}' +
    '.aiemp-foot input{flex:1;border:none;padding:12px;font-size:14px;outline:none;background:#fff;color:#111}' +
    '.aiemp-foot button{border:none;background:transparent;font-weight:600;padding:0 14px;cursor:pointer}';
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.className = 'aiemp-btn';
  btn.setAttribute('aria-label', 'Open chat');
  btn.innerHTML = '&#128172;';

  var panel = document.createElement('div');
  panel.className = 'aiemp-panel';
  panel.innerHTML =
    '<div class="aiemp-head"></div>' +
    '<div class="aiemp-body"></div>' +
    '<form class="aiemp-foot"><input type="text" placeholder="Type a message..." autocomplete="off"/><button type="submit">Send</button></form>';

  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(panel);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  var head = panel.querySelector('.aiemp-head');
  var body = panel.querySelector('.aiemp-body');
  var form = panel.querySelector('.aiemp-foot');
  var input = panel.querySelector('.aiemp-foot input');

  function applyCfg() {
    btn.style.background = cfg.accentColor;
    head.style.background = cfg.accentColor;
    head.textContent = cfg.title;
    form.querySelector('button').style.color = cfg.accentColor;
    var mine = body.querySelectorAll('.aiemp-msg.c');
    for (var i = 0; i < mine.length; i++) mine[i].style.background = cfg.accentColor;
  }

  function addMsg(text, mine, id) {
    if (id) {
      if (seen[id]) return;
      seen[id] = true;
    }
    var el = document.createElement('div');
    el.className = 'aiemp-msg ' + (mine ? 'c' : 'a');
    if (mine) el.style.background = cfg.accentColor;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function poll() {
    var url = base + '/messages?sessionId=' + encodeURIComponent(sessionId);
    if (lastAfter) url += '&after=' + encodeURIComponent(lastAfter);
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.messages) return;
        data.messages.forEach(function (m) {
          addMsg(m.content, m.sender === 'CUSTOMER', m.id);
          if (!lastAfter || m.createdAt > lastAfter) lastAfter = m.createdAt;
        });
      })
      .catch(function () {});
  }

  function startPolling() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, 2500);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    var tempId = 'temp_' + Date.now();
    addMsg(text, true, tempId);
    fetch(base + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, message: text })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (res) {
        if (res && res.messageId) {
          seen[res.messageId] = true;
        }
        startPolling();
      })
      .catch(function () {});
  });

  btn.addEventListener('click', function () {
    isOpen = !isOpen;
    panel.classList.toggle('aiemp-open', isOpen);
    if (isOpen) { input.focus(); startPolling(); }
  });

  fetch(base + '/config')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data && data.active === false) {
        // Channel paused — don't show the widget at all.
        btn.remove();
        panel.remove();
        style.remove();
        return;
      }
      if (data) {
        cfg.title = data.title || cfg.title;
        cfg.accentColor = data.accentColor || cfg.accentColor;
        cfg.greeting = data.greeting || cfg.greeting;
      }
      applyCfg();
      if (cfg.greeting) addMsg(cfg.greeting, false);
    })
    .catch(function () { applyCfg(); });
})();
`;
