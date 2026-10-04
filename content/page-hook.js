// Runs in the page's own JavaScript world (manifest "world": "MAIN") so it can see ChatGPT's fetch
// calls. All it does is announce when a streamed reply starts and when it finishes, so the content
// script can refresh usage right after each message; everything else lives in tracker.js.
'use strict';

(() => {
  const nativeFetch = window.fetch;
  if (typeof nativeFetch !== 'function') return;

  let active = 0;

  // A string detail is the one payload that reliably crosses from this world to the content
  // script's isolated world.
  function emit(phase) {
    document.dispatchEvent(new CustomEvent('cgut:generation', { detail: phase }));
  }

  function requestMethod([input, init]) {
    return (init?.method || (input instanceof Request ? input.method : '') || 'GET').toUpperCase();
  }

  // Reads a copy of the stream to its end; the page reads the original untouched.
  async function watch(response) {
    if (++active === 1) emit('start');
    try {
      const reader = response.clone().body.getReader();
      while (!(await reader.read()).done) { /* drain */ }
    } catch {
      // Aborted or failed: the reply is over either way.
    } finally {
      if (--active === 0) emit('end');
    }
  }

  // A Proxy keeps fetch looking native (toString, name, length) to anything that inspects it.
  window.fetch = new Proxy(nativeFetch, {
    apply(target, thisArg, args) {
      const promise = Reflect.apply(target, thisArg, args);
      try {
        if (requestMethod(args) === 'POST') {
          // Registered before the caller's own handlers, so the copy is taken before the page
          // starts consuming the body.
          promise.then((res) => {
            if (res.body && (res.headers.get('content-type') || '').includes('text/event-stream')) watch(res);
          }, () => {});
        }
      } catch {
        // Never let the hook break the page's request.
      }
      return promise;
    },
  });
})();
