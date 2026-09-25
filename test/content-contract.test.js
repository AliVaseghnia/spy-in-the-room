'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LOCATION_DECK } = require('../game-logic.js');

const EXPECTED_LOCATION_KEYS = ['category', 'name', 'roles'];
const EXPECTED_LOCATION_INVENTORY = [
  ['Airport', 'Travel'],
  ['Bank', 'Workplaces'],
  ['Beach', 'Outdoors'],
  ['Casino', 'Entertainment'],
  ['Circus', 'Entertainment'],
  ['Construction site', 'Workplaces'],
  ['Cruise ship', 'Travel'],
  ['Embassy', 'Workplaces'],
  ['Fire station', 'Services'],
  ['Hospital', 'Services'],
  ['Hotel', 'Travel'],
  ['Library', 'Public places'],
  ['Movie theater', 'Entertainment'],
  ['Museum', 'Public places'],
  ['Night market', 'Public places'],
  ['Police station', 'Services'],
  ['Restaurant', 'Food and drink'],
  ['School', 'Workplaces'],
  ['Space station', 'Travel'],
  ['Stadium', 'Entertainment'],
  ['Subway station', 'Travel'],
  ['Supermarket', 'Public places'],
  ['Train station', 'Travel'],
  ['Wedding', 'Events'],
  ['Amusement park', 'Entertainment'],
  ['Animal shelter', 'Services'],
  ['Arcade', 'Entertainment'],
  ['Aquarium', 'Public places'],
  ['Art opening', 'Events'],
  ['Birthday party', 'Events'],
  ['Botanical garden', 'Outdoors'],
  ['Bowling alley', 'Entertainment'],
  ['Bus terminal', 'Travel'],
  ['Campground', 'Outdoors'],
  ['City park', 'Outdoors'],
  ['Clinic', 'Services'],
  ['Coffee shop', 'Food and drink'],
  ['Community center', 'Public places'],
  ['Concert hall', 'Entertainment'],
  ['Diner', 'Food and drink'],
  ['Farmers market', 'Public places'],
  ['Ferry terminal', 'Travel'],
  ['Food court', 'Food and drink'],
  ['Food truck', 'Food and drink'],
  ['Hiking trail', 'Outdoors'],
  ['Ice cream shop', 'Food and drink'],
  ['Lakeside dock', 'Outdoors'],
  ['Newsroom', 'Workplaces'],
  ['Office tower', 'Workplaces'],
  ['Parade', 'Events'],
  ['Picnic', 'Events'],
  ['Pizza parlor', 'Food and drink'],
  ['Playground', 'Outdoors'],
  ['Post office', 'Services'],
  ['Research lab', 'Workplaces'],
  ['Rescue center', 'Services'],
  ['School concert', 'Events'],
  ['Science fair', 'Events'],
  ['Street fair', 'Events'],
  ['Tea house', 'Food and drink'],
  ['Town hall', 'Services'],
  ['Town square', 'Public places'],
  ['Treehouse', 'Outdoors'],
  ['Waterfall', 'Outdoors'],
  ['Workshop', 'Workplaces']
];
const UNSAFE_MARKUP = /[<>]/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

test('preserves every original location name and category pair', () => {
  const comparePairs = (left, right) =>
    left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]);

  const actual = LOCATION_DECK.map(({ name, category }) => [name, category]);
  assert.deepEqual(
    actual.sort(comparePairs),
    EXPECTED_LOCATION_INVENTORY.slice().sort(comparePairs)
  );
});

test('keeps every location clueable, family-safe, and within the public shape', () => {
  LOCATION_DECK.forEach((location) => {
    assert.deepEqual(Object.keys(location).sort(), EXPECTED_LOCATION_KEYS);

    for (const field of ['name', 'category']) {
      const value = location[field];
      assert.equal(typeof value, 'string', `${field} must be a string`);
      assert.ok(value.trim().length > 0, `${field} must not be empty`);
      assert.equal(value, value.trim(), `${field} must not have edge whitespace`);
      assert.doesNotMatch(value, UNSAFE_MARKUP, `${field} must not contain markup`);
      assert.doesNotMatch(value, CONTROL_CHARACTERS, `${field} must not contain control characters`);
    }

    assert.ok(location.name.length <= 32, `${location.name} should stay concise`);
    assert.ok(location.category.length <= 32, `${location.category} should stay concise`);
  });
});

test('each location has at least seven concise, distinct, location-free roles', () => {
  LOCATION_DECK.forEach((location) => {
    assert.ok(Array.isArray(location.roles), `${location.name} must have role prompts`);
    assert.ok(location.roles.length >= 7, `${location.name} needs at least seven roles`);
    assert.equal(
      new Set(location.roles.map((role) => role.toLowerCase())).size,
      location.roles.length,
      `${location.name} roles must be unique`
    );

    location.roles.forEach((role) => {
      assert.equal(typeof role, 'string');
      assert.ok(role.length >= 2 && role.length <= 32, `${role} must be 2–32 characters`);
      assert.equal(role, role.trim(), `${role} must not have edge whitespace`);
      assert.doesNotMatch(role, UNSAFE_MARKUP, `${role} must not contain markup`);
      assert.doesNotMatch(role, CONTROL_CHARACTERS, `${role} must not contain control characters`);
      assert.equal(
        role.toLowerCase().includes(location.name.toLowerCase()),
        false,
        `${role} must not reveal ${location.name}`
      );
    });
  });
});

test('role prompts are unique across the entire deck', () => {
  const roleOwners = new Map();

  LOCATION_DECK.forEach((location) => {
    location.roles.forEach((role) => {
      const normalizedRole = role.toLowerCase();
      assert.equal(
        roleOwners.has(normalizedRole),
        false,
        `${role} appears in both ${roleOwners.get(normalizedRole)} and ${location.name}`
      );
      roleOwners.set(normalizedRole, location.name);
    });
  });
});

test('freezes the deck and each public location record', () => {
  assert.ok(Object.isFrozen(LOCATION_DECK));
  assert.ok(LOCATION_DECK.every((location) => Object.isFrozen(location)));
  assert.ok(LOCATION_DECK.every((location) => Object.isFrozen(location.roles)));
});
