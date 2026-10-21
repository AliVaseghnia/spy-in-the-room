const assert = require('node:assert/strict');
const test = require('node:test');

const { describeOutcome } = require('../game-view.js');

function player(name) {
  return { id: 'p-' + name, displayName: name };
}

test('the recap tells the story of a wrong accusation', () => {
  const recap = describeOutcome({
    winner: 'spies',
    reason: 'wrong-accusation',
    location: 'Ferry terminal',
    accusedPlayer: player('Ana'),
    spyPlayers: [player('Dev')],
    playerRoles: [
      { player: player('Ana'), isSpy: false, role: 'the one who measured twice' },
      { player: player('Dev'), isSpy: true, role: null }
    ]
  });

  assert.equal(
    recap,
    'The room called in Ana. Ana was the one who measured twice. Dev never got caught.'
  );
});

test('the recap covers an innocent accused player with no role', () => {
  const recap = describeOutcome({
    winner: 'spies',
    reason: 'wrong-accusation',
    location: 'Rooftop garden',
    accusedPlayer: player('Ana'),
    spyPlayers: [player('Dev')]
  });

  assert.match(recap, /Ana was innocent\./);
  assert.match(recap, /Dev never got caught\./);
});

test('the recap names the spy who named the secret', () => {
  const recap = describeOutcome({
    winner: 'spies',
    reason: 'correct-guess',
    location: 'Airport',
    spyPlayers: [player('Dev')],
    guesses: [{ player: player('Dev'), location: 'Airport', correct: true }]
  });

  assert.equal(recap, 'Dev named it: Airport. The spy got away with it.');
});

test('the recap covers a partnered spy team that guessed right', () => {
  const recap = describeOutcome({
    winner: 'spies',
    reason: 'correct-guess',
    location: 'Airport',
    spyPlayers: [player('Ana'), player('Dev')],
    guesses: [{ player: player('Dev'), location: 'Airport', correct: true }]
  });

  assert.equal(recap, 'Dev named it: Airport. The spies got away with it.');
});

test('the recap reports a missed guess against the real secret', () => {
  const recap = describeOutcome({
    winner: 'group',
    reason: 'wrong-guess',
    location: 'Ferry terminal',
    spyPlayers: [player('Dev')],
    guesses: [{ player: player('Dev'), location: 'Airport', correct: false }]
  });

  assert.equal(recap, 'Dev guessed Airport, but the secret was Ferry terminal.');
});

test('the recap lists every miss when both spies guess wrong', () => {
  const recap = describeOutcome({
    winner: 'group',
    reason: 'wrong-guess',
    location: 'Concert hall',
    spyPlayers: [player('Ana'), player('Dev')],
    guesses: [
      { player: player('Ana'), location: 'Animal shelter', correct: false },
      { player: player('Dev'), location: 'Arcade', correct: false }
    ]
  });

  assert.equal(
    recap,
    'The spies guessed Animal shelter and Arcade, but the secret was Concert hall.'
  );
});

test('the recap survives an outcome with nothing to report', () => {
  const recap = describeOutcome({});

  assert.equal(typeof recap, 'string');
  assert.ok(recap.length > 0);
});
