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
      'the gate agent', 'the baggage handler', 'the flight attendant',
      'the runway marshal', 'the one who missed their flight', 'the pilot with two maps', 'the passenger with three bags'
    ] },
    { name: 'Bank', category: 'Workplaces', roles: [
      'the teller', 'the vault keeper', 'the loan officer',
      'the coin counter', 'the saver with a sock stash', 'the one who lost a debit card', 'the clerk with a jar of coins'
    ] },
    { name: 'Beach', category: 'Outdoors', roles: [
      'the lifeguard', 'the surf instructor', 'the shell collector',
      'the kite flyer', 'the swimmer who forgot a towel', 'the one with a sandy sandwich', 'the castle builder with a moat'
    ] },
    { name: 'Casino', category: 'Entertainment', roles: [
      'the card dealer', 'the roulette croupier', 'the dice roller',
      'the chip counter', 'the dealer with lucky socks', 'the one who bet on a snack', 'the guest who dropped a chip'
    ] },
    { name: 'Circus', category: 'Entertainment', roles: [
      'the ringmaster', 'the trapeze artist', 'the juggling coach',
      'the costume tailor', 'the clown who brought two hats', 'the acrobat with a squeaky shoe', 'the one who juggled the tickets'
    ] },
    { name: 'Construction site', category: 'Workplaces', roles: [
      'the safety inspector', 'the crane operator', 'the bricklayer',
      'the blueprint reader', 'the builder with a wonky helmet', 'the one who dropped a lunchbox', 'the worker who mixed up plans'
    ] },
    { name: 'Cruise ship', category: 'Travel', roles: [
      'the deck officer', 'the cabin steward', 'the ship cook',
      'the lifeboat checker', 'the sailor who packed a snorkel', 'the guest who lost a sock', 'the captain with a paper map'
    ] },
    { name: 'Embassy', category: 'Workplaces', roles: [
      'the translator', 'the protocol officer', 'the cultural attaché',
      'the passport clerk', 'the envoy who mixed up flags', 'the guest with two dictionaries', 'the one who forgot the speech'
    ] },
    { name: 'Fire station', category: 'Services', roles: [
      'the fire captain', 'the dispatcher', 'the engine mechanic',
      'the hose handler', 'the firefighter in squeaky boots', 'the rookie who lost a helmet', 'the one who packed extra snacks'
    ] },
    { name: 'Hospital', category: 'Services', roles: [
      'the night nurse', 'the x-ray tech', 'the care coordinator',
      'the bandage artist', 'the nurse with star stickers', 'the doctor who tells dad jokes', 'the visitor with a huge bouquet'
    ] },
    { name: 'Hotel', category: 'Travel', roles: [
      'the concierge', 'the front desk clerk', 'the bellhop',
      'the housekeeper', 'the guest who packed six pillows', 'the porter with a squeaky cart', 'the one who booked two rooms'
    ] },
    { name: 'Library', category: 'Public places', roles: [
      'the librarian', 'the book restorer', 'the reading tutor',
      'the checkout clerk', 'the reader with seven bookmarks', 'the reader who lost a card', 'the one who whispered too loudly'
    ] },
    { name: 'Movie theater', category: 'Entertainment', roles: [
      'the projectionist', 'the usher', 'the ticket seller',
      'the popcorn cook', 'the viewer who brought a blanket', 'the one who quoted every preview', 'the guest with popcorn peaks'
    ] },
    { name: 'Museum', category: 'Public places', roles: [
      'the curator', 'the gallery guide', 'the conservator',
      'the art historian', 'the visitor who wore a crown', 'the kid with a sketchbook', 'the guard with a tiny notebook'
    ] },
    { name: 'Night market', category: 'Public places', roles: [
      'the stall owner', 'the spice vendor', 'the dumpling cook',
      'the lantern maker', 'the shopper who sampled it all', 'the vendor with a lucky apron', 'the one who haggled for mangoes'
    ] },
    { name: 'Police station', category: 'Services', roles: [
      'the detective', 'the radio dispatcher', 'the evidence clerk',
      'the traffic officer', 'the detective with odd socks', 'the rookie who misplaced a pen', 'the neighbor with a lost parrot'
    ] },
    { name: 'Restaurant', category: 'Food and drink', roles: [
      'the head waiter', 'the chef’s helper', 'the host',
      'the pastry chef', 'the diner ordered dessert first', 'the server with a wobbly tray', 'the cook who sang to soup'
    ] },
    { name: 'School', category: 'Workplaces', roles: [
      'the substitute teacher', 'the hall monitor', 'the science teacher',
      'the art teacher', 'the teacher with a squeaky pen', 'the kid who packed three lunches', 'the one who forgot homework'
    ] },
    { name: 'Space station', category: 'Travel', roles: [
      'the mission pilot', 'the robotics tech', 'the star mapper',
      'the oxygen engineer', 'the astronaut who packed a plant', 'the one who floated a sandwich', 'the rookie who lost a pencil'
    ] },
    { name: 'Stadium', category: 'Entertainment', roles: [
      'the referee', 'the score announcer', 'the team mascot',
      'the field groundskeeper', 'the fan with a lucky scarf', 'the one who learned every chant', 'the player with two left cleats'
    ] },
    { name: 'Subway station', category: 'Travel', roles: [
      'the subway driver', 'the platform announcer', 'the transit guide',
      'the lost-property clerk', 'the commuter who missed a stop', 'the poet who rhymed with trains', 'the one with a huge umbrella'
    ] },
    { name: 'Supermarket', category: 'Public places', roles: [
      'the produce clerk', 'the checkout cashier', 'the cart collector',
      'the sample cook', 'the shopper with a wonky cart', 'the one who forgot a bag', 'the baker who bought sprinkles'
    ] },
    { name: 'Train station', category: 'Travel', roles: [
      'the rail conductor', 'the timetable clerk', 'the porter',
      'the sleeper-car host', 'the traveler with four hats', 'the one who waved at wrong train', 'the engineer with lucky whistle'
    ] },
    { name: 'Wedding', category: 'Events', roles: [
      'the florist', 'the toast writer', 'the ring bearer',
      'the dance instructor', 'the groom’s ex, dance captain', 'the aunt who caught the bouquet', 'the guest who wore two bow ties'
    ] },
    { name: 'Amusement park', category: 'Entertainment', roles: [
      'the ride operator', 'the ride announcer', 'the costume mascot',
      'the prize booth attendant', 'the rider who brought a raincoat', 'the one who waved at every duck', 'the parent with many tickets'
    ] },
    { name: 'Animal shelter', category: 'Services', roles: [
      'the adoption counselor', 'the dog walker', 'the kitten foster',
      'the vet tech', 'the helper who knows each name', 'the foster with extra treats', 'the walker with two leashes'
    ] },
    { name: 'Arcade', category: 'Entertainment', roles: [
      'the game technician', 'the pinball champion', 'the token clerk',
      'the dance-game coach', 'the player with a lucky joystick', 'the kid who saved every ticket', 'the one who beat the machine'
    ] },
    { name: 'Aquarium', category: 'Public places', roles: [
      'the marine biologist', 'the penguin keeper', 'the diver',
      'the ocean guide', 'the keeper who named each fish', 'the visitor with a shark hat', 'the diver who waved at a crab'
    ] },
    { name: 'Art opening', category: 'Events', roles: [
      'the gallery greeter', 'the sculptor', 'the sketch artist',
      'the art curator', 'the artist with paint on shoes', 'the guest with a tiny frame', 'the one who applauded a lamp'
    ] },
    { name: 'Birthday party', category: 'Events', roles: [
      'the party host', 'the cake baker', 'the balloon artist',
      'the game leader', 'the kid who wore a party crown', 'the guest with too many candles', 'the parent who forgot balloons'
    ] },
    { name: 'Botanical garden', category: 'Outdoors', roles: [
      'the botanist', 'the gardener', 'the greenhouse guide',
      'the seed librarian', 'the gardener who named a fern', 'the visitor in muddy sneakers', 'the one who waved at a bee'
    ] },
    { name: 'Bowling alley', category: 'Entertainment', roles: [
      'the bowling coach', 'the lane mechanic', 'the pinsetter',
      'the scorekeeper', 'the bowler with lucky shoes', 'the one who rolled a slow ball', 'the player cheering for spares'
    ] },
    { name: 'Bus terminal', category: 'Travel', roles: [
      'the bus driver', 'the ticket clerk', 'the baggage porter',
      'the route dispatcher', 'the traveler with two lunchboxes', 'the one on the wrong bus', 'the driver who sings the stops'
    ] },
    { name: 'Campground', category: 'Outdoors', roles: [
      'the park ranger', 'the trail guide', 'the camp cook',
      'the tent expert', 'the camper who forgot tent poles', 'the camper with extra s’mores', 'the guide who lost a flashlight'
    ] },
    { name: 'City park', category: 'Outdoors', roles: [
      'the groundskeeper', 'the kite instructor', 'the birdwatcher',
      'the lawn caretaker', 'the jogger with odd socks', 'the kid who fed a squirrel', 'the one with a tiny picnic'
    ] },
    { name: 'Clinic', category: 'Services', roles: [
      'the receptionist', 'the nurse practitioner', 'the scheduler',
      'the health educator', 'the patient with a joke book', 'the one who brought a lucky hat', 'the nurse with shiny stickers'
    ] },
    { name: 'Coffee shop', category: 'Food and drink', roles: [
      'the barista', 'the coffee roaster', 'the baker',
      'the cashier', 'the regular who knows every name', 'the artist who drew a cat latte', 'the one who ordered two muffins'
    ] },
    { name: 'Community center', category: 'Public places', roles: [
      'the class coordinator', 'the chess coach', 'the craft instructor',
      'the volunteer organizer', 'the helper who found a mitten', 'the neighbor with spare yarn', 'the one who signed up for all'
    ] },
    { name: 'Concert hall', category: 'Entertainment', roles: [
      'the stage manager', 'the orchestra conductor', 'the sound engineer',
      'the orchestra usher', 'the musician who tuned by ear', 'the fan with a folded program', 'the one who clapped too early'
    ] },
    { name: 'Diner', category: 'Food and drink', roles: [
      'the short-order cook', 'the counter server', 'the pie baker',
      'the breakfast host', 'the regular who runs the jukebox', 'the guest who ordered two stacks', 'the cook with a lucky spatula'
    ] },
    { name: 'Farmers market', category: 'Public places', roles: [
      'the grower', 'the honey seller', 'the flower arranger',
      'the cheese maker', 'the shopper with a wicker hat', 'the farmer with purple carrots', 'the shopper who swapped jam'
    ] },
    { name: 'Ferry terminal', category: 'Travel', roles: [
      'the deckhand', 'the ticket agent', 'the dockmaster',
      'the safety checker', 'the sailor with a gull hat', 'the one who waved at a boat', 'the traveler with a seashell map'
    ] },
    { name: 'Food court', category: 'Food and drink', roles: [
      'the tray collector', 'the food vendor', 'the seating host',
      'the smoothie maker', 'the guest with four napkins', 'the one who sampled every sauce', 'the friend saving six seats'
    ] },
    { name: 'Food truck', category: 'Food and drink', roles: [
      'the grill cook', 'the window server', 'the recipe developer',
      'the queue host', 'the cook who made pickle fries', 'the customer who brought a fork', 'the owner with a rolling menu'
    ] },
    { name: 'Hiking trail', category: 'Outdoors', roles: [
      'the hiking guide', 'the park naturalist', 'the boot fitter',
      'the wildlife tracker', 'the hiker who packed two maps', 'the one who whistled at a jay', 'the climber with a snack stash'
    ] },
    { name: 'Ice cream shop', category: 'Food and drink', roles: [
      'the scoop artist', 'the flavor maker', 'the frozen-treat server',
      'the freezer technician', 'the kid who asked for a cloud', 'the guest with six scoops', 'the one who invented maple mint'
    ] },
    { name: 'Lakeside dock', category: 'Outdoors', roles: [
      'the canoe instructor', 'the dockhand', 'the fishing guide',
      'the boat renter', 'the fisher who forgot the bait', 'the one who dropped a paddle', 'the visitor with a paper boat'
    ] },
    { name: 'Newsroom', category: 'Workplaces', roles: [
      'the editor', 'the reporter', 'the fact checker',
      'the camera operator', 'the reporter who chased a hat', 'the editor with a red pencil', 'the one who filed upside down'
    ] },
    { name: 'Office tower', category: 'Workplaces', roles: [
      'the elevator technician', 'the lobby receptionist', 'the courier',
      'the office manager', 'the worker who lost a badge', 'the one who booked two meetings', 'the courier with a squeaky bag'
    ] },
    { name: 'Parade', category: 'Events', roles: [
      'the drum major', 'the float builder', 'the route marshal',
      'the uniform stitcher', 'the marcher with mixed-up socks', 'the one who waved at a dog', 'the drummer who lost one stick'
    ] },
    { name: 'Picnic', category: 'Events', roles: [
      'the blanket coordinator', 'the blanket caterer', 'the lemonade seller',
      'the park helper', 'the guest with a spare blanket', 'the one who packed no forks', 'the walker with a sandwich'
    ] },
    { name: 'Pizza parlor', category: 'Food and drink', roles: [
      'the dough maker', 'the oven chef', 'the server',
      'the topping planner', 'the cook who tossed dough high', 'the guest who chose ten toppings', 'the one who made a cheese rope'
    ] },
    { name: 'Playground', category: 'Outdoors', roles: [
      'the play-area supervisor', 'the swing attendant', 'the bubble artist',
      'the tag referee', 'the kid who queued for the slide', 'the parent with an extra rope', 'the one who counted every swing'
    ] },
    { name: 'Post office', category: 'Services', roles: [
      'the mail carrier', 'the parcel sorter', 'the stamp clerk',
      'the route planner', 'the sender with a tiny box', 'the one who mailed a card twice', 'the carrier with postcards'
    ] },
    { name: 'Research lab', category: 'Workplaces', roles: [
      'the lab technician', 'the sample analyst', 'the microscope specialist',
      'the safety officer', 'the scientist with odd goggles', 'the one who labeled a banana', 'the researcher with a fern'
    ] },
    { name: 'Rescue center', category: 'Services', roles: [
      'the rescue coordinator', 'the first-aid trainer', 'the radio operator',
      'the supply captain', 'the helper with extra socks', 'the one who untangled every rope', 'the rookie with a loud whistle'
    ] },
    { name: 'School concert', category: 'Events', roles: [
      'the choir director', 'the backstage parent', 'the sheet-music helper',
      'the solo singer', 'the parent who brought earplugs', 'the singer who lost a shoe', 'the one who hummed wrong notes'
    ] },
    { name: 'Science fair', category: 'Events', roles: [
      'the experiment coach', 'the poster artist', 'the ribbon judge',
      'the demo host', 'the kid who built a volcano', 'the one whose robot smiled', 'the judge with a big clipboard'
    ] },
    { name: 'Street fair', category: 'Events', roles: [
      'the craft seller', 'the chalk artist', 'the ring-toss host',
      'the lemonade vendor', 'the artist with a painted nose', 'the one who won a rubber duck', 'the shopper with glitter shoes'
    ] },
    { name: 'Tea house', category: 'Food and drink', roles: [
      'the tea blender', 'the teapot collector', 'the tea server',
      'the kettle keeper', 'the host who steeped it too long', 'the guest with a tiny spoon', 'the one who named each teapot'
    ] },
    { name: 'Town hall', category: 'Services', roles: [
      'the meeting chair', 'the clerk', 'the microphone technician',
      'the agenda coordinator', 'the neighbor with a question', 'the one who rang early', 'the speaker with a wobbly podium'
    ] },
    { name: 'Town square', category: 'Public places', roles: [
      'the fountain attendant', 'the chess-table coach', 'the plaza guide',
      'the clockkeeper', 'the regular who fed a pigeon', 'the one who started a singalong', 'the visitor with a huge umbrella'
    ] },
    { name: 'Treehouse', category: 'Outdoors', roles: [
      'the carpenter', 'the lookout', 'the birdhouse builder',
      'the fort architect', 'the kid who named every branch', 'the one who forgot the ladder', 'the builder with a compass'
    ] },
    { name: 'Waterfall', category: 'Outdoors', roles: [
      'the park guide', 'the trail steward', 'the photographer',
      'the nature educator', 'the visitor with rainbow notes', 'the one who wore two ponchos', 'the guide who saw a small frog'
    ] },
    { name: 'Workshop', category: 'Workplaces', roles: [
      'the woodworker', 'the repair technician', 'the tool maker',
      'the safety mentor', 'the maker who glued a hat', 'the one who measured twice', 'the tinkerer with a wonky wheel'
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
    var roleDeck = Array.isArray(location.roles) ? shuffle(location.roles, random) : [];
    var roleIndex = 0;
    var cards = names.map(function (player) {
      var isSpy = spies.indexOf(player) !== -1;
      var card = {
        player: player,
        isSpy: isSpy,
        location: isSpy ? null : location.name,
        category: isSpy ? null : location.category
      };

      if (!isSpy && roleDeck.length > 0) {
        card.role = roleDeck[roleIndex % roleDeck.length];
        roleIndex += 1;
      }

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
