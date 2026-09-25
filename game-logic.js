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
    { name: 'Airport', category: 'Travel', roles: [
      'the boarding caller', 'the gate agent', 'the baggage sleuth',
      'the runway watcher', 'the window-seat fan', 'the flight attendant', 'the nervous flyer'
    ] },
    { name: 'Bank', category: 'Workplaces', roles: [
      'the teller', 'the vault keeper', 'the coin counter',
      'the loan officer', 'the savings coach', 'the receipt saver', 'the budget planner'
    ] },
    { name: 'Beach', category: 'Outdoors', roles: [
      'the tide watcher', 'the shell collector', 'the lifeguard',
      'the sandcastle architect', 'the sunhat expert', 'the wave counter', 'the sunscreen captain'
    ] },
    { name: 'Casino', category: 'Entertainment', roles: [
      'the card dealer', 'the dice roller', 'the lucky charm',
      'the chip stacker', 'the roulette watcher', 'the magician', 'the scorekeeper'
    ] },
    { name: 'Circus', category: 'Entertainment', roles: [
      'the ringmaster', 'the tightrope walker', 'the clown’s assistant',
      'the juggling coach', 'the costume tailor', 'the trapeze artist', 'the ticket taker'
    ] },
    { name: 'Construction site', category: 'Workplaces', roles: [
      'the safety inspector', 'the blueprint reader', 'the crane operator',
      'the brick layer', 'the hard-hat stylist', 'the tool librarian', 'the lunch bell ringer'
    ] },
    { name: 'Cruise ship', category: 'Travel', roles: [
      'the deck officer', 'the sea-sick singer', 'the captain’s helper',
      'the buffet scout', 'the wave watcher', 'the cabin steward', 'the sunset photographer'
    ] },
    { name: 'Embassy', category: 'Workplaces', roles: [
      'the translator', 'the cultural attaché', 'the protocol guide',
      'the passport checker', 'the welcome host', 'the language tutor', 'the meeting note-taker'
    ] },
    { name: 'Fire station', category: 'Services', roles: [
      'the fire captain', 'the alarm listener', 'the rescue planner',
      'the engine checker', 'the hose expert', 'the safety teacher', 'the ladder climber'
    ] },
    { name: 'Hospital', category: 'Services', roles: [
      'the night nurse', 'the x-ray reader', 'the bandage artist',
      'the care coordinator', 'the calm visitor', 'the chart checker', 'the snack cart scout'
    ] },
    { name: 'Hotel', category: 'Travel', roles: [
      'the concierge', 'the bell captain', 'the room key keeper',
      'the pillow tester', 'the lobby pianist', 'the towel folder', 'the tour planner'
    ] },
    { name: 'Library', category: 'Public places', roles: [
      'the quiet champion', 'the book whisperer', 'the shelf sorter',
      'the reading coach', 'the return desk helper', 'the mystery novel fan', 'the bookmark maker'
    ] },
    { name: 'Movie theater', category: 'Entertainment', roles: [
      'the usher', 'the ticket ripper', 'the popcorn critic',
      'the preview expert', 'the seat finder', 'the subtitle reader', 'the film trivia host'
    ] },
    { name: 'Museum', category: 'Public places', roles: [
      'the gallery guide', 'the artifact admirer', 'the history detective',
      'the audio tour fan', 'the sketchbook keeper', 'the exhibit planner', 'the ancient coin expert'
    ] },
    { name: 'Night market', category: 'Public places', roles: [
      'the lantern seller', 'the dumpling sampler', 'the bargain hunter',
      'the spice expert', 'the night owl', 'the street musician', 'the cashless shopper'
    ] },
    { name: 'Police station', category: 'Services', roles: [
      'the detective', 'the dispatcher', 'the evidence keeper',
      'the traffic officer', 'the community helper', 'the badge shiner', 'the interview note-taker'
    ] },
    { name: 'Restaurant', category: 'Food and drink', roles: [
      'the head waiter', 'the menu memorizer', 'the table planner',
      'the chef’s helper', 'the pastry fan', 'the host with a smile', 'the order checker'
    ] },
    { name: 'School', category: 'Workplaces', roles: [
      'the substitute teacher', 'the hall monitor', 'the science tutor',
      'the lunch monitor', 'the class clown', 'the art teacher', 'the homework helper'
    ] },
    { name: 'Space station', category: 'Travel', roles: [
      'the mission pilot', 'the zero-gravity gardener', 'the star mapper',
      'the oxygen checker', 'the spacewalk coach', 'the robot caretaker', 'the comet watcher'
    ] },
    { name: 'Stadium', category: 'Entertainment', roles: [
      'the score announcer', 'the team mascot', 'the referee',
      'the jersey collector', 'the ticket scanner', 'the chant leader', 'the halftime host'
    ] },
    { name: 'Subway station', category: 'Travel', roles: [
      'the platform guide', 'the map reader', 'the train spotter',
      'the rush-hour poet', 'the lost-and-found helper', 'the turnstile fixer', 'the next-stop announcer'
    ] },
    { name: 'Supermarket', category: 'Public places', roles: [
      'the cart collector', 'the produce expert', 'the coupon planner',
      'the aisle navigator', 'the sample taster', 'the checkout speedster', 'the list keeper'
    ] },
    { name: 'Train station', category: 'Travel', roles: [
      'the conductor', 'the platform announcer', 'the timetable expert',
      'the sleeper-car steward', 'the track inspector', 'the luggage porter', 'the ticket puncher'
    ] },
    { name: 'Wedding', category: 'Events', roles: [
      'the toast writer', 'the ring bearer', 'the bouquet catcher',
      'the dance-floor starter', 'the cake inspector', 'the playlist picker', 'the photo wrangler'
    ] },
    { name: 'Amusement park', category: 'Entertainment', roles: [
      'the ride tester', 'the queue comedian', 'the park map expert',
      'the coaster fan', 'the prize booth pro', 'the parade watcher', 'the cotton-candy critic'
    ] },
    { name: 'Animal shelter', category: 'Services', roles: [
      'the puppy socializer', 'the kitten whisperer', 'the adoption matchmaker',
      'the dog-walk organizer', 'the treat dispenser', 'the paw-print painter', 'the blanket folder'
    ] },
    { name: 'Arcade', category: 'Entertainment', roles: [
      'the high-score holder', 'the joystick wizard', 'the token counter',
      'the pinball champion', 'the button masher', 'the prize-ticket saver', 'the dance-game dancer'
    ] },
    { name: 'Aquarium', category: 'Public places', roles: [
      'the penguin expert', 'the coral caretaker', 'the shark narrator',
      'the diver', 'the seal trainer', 'the fish-name inventor', 'the ocean educator'
    ] },
    { name: 'Art opening', category: 'Events', roles: [
      'the gallery greeter', 'the bold-color fan', 'the sketchbook artist',
      'the tiny-frame critic', 'the opening-toast host', 'the sculpture admirer', 'the art-history buff'
    ] },
    { name: 'Birthday party', category: 'Events', roles: [
      'the candle counter', 'the party planner', 'the gift-wrap expert',
      'the birthday singer', 'the balloon twister', 'the cake cutter', 'the game host'
    ] },
    { name: 'Botanical garden', category: 'Outdoors', roles: [
      'the orchid expert', 'the seed librarian', 'the butterfly watcher',
      'the plant label writer', 'the greenhouse guide', 'the garden sketcher', 'the pollinator fan'
    ] },
    { name: 'Bowling alley', category: 'Entertainment', roles: [
      'the pin setter', 'the lane coach', 'the strike tracker',
      'the shoe sanitizer', 'the spare solver', 'the scoreboard keeper', 'the ball polisher'
    ] },
    { name: 'Bus terminal', category: 'Travel', roles: [
      'the route planner', 'the driver', 'the ticket checker',
      'the luggage stacker', 'the platform guide', 'the early arriver', 'the seat saver'
    ] },
    { name: 'Campground', category: 'Outdoors', roles: [
      'the park ranger', 'the tent-pitching pro', 'the campfire storyteller',
      'the trail guide', 'the bug spray expert', 'the marshmallow roaster', 'the map keeper'
    ] },
    { name: 'City park', category: 'Outdoors', roles: [
      'the kite flyer', 'the bench painter', 'the jogger',
      'the bird feeder', 'the picnic blanket finder', 'the playground monitor', 'the tree identifier'
    ] },
    { name: 'Clinic', category: 'Services', roles: [
      'the triage helper', 'the blood pressure checker', 'the waiting-room reader',
      'the calm receptionist', 'the appointment reminder', 'the health educator', 'the bandage folder'
    ] },
    { name: 'Coffee shop', category: 'Food and drink', roles: [
      'the latte artist', 'the bean roaster', 'the pastry pairing expert',
      'the regular who knows everyone', 'the mug collector', 'the quiet corner scout', 'the oat milk taster'
    ] },
    { name: 'Community center', category: 'Public places', roles: [
      'the class coordinator', 'the welcome-desk helper', 'the chess coach',
      'the craft-table captain', 'the event calendar keeper', 'the volunteer matcher', 'the lost mitten finder'
    ] },
    { name: 'Concert hall', category: 'Entertainment', roles: [
      'the sound checker', 'the stage manager', 'the aisle usher',
      'the conductor’s page turner', 'the program collector', 'the standing ovation starter', 'the instrument tuner'
    ] },
    { name: 'Diner', category: 'Food and drink', roles: [
      'the pie specialist', 'the booth selector', 'the early-bird regular',
      'the menu memorizer', 'the milkshake mixer', 'the jukebox picker', 'the counter stool saver'
    ] },
    { name: 'Farmers market', category: 'Public places', roles: [
      'the tomato judge', 'the honey taster', 'the basket carrier',
      'the flower bunch maker', 'the local cheese fan', 'the early shopper', 'the recipe swapper'
    ] },
    { name: 'Ferry terminal', category: 'Travel', roles: [
      'the dock guide', 'the deckhand', 'the tide checker',
      'the life-jacket inspector', 'the ticket puncher', 'the gull watcher', 'the crossing announcer'
    ] },
    { name: 'Food court', category: 'Food and drink', roles: [
      'the tray returner', 'the table saver', 'the menu sampler',
      'the napkin collector', 'the lunch planner', 'the smoothie fan', 'the fastest order picker'
    ] },
    { name: 'Food truck', category: 'Food and drink', roles: [
      'the window server', 'the recipe tinkerer', 'the queue host',
      'the sauce expert', 'the menu chalk artist', 'the grill helper', 'the napkin supplier'
    ] },
    { name: 'Hiking trail', category: 'Outdoors', roles: [
      'the trail marker painter', 'the boot lace fixer', 'the bird call mimic',
      'the snack packer', 'the elevation tracker', 'the map reader', 'the summit selfie taker'
    ] },
    { name: 'Ice cream shop', category: 'Food and drink', roles: [
      'the scoop artist', 'the sprinkle expert', 'the flavor inventor',
      'the cone balancer', 'the sundae architect', 'the freezer checker', 'the waffle cone fan'
    ] },
    { name: 'Lakeside dock', category: 'Outdoors', roles: [
      'the canoe renter', 'the knot tyer', 'the dock painter',
      'the paddle collector', 'the fishing coach', 'the loon listener', 'the sunset watcher'
    ] },
    { name: 'Newsroom', category: 'Workplaces', roles: [
      'the headline editor', 'the fact checker', 'the weather reporter',
      'the camera operator', 'the crossword solver', 'the deadline sprinter', 'the interview asker'
    ] },
    { name: 'Office tower', category: 'Workplaces', roles: [
      'the elevator expert', 'the floor directory reader', 'the window cleaner',
      'the meeting scheduler', 'the coffee runner', 'the badge scanner', 'the lunch-break walker'
    ] },
    { name: 'Parade', category: 'Events', roles: [
      'the float decorator', 'the drum major', 'the confetti sweeper',
      'the baton twirler', 'the route marshal', 'the costume mender', 'the wave leader'
    ] },
    { name: 'Picnic', category: 'Events', roles: [
      'the blanket un-folder', 'the sandwich architect', 'the ant lookout',
      'the lemonade mixer', 'the frisbee thrower', 'the fruit cutter', 'the napkin saver'
    ] },
    { name: 'Pizza parlor', category: 'Food and drink', roles: [
      'the dough spinner', 'the topping negotiator', 'the oven watcher',
      'the crust critic', 'the delivery planner', 'the cheese-pull judge', 'the garlic bread fan'
    ] },
    { name: 'Playground', category: 'Outdoors', roles: [
      'the swing-set timer', 'the slide inspector', 'the tag-game champion',
      'the hopscotch artist', 'the sandbox architect', 'the bubble blower', 'the turn-taker coach'
    ] },
    { name: 'Post office', category: 'Services', roles: [
      'the stamp collector', 'the parcel sorter', 'the mail carrier',
      'the address checker', 'the envelope folder', 'the route memorizer', 'the postcard writer'
    ] },
    { name: 'Research lab', category: 'Workplaces', roles: [
      'the sample labeler', 'the microscope expert', 'the lab notebook keeper',
      'the hypothesis tester', 'the safety-glasses stylist', 'the data spotter', 'the careful pipetter'
    ] },
    { name: 'Rescue center', category: 'Services', roles: [
      'the first-aid coach', 'the supply packer', 'the radio listener',
      'the rope coiler', 'the map coordinator', 'the calm voice', 'the training dummy’s friend'
    ] },
    { name: 'School concert', category: 'Events', roles: [
      'the music teacher', 'the stage parent', 'the sheet-music passer',
      'the solo singer', 'the instrument tuner', 'the applause starter', 'the bow coach'
    ] },
    { name: 'Science fair', category: 'Events', roles: [
      'the volcano builder', 'the poster designer', 'the experiment explainer',
      'the model tester', 'the ribbon judge', 'the safety-goggles fan', 'the question asker'
    ] },
    { name: 'Street fair', category: 'Events', roles: [
      'the craft booth maker', 'the sidewalk chalk artist', 'the ring toss expert',
      'the lemonade stand boss', 'the local band fan', 'the prize-ticket saver', 'the face-paint artist'
    ] },
    { name: 'Tea house', category: 'Food and drink', roles: [
      'the steep-time expert', 'the teapot collector', 'the tiny-cup server',
      'the herbal blend mixer', 'the quiet conversation host', 'the biscuit dipper', 'the kettle watcher'
    ] },
    { name: 'Town hall', category: 'Services', roles: [
      'the meeting chair', 'the microphone tester', 'the agenda keeper',
      'the question card reader', 'the sign-up sheet host', 'the bell ringer', 'the minutes taker'
    ] },
    { name: 'Town square', category: 'Public places', roles: [
      'the fountain watcher', 'the chess-table regular', 'the plaza guide',
      'the pigeon’s friend', 'the public speaker', 'the bench storyteller', 'the clock keeper'
    ] },
    { name: 'Treehouse', category: 'Outdoors', roles: [
      'the rope ladder expert', 'the lookout', 'the secret notebook keeper',
      'the branch checker', 'the birdhouse builder', 'the leaf collector', 'the fort architect'
    ] },
    { name: 'Waterfall', category: 'Outdoors', roles: [
      'the mist watcher', 'the rock-step guide', 'the spray photographer',
      'the river sound listener', 'the poncho lender', 'the safe-distance coach', 'the rainbow spotter'
    ] },
    { name: 'Workshop', category: 'Workplaces', roles: [
      'the tool organizer', 'the sawdust sweeper', 'the repair coach',
      'the tape-measure expert', 'the scrap-wood saver', 'the goggles reminder', 'the prototype painter'
    ] }
  ];

  LOCATION_DECK.forEach(function (location) {
    Object.freeze(location.roles);
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
