'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const view = require('../game-view.js');

function element(attributes) {
  const values = Object.assign({}, attributes);
  const activeClasses = new Set();
  return {
    attributes: values,
    classList: {
      toggle(name, enabled) {
        if (enabled) activeClasses.add(name);
        else activeClasses.delete(name);
      },
      contains(name) {
        return activeClasses.has(name);
      }
    },
    dataset: {},
    disabled: false,
    hidden: false,
    textContent: '',
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
    },
    removeAttribute(name) {
      delete values[name];
    },
    setAttribute(name, value) {
      values[name] = String(value);
    }
  };
}

function revealContext(revealIndex, cardVisible, cardHidden) {
  const players = [
    { id: 'player-1', displayName: 'Farzaneh' },
    { id: 'player-2', displayName: 'Asal' }
  ];
  const steps = [element({ 'data-reveal-step': 'reveal' }), element({ 'data-reveal-step': 'pass' })];
  const refs = {
    connectionError: element(),
    connectionStatus: element(),
    retryButton: element(),
    resumeNewGameButton: element(),
    newGameButton: element(),
    revealTitle: element(),
    revealProgress: element(),
    revealSteps: steps,
    revealInstruction: element(),
    revealCard: element(),
    revealCardFace: element(),
    revealAction: element(),
    revealActionLabel: element(),
    privacyCover: element(),
    revealLabel: element(),
    revealSecret: element(),
    revealHint: element(),
    revealArt: element(),
    revealNote: element()
  };
  const player = players[revealIndex];

  return {
    refs,
    state: {
      snapshot: {
        players,
        currentPlayer: player,
        revealIndex,
        secretMode: 'deck'
      },
      visibleCard: cardVisible
        ? { player: player, isSpy: false, location: 'Train station', category: 'Travel' }
        : null,
      cardHidden: cardHidden,
      connection: 'connected',
      mutationBusy: false,
      retryOperation: null,
      revealPending: false,
      privacyLocked: false
    }
  };
}

test('a revealed card combines hiding and passing in one action', () => {
  const context = revealContext(0, true, false);

  view.renderReveal(context);

  assert.equal(context.refs.revealActionLabel.textContent, 'Hide & pass to Asal');
  assert.equal(context.refs.revealAction.getAttribute('aria-label'), 'Hide & pass to Asal');
  assert.equal(context.refs.revealSteps[1].getAttribute('aria-current'), 'step');
  assert.equal(context.refs.revealSteps[0].getAttribute('aria-current'), null);
});

test('the last revealed card combines hiding and starting the round', () => {
  const context = revealContext(1, true, false);

  view.renderReveal(context);

  assert.equal(context.refs.revealActionLabel.textContent, 'Hide & start the round');
  assert.equal(context.refs.revealAction.getAttribute('aria-label'), 'Hide & start the round');
});

test('a hidden card cannot be reopened from the handoff screen', () => {
  const context = revealContext(0, false, true);

  view.renderReveal(context);
  view.renderConnection(context);

  assert.equal(context.refs.revealAction.disabled, true);
  assert.equal(context.refs.revealSteps[1].getAttribute('aria-current'), 'step');
});
