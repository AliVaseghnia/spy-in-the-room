(function (root) {
  'use strict';

  var documentRef = root && root.document;
  var logic = root && root.SpyGameLogic;
  var api = root && root.SpyGameApi;
  var prefs = root && root.SpyPrefs;
  var view = root && root.SpyGameView;
  var performanceRef = root && root.performance;

  if (!documentRef || !logic || !api || !view) {
    return;
  }

  var DEFAULT_TIMER_SECONDS = 300;
  var CUSTOM_TIMER_MIN_MINUTES = 1;
  var CUSTOM_TIMER_MAX_MINUTES = 60;
  var MAX_PLAYERS = 12;
  var MIN_PLAYERS = 4;
  var MAX_CUSTOM_SECRET_LENGTH = 80;
  var TAP_PEEK_MS = 400;
  var TIMED_REVEAL_MS = 5000;
  var PHASE_LABELS = {
    setup: 'Get ready',
    resume: 'Saved games',
    reveal: 'Peek & pass',
    round: 'Ask around',
    accuse: 'Call it',
    'spy-guess': 'One last shot',
    result: 'Reveal'
  };
  var RESUME_PHASE_LABELS = {
    reveal: 'Peek & pass',
    round: 'Ask around',
    accuse: 'Call it',
    'spy-guess': 'One last shot',
    result: 'Round complete'
  };
  var VIEW_PHASES = ['resume', 'setup', 'reveal', 'round', 'accuse', 'guess', 'result'];

  var state = {
    snapshot: null,
    visibleCard: null,
    history: [],
    resumeGames: [],
    roster: [],
    prefs: { sound: true, haptics: true, spice: false },
    showResume: false,
    connection: 'checking',
    sessionReady: false,
    generation: 0,
    mutationBusy: false,
    mutationSequence: 0,
    mutationOwner: null,
    mutationQueues: Object.create(null),
    retryOperation: null,
    displayIntervalId: null,
    refreshInFlight: false,
    snapshotRequestSequence: 0,
    latestSnapshotRequest: 0,
    snapshotAbortController: null,
    historyRequestSequence: 0,
    latestHistoryRequest: 0,
    historyAbortController: null,
    gamesRequestSequence: 0,
    latestGamesRequest: 0,
    gamesAbortController: null,
    connectionOperationSequence: 0,
    connectionErrorEpoch: 0,
    serverNowMs: Date.now(),
    clockCapturedAtMs: Date.now(),
    historyNextCursor: null,
    pendingAccusationPlayerId: null,
    pendingGuessLocation: null,
    pendingReplaySecret: '',
    pendingResumeDeleteGameId: null,
    showEndRoundDialog: false,
    showReplaySecretForm: false,
    showGuessCallPanel: false,
    privacyLocked: false,
    peeking: false,
    cardsSeen: false,
    timedReveal: false,
    holdStartedAt: 0,
    peekTimerId: null,
    pressTimerId: null,
    prefetchedCard: null,
    prefetchedFor: '',
    pointerHandledAt: 0,
    keyboardPeeking: false,
    question: null,
    twist: '',
    guessFilter: '',
    shareStatus: '',
    wakeLock: null,
    soundEnabled: true,
    hapticsEnabled: true,
    audioContext: null,
    lastTimerCue: null
  };

  var lastRenderedPhase = null;
  var pendingAnnouncement = '';
  var pendingServiceWorker = null;
  var updateRequested = false;
  var reloadingForUpdate = false;
  var refs = null;
  var skipInitialFocus = true;

  function getElement(id) {
    return documentRef.getElementById(id);
  }

  function collectReferences() {
    refs = {
      app: getElement('app'),
      howToPlayButton: getElement('how-to-play-button'),
      howToPlayDialog: getElement('how-to-play-dialog'),
      closeHowToPlayButton: getElement('close-how-to-play-button'),
      phaseLabel: getElement('phase-label'),
      roundStatus: getElement('round-status'),
      connectionStatus: getElement('connection-status'),
      announcement: getElement('announcement'),
      resumeView: getElement('resume-view'),
      resumeList: getElement('resume-list'),
      resumeNewGameButton: getElement('resume-new-game-button'),
      connectionError: getElement('connection-error'),
      connectionErrorMessage: getElement('connection-error-message'),
      retryButton: getElement('retry-button'),
      setupView: getElement('setup-view'),
      playerForm: getElement('player-form'),
      playerNameInput: getElement('player-name-input'),
      playerChips: getElement('player-chips'),
      playerCount: getElement('player-count'),
      playerEmptyState: getElement('player-empty-state'),
      playerError: getElement('player-error'),
      addPlayerButton: getElement('add-player-button'),
      startButton: getElement('start-button'),
      timerInputs: documentRef.querySelectorAll('[name="timerSeconds"]'),
      customTimerField: getElement('custom-timer-field'),
      customTimerInput: getElement('custom-timer-minutes'),
      customTimerDecrease: getElement('custom-timer-decrease'),
      customTimerIncrease: getElement('custom-timer-increase'),
      spiceToggle: getElement('spice-toggle'),
      settingsButton: getElement('settings-button'),
      settingsDialog: getElement('settings-dialog'),
      closeSettingsButton: getElement('close-settings-button'),
      forgetRosterButton: getElement('forget-roster-button'),
      secretModeDeck: getElement('secret-mode-deck'),
      secretModeCustom: getElement('secret-mode-custom'),
      customSecretField: getElement('custom-secret-field'),
      customSecretInput: getElement('custom-secret-input'),
      customSecretError: getElement('custom-secret-error'),
      revealView: getElement('reveal-view'),
      revealCard: getElement('reveal-card'),
      revealCardFace: getElement('reveal-card-face'),
      revealArt: getElement('reveal-art'),
      revealName: getElement('reveal-name'),
      revealAvatar: getElement('reveal-avatar'),
      revealProgress: getElement('reveal-progress'),
      revealLabel: getElement('reveal-label'),
      revealSecret: getElement('reveal-secret'),
      revealHint: getElement('reveal-hint'),
      revealActionLabel: getElement('reveal-action-label'),
      holdNote: getElement('hold-note'),
      privacyCover: getElement('privacy-cover'),
      revealAction: getElement('reveal-action'),
      roundView: getElement('round-view'),
      roundTitle: getElement('round-title'),
      roundTimer: getElement('round-timer'),
      timerRing: getElement('timer-ring'),
      timerRingProgress: getElement('timer-ring-progress'),
      roundIntel: getElement('round-intel'),
      twistStrip: getElement('twist-strip'),
      twistText: getElement('twist-text'),
      questionPrompt: getElement('question-prompt'),
      drawQuestionButton: getElement('draw-question-button'),
      roundLocationHint: getElement('round-location-hint'),
      endRoundButton: getElement('end-round-button'),
      endRoundDialog: getElement('end-round-dialog'),
      confirmEndRoundButton: getElement('confirm-end-round-button'),
      cancelEndRoundButton: getElement('cancel-end-round-button'),
      callGuessButton: getElement('call-guess-button'),
      guessCallPanel: getElement('guess-call-panel'),
      guessCallerList: getElement('guess-caller-list'),
      accuseView: getElement('accuse-view'),
      suspectList: getElement('suspect-list'),
      accusationDialog: getElement('accusation-dialog'),
      accusationConfirmation: getElement('accusation-confirmation'),
      accusationConfirmationCopy: getElement('accusation-confirmation-copy'),
      confirmAccusationButton: getElement('confirm-accusation-button'),
      cancelAccusationButton: getElement('cancel-accusation-button'),
      guessView: getElement('guess-view'),
      guessList: getElement('guess-list'),
      guessSearchField: getElement('guess-search-field'),
      guessSearchInput: getElement('guess-search-input'),
      guessCustomForm: getElement('guess-custom-form'),
      guessInput: getElement('guess-input'),
      guessInputError: getElement('guess-input-error'),
      guessTurnLabel: getElement('guess-turn-label'),
      guessDialog: getElement('guess-dialog'),
      guessConfirmationCopy: getElement('guess-confirmation-copy'),
      confirmGuessButton: getElement('confirm-guess-button'),
      cancelGuessButton: getElement('cancel-guess-button'),
      soundToggle: getElement('sound-toggle'),
      hapticsToggle: getElement('haptics-toggle'),
      resultView: getElement('result-view'),
      resultStamp: getElement('result-stamp'),
      resultStampLabel: getElement('result-stamp-label'),
      resultTitle: getElement('result-title'),
      resultCopy: getElement('result-copy'),
      resultProgress: getElement('result-progress'),
      resultSecretLabel: getElement('result-secret-label'),
      resultLocation: getElement('result-location'),
      resultSpies: getElement('result-spies'),
      sessionScoreStatus: getElement('session-score-status'),
      roundPointsList: getElement('round-points-list'),
      scoreboardList: getElement('scoreboard-list'),
      replayButton: getElement('replay-button'),
      shareResultButton: getElement('share-result-button'),
      replaySecretPanel: getElement('replay-secret-panel'),
      replaySecretForm: getElement('replay-secret-form'),
      replaySecretInput: getElement('replay-secret-input'),
      replaySecretError: getElement('replay-secret-error'),
      replaySecretRound: getElement('replay-secret-round'),
      replaySecretSubmit: getElement('replay-secret-submit'),
      replaySecretCancel: getElement('replay-secret-cancel'),
      newGameButton: getElement('new-game-button'),
      deleteGameButton: getElement('delete-game-button'),
      deleteConfirmation: getElement('delete-confirmation'),
      confirmDeleteButton: getElement('confirm-delete-button'),
      cancelDeleteButton: getElement('cancel-delete-button'),
      resumeDeleteDialog: getElement('resume-delete-dialog'),
      resumeDeleteCopy: getElement('resume-delete-copy'),
      confirmResumeDeleteButton: getElement('confirm-resume-delete-button'),
      cancelResumeDeleteButton: getElement('cancel-resume-delete-button'),
      historyList: getElement('history-list')
    };

    return refs.app && refs.playerForm && refs.playerChips && refs.startButton && refs.resumeView;
  }

  function getSetupNames() {
    return state.roster.slice();
  }

  function validateSetup() {
    return logic.validatePlayers(getSetupNames());
  }

  function updateSetupControls() {
    var names = state.roster;
    var validation = validateSetup();
    var customMode = readSecretMode() === 'custom';
    var secretValidation = validateCustomSecret(readCustomSecret(), customMode);
    var remaining = MIN_PLAYERS - names.length;

    refs.playerCount.textContent = names.length + ' / ' + MAX_PLAYERS;
    refs.startButton.textContent = state.mutationBusy ? 'Dealing the cards…' : 'Deal the cards';
    refs.startButton.disabled = !validation.ok || !state.sessionReady;
    refs.startButton.disabled = refs.startButton.disabled
      || !secretValidation.ok || state.mutationBusy;
    refs.addPlayerButton.disabled = names.length >= MAX_PLAYERS || state.mutationBusy;
    refs.playerEmptyState.hidden = names.length >= MIN_PLAYERS;
    refs.playerEmptyState.textContent = names.length === 0
      ? 'Add 4 names to start.'
      : 'Add ' + remaining + ' more name' + (remaining === 1 ? '' : 's') + ' to start.';
    var customTimerMinutes = readCustomTimerMinutes();

    refs.customTimerField.hidden = !isCustomTimerSelected();
    if (refs.customTimerDecrease) {
      refs.customTimerDecrease.disabled = customTimerMinutes <= CUSTOM_TIMER_MIN_MINUTES;
    }
    if (refs.customTimerIncrease) {
      refs.customTimerIncrease.disabled = customTimerMinutes >= CUSTOM_TIMER_MAX_MINUTES;
    }
    refs.customSecretField.hidden = !customMode;
    refs.customSecretInput.required = customMode;
    if (!customMode || secretValidation.ok || !readCustomSecret()) {
      showCustomSecretError('', refs.customSecretInput, refs.customSecretError);
    } else {
      showCustomSecretError(secretValidation.error, refs.customSecretInput, refs.customSecretError);
    }

    if (names.length >= MIN_PLAYERS && !validation.ok) {
      showSetupError(validation.error);
    } else if (!refs.playerError.hidden) {
      refs.playerError.textContent = validation.ok ? '' : validation.error;
      refs.playerError.hidden = validation.ok;
    }
  }

  function showSetupError(message) {
    refs.playerError.textContent = message || '';
    refs.playerError.hidden = !message;
  }

  function persistRoster() {
    if (prefs && typeof prefs.saveRoster === 'function') prefs.saveRoster(state.roster);
  }

  function addRosterName(rawName) {
    var name = normalizeSecretInput(rawName);

    if (!name || state.mutationBusy) return false;
    if (state.roster.length >= MAX_PLAYERS) {
      showSetupError('Twelve players is the max. Remove one to add another.');
      return false;
    }
    if (state.roster.some(function (existing) {
      return existing.toLowerCase() === name.toLowerCase();
    })) {
      showSetupError(name + ' is already in the room.');
      return false;
    }

    state.roster.push(name);
    showSetupError('');
    persistRoster();
    updateSetupControls();
    render();
    return true;
  }

  function removeRosterName(index) {
    if (state.mutationBusy || !Number.isInteger(index) || index < 0 || index >= state.roster.length) return;
    state.roster.splice(index, 1);
    showSetupError('');
    persistRoster();
    updateSetupControls();
    render();
    focusElement(refs.playerNameInput);
  }

  function closestWithin(target, selector, container) {
    var current = target;

    while (current && current !== container) {
      if (current.matches && current.matches(selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  function readTimerSelection() {
    var inputs = refs.timerInputs || [];
    var selected = null;

    Array.prototype.forEach.call(inputs, function (input) {
      if (input.checked) selected = input;
    });
    if (selected && selected.value === 'custom') return readCustomTimerMinutes() * 60;

    var seconds = selected ? Number(selected.value) : NaN;
    return Number.isFinite(seconds) && seconds > 0
      ? Math.floor(seconds)
      : DEFAULT_TIMER_SECONDS;
  }

  function setTimerSelection(seconds) {
    var target = String(seconds);
    var matched = false;

    Array.prototype.forEach.call(refs.timerInputs || [], function (input) {
      var isMatch = input.value === target;
      input.checked = isMatch;
      if (isMatch) matched = true;
    });
    if (matched) return;

    setCustomTimerMinutes(Number(seconds) / 60);
    selectCustomTimer();
  }

  function clampCustomTimerMinutes(value) {
    var minutes = Math.round(Number(value));

    if (!Number.isFinite(minutes)) minutes = DEFAULT_TIMER_SECONDS / 60;
    return Math.min(CUSTOM_TIMER_MAX_MINUTES, Math.max(CUSTOM_TIMER_MIN_MINUTES, minutes));
  }

  function readCustomTimerMinutes() {
    return clampCustomTimerMinutes(refs.customTimerInput && refs.customTimerInput.value);
  }

  function setCustomTimerMinutes(value) {
    var minutes = clampCustomTimerMinutes(value);

    if (refs.customTimerInput) refs.customTimerInput.value = String(minutes);
    return minutes;
  }

  function isCustomTimerSelected() {
    var selected = false;

    Array.prototype.forEach.call(refs.timerInputs || [], function (input) {
      if (input.checked && input.value === 'custom') selected = true;
    });
    return selected;
  }

  function selectCustomTimer() {
    Array.prototype.forEach.call(refs.timerInputs || [], function (input) {
      if (input.value === 'custom') input.checked = true;
    });
  }

  function announceTimerSelection() {
    setAnnouncement('Round length: ' + Math.round(readTimerSelection() / 60) + ' minutes.');
  }

  function stepCustomTimer(delta) {
    var minutes = setCustomTimerMinutes(readCustomTimerMinutes() + delta);

    selectCustomTimer();
    setAnnouncement('Round length: ' + minutes + ' minutes.');
    updateSetupControls();
    render();
  }

  function normalizeSecretInput(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function readSecretMode() {
    return refs.secretModeCustom && refs.secretModeCustom.checked ? 'custom' : 'deck';
  }

  function readCustomSecret() {
    return normalizeSecretInput(refs.customSecretInput && refs.customSecretInput.value);
  }

  function validateCustomSecret(value, required) {
    var normalized = normalizeSecretInput(value);

    if (!required && normalized.length === 0) return { ok: true, value: '' };
    if (normalized.length < 2) {
      return { ok: false, value: normalized, error: 'Enter at least two characters for the secret.' };
    }
    if (normalized.length > MAX_CUSTOM_SECRET_LENGTH) {
      return { ok: false, value: normalized, error: 'Keep the secret to 80 characters or fewer.' };
    }
    return { ok: true, value: normalized };
  }

  function showCustomSecretError(message, input, errorElement) {
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (errorElement) {
      errorElement.textContent = message || '';
      errorElement.hidden = !message;
    }
  }

  function focusElement(element) {
    if (element && typeof element.focus === 'function') element.focus();
  }

  function markPerformance(name) {
    var safeName;

    if (!performanceRef || typeof performanceRef.mark !== 'function') return;
    safeName = String(name || '').replace(/[^a-z0-9-]/gi, '-').slice(0, 64);
    if (!safeName) return;
    try {
      performanceRef.mark('spy-' + safeName);
    } catch (error) {
      // Performance marks are optional diagnostics and must never affect play.
    }
  }

  function getFirstChoice(list) {
    return list && list.querySelector ? list.querySelector('.choice-button') : null;
  }

  function getFirstResumeButton() {
    return refs.resumeList && refs.resumeList.querySelector
      ? refs.resumeList.querySelector('[data-resume-game-id]')
      : null;
  }

  function setAnnouncement(message) {
    pendingAnnouncement = message || '';
  }

  function currentPhase() {
    if (state.snapshot && state.snapshot.phase) return state.snapshot.phase;
    return state.showResume ? 'resume' : 'setup';
  }

  function currentGameId() {
    return state.snapshot && state.snapshot.gameId ? state.snapshot.gameId : null;
  }

  function isCurrentGeneration(generation) {
    return generation === state.generation;
  }

  function beginMutation() {
    state.mutationSequence += 1;
    state.mutationOwner = state.mutationSequence;
    return state.mutationOwner;
  }

  function ownsMutation(generation, operationToken) {
    return isCurrentGeneration(generation) && state.mutationOwner === operationToken;
  }

  function releaseMutation(generation, operationToken) {
    if (!ownsMutation(generation, operationToken)) return false;
    state.mutationBusy = false;
    state.mutationOwner = null;
    return true;
  }

  function createAbortController() {
    return root && typeof root.AbortController === 'function'
      ? new root.AbortController()
      : null;
  }

  function abortController(controller) {
    if (controller && typeof controller.abort === 'function') controller.abort();
  }

  function abortPendingRequests() {
    abortController(state.snapshotAbortController);
    abortController(state.historyAbortController);
    state.snapshotAbortController = null;
    state.historyAbortController = null;
    state.snapshotRequestSequence += 1;
    state.latestSnapshotRequest = state.snapshotRequestSequence;
    state.historyRequestSequence += 1;
    state.latestHistoryRequest = state.historyRequestSequence;
    invalidateGamesRequests();
    state.refreshInFlight = false;
  }

  function beginSnapshotRequest() {
    abortController(state.snapshotAbortController);
    state.snapshotRequestSequence += 1;
    state.latestSnapshotRequest = state.snapshotRequestSequence;
    state.snapshotAbortController = createAbortController();
    return state.snapshotRequestSequence;
  }

  function hasCurrentSnapshotRevision(snapshot) {
    var currentRevision;
    var nextRevision;

    if (!state.snapshot || state.snapshot.gameId !== snapshot.gameId) return true;

    currentRevision = Number(state.snapshot.revision);
    nextRevision = Number(snapshot.revision);
    return !Number.isFinite(currentRevision)
      || !Number.isFinite(nextRevision)
      || nextRevision >= currentRevision;
  }

  function canApplySnapshot(snapshot, gameId, generation, requestSequence) {
    if (!isCurrentGeneration(generation) || !snapshot || snapshot.gameId !== gameId) return false;
    if (requestSequence !== state.latestSnapshotRequest) return false;
    return hasCurrentSnapshotRevision(snapshot);
  }

  function isLatestSnapshotRequest(requestSequence) {
    return requestSequence === state.latestSnapshotRequest;
  }

  function invalidateHistoryRequests() {
    abortController(state.historyAbortController);
    state.historyAbortController = null;
    state.historyRequestSequence += 1;
    state.latestHistoryRequest = state.historyRequestSequence;
  }

  function invalidateGamesRequests() {
    abortController(state.gamesAbortController);
    state.gamesAbortController = null;
    state.gamesRequestSequence += 1;
    state.latestGamesRequest = state.gamesRequestSequence;
  }

  function beginGamesRequest() {
    abortController(state.gamesAbortController);
    state.gamesRequestSequence += 1;
    state.latestGamesRequest = state.gamesRequestSequence;
    state.gamesAbortController = createAbortController();
    return state.gamesRequestSequence;
  }

  function isCurrentHistoryRequest(gameId, generation, roundNumber, revision, requestSequence) {
    var snapshot = state.snapshot;

    return isCurrentGeneration(generation)
      && requestSequence === state.latestHistoryRequest
      && snapshot
      && snapshot.phase === 'result'
      && snapshot.gameId === gameId
      && snapshot.roundNumber === roundNumber
      && snapshot.revision === revision;
  }

  function updateServerClock(meta) {
    var serverNow = meta && meta.serverNow ? Date.parse(meta.serverNow) : NaN;

    if (Number.isFinite(serverNow)) {
      state.serverNowMs = serverNow;
      state.clockCapturedAtMs = Date.now();
    }
  }

  function serverClockNow() {
    return state.serverNowMs + (Date.now() - state.clockCapturedAtMs);
  }

  function getSecondsRemaining() {
    var deadline;
    var difference;

    if (!state.snapshot || state.snapshot.phase !== 'round' || !state.snapshot.deadlineAt) return 0;
    deadline = Date.parse(state.snapshot.deadlineAt);
    if (!Number.isFinite(deadline)) return 0;
    difference = Math.ceil((deadline - serverClockNow()) / 1000);
    return Math.max(0, difference);
  }

  function getTimerSetter() {
    if (root && typeof root.setInterval === 'function') return root.setInterval.bind(root);
    if (typeof setInterval === 'function') return setInterval;
    return null;
  }

  function getTimerClearer() {
    if (root && typeof root.clearInterval === 'function') return root.clearInterval.bind(root);
    if (typeof clearInterval === 'function') return clearInterval;
    return null;
  }

  function stopDisplayTimer() {
    var clearTimer = getTimerClearer();

    if (state.displayIntervalId !== null && clearTimer) clearTimer(state.displayIntervalId);
    state.displayIntervalId = null;
    state.lastTimerCue = null;
    releaseWakeLock();
  }

  function emitCue(kind, vibrationPattern) {
    var navigatorRef = root && root.navigator;
    var vibrationPatterns = {
      enabled: [10],
      tap: [12],
      scan: [8, 40, 8],
      reveal: [14, 30, 14],
      hide: [12],
      decision: [22],
      guess: [20, 40, 20],
      result: [30, 60, 30],
      win: [20, 40, 20, 40, 70],
      lose: [60, 40, 60],
      warning: [30, 30, 30]
    };
    // [frequencyHz, startOffsetSeconds, durationSeconds]
    var toneSequences = {
      enabled: [[420, 0, 0.07]],
      tap: [[420, 0, 0.05]],
      scan: [[700, 0, 0.04], [900, 0.06, 0.05]],
      reveal: [[420, 0, 0.07], [560, 0.07, 0.11]],
      hide: [[260, 0, 0.07]],
      decision: [[260, 0, 0.09]],
      guess: [[340, 0, 0.07], [440, 0.08, 0.08]],
      result: [[520, 0, 0.09], [660, 0.1, 0.12]],
      win: [[523, 0, 0.09], [659, 0.1, 0.09], [784, 0.2, 0.18]],
      lose: [[330, 0, 0.12], [247, 0.13, 0.2]],
      warning: [[180, 0, 0.12]]
    };
    var tones = toneSequences[kind] || toneSequences.decision;

    if (state.hapticsEnabled && navigatorRef && typeof navigatorRef.vibrate === 'function') {
      navigatorRef.vibrate(vibrationPattern || vibrationPatterns[kind] || vibrationPatterns.decision);
    }
    if (!state.soundEnabled) return;

    try {
      var AudioContextConstructor = root && (root.AudioContext || root.webkitAudioContext);
      if (!AudioContextConstructor) return;
      if (!state.audioContext) state.audioContext = new AudioContextConstructor();
      var context = state.audioContext;
      var start = function () {
        tones.forEach(function (tone) {
          var oscillator = context.createOscillator();
          var gain = context.createGain();
          var startAt = context.currentTime + tone[1];

          oscillator.frequency.value = tone[0];
          oscillator.type = 'sine';
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.055, startAt + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + tone[2]);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + tone[2] + 0.02);
        });
      };
      if (typeof context.resume === 'function') context.resume().then(start).catch(function () {});
      else start();
    } catch (error) {
      // Audio is an optional enhancement and may be unavailable or blocked.
    }
  }

  function updateCuePreferences() {
    state.soundEnabled = Boolean(refs.soundToggle && refs.soundToggle.checked);
    state.hapticsEnabled = Boolean(refs.hapticsToggle && refs.hapticsToggle.checked);
    state.prefs.sound = state.soundEnabled;
    state.prefs.haptics = state.hapticsEnabled;
    if (prefs && typeof prefs.saveFlags === 'function') {
      prefs.saveFlags({ sound: state.soundEnabled, haptics: state.hapticsEnabled });
    }
    if (state.soundEnabled || state.hapticsEnabled) emitCue('enabled', 10);
    setAnnouncement(state.soundEnabled || state.hapticsEnabled
      ? 'Extra cues on. Text and visuals still work.'
      : 'Extra cues off.');
  }

  function releaseWakeLock() {
    var lock = state.wakeLock;

    state.wakeLock = null;
    if (lock && typeof lock.release === 'function') {
      lock.release().catch(function () {});
    }
  }

  function requestWakeLock() {
    var navigatorRef = root && root.navigator;

    if (!navigatorRef || !navigatorRef.wakeLock || typeof navigatorRef.wakeLock.request !== 'function'
      || state.wakeLock || !state.snapshot || state.snapshot.phase !== 'round'
      || !isFocusedDisplay()) return;

    navigatorRef.wakeLock.request('screen').then(function (lock) {
      if (!state.snapshot || state.snapshot.phase !== 'round' || !isFocusedDisplay()) {
        if (lock && typeof lock.release === 'function') lock.release().catch(function () {});
        return;
      }
      state.wakeLock = lock;
      if (lock && typeof lock.addEventListener === 'function') {
        lock.addEventListener('release', function () {
          if (state.wakeLock === lock) state.wakeLock = null;
        });
      }
    }).catch(function () {});
  }

  function renderTimer() {
    var secondsRemaining = getSecondsRemaining();
    var snapshot = state.snapshot;
    var total = snapshot && Number(snapshot.timerSeconds) > 0
      ? Number(snapshot.timerSeconds)
      : DEFAULT_TIMER_SECONDS;
    var fraction = Math.max(0, Math.min(1, secondsRemaining / total));
    var urgency = '';

    if (refs.roundTimer) refs.roundTimer.textContent = logic.formatTime(secondsRemaining);
    if (refs.timerRingProgress) {
      refs.timerRingProgress.style.strokeDashoffset = String(326.73 * (1 - fraction));
    }
    if (refs.timerRing) {
      if (secondsRemaining <= 10) urgency = 'urgent';
      else if (secondsRemaining <= 60) urgency = 'warning';
      if (urgency) refs.timerRing.setAttribute('data-urgency', urgency);
      else refs.timerRing.removeAttribute('data-urgency');
    }
  }

  function isFocusedDisplay() {
    var visible = documentRef.visibilityState !== 'hidden';
    var focused = typeof documentRef.hasFocus !== 'function' || documentRef.hasFocus();
    return visible && focused;
  }

  function refreshAuthoritativeState(reason) {
    var gameId = currentGameId();
    var generation = state.generation;
    var requestSequence;
    var requestController;
    var operationEpoch;

    if (!gameId || state.refreshInFlight || !isFocusedDisplay()) return Promise.resolve(null);
    state.refreshInFlight = true;
    requestSequence = beginSnapshotRequest();
    requestController = state.snapshotAbortController;
    operationEpoch = beginConnectionOperation();
    clearVisibleCard();
    return api.getGame(gameId, {
      signal: requestController ? requestController.signal : undefined
    }).then(function (result) {
      if (!canApplySnapshot(result.data, gameId, generation, requestSequence)) return null;
      clearConnectionError(operationEpoch);
      applySnapshot(result.data, result.meta, {
        announcement: reason || 'Game is up to date.',
        focus: false,
        generation: generation,
        requestSequence: requestSequence
      });
      return result;
    }).catch(function (error) {
      if (isCurrentGeneration(generation) && isLatestSnapshotRequest(requestSequence)) {
        showConnectionError(error, function () { return refreshAuthoritativeState(reason); }, operationEpoch);
      }
      return null;
    }).then(function (result) {
      if (state.snapshotAbortController === requestController) state.snapshotAbortController = null;
      state.refreshInFlight = false;
      return result;
    });
  }

  function tickTimer() {
    var secondsRemaining;

    if (!state.snapshot || state.snapshot.phase !== 'round') {
      stopDisplayTimer();
      return;
    }
    renderTimer();
    secondsRemaining = getSecondsRemaining();
    if ((secondsRemaining === 60 || secondsRemaining === 10) && state.lastTimerCue !== secondsRemaining) {
      state.lastTimerCue = secondsRemaining;
      emitCue('warning', secondsRemaining === 10 ? [30, 30, 30] : 20);
      if (refs.announcement) refs.announcement.textContent = secondsRemaining === 10
        ? 'Ten seconds left.'
        : 'One minute left.';
    }
    if (secondsRemaining <= 0 && isFocusedDisplay()) {
      refreshAuthoritativeState('Checking the latest round state.');
    }
  }

  function beginDisplayTimer() {
    var setTimer;

    stopDisplayTimer();
    if (!state.snapshot || state.snapshot.phase !== 'round') return;
    renderTimer();
    setTimer = getTimerSetter();
    if (!setTimer) return;
    state.displayIntervalId = setTimer(tickTimer, 1000);
    requestWakeLock();
  }

  function clearVisibleCard() {
    state.visibleCard = null;
    if (!refs || !refs.revealSecret) return;
    refs.revealSecret.textContent = '';
    refs.revealLabel.textContent = 'Your card is ready';
    refs.revealHint.textContent = 'Card hidden. Pass the phone on.';
    if (refs.revealActionLabel) refs.revealActionLabel.textContent = 'Hold to reveal';
    if (refs.revealArt) {
      refs.revealArt.src = 'assets/pass-phone.png';
      refs.revealArt.alt = '';
      refs.revealArt.removeAttribute('data-role');
    }
    refs.revealAction.removeAttribute('data-revealed');
    refs.revealCard.removeAttribute('data-revealed');
    if (refs.privacyCover) refs.privacyCover.hidden = true;
  }

  function focusForCurrentPhase() {
    var phase = currentPhase();
    var target;

    if (skipInitialFocus) {
      // Do not steal focus or open the mobile keyboard on first paint.
      skipInitialFocus = false;
      return;
    }

    switch (phase) {
      case 'resume':
        target = getFirstResumeButton() || refs.resumeNewGameButton;
        break;
      case 'setup':
        target = refs.playerNameInput || refs.startButton;
        break;
      case 'reveal':
        target = refs.revealAction;
        break;
      case 'round':
        target = refs.endRoundButton;
        break;
      case 'accuse':
        target = state.pendingAccusationPlayerId
          ? refs.confirmAccusationButton
          : getFirstChoice(refs.suspectList);
        break;
      case 'spy-guess':
        target = state.pendingGuessLocation
          ? refs.confirmGuessButton
          : state.snapshot && state.snapshot.secretMode === 'custom'
            ? refs.guessInput
            : getFirstChoice(refs.guessList);
        break;
      case 'result':
        target = refs.replayButton;
        break;
      default:
        target = null;
    }
    focusElement(target);
  }

  function getPhaseAnnouncement() {
    var player;

    switch (currentPhase()) {
      case 'resume':
        return 'Saved games are ready.';
      case 'setup':
        return 'Get ready. Add 4 names to start.';
      case 'reveal':
        player = state.snapshot && state.snapshot.currentPlayer;
        return player
          ? player.displayName + '’s card is ready. Reveal it, hide it, then pass the phone.'
          : 'Your card is ready.';
      case 'round':
        return 'The round is live. ' + logic.formatTime(getSecondsRemaining()) + ' left.';
      case 'accuse':
        return 'Talk it out, then lock in the room’s suspect.';
      case 'spy-guess':
        player = state.snapshot && state.snapshot.guessingPlayer;
        return player
          ? 'Pass the phone to ' + player.displayName + '. Only they should enter the guess.'
          : 'Pass the phone to the guessing player.';
      case 'result':
        return state.snapshot && state.snapshot.outcome && state.snapshot.outcome.winner === 'spies'
          ? 'The spies win.'
          : 'The room wins.';
      default:
        return '';
    }
  }

  function closeAccusationDialog() {
    if (!refs || !refs.accusationDialog) return;
    if (refs.accusationDialog.open && typeof refs.accusationDialog.close === 'function') {
      refs.accusationDialog.close();
    }
    refs.accusationDialog.hidden = true;
  }

  function closeGuessDialog() {
    if (!refs || !refs.guessDialog) return;
    if (refs.guessDialog.open && typeof refs.guessDialog.close === 'function') refs.guessDialog.close();
    refs.guessDialog.hidden = true;
  }

  function closeEndRoundDialog() {
    if (!refs || !refs.endRoundDialog) return;
    state.showEndRoundDialog = false;
    if (refs.endRoundDialog.open && typeof refs.endRoundDialog.close === 'function') {
      refs.endRoundDialog.close();
    }
    refs.endRoundDialog.hidden = true;
  }

  function openEndRoundDialog() {
    if (currentPhase() !== 'round' || state.mutationBusy || !refs.endRoundDialog) return;
    state.showEndRoundDialog = true;
    refs.endRoundDialog.hidden = false;
    if (typeof refs.endRoundDialog.showModal === 'function' && !refs.endRoundDialog.open) {
      refs.endRoundDialog.showModal();
    }
    setAnnouncement('End the round?');
    render();
    focusElement(refs.confirmEndRoundButton);
  }

  function confirmEndRound() {
    if (currentPhase() !== 'round' || state.mutationBusy || !state.showEndRoundDialog) return;
    closeEndRoundDialog();
    sendGameAction('end-round');
  }

  function cancelEndRound() {
    if (state.mutationBusy) return;
    closeEndRoundDialog();
    setAnnouncement('Keep investigating. The clock is still running.');
    render();
    focusElement(refs.endRoundButton);
  }

  function renderContext() {
    return {
      documentRef: documentRef,
      logic: logic,
      refs: refs,
      state: state,
      defaultTimerSeconds: DEFAULT_TIMER_SECONDS,
      resumePhaseLabels: RESUME_PHASE_LABELS,
      avatarFor: logic.avatarForIndex,
      updateSetupControls: updateSetupControls,
      renderTimer: renderTimer,
      closeAccusationDialog: closeAccusationDialog,
      closeGuessDialog: closeGuessDialog
    };
  }

  function render() {
    var phase = currentPhase();
    var phaseChanged = lastRenderedPhase !== phase;
    var activeView;
    var context = renderContext();

    if (phase !== 'round') stopDisplayTimer();
    if (phase !== 'accuse') closeAccusationDialog();
    if (phase !== 'spy-guess') closeGuessDialog();
    if (phase !== 'round') closeEndRoundDialog();
    refs.app.classList.toggle('game-active', phase !== 'setup' && phase !== 'resume');
    refs.app.dataset.phase = phase;
    refs.app.dataset.connection = state.connection;
    VIEW_PHASES.forEach(function (viewPhase) {
      var view = refs[viewPhase + 'View'];
      if (view) view.hidden = true;
    });

    if (phase === 'resume') {
      view.renderResume(context);
      activeView = refs.resumeView;
    } else if (phase === 'setup') {
      view.renderSetup(context);
      activeView = refs.setupView;
    } else if (phase === 'reveal') {
      view.renderReveal(context);
      activeView = refs.revealView;
    } else if (phase === 'round') {
      view.renderRound(context);
      activeView = refs.roundView;
    } else if (phase === 'accuse') {
      view.renderAccuse(context);
      activeView = refs.accuseView;
    } else if (phase === 'spy-guess') {
      view.renderGuess(context);
      activeView = refs.guessView;
    } else {
      view.renderResult(context);
      activeView = refs.resultView;
    }

    if (activeView) activeView.hidden = false;
    refs.phaseLabel.textContent = PHASE_LABELS[phase] || 'Get ready';
    refs.roundStatus.textContent = state.snapshot && state.snapshot.players
      ? 'Round ' + state.snapshot.roundNumber + ' / 5 · ' + state.snapshot.players.length + ' players'
      : '4 to 12 players';
    view.renderConnection(context);
    refs.announcement.textContent = pendingAnnouncement || getPhaseAnnouncement();
    pendingAnnouncement = '';
    lastRenderedPhase = phase;

    if (phase === 'round' && state.displayIntervalId === null) beginDisplayTimer();
    if (phaseChanged) focusForCurrentPhase();
    activatePendingWorker();
    markPerformance('phase-render-' + phase);
  }

  function beginConnectionOperation() {
    state.connectionOperationSequence += 1;
    return state.connectionOperationSequence;
  }

  function clearConnectionError(operationEpoch) {
    if (operationEpoch !== undefined && operationEpoch < state.connectionErrorEpoch) return false;
    state.connection = 'connected';
    state.retryOperation = null;
    if (operationEpoch !== undefined) state.connectionErrorEpoch = operationEpoch;
    return true;
  }

  function errorMessage(error) {
    return error && error.message
      ? error.message
      : 'We can’t reach the game right now. Check your connection and try again.';
  }

  function showConnectionError(error, retryOperation, operationEpoch) {
    if (operationEpoch !== undefined && operationEpoch < state.connectionErrorEpoch) return false;
    state.connection = 'error';
    if (operationEpoch !== undefined) state.connectionErrorEpoch = operationEpoch;
    if (typeof retryOperation === 'function') state.retryOperation = retryOperation;
    refs.connectionErrorMessage.textContent = errorMessage(error);
    setAnnouncement('Connection issue. ' + errorMessage(error));
    render();
    return true;
  }

  function enqueueMutation(gameId, operation) {
    var previous = state.mutationQueues[gameId] || Promise.resolve();
    var next = previous.catch(function () { return null; }).then(operation);
    var tail = next.then(function (value) {
      if (state.mutationQueues[gameId] === tail) delete state.mutationQueues[gameId];
      return value;
    }, function () {
      if (state.mutationQueues[gameId] === tail) delete state.mutationQueues[gameId];
      return null;
    });

    state.mutationQueues[gameId] = tail;
    return next;
  }

  function reloadAfterConflict(gameId, generation) {
    setAnnouncement('The game changed in another tab. Loading the latest version.');
    if (!gameId) return loadGames();
    return loadGame(gameId, generation, {
      focus: false,
      announcement: 'The game changed in another tab. The latest version is loaded.'
    });
  }

  function handleIntentError(error, gameId, generation, retryOperation, operationEpoch, operationToken) {
    if (!releaseMutation(generation, operationToken)) return;
    if (error && (error.status === 409 || error.code === 'REVISION_CONFLICT')) {
      state.retryOperation = null;
      reloadAfterConflict(gameId, generation);
      return;
    }
    showConnectionError(error, retryOperation, operationEpoch);
  }

  function runIntent({ gameId, generation, execute, onSuccess }) {
    var retryOperation;

    if (state.mutationBusy) return Promise.resolve(null);
    retryOperation = function () {
      var operationEpoch;
      var operationToken;

      if (!isCurrentGeneration(generation) || state.mutationBusy) return Promise.resolve(null);
      operationToken = beginMutation();
      operationEpoch = beginConnectionOperation();
      state.mutationBusy = true;
      markPerformance('api-latency-start');
      render();
      return enqueueMutation(gameId || 'create', execute).then(function (result) {
        if (!releaseMutation(generation, operationToken)) return null;
        markPerformance('api-latency');
        markPerformance('tap-to-acknowledgement');
        clearConnectionError(operationEpoch);
        onSuccess(result);
        return result;
      }).catch(function (error) {
        handleIntentError(error, gameId, generation, retryOperation, operationEpoch, operationToken);
        return null;
      });
    };

    state.retryOperation = retryOperation;
    return retryOperation();
  }

  function applySnapshot(snapshot, meta, options) {
    var oldSnapshot = state.snapshot;
    var changedHandoff;
    var enteredRound;

    if (!snapshot) return oldSnapshot;
    if (!hasCurrentSnapshotRevision(snapshot)) return oldSnapshot;
    if (options && options.requestSequence !== undefined
      && !canApplySnapshot(snapshot, snapshot.gameId, options.generation, options.requestSequence)) {
      return oldSnapshot;
    }
    changedHandoff = !oldSnapshot
      || oldSnapshot.phase !== snapshot.phase
      || oldSnapshot.roundNumber !== snapshot.roundNumber
      || oldSnapshot.revealIndex !== snapshot.revealIndex
      || (oldSnapshot.currentPlayer && snapshot.currentPlayer
        && oldSnapshot.currentPlayer.id !== snapshot.currentPlayer.id);
    enteredRound = snapshot.phase === 'round'
      && (!oldSnapshot || oldSnapshot.phase !== 'round' || oldSnapshot.roundNumber !== snapshot.roundNumber);

    if (changedHandoff) resetHandoffFlip();
    state.snapshot = snapshot;
    state.showResume = false;
    state.resumeGames = [];
    updateServerClock(meta);
    if (changedHandoff || snapshot.phase !== 'reveal') clearVisibleCard();
    if (snapshot.phase !== 'reveal') {
      state.prefetchedCard = null;
      state.prefetchedFor = '';
    }
    if (enteredRound) {
      state.question = logic.drawQuestion(-1);
      state.twist = state.prefs.spice
        ? logic.twistForRound(snapshot.gameId, snapshot.roundNumber)
        : '';
      state.guessFilter = '';
    }
    if (snapshot.phase !== 'accuse') state.pendingAccusationPlayerId = null;
    if (snapshot.phase !== 'spy-guess') state.pendingGuessLocation = null;
    if (snapshot.phase !== 'round') state.showGuessCallPanel = false;
    if (snapshot.phase !== 'result') {
      state.pendingReplaySecret = '';
      state.showReplaySecretForm = false;
    }
    if (snapshot.phase !== 'result') {
      invalidateHistoryRequests();
      state.history = [];
      state.historyNextCursor = null;
    }
    if (options && options.announcement) setAnnouncement(options.announcement);
    render();
    if (options && options.focus) focusForCurrentPhase();
    if (snapshot.phase === 'reveal') prefetchCurrentCard();
    if (snapshot.phase === 'result') loadHistory(snapshot.gameId, state.generation);
    return snapshot;
  }

  function loadHistory(gameId, generation) {
    var snapshot = state.snapshot;
    var requestSequence = state.historyRequestSequence + 1;
    var requestController;
    var operationEpoch = beginConnectionOperation();
    var roundNumber;
    var revision;

    if (!snapshot || snapshot.phase !== 'result' || snapshot.gameId !== gameId) return Promise.resolve(null);
    roundNumber = snapshot.roundNumber;
    revision = snapshot.revision;

    state.historyRequestSequence = requestSequence;
    state.latestHistoryRequest = requestSequence;
    abortController(state.historyAbortController);
    requestController = createAbortController();
    state.historyAbortController = requestController;
    return api.listRounds(gameId, {
      signal: requestController ? requestController.signal : undefined
    }).then(function (result) {
      if (!isCurrentHistoryRequest(gameId, generation, roundNumber, revision, requestSequence)) return null;
      clearConnectionError(operationEpoch);
      state.history = result.data && Array.isArray(result.data.items) ? result.data.items : [];
      state.historyNextCursor = result.data ? result.data.nextCursor || null : null;
      render();
      return result;
    }).catch(function (error) {
      if (isCurrentHistoryRequest(gameId, generation, roundNumber, revision, requestSequence)) {
        showConnectionError(error, function () { return loadHistory(gameId, generation); }, operationEpoch);
      }
      return null;
    }).then(function (result) {
      if (state.historyAbortController === requestController) state.historyAbortController = null;
      return result;
    });
  }

  function loadGame(gameId, generation, options) {
    var requestGeneration = generation === undefined ? state.generation : generation;
    var requestOptions = options || {};
    var requestSequence;
    var requestController;
    var operationEpoch;

    if (!isCurrentGeneration(requestGeneration)) return Promise.resolve(null);
    requestSequence = beginSnapshotRequest();
    requestController = state.snapshotAbortController;
    operationEpoch = beginConnectionOperation();
    clearVisibleCard();
    return api.getGame(gameId, {
      signal: requestController ? requestController.signal : undefined
    }).then(function (result) {
      if (!canApplySnapshot(result.data, gameId, requestGeneration, requestSequence)) return null;
      clearConnectionError(operationEpoch);
      applySnapshot(result.data, result.meta, {
        announcement: requestOptions.announcement || '',
        focus: requestOptions.focus === true,
        generation: requestGeneration,
        requestSequence: requestSequence
      });
      return result;
    }).catch(function (error) {
      if (isCurrentGeneration(requestGeneration) && isLatestSnapshotRequest(requestSequence)) showConnectionError(error, function () {
        return loadGame(gameId, requestGeneration, requestOptions);
      }, operationEpoch);
      return null;
    }).then(function (result) {
      if (state.snapshotAbortController === requestController) state.snapshotAbortController = null;
      return result;
    });
  }

  function loadGames() {
    var generation = state.generation;
    var requestSequence = beginGamesRequest();
    var requestController = state.gamesAbortController;
    var operationEpoch = beginConnectionOperation();

    state.sessionReady = false;
    state.connection = 'checking';
    render();
    return api.listGames({
      signal: requestController ? requestController.signal : undefined
    }).then(function (result) {
      var items = result.data && Array.isArray(result.data.items) ? result.data.items : [];

      if (!isCurrentGeneration(generation) || requestSequence !== state.latestGamesRequest) return null;
      state.sessionReady = true;
      clearConnectionError(operationEpoch);
      state.resumeGames = items;
      state.showResume = items.length > 0 && !state.snapshot;
      render();
      return result;
    }).catch(function (error) {
      if (isCurrentGeneration(generation) && requestSequence === state.latestGamesRequest) {
        state.sessionReady = false;
        showConnectionError(error, loadGames, operationEpoch);
      }
      return null;
    }).then(function (result) {
      if (state.gamesAbortController === requestController) state.gamesAbortController = null;
      return result;
    });
  }

  function startRound() {
    var validation = validateSetup();
    var secretMode = readSecretMode();
    var customSecret = readCustomSecret();
    var secretValidation = validateCustomSecret(customSecret, secretMode === 'custom');
    var timerSeconds;
    var players;
    var generation;
    var idempotencyKey;

    if (!validation.ok) {
      showSetupError(validation.error);
      updateSetupControls();
      focusElement(refs.playerNameInput);
      return false;
    }
    if (!secretValidation.ok) {
      updateSetupControls();
      showSetupError('Pick a secret before starting the round.');
      showCustomSecretError(secretValidation.error, refs.customSecretInput, refs.customSecretError);
      focusElement(refs.customSecretInput);
      return false;
    }
    if (!state.sessionReady) return false;
    timerSeconds = readTimerSelection();
    players = validation.names.slice();
    generation = state.generation;
    idempotencyKey = api.createIdempotencyKey();
    setAnnouncement('Setting up the round…');
    runIntent({
      gameId: null,
      generation: generation,
      execute: function () {
        var input = { players: players, timerSeconds: timerSeconds, secretMode: secretMode };
        if (secretMode === 'custom') input.customSecret = customSecret;
        return api.createGame(input, {
          idempotencyKey: idempotencyKey
        });
      },
      onSuccess: function (result) {
        refs.customSecretInput.value = '';
        persistRoster();
        applySnapshot(result.data, result.meta, {
          announcement: 'Round ready. Pass the phone to ' + (result.data && result.data.currentPlayer ? result.data.currentPlayer.displayName : 'the first player') + '.',
          focus: true
        });
      }
    });
    return true;
  }

  function currentHandoffPlayer() {
    return state.snapshot && state.snapshot.currentPlayer ? state.snapshot.currentPlayer : null;
  }

  function clearPeekTimer() {
    if (state.peekTimerId === null) return;
    if (typeof root.clearTimeout === 'function') root.clearTimeout(state.peekTimerId);
    else clearTimeout(state.peekTimerId);
    state.peekTimerId = null;
  }

  function clearPressTimer() {
    if (state.pressTimerId === null) return;
    if (typeof root.clearTimeout === 'function') root.clearTimeout(state.pressTimerId);
    else clearTimeout(state.pressTimerId);
    state.pressTimerId = null;
  }

  function setPressTimer(callback, delay) {
    var setTimer = root && typeof root.setTimeout === 'function' ? root.setTimeout : setTimeout;
    return setTimer(callback, delay);
  }

  function resetHandoffFlip() {
    clearPeekTimer();
    clearPressTimer();
    state.peeking = false;
    state.timedReveal = false;
    state.cardsSeen = false;
    state.prefetchedCard = null;
    state.prefetchedFor = '';
    state.pointerHandledAt = 0;
    state.keyboardPeeking = false;
  }

  function cardMatchesHandoff(card) {
    var player = currentHandoffPlayer();
    return Boolean(card && player && card.player && card.player.id === player.id);
  }

  // Prefetching the current handoff card keeps hold-to-reveal instant. The
  // card still only ever exists for the player named on the handoff screen.
  function prefetchCurrentCard() {
    var snapshot = state.snapshot;
    var player = currentHandoffPlayer();
    var generation = state.generation;
    var gameId;
    var revision;

    if (!snapshot || snapshot.phase !== 'reveal' || !player || state.prefetchedCard) return;
    if (state.prefetchedFor === player.id) return;
    state.prefetchedFor = player.id;
    gameId = snapshot.gameId;
    revision = snapshot.revision;
    api.getCard(gameId, 'reveal', revision, {
      idempotencyKey: api.createIdempotencyKey()
    }).then(function (result) {
      var card = result && result.data && result.data.card;
      if (!card || !isCurrentGeneration(generation)) return;
      if (!state.snapshot || state.snapshot.gameId !== gameId || state.snapshot.revision !== revision) return;
      if (!cardMatchesHandoff(card)) return;
      state.prefetchedCard = card;
    }).catch(function () {
      state.prefetchedFor = '';
    });
  }

  function showPeekedCard(card) {
    if (!card) return;
    state.visibleCard = card;
    state.privacyLocked = false;
    if (state.timedReveal) {
      clearPeekTimer();
      state.peekTimerId = (root && typeof root.setTimeout === 'function' ? root.setTimeout : setTimeout)(function () {
        endTimedReveal();
      }, TIMED_REVEAL_MS);
    }
    render();
  }

  function fetchCardForPeek() {
    var snapshot = state.snapshot;
    var player = currentHandoffPlayer();
    var generation = state.generation;
    var gameId;
    var revision;

    if (!snapshot || !player) return;
    gameId = snapshot.gameId;
    revision = snapshot.revision;
    api.getCard(gameId, 'reveal', revision, {
      idempotencyKey: api.createIdempotencyKey()
    }).then(function (result) {
      var card = result && result.data && result.data.card;
      if (!card || !isCurrentGeneration(generation)) return;
      if (!state.snapshot || state.snapshot.gameId !== gameId) return;
      if (!cardMatchesHandoff(card)) return;
      state.prefetchedCard = card;
      if (!state.peeking) return;
      showPeekedCard(card);
    }).catch(function () {
      if (!state.peeking) return;
      state.peeking = false;
      state.timedReveal = false;
      showConnectionError(new Error('The card could not be loaded. Check the connection and hold again.'), null);
    });
  }

  function beginPeek(options) {
    var snapshot = state.snapshot;

    if (!snapshot || snapshot.phase !== 'reveal' || state.mutationBusy || state.peeking) return;
    state.holdStartedAt = Date.now();
    state.peeking = true;
    state.timedReveal = Boolean(options && options.timed);
    emitCue('scan');
    if (state.prefetchedCard && cardMatchesHandoff(state.prefetchedCard)) {
      showPeekedCard(state.prefetchedCard);
      return;
    }
    render();
    fetchCardForPeek();
  }

  function endPeek() {
    var heldMs;
    var hadCard;

    if (!state.peeking || state.timedReveal) return;
    heldMs = Date.now() - state.holdStartedAt;
    hadCard = Boolean(state.visibleCard);
    if (hadCard && heldMs < TAP_PEEK_MS) {
      // A quick tap becomes a short timed reveal so assistive tech and
      // one-handed players are not forced into a long press.
      state.timedReveal = true;
      showPeekedCard(state.visibleCard);
      return;
    }
    state.peeking = false;
    if (hadCard) {
      state.cardsSeen = true;
      state.visibleCard = null;
      emitCue('hide');
    }
    render();
  }

  function passCard() {
    clearPeekTimer();
    clearPressTimer();
    state.peeking = false;
    state.timedReveal = false;
    state.visibleCard = null;
    emitCue('hide', 18);
    sendCardAction('hide');
  }

  // A press on the handoff button can mean three things: peek (hold), timed
  // reveal (tap before seeing the card), or pass (tap after seeing it).
  function beginPress() {
    state.pointerHandledAt = Date.now();
    if (state.timedReveal) {
      endTimedReveal();
      return;
    }
    if (state.cardsSeen) {
      clearPressTimer();
      state.pressTimerId = setPressTimer(function () {
        state.pressTimerId = null;
        beginPeek({ timed: false });
      }, TAP_PEEK_MS);
      return;
    }
    beginPeek({ timed: false });
  }

  function releasePress() {
    state.pointerHandledAt = Date.now();
    if (state.pressTimerId !== null) {
      clearPressTimer();
      passCard();
      return;
    }
    endPeek();
  }

  function endTimedReveal() {
    clearPeekTimer();
    state.timedReveal = false;
    state.peeking = false;
    if (state.visibleCard) state.cardsSeen = true;
    state.visibleCard = null;
    emitCue('hide');
    render();
    focusElement(refs.revealAction);
  }

  function sendCardAction(action) {
    var snapshot = state.snapshot;
    var generation;
    var gameId;
    var revision;
    var idempotencyKey;

    if (!snapshot || snapshot.phase !== 'reveal' || state.mutationBusy) return;
    generation = state.generation;
    gameId = snapshot.gameId;
    revision = snapshot.revision;
    idempotencyKey = api.createIdempotencyKey();
    if (action === 'hide') clearVisibleCard();

    runIntent({
      gameId: gameId,
      generation: generation,
      execute: function () {
        if (action === 'hide') clearVisibleCard();
        return api.getCard(gameId, action, revision, { idempotencyKey: idempotencyKey });
      },
      onSuccess: function (result) {
        if (action === 'reveal') {
          state.visibleCard = result.data && result.data.card ? result.data.card : null;
          state.privacyLocked = false;
          setAnnouncement('Card revealed. Hide it before you pass the phone.');
          render();
          focusElement(refs.revealAction);
          return;
        }
        applySnapshot(result.data, result.meta, {
          announcement: 'Card hidden. Pass the phone on.',
          focus: true
        });
      }
    });
  }

  function sendGameAction(command) {
    var snapshot = state.snapshot;
    var generation;
    var gameId;
    var revision;
    var idempotencyKey;
    var payload = typeof command === 'string' ? { type: command } : Object.assign({}, command);

    if (!snapshot || state.mutationBusy) return;
    generation = state.generation;
    gameId = snapshot.gameId;
    revision = snapshot.revision;
    idempotencyKey = api.createIdempotencyKey();
    clearVisibleCard();
    runIntent({
      gameId: gameId,
      generation: generation,
      execute: function () {
        return api.act(gameId, payload, revision, { idempotencyKey: idempotencyKey });
      },
      onSuccess: function (result) {
        var next = result.data || {};
        var message = next.phase === 'spy-guess'
          ? 'The last-chance guess is open. Pass the phone to the guessing player.'
          : next.phase === 'result'
            ? 'Result ready.'
            : next.phase === 'reveal'
              ? 'New round ready. Pass the phone to the first player.'
              : 'The vote is open. Pick the spy.';

        if (next.phase === 'result') emitCue('result', [20, 25, 20]);
        applySnapshot(next, result.meta, { announcement: message, focus: true });
      }
    });
  }

  function rememberedRoster() {
    if (!prefs || typeof prefs.load !== 'function') return [];
    return prefs.load().roster || [];
  }

  function resetSetupFields() {
    state.roster = rememberedRoster();
    state.cardsSeen = false;
    state.timedReveal = false;
    state.prefetchedCard = null;
    state.prefetchedFor = '';
    clearPeekTimer();
    clearPressTimer();
    if (refs.playerNameInput) refs.playerNameInput.value = '';
    setTimerSelection(DEFAULT_TIMER_SECONDS);
    refs.secretModeDeck.checked = true;
    refs.secretModeCustom.checked = false;
    refs.customSecretInput.value = '';
    showCustomSecretError('', refs.customSecretInput, refs.customSecretError);
    showSetupError('');
  }

  function openSettings() {
    if (!refs || !refs.settingsDialog) return;
    refs.settingsDialog.hidden = false;
    if (typeof refs.settingsDialog.showModal === 'function' && !refs.settingsDialog.open) {
      refs.settingsDialog.showModal();
    }
    setAnnouncement('Settings opened.');
    render();
    focusElement(refs.closeSettingsButton);
  }

  function closeSettings() {
    if (!refs || !refs.settingsDialog) return;
    if (refs.settingsDialog.open && typeof refs.settingsDialog.close === 'function') {
      refs.settingsDialog.close();
    }
    refs.settingsDialog.hidden = true;
    setAnnouncement('Settings closed.');
    render();
    focusElement(refs.settingsButton);
  }

  function forgetRememberedPlayers() {
    if (prefs && typeof prefs.clearAll === 'function') prefs.clearAll();
    state.prefs = { sound: state.soundEnabled, haptics: state.hapticsEnabled, spice: state.prefs.spice };
    if (prefs && typeof prefs.saveFlags === 'function') {
      prefs.saveFlags({
        sound: state.soundEnabled,
        haptics: state.hapticsEnabled,
        spice: state.prefs.spice
      });
    }
    setAnnouncement('Remembered players cleared. Cue settings stay as they are.');
    render();
  }

  function startNewGame() {
    if (state.mutationBusy) return false;
    abortPendingRequests();
    state.generation += 1;
    stopDisplayTimer();
    clearVisibleCard();
    state.snapshot = null;
    state.history = [];
    state.historyNextCursor = null;
    state.pendingAccusationPlayerId = null;
    state.pendingGuessLocation = null;
    state.pendingReplaySecret = '';
    state.pendingResumeDeleteGameId = null;
    state.showEndRoundDialog = false;
    state.showReplaySecretForm = false;
    state.showGuessCallPanel = false;
    state.privacyLocked = false;
    state.resumeGames = [];
    state.showResume = false;
    if (state.sessionReady) state.connection = 'connected';
    state.retryOperation = null;
    refs.deleteConfirmation.hidden = true;
    closeResumeDeleteDialog();
    closeEndRoundDialog();
    resetSetupFields();
    setAnnouncement(state.roster.length >= MIN_PLAYERS
      ? 'New game. The old roster is loaded — deal when ready.'
      : 'New game. Add 4 names to start.');
    render();
    return true;
  }

  function closeResumeDeleteDialog() {
    if (!refs || !refs.resumeDeleteDialog) return;
    if (refs.resumeDeleteDialog.open && typeof refs.resumeDeleteDialog.close === 'function') {
      refs.resumeDeleteDialog.close();
    }
    refs.resumeDeleteDialog.hidden = true;
  }

  function openHowToPlay() {
    if (!refs || !refs.howToPlayDialog) return;
    refs.howToPlayDialog.hidden = false;
    if (typeof refs.howToPlayDialog.showModal === 'function' && !refs.howToPlayDialog.open) {
      refs.howToPlayDialog.showModal();
    }
    setAnnouncement('Rules opened.');
    render();
    focusElement(refs.closeHowToPlayButton);
  }

  function closeHowToPlay() {
    if (!refs || !refs.howToPlayDialog) return;
    if (refs.howToPlayDialog.open && typeof refs.howToPlayDialog.close === 'function') {
      refs.howToPlayDialog.close();
    }
    refs.howToPlayDialog.hidden = true;
    setAnnouncement('Rules closed.');
    render();
    focusElement(refs.howToPlayButton);
  }

  function requestResumeDelete(gameId) {
    var game = state.resumeGames.find(function (candidate) { return candidate.gameId === gameId; });
    var players = game && Array.isArray(game.players) ? game.players : [];

    if (!gameId || state.mutationBusy) return;
    state.pendingResumeDeleteGameId = gameId;
    refs.resumeDeleteCopy.textContent = players.length > 0
      ? 'This deletes the game for ' + players.map(function (player) {
        return player.displayName;
      }).join(', ') + '. You can’t undo this.'
      : 'This deletes the game and its round history. You can’t undo this.';
    refs.resumeDeleteDialog.hidden = false;
    if (typeof refs.resumeDeleteDialog.showModal === 'function' && !refs.resumeDeleteDialog.open) {
      refs.resumeDeleteDialog.showModal();
    }
    setAnnouncement('Delete this game?');
    render();
    focusElement(refs.confirmResumeDeleteButton);
  }

  function confirmResumeDelete() {
    var gameId = state.pendingResumeDeleteGameId;
    var generation;
    var idempotencyKey;

    if (!gameId || state.mutationBusy) return;
    // Do not let a list response that started before the delete reinsert the game.
    invalidateGamesRequests();
    generation = state.generation;
    idempotencyKey = api.createIdempotencyKey();
    runIntent({
      gameId: gameId,
      generation: generation,
      execute: function () {
        return api.deleteGame(gameId, { idempotencyKey: idempotencyKey });
      },
      onSuccess: function () {
        state.resumeGames = state.resumeGames.filter(function (game) {
          return game.gameId !== gameId;
        });
        state.pendingResumeDeleteGameId = null;
        closeResumeDeleteDialog();
        setAnnouncement('Saved game deleted.');
        render();
      }
    });
  }

  function cancelResumeDelete() {
    if (state.mutationBusy) return;
    state.pendingResumeDeleteGameId = null;
    closeResumeDeleteDialog();
    setAnnouncement('Game kept.');
    render();
    focusElement(getFirstResumeButton() || refs.resumeNewGameButton);
  }

  function confirmDelete() {
    var snapshot = state.snapshot;
    var gameId;
    var generation;
    var idempotencyKey;

    if (!snapshot || state.mutationBusy) return;
    gameId = snapshot.gameId;
    generation = state.generation;
    idempotencyKey = api.createIdempotencyKey();
    runIntent({
      gameId: gameId,
      generation: generation,
      execute: function () {
        return api.deleteGame(gameId, { idempotencyKey: idempotencyKey });
      },
      onSuccess: function () {
        state.generation += 1;
        stopDisplayTimer();
        state.snapshot = null;
        state.history = [];
        state.resumeGames = [];
        state.showResume = false;
        state.pendingReplaySecret = '';
        state.showReplaySecretForm = false;
        state.retryOperation = null;
        refs.deleteConfirmation.hidden = true;
        resetSetupFields();
        setAnnouncement('Saved game deleted. Add 4 names to start a new game.');
        render();
      }
    });
  }

  function handleRevealAction() {
    var now = Date.now();

    if (now - state.pointerHandledAt < 600) return;
    if (state.timedReveal) {
      endTimedReveal();
      return;
    }
    if (state.cardsSeen || state.visibleCard) {
      passCard();
      return;
    }
    beginPeek({ timed: true });
  }

  function handleChoice(button) {
    var action = button.getAttribute('data-choice-action');
    var value = button.getAttribute('data-choice-value');

    if (action === 'accuse' && currentPhase() === 'accuse') {
      state.pendingAccusationPlayerId = value;
      setAnnouncement('Suspect selected. Get the room’s agreement.');
      render();
      focusElement(refs.confirmAccusationButton);
    } else if (action === 'call-guess' && currentPhase() === 'round') {
      state.showGuessCallPanel = false;
      sendGameAction({ type: 'call-guess', playerId: value });
    } else if (action === 'guess' && currentPhase() === 'spy-guess') {
      state.pendingGuessLocation = value;
      setAnnouncement('Guess selected. Check it before locking it in.');
      render();
      focusElement(refs.confirmGuessButton);
    }
  }

  function confirmAccusation() {
    if (!state.pendingAccusationPlayerId || currentPhase() !== 'accuse') return;
    sendGameAction({ type: 'accuse', playerId: state.pendingAccusationPlayerId });
  }

  function confirmGuess() {
    var player = state.snapshot && state.snapshot.guessingPlayer;
    var location = state.pendingGuessLocation;

    if (!location || !player || currentPhase() !== 'spy-guess') return;
    emitCue('decision', 20);
    state.pendingGuessLocation = null;
    closeGuessDialog();
    sendGameAction({ type: 'guess', playerId: player.id, location: location });
  }

  function cancelGuess() {
    state.pendingGuessLocation = null;
    closeGuessDialog();
    setAnnouncement('Choose a different secret.');
    render();
    focusForCurrentPhase();
  }

  function cancelAccusation() {
    state.pendingAccusationPlayerId = null;
    closeAccusationDialog();
    setAnnouncement('Choose a different suspect.');
    render();
    focusForCurrentPhase();
  }

  function submitCustomGuess(event) {
    var validation;

    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (currentPhase() !== 'spy-guess' || !state.snapshot || state.snapshot.secretMode !== 'custom') return;
    validation = validateCustomSecret(refs.guessInput && refs.guessInput.value, true);
    if (!validation.ok) {
      showCustomSecretError(validation.error, refs.guessInput, refs.guessInputError);
      setAnnouncement(validation.error);
      return;
    }
    showCustomSecretError('', refs.guessInput, refs.guessInputError);
    state.pendingGuessLocation = validation.value;
    setAnnouncement('Guess entered. Check it before locking it in.');
    render();
    focusElement(refs.confirmGuessButton);
  }

  function handleReplayButton() {
    if (refs.replayButton.disabled || !state.snapshot || state.snapshot.phase !== 'result') return;
    if (state.snapshot.secretMode === 'custom') {
      state.showReplaySecretForm = true;
      state.pendingReplaySecret = '';
      setAnnouncement('Enter a fresh secret for the next round.');
      render();
      focusElement(refs.replaySecretInput);
      return;
    }
    sendGameAction('replay');
  }

  function handleDrawQuestion() {
    if (state.mutationBusy || currentPhase() !== 'round') return;
    state.question = logic.drawQuestion(state.question ? state.question.index : -1);
    emitCue('tap');
    setAnnouncement(state.question.text);
    render();
  }

  function handleGuessFilter() {
    state.guessFilter = refs.guessSearchInput ? refs.guessSearchInput.value : '';
    render();
  }

  function handleSpiceChange() {
    state.prefs.spice = Boolean(refs.spiceToggle && refs.spiceToggle.checked);
    if (prefs && typeof prefs.saveFlags === 'function') prefs.saveFlags({ spice: state.prefs.spice });
    setAnnouncement(state.prefs.spice
      ? 'Chaos mode on. One public twist per round.'
      : 'Chaos mode off.');
    render();
  }

  function handleShareResult() {
    var snapshot = state.snapshot;
    var outcome = snapshot && snapshot.outcome ? snapshot.outcome : {};
    var spies = Array.isArray(outcome.spyPlayers) ? outcome.spyPlayers : [];
    var spyNames = spies.map(function (spy) {
      return spy && spy.displayName ? spy.displayName : String(spy);
    }).join(' and ');
    var text = 'Spy in the Room · Round ' + (snapshot ? snapshot.roundNumber : 1) + ': '
      + (outcome.winner === 'spies' ? 'the spies win' : 'the room wins')
      + '. ' + (spies.length > 1 ? 'Spies: ' : 'Spy: ') + spyNames
      + '. Secret: ' + (outcome.location || 'unknown') + '.';
    var navigatorRef = root && root.navigator;

    function copied() {
      state.shareStatus = 'Copied!';
      setAnnouncement('Result copied to the clipboard.');
      render();
      (root && typeof root.setTimeout === 'function' ? root.setTimeout : setTimeout)(function () {
        state.shareStatus = '';
        render();
      }, 2000);
    }

    if (!spies.length) return;
    if (navigatorRef && typeof navigatorRef.share === 'function') {
      navigatorRef.share({ title: 'Spy in the Room', text: text }).then(function () {
        setAnnouncement('Result shared.');
      }).catch(function () {});
      return;
    }
    if (navigatorRef && navigatorRef.clipboard && typeof navigatorRef.clipboard.writeText === 'function') {
      navigatorRef.clipboard.writeText(text).then(copied).catch(function () {});
      return;
    }
    setAnnouncement('Sharing is not available in this browser. The result is on screen.');
  }

  function submitReplaySecret(event) {
    var validation;

    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (!state.snapshot || state.snapshot.phase !== 'result' || state.snapshot.secretMode !== 'custom') return;
    validation = validateCustomSecret(refs.replaySecretInput && refs.replaySecretInput.value, true);
    if (!validation.ok) {
      showCustomSecretError(validation.error, refs.replaySecretInput, refs.replaySecretError);
      setAnnouncement(validation.error);
      return;
    }
    state.pendingReplaySecret = validation.value;
    showCustomSecretError('', refs.replaySecretInput, refs.replaySecretError);
    setAnnouncement('Setting up the next round…');
    sendGameAction({ type: 'replay', customSecret: validation.value });
  }

  function cancelReplaySecret() {
    if (state.mutationBusy) return;
    state.pendingReplaySecret = '';
    state.showReplaySecretForm = false;
    showCustomSecretError('', refs.replaySecretInput, refs.replaySecretError);
    setAnnouncement('Keeping the result.');
    render();
    focusElement(refs.replayButton);
  }

  function toggleGuessCallPanel() {
    if (state.mutationBusy || currentPhase() !== 'round') return;
    state.showGuessCallPanel = !state.showGuessCallPanel;
    setAnnouncement(state.showGuessCallPanel
      ? 'Pass the phone to the player calling for a guess.'
      : 'Guess call closed.');
    render();
    if (state.showGuessCallPanel) focusElement(getFirstChoice(refs.guessCallerList));
  }

  function handleSecretModeChange() {
    showSetupError('');
    updateSetupControls();
    setAnnouncement(readSecretMode() === 'custom'
      ? 'Your own secret selected. Enter it for this round.'
      : 'Random location selected.');
    render();
  }

  function handleResumeClick(button) {
    var gameId = button.getAttribute('data-resume-game-id');

    if (!gameId || state.mutationBusy) return;
    state.showResume = false;
    state.connection = 'checking';
    render();
    loadGame(gameId, state.generation, { focus: true, announcement: 'Game loaded.' });
  }

  function handleRetry() {
    var operation = state.retryOperation;

    if (typeof operation === 'function' && !state.mutationBusy) operation();
  }

  function handleVisibilityChange() {
    if (documentRef.visibilityState === 'hidden') {
      if (state.visibleCard) state.privacyLocked = true;
      clearPeekTimer();
      clearPressTimer();
      state.peeking = false;
      state.timedReveal = false;
      state.prefetchedCard = null;
      state.prefetchedFor = '';
      clearVisibleCard();
      releaseWakeLock();
      if (currentPhase() === 'reveal') render();
      return;
    }
    refreshOnFocus();
  }

  function handlePageHide() {
    if (state.visibleCard) state.privacyLocked = true;
    clearPeekTimer();
    clearPressTimer();
    state.peeking = false;
    state.timedReveal = false;
    state.prefetchedCard = null;
    state.prefetchedFor = '';
    abortPendingRequests();
    clearVisibleCard();
    releaseWakeLock();
  }

  function refreshOnFocus() {
    requestWakeLock();
    if (currentGameId() && isFocusedDisplay()) {
      refreshAuthoritativeState('Game checked after returning to the page.');
    }
  }

  function safePhaseForReload() {
    var phase = currentPhase();
    return phase === 'setup' || phase === 'resume' || phase === 'result';
  }

  // A waiting worker is activated only at a safe table point, then the page
  // reloads once onto the new shell. Without this, an update can sit in
  // "waiting" until every tab closes, and the old worker keeps serving the
  // previous stylesheet and scripts into the new HTML.
  function activatePendingWorker() {
    var worker = pendingServiceWorker;

    if (!worker || state.mutationBusy || !safePhaseForReload()) return;
    pendingServiceWorker = null;
    updateRequested = true;
    if (typeof worker.postMessage === 'function') worker.postMessage({ type: 'SKIP_WAITING' });
  }

  function registerServiceWorker() {
    var navigatorRef = root && root.navigator;
    var serviceWorker = navigatorRef && navigatorRef.serviceWorker;

    if (!serviceWorker || typeof serviceWorker.register !== 'function') return;

    serviceWorker.register('./service-worker.js', { scope: './' }).then(function (registration) {
      if (!registration) return;
      if (registration.waiting && serviceWorker.controller) {
        pendingServiceWorker = registration.waiting;
        activatePendingWorker();
      }
      if (typeof registration.addEventListener !== 'function') return;
      registration.addEventListener('updatefound', function () {
        var installing = registration.installing;
        if (!installing || typeof installing.addEventListener !== 'function') return;
        installing.addEventListener('statechange', function () {
          if (installing.state !== 'installed' || !serviceWorker.controller) return;
          pendingServiceWorker = installing;
          activatePendingWorker();
        });
      });
    }).catch(function () {});

    if (typeof serviceWorker.addEventListener === 'function') {
      serviceWorker.addEventListener('controllerchange', function () {
        if (!updateRequested || reloadingForUpdate) return;
        reloadingForUpdate = true;
        root.location.reload();
      });
    }
  }

  function handleNetworkHint(isOnline) {
    if (isOnline) {
      state.connection = 'checking';
      render();
      if (currentGameId()) refreshOnFocus();
      else if (!state.sessionReady) loadGames();
      return;
    }

    state.connection = 'error';
    state.retryOperation = state.retryOperation || (currentGameId()
      ? function () { return refreshAuthoritativeState('Checking the game after reconnecting.'); }
      : loadGames);
    if (refs.connectionErrorMessage) refs.connectionErrorMessage.textContent = 'No connection. Reconnect to keep playing.';
    setAnnouncement('No connection. Reconnect to keep playing.');
    render();
  }

  function bindDialogBackdropClose(dialog, cancel) {
    if (!dialog || !dialog.addEventListener) return;
    dialog.addEventListener('click', function (event) {
      // A backdrop click targets the dialog element itself.
      if (event.target !== dialog) return;
      cancel();
    });
  }

  function bindEvents() {
    if (refs.howToPlayButton && refs.howToPlayDialog && refs.closeHowToPlayButton) {
      refs.howToPlayButton.addEventListener('click', openHowToPlay);
      refs.closeHowToPlayButton.addEventListener('click', closeHowToPlay);
      refs.howToPlayDialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeHowToPlay();
      });
      bindDialogBackdropClose(refs.howToPlayDialog, closeHowToPlay);
    }
    if (refs.settingsButton && refs.settingsDialog) {
      refs.settingsButton.addEventListener('click', openSettings);
      refs.closeSettingsButton.addEventListener('click', closeSettings);
      refs.forgetRosterButton.addEventListener('click', forgetRememberedPlayers);
      refs.settingsDialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeSettings();
      });
      bindDialogBackdropClose(refs.settingsDialog, closeSettings);
    }
    refs.playerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      startRound();
    });
    refs.playerNameInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (addRosterName(refs.playerNameInput.value)) refs.playerNameInput.value = '';
    });
    refs.playerChips.addEventListener('click', function (event) {
      var button = closestWithin(event.target, '[data-remove-player]', refs.playerChips);
      if (button) removeRosterName(Number(button.getAttribute('data-remove-player')));
    });
    refs.addPlayerButton.addEventListener('click', function () {
      if (addRosterName(refs.playerNameInput.value)) {
        refs.playerNameInput.value = '';
        focusElement(refs.playerNameInput);
      }
    });
    Array.prototype.forEach.call(refs.timerInputs || [], function (input) {
      input.addEventListener('change', function () {
        updateSetupControls();
        announceTimerSelection();
        render();
      });
    });
    if (refs.customTimerInput) {
      refs.customTimerInput.addEventListener('input', updateSetupControls);
      refs.customTimerInput.addEventListener('change', function () {
        setCustomTimerMinutes(refs.customTimerInput.value);
        announceTimerSelection();
        updateSetupControls();
        render();
      });
    }
    if (refs.customTimerDecrease) {
      refs.customTimerDecrease.addEventListener('click', function () {
        stepCustomTimer(-1);
      });
    }
    if (refs.customTimerIncrease) {
      refs.customTimerIncrease.addEventListener('click', function () {
        stepCustomTimer(1);
      });
    }
    refs.spiceToggle.addEventListener('change', handleSpiceChange);
    refs.secretModeDeck.addEventListener('change', handleSecretModeChange);
    refs.secretModeCustom.addEventListener('change', handleSecretModeChange);
    refs.customSecretInput.addEventListener('input', function () {
      updateSetupControls();
      if (refs.playerError.textContent === 'Pick a secret before starting the round.') {
        refs.playerError.hidden = true;
      }
    });
    if (refs.revealAction) {
      refs.revealAction.addEventListener('pointerdown', function (event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        beginPress();
      });
      refs.revealAction.addEventListener('pointerup', releasePress);
      refs.revealAction.addEventListener('pointercancel', releasePress);
      refs.revealAction.addEventListener('pointerleave', function () {
        if (!state.peeking) return;
        releasePress();
      });
      refs.revealAction.addEventListener('keydown', function (event) {
        if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') return;
        event.preventDefault();
        if (state.keyboardPeeking) return;
        state.keyboardPeeking = true;
        beginPress();
      });
      refs.revealAction.addEventListener('keyup', function (event) {
        if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') return;
        event.preventDefault();
        state.keyboardPeeking = false;
        releasePress();
      });
      refs.revealAction.addEventListener('click', handleRevealAction);
      refs.revealAction.addEventListener('contextmenu', function (event) {
        event.preventDefault();
      });
    }
    refs.drawQuestionButton.addEventListener('click', handleDrawQuestion);
    refs.shareResultButton.addEventListener('click', handleShareResult);
    refs.guessSearchInput.addEventListener('input', handleGuessFilter);
    refs.endRoundButton.addEventListener('click', openEndRoundDialog);
    refs.confirmEndRoundButton.addEventListener('click', confirmEndRound);
    refs.cancelEndRoundButton.addEventListener('click', cancelEndRound);
    if (refs.endRoundDialog && refs.endRoundDialog.addEventListener) {
      refs.endRoundDialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        cancelEndRound();
      });
      bindDialogBackdropClose(refs.endRoundDialog, cancelEndRound);
    }
    refs.callGuessButton.addEventListener('click', toggleGuessCallPanel);
    refs.suspectList.addEventListener('click', function (event) {
      var button = closestWithin(event.target, '[data-choice-action]', refs.suspectList);
      if (button) handleChoice(button);
    });
    refs.guessCallerList.addEventListener('click', function (event) {
      var button = closestWithin(event.target, '[data-choice-action]', refs.guessCallerList);
      if (button) handleChoice(button);
    });
    refs.confirmAccusationButton.addEventListener('click', confirmAccusation);
    refs.cancelAccusationButton.addEventListener('click', cancelAccusation);
    if (refs.accusationDialog && refs.accusationDialog.addEventListener) {
      refs.accusationDialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        cancelAccusation();
      });
      bindDialogBackdropClose(refs.accusationDialog, cancelAccusation);
    }
    refs.confirmGuessButton.addEventListener('click', confirmGuess);
    refs.cancelGuessButton.addEventListener('click', cancelGuess);
    if (refs.guessDialog && refs.guessDialog.addEventListener) {
      refs.guessDialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        cancelGuess();
      });
      bindDialogBackdropClose(refs.guessDialog, cancelGuess);
    }
    refs.guessCustomForm.addEventListener('submit', submitCustomGuess);
    refs.guessInput.addEventListener('input', function () {
      if (refs.guessInputError && !refs.guessInputError.hidden) {
        showCustomSecretError('', refs.guessInput, refs.guessInputError);
      }
    });
    refs.soundToggle.addEventListener('change', updateCuePreferences);
    refs.hapticsToggle.addEventListener('change', updateCuePreferences);
    refs.guessList.addEventListener('click', function (event) {
      var button = closestWithin(event.target, '[data-choice-action]', refs.guessList);
      if (button) handleChoice(button);
    });
    refs.resumeList.addEventListener('click', function (event) {
      var deleteButton = closestWithin(event.target, '[data-resume-delete-game-id]', refs.resumeList);
      var button = closestWithin(event.target, '[data-resume-game-id]', refs.resumeList);
      if (deleteButton) {
        requestResumeDelete(deleteButton.getAttribute('data-resume-delete-game-id'));
      } else if (button) {
        handleResumeClick(button);
      }
    });
    refs.resumeDeleteDialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      cancelResumeDelete();
    });
    bindDialogBackdropClose(refs.resumeDeleteDialog, cancelResumeDelete);
    refs.confirmResumeDeleteButton.addEventListener('click', confirmResumeDelete);
    refs.cancelResumeDeleteButton.addEventListener('click', cancelResumeDelete);
    refs.resumeNewGameButton.addEventListener('click', startNewGame);
    refs.retryButton.addEventListener('click', handleRetry);
    refs.replayButton.addEventListener('click', handleReplayButton);
    refs.replaySecretForm.addEventListener('submit', submitReplaySecret);
    refs.replaySecretInput.addEventListener('input', function () {
      state.pendingReplaySecret = normalizeSecretInput(refs.replaySecretInput.value);
      if (refs.replaySecretError && !refs.replaySecretError.hidden) {
        showCustomSecretError('', refs.replaySecretInput, refs.replaySecretError);
      }
    });
    refs.replaySecretCancel.addEventListener('click', cancelReplaySecret);
    refs.newGameButton.addEventListener('click', startNewGame);
    refs.deleteGameButton.addEventListener('click', function () {
      refs.deleteConfirmation.hidden = false;
      setAnnouncement('Delete this game?');
      render();
      focusElement(refs.confirmDeleteButton);
    });
    refs.confirmDeleteButton.addEventListener('click', confirmDelete);
    refs.cancelDeleteButton.addEventListener('click', function () {
      refs.deleteConfirmation.hidden = true;
      setAnnouncement('Game kept.');
      render();
      focusElement(refs.deleteGameButton);
    });
    if (documentRef.addEventListener) documentRef.addEventListener('visibilitychange', handleVisibilityChange);
    if (root && root.addEventListener) root.addEventListener('pagehide', handlePageHide);
    if (root && root.addEventListener) root.addEventListener('focus', refreshOnFocus);
    if (root && root.addEventListener) {
      root.addEventListener('online', function () { handleNetworkHint(true); });
      root.addEventListener('offline', function () { handleNetworkHint(false); });
    }
  }

  function loadPreferences() {
    var loaded = prefs && typeof prefs.load === 'function'
      ? prefs.load()
      : { roster: [], flags: { sound: true, haptics: true, spice: false } };

    state.prefs = {
      sound: Boolean(loaded.flags && loaded.flags.sound !== false),
      haptics: Boolean(loaded.flags && loaded.flags.haptics !== false),
      spice: Boolean(loaded.flags && loaded.flags.spice)
    };
    state.roster = Array.isArray(loaded.roster) ? loaded.roster.slice(0, MAX_PLAYERS) : [];
    state.soundEnabled = state.prefs.sound;
    state.hapticsEnabled = state.prefs.haptics;
    if (refs.soundToggle) refs.soundToggle.checked = state.soundEnabled;
    if (refs.hapticsToggle) refs.hapticsToggle.checked = state.hapticsEnabled;
    if (refs.spiceToggle) refs.spiceToggle.checked = state.prefs.spice;
  }

  function init() {
    if (!collectReferences()) return;
    markPerformance('boot-to-usable-start');
    loadPreferences();
    bindEvents();
    refs.playerError.hidden = true;
    refs.deleteConfirmation.hidden = true;
    render();
    markPerformance('boot-to-usable');
    registerServiceWorker();
    if (root && root.navigator && root.navigator.onLine === false) handleNetworkHint(false);
    loadGames();
  }

  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', init);
  else init();
}(typeof window !== 'undefined'
  ? window
  : typeof globalThis !== 'undefined' ? globalThis : this));
