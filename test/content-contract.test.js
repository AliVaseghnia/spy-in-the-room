'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LOCATION_DECK } = require('../game-logic.js');

const EXPECTED_LOCATION_KEYS = ['category', 'name', 'roles'];
const UNSAFE_MARKUP = /[<>]/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

test('ships a broad location pack with unique names', () => {
  assert.ok(LOCATION_DECK.length >= 65);

  const normalizedNames = LOCATION_DECK.map((location) => location.name.toLowerCase());
  assert.equal(new Set(normalizedNames).size, LOCATION_DECK.length);
});

test('covers at least eight location categories', () => {
  const categories = new Set(LOCATION_DECK.map((location) => location.category));

  assert.ok(categories.size >= 8);
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

test('freezes the deck and each public location record', () => {
  assert.ok(Object.isFrozen(LOCATION_DECK));
  assert.ok(LOCATION_DECK.every((location) => Object.isFrozen(location)));
  assert.ok(LOCATION_DECK.every((location) => Object.isFrozen(location.roles)));
});
