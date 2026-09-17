(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  }
  if (root) root.SpyPrefs = factory(root);
}(typeof window !== 'undefined'
  ? window
  : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /*
   * Device-local preferences only. This module is the single place that
   * touches browser storage, and it is limited to an explicit allow-list:
   * remembered player names, cue flags, and the chaos-mode toggle. Secrets,
   * cards, snapshots, game ids, and round history are never written here.
   */
  var STORAGE_KEY = 'spy-in-the-room:prefs:v1';
  var MAX_ROSTER = 12;
  var MAX_NAME_LENGTH = 32;
  var DEFAULT_FLAGS = Object.freeze({ sound: true, haptics: true, spice: false });

  function storage() {
    try {
      var candidate = root && root.localStorage;
      if (!candidate || typeof candidate.getItem !== 'function') return null;
      return candidate;
    } catch (error) {
      return null;
    }
  }

  function sanitizeName(value) {
    if (typeof value !== 'string') return '';
    var name = value.trim().replace(/\s+/g, ' ');
    if (!name) return '';
    return name.slice(0, MAX_NAME_LENGTH);
  }

  function sanitizeRoster(value) {
    var seen = Object.create(null);
    var result = [];

    if (!Array.isArray(value)) return result;
    value.forEach(function (entry) {
      var name = sanitizeName(entry);
      var key = name.toLowerCase();
      if (!name || seen[key] || result.length >= MAX_ROSTER) return;
      seen[key] = true;
      result.push(name);
    });
    return result;
  }

  function sanitizeFlags(value) {
    var flags = {
      sound: DEFAULT_FLAGS.sound,
      haptics: DEFAULT_FLAGS.haptics,
      spice: DEFAULT_FLAGS.spice
    };

    if (value && typeof value === 'object') {
      if (typeof value.sound === 'boolean') flags.sound = value.sound;
      if (typeof value.haptics === 'boolean') flags.haptics = value.haptics;
      if (typeof value.spice === 'boolean') flags.spice = value.spice;
    }
    return flags;
  }

  function load() {
    var store = storage();
    var parsed = null;

    if (!store) return { roster: [], flags: sanitizeFlags(null) };
    try {
      parsed = JSON.parse(store.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { roster: [], flags: sanitizeFlags(null) };
    }
    return {
      roster: sanitizeRoster(parsed.roster),
      flags: sanitizeFlags(parsed.flags)
    };
  }

  function persist(state) {
    var store = storage();
    var payload = {
      roster: sanitizeRoster(state.roster),
      flags: sanitizeFlags(state.flags)
    };

    if (!store) return payload;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Storage can be full or blocked; preferences are optional.
    }
    return payload;
  }

  function currentState() {
    return load();
  }

  function saveRoster(names) {
    var state = currentState();
    return persist({ roster: sanitizeRoster(names), flags: state.flags });
  }

  function saveFlags(flags) {
    var state = currentState();
    return persist({
      roster: state.roster,
      flags: sanitizeFlags(Object.assign({}, state.flags, flags || {}))
    });
  }

  function clearAll() {
    var store = storage();
    if (store && typeof store.removeItem === 'function') {
      try {
        store.removeItem(STORAGE_KEY);
      } catch (error) {
        // Ignore blocked storage.
      }
    }
    return { roster: [], flags: sanitizeFlags(null) };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_FLAGS: DEFAULT_FLAGS,
    load: load,
    saveRoster: saveRoster,
    saveFlags: saveFlags,
    clearAll: clearAll,
    sanitizeRoster: sanitizeRoster
  };
}));
