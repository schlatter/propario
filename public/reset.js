// Resets Propario in this browser (public/reset.html): service worker, cached app files and the
// local copy of the data. The sign-in cookie stays; the data on
// the server is untouched. Plain script, independent of the app, so it works when the app does not.
;(function () {
  var button = document.getElementById('reset')
  var status = document.getElementById('status')
  var open = document.getElementById('open')

  function quietly(promise) {
    return Promise.resolve(promise).catch(function () {})
  }

  /** Resolves with true when deleted, false when another Propario window keeps it open. */
  function deleteDatabase(name) {
    return new Promise(function (resolve) {
      var request = indexedDB.deleteDatabase(name)
      request.onsuccess = function () {
        resolve(true)
      }
      request.onerror = function () {
        resolve(false)
      }
      request.onblocked = function () {
        resolve(false)
      }
    })
  }

  button.addEventListener('click', function () {
    button.disabled = true
    status.textContent = 'Wird zurückgesetzt … · Resetting …'
    var workers = 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations() : Promise.resolve([])
    quietly(
      workers.then(function (registrations) {
        return Promise.all(registrations.map((r) => quietly(r.unregister())))
      }),
    )
      .then(function () {
        return quietly(
          'caches' in window
            ? caches.keys().then(function (keys) {
                return Promise.all(keys.map((k) => caches.delete(k)))
              })
            : null,
        )
      })
      .then(function () {
        // Only Propario's own data copies; "produktvergleich" holds data from before accounts.
        var list = indexedDB.databases ? indexedDB.databases() : Promise.resolve([])
        return list.then(function (dbs) {
          return Promise.all(
            dbs
              .map((d) => d.name)
              .filter((n) => n && n.indexOf('propario-') === 0)
              .map(deleteDatabase),
          )
        })
      })
      .then(function (results) {
        try {
          sessionStorage.clear()
        } catch (e) {}
        var blocked = (results || []).indexOf(false) >= 0
        status.textContent = blocked
          ? 'Fast fertig: Bitte die installierte Propario-App und andere Propario-Tabs schließen, dann Propario öffnen. · Almost done: close the installed app and other Propario tabs, then open Propario.'
          : 'Erledigt. · Done.'
        open.hidden = false
        open.focus()
      })
      .catch(function (e) {
        status.textContent = 'Das hat nicht geklappt: ' + e + ' · This did not work.'
        button.disabled = false
      })
  })
})()
