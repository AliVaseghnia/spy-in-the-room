(function (root, factory) {
  'use strict';

  var api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.SpyGameApi = api;
  } else if (root) {
    root.SpyGameApi = api;
  }
}(typeof window !== 'undefined'
  ? window
  : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var API_ROOT = '/api/games';
  var DEFAULT_TIMEOUT_MS = 15000;

  function createRequestError(code, status, message, details) {
    var error = new Error(message || 'Request failed.');

    error.name = 'SpyGameApiError';
    error.code = code || 'INTERNAL_ERROR';
    error.status = Number.isInteger(status) ? status : 0;
    error.message = message || 'Request failed.';
    error.details = details || {};
    return error;
  }

  function randomKey() {
    var cryptoObject = root && root.crypto;
    var bytes;

    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
      return cryptoObject.randomUUID();
    }
    if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
      bytes = new Uint8Array(16);
      cryptoObject.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (value) {
        return value.toString(16).padStart(2, '0');
      }).join('');
    }
    return 'spy-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function getFetch() {
    if (root && typeof root.fetch === 'function') {
      return root.fetch.bind(root);
    }
    if (typeof fetch === 'function') {
      return fetch;
    }
    return null;
  }

  function parseJsonResponse(response) {
    if (!response || typeof response.json !== 'function') {
      return Promise.resolve(null);
    }
    return response.json().catch(function () {
      return null;
    });
  }

  function errorFromResponse(response, body) {
    var errorBody = body && body.error ? body.error : {};
    var fallbackMessage = response && response.status === 409
      ? 'The game changed in another tab.'
      : 'Request failed.';

    return createRequestError(
      errorBody.code || (response && response.status === 409 ? 'REVISION_CONFLICT' : 'REQUEST_FAILED'),
      response && response.status,
      errorBody.message || fallbackMessage,
      errorBody.details || {}
    );
  }

  function request(path, options) {
    var fetchImpl = getFetch();
    var requestOptions = options || {};
    var headers = Object.assign({ Accept: 'application/json' }, requestOptions.headers || {});
    var timeoutMs = Number.isFinite(requestOptions.timeoutMs) && requestOptions.timeoutMs >= 0
      ? requestOptions.timeoutMs
      : DEFAULT_TIMEOUT_MS;
    var controller = null;
    var signal = requestOptions.signal;
    var timeoutId = null;
    var timedOut = false;
    var removeExternalAbort = null;
    var setTimer = root && typeof root.setTimeout === 'function' ? root.setTimeout.bind(root) : setTimeout;
    var clearTimer = root && typeof root.clearTimeout === 'function' ? root.clearTimeout.bind(root) : clearTimeout;

    if (!fetchImpl) {
      return Promise.reject(createRequestError(
        'NETWORK_ERROR',
        0,
        'No connection. Reconnect to keep playing.',
        {}
      ));
    }

    if (requestOptions.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (root && typeof root.AbortController === 'function') {
      controller = new root.AbortController();
      signal = controller.signal;
      if (requestOptions.signal) {
        if (requestOptions.signal.aborted) {
          controller.abort();
        } else if (typeof requestOptions.signal.addEventListener === 'function') {
          var forwardAbort = function () { controller.abort(); };
          requestOptions.signal.addEventListener('abort', forwardAbort, { once: true });
          removeExternalAbort = function () {
            if (typeof requestOptions.signal.removeEventListener === 'function') {
              requestOptions.signal.removeEventListener('abort', forwardAbort);
            }
          };
        }
      }
      timeoutId = setTimer(function () {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    var fetchOptions = Object.assign({}, requestOptions, {
      credentials: 'include',
      cache: 'no-store',
      headers: headers,
      signal: signal
    });
    delete fetchOptions.timeoutMs;

    return Promise.resolve().then(function () {
      return fetchImpl(path, fetchOptions);
    }).then(function (response) {
      return parseJsonResponse(response).then(function (body) {
        var successful = response && response.ok !== undefined
          ? response.ok
          : response && response.status >= 200 && response.status < 300;

        if (!successful) {
          throw errorFromResponse(response, body);
        }
        if (response.status === 204) {
          return { data: null, meta: {} };
        }
        if (!body || !Object.prototype.hasOwnProperty.call(body, 'data')) {
          throw createRequestError('INVALID_RESPONSE', response.status, 'The game sent back an unexpected reply.', {});
        }
        return {
          data: body.data,
          meta: body.meta || {}
        };
      });
    }).catch(function (error) {
      if (error && error.name === 'SpyGameApiError') {
        throw error;
      }
      if (timedOut) {
        throw createRequestError(
          'REQUEST_TIMEOUT',
          0,
          'That took too long. Check your connection and try again.',
          {}
        );
      }
      if (requestOptions.signal && requestOptions.signal.aborted) {
        throw createRequestError('REQUEST_ABORTED', 0, 'Request cancelled.', {});
      }
      throw createRequestError(
        'NETWORK_ERROR',
        0,
        'We can’t reach the game right now. Check your connection and try again.',
        {}
      );
    }).finally(function () {
      if (timeoutId !== null) clearTimer(timeoutId);
      if (removeExternalAbort) removeExternalAbort();
    });
  }

  function mutationKey(options) {
    return options && typeof options.idempotencyKey === 'string' && options.idempotencyKey.trim()
      ? options.idempotencyKey.trim()
      : randomKey();
  }

  function mutationOptions(options) {
    var input = options || {};
    return {
      idempotencyKey: mutationKey(input),
      signal: input.signal,
      timeoutMs: input.timeoutMs
    };
  }

  function createGame(input, options) {
    var mutation = mutationOptions(options);

    return request(API_ROOT, {
      method: 'POST',
      headers: {
        'Idempotency-Key': mutation.idempotencyKey
      },
      body: JSON.stringify(input || {}),
      signal: mutation.signal,
      timeoutMs: mutation.timeoutMs
    });
  }

  function listGames(options) {
    var input = options || {};
    return request(API_ROOT, {
      method: 'GET',
      signal: input.signal,
      timeoutMs: input.timeoutMs
    });
  }

  function getGame(gameId, options) {
    var input = options || {};
    return request(API_ROOT + '/' + encodeURIComponent(gameId), {
      method: 'GET',
      signal: input.signal,
      timeoutMs: input.timeoutMs
    });
  }

  function getCard(gameId, action, revision, options) {
    var mutation = mutationOptions(options);

    return request(API_ROOT + '/' + encodeURIComponent(gameId) + '/card', {
      method: 'POST',
      body: JSON.stringify({
        action: action,
        expectedRevision: revision,
        idempotencyKey: mutation.idempotencyKey
      }),
      headers: {
        'Idempotency-Key': mutation.idempotencyKey
      },
      signal: mutation.signal,
      timeoutMs: mutation.timeoutMs
    });
  }

  function act(gameId, command, revision, options) {
    var mutation = mutationOptions(options);
    var payload = typeof command === 'string' ? { type: command } : Object.assign({}, command || {});

    payload.expectedRevision = revision;
    payload.idempotencyKey = mutation.idempotencyKey;
    return request(API_ROOT + '/' + encodeURIComponent(gameId) + '/actions', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Idempotency-Key': mutation.idempotencyKey
      },
      signal: mutation.signal,
      timeoutMs: mutation.timeoutMs
    });
  }

  function listRounds(gameId, options) {
    var input = options || {};
    return request(API_ROOT + '/' + encodeURIComponent(gameId) + '/rounds', {
      method: 'GET',
      signal: input.signal,
      timeoutMs: input.timeoutMs
    });
  }

  function deleteGame(gameId, options) {
    var mutation = mutationOptions(options);

    return request(API_ROOT + '/' + encodeURIComponent(gameId), {
      method: 'DELETE',
      headers: {
        'Idempotency-Key': mutation.idempotencyKey
      },
      signal: mutation.signal,
      timeoutMs: mutation.timeoutMs
    });
  }

  return {
    createGame: createGame,
    listGames: listGames,
    getGame: getGame,
    getCard: getCard,
    act: act,
    listRounds: listRounds,
    deleteGame: deleteGame,
    createIdempotencyKey: randomKey
  };
}));
