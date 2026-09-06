// Runs before React to apply the saved theme under script-src self.
      ;(function () {
        try {
          var keys = Object.keys(localStorage).filter(function (k) {
            return k.indexOf('procurenance.theme.') === 0
          })
          // A signed-in user's own key is preferred over the anonymous one.
          var owned = keys.filter(function (k) {
            return k !== 'procurenance.theme.public'
          })
          var pref = localStorage.getItem(owned[0] || 'procurenance.theme.public')
          // No stored preference means LIGHT, not "ask the OS". A first-time
          // visitor on a dark-mode phone should still see a government records
          // portal in its default appearance; dark is opt-in. Someone who has
          // explicitly chosen 'system' still gets the OS setting.
          var dark =
            pref === 'dark' ||
            (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.theme = dark ? 'dark' : 'light'
        } catch {
          /* Blocked storage only costs the flash — never worth failing over. */
        }
      })()
