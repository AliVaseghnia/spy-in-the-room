'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const view = require('../game-view.js');
const { LOCATION_DECK } = require('../game-logic.js');

function node(tag) {
  const attributes = {};
  const children = [];
  return {
    tag,
    attributes,
    children,
    style: { setProperty() {} },
    dataset: {},
    open: false,
    disabled: false,
    hidden: false,
    textContent: '',
    get firstChild() {
      return children[0] || null;
    },
    appendChild(child) {
      children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index !== -1) children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
    }
  };
}

function roundContext({ secretMode = 'deck', locationBoard = ['Airport', 'Bank'] } = {}) {
  const refs = {
    roundTitle: node('h2'),
    roundLocationHint: node('p'),
    guessCallerList: node('ul'),
    callGuessButton: node('button'),
    guessCallPanel: node('div'),
    roundIntel: node('p'),
    twistStrip: node('p'),
    twistText: node('span'),
    questionPrompt: node('p'),
    locationBoard: node('details'),
    locationBoardList: node('ul')
  };
  return {
    refs,
    state: {
      snapshot: {
        secretMode,
        locationBoard,
        players: [],
        roundNumber: 1,
        roundsTotal: 5
      },
      question: null,
      showGuessCallPanel: false,
      twist: ''
    },
    logic: { getSpyCount: () => 1 },
    documentRef: { createElement: node },
    renderTimer() {}
  };
}

function guessContext({ locationBoard, secretMode = 'deck', guessFilter = '' } = {}) {
  const refs = {
    guessTurnLabel: node('p'),
    guessList: node('ul'),
    guessSearchField: node('div'),
    guessCustomForm: node('form'),
    guessDialog: node('dialog'),
    guessConfirmationCopy: node('p')
  };
  return {
    refs,
    state: {
      snapshot: {
        secretMode,
        locationBoard,
        guessingPlayer: { id: 'spy-1', displayName: 'Ana' }
      },
      guessFilter,
      pendingGuessLocation: null,
      mutationBusy: false
    },
    logic: { LOCATION_DECK },
    documentRef: { createElement: node },
    closeGuessDialog() {}
  };
}

function spyRevealContext(secretMode, partner, locationBoard) {
  const player = { id: 'spy-1', displayName: 'Ana' };
  const otherPlayer = { id: 'player-2', displayName: 'Bea' };
  const refs = {
    revealTitle: node('h2'),
    revealInstruction: node('p'),
    revealCard: node('div'),
    revealCardFace: node('div'),
    revealAction: node('button'),
    revealActionLabel: node('span'),
    privacyCover: node('div'),
    revealLabel: node('p'),
    revealSecret: node('strong'),
    revealHint: node('p'),
    revealArt: node('img'),
    revealNote: node('p')
  };
  return {
    refs,
    state: {
      snapshot: {
        players: [player, otherPlayer],
        currentPlayer: player,
        revealIndex: 0,
        secretMode,
        locationBoard
      },
      visibleCard: { player, isSpy: true, partner: partner ? otherPlayer : undefined },
      cardHidden: false,
      mutationBusy: false,
      revealPending: false,
      privacyLocked: false
    }
  };
}

test('round view shows the public board in a collapsed, alphabetical list', () => {
  const context = roundContext();

  view.renderRound(context);

  assert.equal(context.refs.locationBoard.hidden, false);
  assert.deepEqual(context.refs.locationBoardList.children.map((item) => item.textContent), ['Airport', 'Bank']);
  assert.equal(context.refs.locationBoard.open, false);
  assert.deepEqual(context.refs.locationBoardList.children.map((item) => item.children.length), [0, 0]);
});

test('round view hides the board for custom and legacy games without one', () => {
  for (const options of [
    { secretMode: 'custom', locationBoard: null },
    { secretMode: 'deck', locationBoard: null }
  ]) {
    const context = roundContext(options);
    view.renderRound(context);
    assert.equal(context.refs.locationBoard.hidden, true);
    assert.equal(context.refs.locationBoardList.children.length, 0);
  }
});

test('spy guess options use only the game board and preserve search', () => {
  const context = guessContext({ locationBoard: ['Airport', 'Bank', 'Beach'] });

  view.renderGuess(context);

  assert.deepEqual(
    context.refs.guessList.children.map((item) => item.children[0].getAttribute('data-choice-value')),
    ['Airport', 'Bank', 'Beach']
  );
  context.state.guessFilter = 'bank';
  view.renderGuess(context);
  assert.deepEqual(
    context.refs.guessList.children.map((item) => item.children[0].getAttribute('data-choice-value')),
    ['Bank']
  );
});

test('legacy deck games still offer the full deck and custom games keep free-text guesses', () => {
  const legacy = guessContext({ locationBoard: null });
  view.renderGuess(legacy);
  assert.deepEqual(
    legacy.refs.guessList.children.map((item) => item.children[0].getAttribute('data-choice-value')),
    LOCATION_DECK.map((location) => location.name)
  );

  const custom = guessContext({ locationBoard: null, secretMode: 'custom' });
  view.renderGuess(custom);
  assert.equal(custom.refs.guessList.hidden, true);
  assert.equal(custom.refs.guessSearchField.hidden, true);
  assert.equal(custom.refs.guessCustomForm.hidden, false);
});

test('spy card points to a board only when the game has one', () => {
  const board = ['Airport', 'Bank'];
  const deckSpy = spyRevealContext('deck', false, board);
  view.renderReveal(deckSpy);
  assert.equal(deckSpy.refs.revealHint.textContent, 'The location is on the board — listen and narrow it down.');

  const partneredSpy = spyRevealContext('deck', true, board);
  view.renderReveal(partneredSpy);
  assert.match(partneredSpy.refs.revealHint.textContent, /working with Bea.*location is on the board/);

  const legacySpy = spyRevealContext('deck', false, null);
  view.renderReveal(legacySpy);
  assert.equal(legacySpy.refs.revealHint.textContent, 'Keep it private, then hide the card.');

  const customSpy = spyRevealContext('custom', false, null);
  view.renderReveal(customSpy);
  assert.doesNotMatch(customSpy.refs.revealHint.textContent, /location is on the board/);
});
