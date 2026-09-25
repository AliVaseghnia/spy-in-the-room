(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpyGameLogic = factory();
  }
}(typeof window !== 'undefined'
  ? window
  : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var LOCATION_DECK = [
    { name: 'Airport', category: 'Travel' },
    { name: 'Bank', category: 'Workplaces' },
    { name: 'Beach', category: 'Outdoors' },
    { name: 'Casino', category: 'Entertainment' },
    { name: 'Circus', category: 'Entertainment' },
    { name: 'Construction site', category: 'Workplaces' },
    { name: 'Cruise ship', category: 'Travel' },
    { name: 'Embassy', category: 'Workplaces' },
    { name: 'Fire station', category: 'Services' },
    { name: 'Hospital', category: 'Services' },
    { name: 'Hotel', category: 'Travel' },
    { name: 'Library', category: 'Public places' },
    { name: 'Movie theater', category: 'Entertainment' },
    { name: 'Museum', category: 'Public places' },
    { name: 'Night market', category: 'Public places' },
    { name: 'Police station', category: 'Services' },
    { name: 'Restaurant', category: 'Food and drink' },
    { name: 'School', category: 'Workplaces' },
    { name: 'Space station', category: 'Travel' },
    { name: 'Stadium', category: 'Entertainment' },
    { name: 'Subway station', category: 'Travel' },
    { name: 'Supermarket', category: 'Public places' },
    { name: 'Train station', category: 'Travel' },
    { name: 'Wedding', category: 'Events' },

    { name: 'Amusement park', category: 'Entertainment' },
    { name: 'Animal shelter', category: 'Services' },
    { name: 'Arcade', category: 'Entertainment' },
    { name: 'Aquarium', category: 'Public places' },
    { name: 'Art opening', category: 'Events' },
    { name: 'Birthday party', category: 'Events' },
    { name: 'Botanical garden', category: 'Outdoors' },
    { name: 'Bowling alley', category: 'Entertainment' },
    { name: 'Bus terminal', category: 'Travel' },
    { name: 'Campground', category: 'Outdoors' },
    { name: 'City park', category: 'Outdoors' },
    { name: 'Clinic', category: 'Services' },
    { name: 'Coffee shop', category: 'Food and drink' },
    { name: 'Community center', category: 'Public places' },
    { name: 'Concert hall', category: 'Entertainment' },
    { name: 'Diner', category: 'Food and drink' },
    { name: 'Farmers market', category: 'Public places' },
    { name: 'Ferry terminal', category: 'Travel' },
    { name: 'Food court', category: 'Food and drink' },
    { name: 'Food truck', category: 'Food and drink' },
    { name: 'Hiking trail', category: 'Outdoors' },
    { name: 'Ice cream shop', category: 'Food and drink' },
    { name: 'Lakeside dock', category: 'Outdoors' },
    { name: 'Newsroom', category: 'Workplaces' },
    { name: 'Office tower', category: 'Workplaces' },
    { name: 'Parade', category: 'Events' },
    { name: 'Picnic', category: 'Events' },
    { name: 'Pizza parlor', category: 'Food and drink' },
    { name: 'Playground', category: 'Outdoors' },
    { name: 'Post office', category: 'Services' },
    { name: 'Research lab', category: 'Workplaces' },
    { name: 'Rescue center', category: 'Services' },
    { name: 'School concert', category: 'Events' },
    { name: 'Science fair', category: 'Events' },
    { name: 'Street fair', category: 'Events' },
    { name: 'Tea house', category: 'Food and drink' },
    { name: 'Town hall', category: 'Services' },
    { name: 'Town square', category: 'Public places' },
    { name: 'Treehouse', category: 'Outdoors' },
    { name: 'Waterfall', category: 'Outdoors' },
    { name: 'Workshop', category: 'Workplaces' }
  ];

  LOCATION_DECK.forEach(function (location) {
    Object.freeze(location);
  });
  Object.freeze(LOCATION_DECK);

  function validatePlayers(rawNames) {
    var names = Array.isArray(rawNames)
      ? rawNames.map(function (name) {
        return typeof name === 'string' ? name.trim() : '';
      })
      : [];

    if (names.length < 4) {
      return { ok: false, names: names, error: 'Enter at least 4 player names.' };
    }

    if (names.length > 12) {
      return { ok: false, names: names, error: 'Enter no more than 12 player names.' };
    }

    if (names.some(function (name) { return name.length === 0; })) {
      return { ok: false, names: names, error: 'Player names cannot be empty.' };
    }

    var normalized = names.map(function (name) { return name.toLowerCase(); });
    if (new Set(normalized).size !== normalized.length) {
      return { ok: false, names: names, error: 'Player names must be unique.' };
    }

    return { ok: true, names: names, error: '' };
  }

  function getSpyCount(playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 12) {
      throw new RangeError('Spy games support 4 to 12 players.');
    }
    return playerCount <= 8 ? 1 : 2;
  }

  function shuffle(items, random) {
    var result = items.slice();
    var randomSource = typeof random === 'function' ? random : Math.random;

    for (var index = result.length - 1; index > 0; index -= 1) {
      var swapIndex = Math.floor(randomSource() * (index + 1));
      swapIndex = Math.max(0, Math.min(index, swapIndex));
      var item = result[index];
      result[index] = result[swapIndex];
      result[swapIndex] = item;
    }

    return result;
  }

  function pickBoard(deck, size, random) {
    var locations = Array.isArray(deck) ? deck : [];
    var boardSize = Number(size);
    if (!Number.isFinite(boardSize) || boardSize < 0) boardSize = 0;

    return shuffle(locations, random)
      .slice(0, Math.floor(boardSize))
      .map(function (location) { return location.name; })
      .sort();
  }

  function dealRound(names, location, random) {
    var spyCount = getSpyCount(names.length);
    var shuffledNames = shuffle(names, random);
    var spies = shuffledNames.slice(0, spyCount);
    var cards = names.map(function (player) {
      var isSpy = spies.indexOf(player) !== -1;
      var card = {
        player: player,
        isSpy: isSpy,
        location: isSpy ? null : location.name,
        category: isSpy ? null : location.category
      };

      if (isSpy && spies.length > 1) {
        card.partner = spies.find(function (spy) { return spy !== player; }) || null;
      }
      return card;
    });

    return {
      location: location,
      spies: spies,
      cards: cards
    };
  }

  function formatTime(totalSeconds) {
    var seconds = Number(totalSeconds);
    if (!Number.isFinite(seconds) || seconds < 0) {
      seconds = 0;
    }
    seconds = Math.floor(seconds);

    var minutes = Math.floor(seconds / 60);
    var remainingSeconds = seconds % 60;
    return (minutes < 10 ? '0' : '') + minutes
      + ':'
      + (remainingSeconds < 10 ? '0' : '') + remainingSeconds;
  }

  function resolveAccusation(accusedPlayer, spies) {
    if (spies.indexOf(accusedPlayer) !== -1) {
      return { phase: 'spy-guess' };
    }

    return {
      phase: 'result',
      winner: 'spies',
      reason: 'wrong-accusation'
    };
  }

  function resolveSpyGuess(guess, location) {
    if (guess === location) {
      return { winner: 'spies', reason: 'correct-guess' };
    }

    return { winner: 'group', reason: 'wrong-guess' };
  }

  function resolveSpyGuesses(guesses, location) {
    var entries = Array.isArray(guesses) ? guesses : [];
    var correct = entries.some(function (guess) {
      return guess && guess.location === location;
    });

    return {
      winner: correct ? 'spies' : 'group',
      reason: correct ? 'correct-guess' : 'wrong-guess'
    };
  }

  function calculateRoundPoints({ players, spies, winner, reason } = {}) {
    var roster = Array.isArray(players) ? players : [];
    var spyNames = new Set(Array.isArray(spies) ? spies : []);
    var winningPoints = winner === 'spies'
      ? (reason === 'correct-guess' ? 3 : 2)
      : 2;

    return roster.map(function (player) {
      var isWinner = winner === 'spies'
        ? spyNames.has(player)
        : !spyNames.has(player);
      return {
        player: player,
        points: isWinner ? winningPoints : 0
      };
    });
  }

  // Player tokens. Order is stable for the whole session: a seat keeps its
  // token so the room learns who is who at a glance.
  var AVATARS = Object.freeze([
    { emoji: '🦊', color: '#efb36d' },
    { emoji: '🐼', color: '#8fc7e8' },
    { emoji: '🦉', color: '#c9a7eb' },
    { emoji: '🐙', color: '#f0967d' },
    { emoji: '🐸', color: '#a8c79d' },
    { emoji: '🦁', color: '#f2c94c' },
    { emoji: '🐨', color: '#9fb7c9' },
    { emoji: '🦄', color: '#f4a3c2' },
    { emoji: '🐯', color: '#f08a5d' },
    { emoji: '🐳', color: '#78c6d0' },
    { emoji: '🦖', color: '#b7d76f' },
    { emoji: '🐝', color: '#e8c46a' }
  ]);
  AVATARS.forEach(function (avatar) { Object.freeze(avatar); });

  function avatarForIndex(index) {
    var normalized = Number.isInteger(index) && index >= 0 ? index : 0;
    return AVATARS[normalized % AVATARS.length];
  }

  // Questions stay location-agnostic on purpose: the spy sees the same deck as
  // everyone else, and no prompt can leak a category.
  var QUESTION_PROMPTS = Object.freeze([
    'What is the first thing you notice when you walk in?',
    'What is the busiest time here?',
    'What does it smell like here?',
    'What do people wear here?',
    'What is the worst spot to sit?',
    'What is in your pocket right now?',
    'Who is the most annoying person here?',
    'What is the last thing that happens before everyone leaves?',
    'What is the most expensive thing here?',
    'What sound do you hear most often here?',
    'What is the quickest way to get kicked out?',
    'What is the best spot for a photo?',
    'What would a tourist get wrong about this place?',
    'What is the first rule everyone breaks?',
    'What job would be terrible here?',
    'What is the signature move of the person in charge?',
    'What is the most common complaint?',
    'What is the weirdest thing you have seen here?',
    'What is the unofficial dress code?',
    'What do you do while you wait?',
    'What is the item nobody here can live without?',
    'What is the worst thing someone could bring through the door?',
    'What is the biggest safety hazard?',
    'What is the least-used corner?',
    'What is the best excuse to leave early?',
    'What is the proudest moment this place has seen?',
    'What is the most popular souvenir?',
    'What is the correct way to greet someone here?',
    'What snack shows up at every event here?',
    'What is the most suspicious behavior for a newcomer?',
    'What is the loudest thing here?',
    'What is the quietest thing here?',
    'What is the first thing you would change about this place?',
    'What is the most repeated sentence said here?',
    'What is the typical age of someone here?',
    'What is the hardest part of the day?',
    'What is a job only an expert could do here?',
    'What is the best hiding spot?',
    'What is the worst smell you could imagine here?',
    'What would count as a dress-code violation?',
    'What is the unofficial uniform?',
    'What is the most common photo pose?',
    'What is the weirdest rule?',
    'What would you never say out loud here?',
    'What is the first thing you would buy here?',
    'What is the one thing you forgot to bring?',
    'What is the tell that someone does not belong?',
    'What is the most repeated question here?',
    'What is the perfect time to arrive?',
    'What is the perfect time to leave?',
    'What is the biggest lie someone tells here?',
    'What is the most overrated part of this place?',
    'What is the most underrated part of this place?',
    'What is the first thing you would hide if your boss walked in?',
    'What is the best thing that could happen to you here?',
    'What is the worst thing that could happen to you here?',
    'If this place had a mascot, what would it be?',
    'What is the drink of choice here?',
    'What is the last thing you do before you leave?',
    'Describe the vibe in one word — and why?'
  ]);

  // Public, opt-in round modifiers. Deliberately light so they add flavor
  // without breaking the deduction loop.
  var TWISTS = Object.freeze([
    'No saying yes or no.',
    'Every answer needs a hand gesture.',
    'Answers must be exactly three words.',
    'Nobody may repeat a question that was already asked.',
    'Speak in the third person for the next three questions.',
    'Every answer must start with “Honestly,”.',
    'Questions must be asked in a whisper.',
    'End every answer with “…allegedly.”',
    'Answer as if you are being interviewed on TV.',
    'Swap seats with someone after you answer.',
    'You may only ask questions that start with how or why.',
    'Clap once before every answer.',
    'Nobody may use the word “the”.',
    'Every answer must mention a colour.'
  ]);

  function randomIndex(length, random) {
    var source = typeof random === 'function' ? random : Math.random;
    var value = Number(source());
    var bounded = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
    return Math.floor(bounded * length);
  }

  function drawQuestion(previousIndex, random) {
    var index;

    if (QUESTION_PROMPTS.length === 0) return { index: -1, text: '' };
    index = randomIndex(QUESTION_PROMPTS.length, random);
    if (index === previousIndex && QUESTION_PROMPTS.length > 1) {
      index = (index + 1) % QUESTION_PROMPTS.length;
    }
    return { index: index, text: QUESTION_PROMPTS[index] };
  }

  // FNV-1a keeps the per-round twist stable everywhere it is computed.
  function hashString(value) {
    var text = String(value || '');
    var hash = 2166136261;

    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function twistForRound(gameId, roundNumber) {
    var round = Number.isInteger(roundNumber) && roundNumber > 0 ? roundNumber : 1;
    return TWISTS[hashString(String(gameId || 'game') + ':' + round) % TWISTS.length];
  }

  return {
    AVATARS: AVATARS,
    QUESTION_PROMPTS: QUESTION_PROMPTS,
    TWISTS: TWISTS,
    avatarForIndex: avatarForIndex,
    drawQuestion: drawQuestion,
    hashString: hashString,
    twistForRound: twistForRound,
    validatePlayers: validatePlayers,
    getSpyCount: getSpyCount,
    shuffle: shuffle,
    pickBoard: pickBoard,
    dealRound: dealRound,
    formatTime: formatTime,
    resolveAccusation: resolveAccusation,
    resolveSpyGuess: resolveSpyGuess,
    resolveSpyGuesses: resolveSpyGuesses,
    calculateRoundPoints: calculateRoundPoints,
    LOCATION_DECK: LOCATION_DECK
  };
}));
