// public/reset.html in the person's language, and after the reset (?done=1) a check that it
// worked. The clearing itself is done by the browser: /api/reset-browser answers with
// Clear-Site-Data. Every check gives up after a few seconds – a storage that does not answer is
// exactly the case this page is for – and then says what to do instead.
;(() => {
  const saved = (() => {
    try {
      return localStorage.getItem('pv.locale')
    } catch {
      return null
    }
  })()
  const en = (saved || navigator.language || 'de').toLowerCase().indexOf('de') !== 0
  const text = en
    ? {
        title: 'Reset Propario in this browser',
        what: 'Helps when Propario stays blank or does not finish loading. Removes only Propario’s copy on this device: cached data and app files. You stay signed in; your data is on the server.',
        close: 'Close the installed Propario app and other Propario tabs first.',
        reset: 'Reset now',
        checking: 'Checking …',
        open: 'Open Propario',
        done: 'Done',
        doneText: 'Propario’s copy in this browser has been removed. Open Propario – it loads everything again from the server.',
        stuck: 'The browser’s storage does not respond',
        stuckText:
          'This browser could not remove everything. Close the browser completely (also from the recent apps), open it again and try once more. If that does not help: browser settings → Site settings → propario → Delete data.',
      }
    : {
        checking: 'Wird geprüft …',
        done: 'Erledigt',
        doneText: 'Die Kopie von Propario in diesem Browser ist entfernt. Öffne Propario – es lädt alles neu vom Server.',
        stuck: 'Der Speicher des Browsers antwortet nicht',
        stuckText:
          'Dieser Browser konnte nicht alles entfernen. Schließe den Browser vollständig (auch aus den zuletzt verwendeten Apps), öffne ihn neu und versuche es noch einmal. Hilft das nicht: Browser-Einstellungen → Website-Einstellungen → propario → Daten löschen.',
      }
  if (en) {
    document.documentElement.lang = 'en'
    document.title = 'Propario – reset'
    document.querySelectorAll('[data-t]').forEach((el) => {
      const t = text[el.getAttribute('data-t')]
      if (t) el.textContent = t
    })
  }
  if (!/[?&]done=1/.test(location.search)) return

  document.getElementById('start').hidden = true
  document.getElementById('done').hidden = false
  const title = document.getElementById('done-title')
  const status = document.getElementById('done-text')
  const atMost = (work, ms) => Promise.race([work, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
  // Left over: a service worker, cached files or a data copy of Propario.
  const leftovers = Promise.all([
    'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0,
    'caches' in window ? caches.keys().then((k) => k.length) : 0,
    indexedDB.databases ? indexedDB.databases().then((d) => d.filter((x) => (x.name || '').indexOf('propario-') === 0).length) : 0,
  ]).then((counts) => counts.reduce((a, b) => a + b, 0))
  atMost(leftovers, 5000)
    .then((left) => (left === 0 ? 'done' : 'stuck'))
    .catch(() => 'stuck')
    .then((result) => {
      title.textContent = text[result]
      status.textContent = text[result + 'Text']
    })
})()
