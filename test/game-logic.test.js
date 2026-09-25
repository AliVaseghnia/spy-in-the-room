const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validatePlayers,
  getSpyCount,
  shuffle,
  dealRound,
  pickBoard,
  formatTime,
  resolveAccusation,
  resolveSpyGuess,
  avatarForIndex,
  drawQuestion,
  twistForRound,
  AVATARS,
  QUESTION_PROMPTS,
  TWISTS,
  LOCATION_DECK
} = require('../game-logic.js');

test('accepts four unique trimmed names and returns them normalized', () => {
  assert.deepEqual(validatePlayers([' Ana ', 'Bea', 'Cy', 'Dee']), {
    ok: true,
    names: ['Ana', 'Bea', 'Cy', 'Dee'],
    error: ''
  });
});

test('rejects duplicate names case-insensitively', () => {
  assert.equal(validatePlayers(['Ana', ' ana ', 'Cy', 'Dee']).ok, false);
});

test('uses one spy for small groups and two for large groups', () => {
  assert.equal(getSpyCount(4), 1);
  assert.equal(getSpyCount(8), 1);
  assert.equal(getSpyCount(9), 2);
  assert.equal(getSpyCount(12), 2);
});

test('rejects player counts outside the supported range', () => {
  assert.throws(() => getSpyCount(3), RangeError);
  assert.throws(() => getSpyCount(13), RangeError);
});

test('shuffle returns a new deterministic permutation without mutating the input', () => {
  const original = ['Ana', 'Bea', 'Cy'];
  const shuffled = shuffle(original, () => 0);

  assert.deepEqual(shuffled, ['Bea', 'Cy', 'Ana']);
  assert.notStrictEqual(shuffled, original);
  assert.deepEqual(original, ['Ana', 'Bea', 'Cy']);
});

test('the location deck has at least 20 uniquely named categorized locations', () => {
  assert.ok(LOCATION_DECK.length >= 20);
  assert.equal(new Set(LOCATION_DECK.map(location => location.name)).size, LOCATION_DECK.length);
  assert.ok(LOCATION_DECK.every(location => location.name && location.category));
});

test('dealRound assigns the configured number of spies and preserves roster order', () => {
  const round = dealRound(
    ['Ana', 'Bea', 'Cy', 'Dee'],
    { name: 'Night market', category: 'Public places' },
    () => 0
  );

  assert.equal(round.spies.length, 1);
  assert.deepEqual(round.cards.map(card => card.player), ['Ana', 'Bea', 'Cy', 'Dee']);
  assert.equal(round.cards.filter(card => card.isSpy).length, 1);
  assert.equal(round.cards.find(card => !card.isSpy).location, 'Night market');
  assert.equal(round.cards.find(card => card.isSpy).location, null);
  assert.equal(round.cards.find(card => card.isSpy).category, null);
});
test('dealRound assigns unique roles until the role list cycles and leaves spies unassigned', () => {
  const players = Array.from({ length: 12 }, (_, index) => `Player ${index + 1}`);
  const location = LOCATION_DECK[0];
  const round = dealRound(players, location, () => 0);
  const spyCards = round.cards.filter(card => card.isSpy);
  const nonSpyCards = round.cards.filter(card => !card.isSpy);
  const assignedRoles = nonSpyCards.map(card => card.role);

  assert.equal(nonSpyCards.length, 10);
  assert.ok(assignedRoles.every(role => typeof role === 'string' && role.length > 0));
  assert.equal(new Set(assignedRoles.slice(0, location.roles.length)).size, location.roles.length);
  assert.deepEqual(
    assignedRoles.slice(location.roles.length),
    assignedRoles.slice(0, assignedRoles.length % location.roles.length)
  );
  assert.ok(spyCards.every(card => !Object.prototype.hasOwnProperty.call(card, 'role')));

  const customRound = dealRound(players.slice(0, 4), { name: 'Private secret', category: 'Custom' }, () => 0);
  assert.ok(customRound.cards.every(card => !Object.prototype.hasOwnProperty.call(card, 'role')));
});


test('pickBoard returns a unique, sorted deterministic sample from the deck', () => {
  const first = pickBoard(LOCATION_DECK, 24, () => 0.25);
  const second = pickBoard(LOCATION_DECK, 24, () => 0.25);
  const otherSample = pickBoard(LOCATION_DECK, 24, () => 0.75);

  assert.equal(first.length, 24);
  assert.equal(new Set(first).size, 24);
  assert.ok(first.every(name => LOCATION_DECK.some(location => location.name === name)));
  assert.deepEqual(first, first.slice().sort());
  assert.deepEqual(second, first);
  assert.notDeepEqual(otherSample, first);
});
test('formatTime pads minutes and seconds and clamps negatives', () => {
  assert.equal(formatTime(305), '05:05');
  assert.equal(formatTime(-1), '00:00');
});

test('a correct spy accusation opens the spy guess phase', () => {
  assert.deepEqual(resolveAccusation('Ana', ['Ana']), { phase: 'spy-guess' });
});

test('a wrong accusation immediately gives the win to the spies', () => {
  assert.deepEqual(resolveAccusation('Bea', ['Ana']), {
    phase: 'result',
    winner: 'spies',
    reason: 'wrong-accusation'
  });
});

test('the spy wins a correct location guess and the group wins an incorrect guess', () => {
  assert.deepEqual(resolveSpyGuess('Airport', 'Airport'), { winner: 'spies', reason: 'correct-guess' });
  assert.deepEqual(resolveSpyGuess('Museum', 'Airport'), { winner: 'group', reason: 'wrong-guess' });
});

test('player tokens are stable, frozen, and reused for large rosters', () => {
  assert.ok(AVATARS.length >= 12);
  assert.ok(Object.isFrozen(AVATARS));
  assert.ok(AVATARS.every((avatar) => Object.isFrozen(avatar)));
  assert.equal(avatarForIndex(0), AVATARS[0]);
  assert.equal(avatarForIndex(AVATARS.length), AVATARS[0]);
  assert.equal(avatarForIndex(-1), AVATARS[0]);
  assert.equal(new Set(AVATARS.map((avatar) => avatar.emoji)).size, AVATARS.length);
});

test('question prompts are location-agnostic, unique, and never repeat back-to-back', () => {
  assert.ok(QUESTION_PROMPTS.length >= 40);
  assert.equal(new Set(QUESTION_PROMPTS).size, QUESTION_PROMPTS.length);
  assert.ok(Object.isFrozen(QUESTION_PROMPTS));
  QUESTION_PROMPTS.forEach((prompt) => {
    assert.equal(prompt, prompt.trim());
    assert.ok(prompt.length <= 120);
    assert.doesNotMatch(prompt, /[<>]/);
  });

  assert.equal(drawQuestion(-1, () => 0).index, 0);
  // drawQuestion avoids the previous index instead of repeating it.
  assert.notEqual(drawQuestion(0, () => 0).index, 0);
  const random = (() => {
    const values = [0.5];
    return () => values.shift() ?? 0.5;
  })();
  assert.equal(drawQuestion(-1, random).index, Math.floor(0.5 * QUESTION_PROMPTS.length));
});

test('twists are frozen, public-safe, and deterministic per game and round', () => {
  assert.ok(TWISTS.length >= 10);
  assert.equal(new Set(TWISTS).size, TWISTS.length);
  assert.ok(Object.isFrozen(TWISTS));
  TWISTS.forEach((twist) => {
    assert.equal(twist, twist.trim());
    assert.doesNotMatch(twist, /[<>]/);
  });

  const first = twistForRound('game-abc', 1);
  assert.equal(twistForRound('game-abc', 1), first);
  assert.ok(TWISTS.includes(first));
  assert.ok(TWISTS.includes(twistForRound('game-abc', 2)));
  assert.ok(TWISTS.includes(twistForRound('game-xyz', 1)));
});
