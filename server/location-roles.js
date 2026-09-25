'use strict';

const LOCATION_ROLE_CATALOG = Object.freeze({
  "Airport": Object.freeze([
    "the gate agent", "the baggage handler",
    "the flight attendant", "the runway marshal",
    "the one who missed their flight", "the pilot with two maps",
    "the passenger with three bags"
  ]),
  "Bank": Object.freeze([
    "the teller", "the vault keeper",
    "the loan officer", "the coin counter",
    "the saver with a sock stash", "the one who lost a debit card",
    "the clerk with a jar of coins"
  ]),
  "Beach": Object.freeze([
    "the lifeguard", "the surf instructor",
    "the shell collector", "the kite flyer",
    "the swimmer who forgot a towel", "the one with a sandy sandwich",
    "the castle builder with a moat"
  ]),
  "Casino": Object.freeze([
    "the card dealer", "the roulette croupier",
    "the dice roller", "the chip counter",
    "the dealer with lucky socks", "the one who bet on a snack",
    "the guest who dropped a chip"
  ]),
  "Circus": Object.freeze([
    "the ringmaster", "the trapeze artist",
    "the juggling coach", "the costume tailor",
    "the clown who brought two hats", "the acrobat with a squeaky shoe",
    "the one who juggled the tickets"
  ]),
  "Construction site": Object.freeze([
    "the safety inspector", "the crane operator",
    "the bricklayer", "the blueprint reader",
    "the builder with a wonky helmet", "the one who dropped a lunchbox",
    "the worker who mixed up plans"
  ]),
  "Cruise ship": Object.freeze([
    "the deck officer", "the cabin steward",
    "the ship cook", "the lifeboat checker",
    "the sailor who packed a snorkel", "the guest who lost a sock",
    "the captain with a paper map"
  ]),
  "Embassy": Object.freeze([
    "the translator", "the protocol officer",
    "the cultural attaché", "the passport clerk",
    "the envoy who mixed up flags", "the guest with two dictionaries",
    "the one who forgot the speech"
  ]),
  "Fire station": Object.freeze([
    "the fire captain", "the dispatcher",
    "the engine mechanic", "the hose handler",
    "the firefighter in squeaky boots", "the rookie who lost a helmet",
    "the one who packed extra snacks"
  ]),
  "Hospital": Object.freeze([
    "the night nurse", "the x-ray tech",
    "the care coordinator", "the bandage artist",
    "the nurse with star stickers", "the doctor who tells dad jokes",
    "the visitor with a huge bouquet"
  ]),
  "Hotel": Object.freeze([
    "the concierge", "the front desk clerk",
    "the bellhop", "the housekeeper",
    "the guest who packed six pillows", "the porter with a squeaky cart",
    "the one who booked two rooms"
  ]),
  "Library": Object.freeze([
    "the librarian", "the book restorer",
    "the reading tutor", "the checkout clerk",
    "the reader with seven bookmarks", "the reader who lost a card",
    "the one who whispered too loudly"
  ]),
  "Movie theater": Object.freeze([
    "the projectionist", "the usher",
    "the ticket seller", "the popcorn cook",
    "the viewer who brought a blanket", "the one who quoted every preview",
    "the guest with popcorn peaks"
  ]),
  "Museum": Object.freeze([
    "the curator", "the gallery guide",
    "the conservator", "the art historian",
    "the visitor who wore a crown", "the kid with a sketchbook",
    "the guard with a tiny notebook"
  ]),
  "Night market": Object.freeze([
    "the stall owner", "the spice vendor",
    "the dumpling cook", "the lantern maker",
    "the shopper who sampled it all", "the vendor with a lucky apron",
    "the one who haggled for mangoes"
  ]),
  "Police station": Object.freeze([
    "the detective", "the radio dispatcher",
    "the evidence clerk", "the traffic officer",
    "the detective with odd socks", "the rookie who misplaced a pen",
    "the neighbor with a lost parrot"
  ]),
  "Restaurant": Object.freeze([
    "the head waiter", "the chef’s helper",
    "the host", "the pastry chef",
    "the diner ordered dessert first", "the server with a wobbly tray",
    "the cook who sang to soup"
  ]),
  "School": Object.freeze([
    "the substitute teacher", "the hall monitor",
    "the science teacher", "the art teacher",
    "the teacher with a squeaky pen", "the kid who packed three lunches",
    "the one who forgot homework"
  ]),
  "Space station": Object.freeze([
    "the mission pilot", "the robotics tech",
    "the star mapper", "the oxygen engineer",
    "the astronaut who packed a plant", "the one who floated a sandwich",
    "the rookie who lost a pencil"
  ]),
  "Stadium": Object.freeze([
    "the referee", "the score announcer",
    "the team mascot", "the field groundskeeper",
    "the fan with a lucky scarf", "the one who learned every chant",
    "the player with two left cleats"
  ]),
  "Subway station": Object.freeze([
    "the subway driver", "the platform announcer",
    "the transit guide", "the lost-property clerk",
    "the commuter who missed a stop", "the poet who rhymed with trains",
    "the one with a huge umbrella"
  ]),
  "Supermarket": Object.freeze([
    "the produce clerk", "the checkout cashier",
    "the cart collector", "the sample cook",
    "the shopper with a wonky cart", "the one who forgot a bag",
    "the baker who bought sprinkles"
  ]),
  "Train station": Object.freeze([
    "the rail conductor", "the timetable clerk",
    "the porter", "the sleeper-car host",
    "the traveler with four hats", "the one who waved at wrong train",
    "the engineer with lucky whistle"
  ]),
  "Wedding": Object.freeze([
    "the florist", "the toast writer",
    "the ring bearer", "the dance instructor",
    "the groom’s ex, dance captain", "the aunt who caught the bouquet",
    "the guest who wore two bow ties"
  ]),
  "Amusement park": Object.freeze([
    "the ride operator", "the ride announcer",
    "the costume mascot", "the prize booth attendant",
    "the rider who brought a raincoat", "the one who waved at every duck",
    "the parent with many tickets"
  ]),
  "Animal shelter": Object.freeze([
    "the adoption counselor", "the dog walker",
    "the kitten foster", "the vet tech",
    "the helper who knows each name", "the foster with extra treats",
    "the walker with two leashes"
  ]),
  "Arcade": Object.freeze([
    "the game technician", "the pinball champion",
    "the token clerk", "the dance-game coach",
    "the player with a lucky joystick", "the kid who saved every ticket",
    "the one who beat the machine"
  ]),
  "Aquarium": Object.freeze([
    "the marine biologist", "the penguin keeper",
    "the diver", "the ocean guide",
    "the keeper who named each fish", "the visitor with a shark hat",
    "the diver who waved at a crab"
  ]),
  "Art opening": Object.freeze([
    "the gallery greeter", "the sculptor",
    "the sketch artist", "the art curator",
    "the artist with paint on shoes", "the guest with a tiny frame",
    "the one who applauded a lamp"
  ]),
  "Birthday party": Object.freeze([
    "the party host", "the cake baker",
    "the balloon artist", "the game leader",
    "the kid who wore a party crown", "the guest with too many candles",
    "the parent who forgot balloons"
  ]),
  "Botanical garden": Object.freeze([
    "the botanist", "the gardener",
    "the greenhouse guide", "the seed librarian",
    "the gardener who named a fern", "the visitor in muddy sneakers",
    "the one who waved at a bee"
  ]),
  "Bowling alley": Object.freeze([
    "the bowling coach", "the lane mechanic",
    "the pinsetter", "the scorekeeper",
    "the bowler with lucky shoes", "the one who rolled a slow ball",
    "the player cheering for spares"
  ]),
  "Bus terminal": Object.freeze([
    "the bus driver", "the ticket clerk",
    "the baggage porter", "the route dispatcher",
    "the traveler with two lunchboxes", "the one on the wrong bus",
    "the driver who sings the stops"
  ]),
  "Campground": Object.freeze([
    "the park ranger", "the trail guide",
    "the camp cook", "the tent expert",
    "the camper who forgot tent poles", "the camper with extra s’mores",
    "the guide who lost a flashlight"
  ]),
  "City park": Object.freeze([
    "the groundskeeper", "the kite instructor",
    "the birdwatcher", "the lawn caretaker",
    "the jogger with odd socks", "the kid who fed a squirrel",
    "the one with a tiny picnic"
  ]),
  "Clinic": Object.freeze([
    "the receptionist", "the nurse practitioner",
    "the scheduler", "the health educator",
    "the patient with a joke book", "the one who brought a lucky hat",
    "the nurse with shiny stickers"
  ]),
  "Coffee shop": Object.freeze([
    "the barista", "the coffee roaster",
    "the baker", "the cashier",
    "the regular who knows every name", "the artist who drew a cat latte",
    "the one who ordered two muffins"
  ]),
  "Community center": Object.freeze([
    "the class coordinator", "the chess coach",
    "the craft instructor", "the volunteer organizer",
    "the helper who found a mitten", "the neighbor with spare yarn",
    "the one who signed up for all"
  ]),
  "Concert hall": Object.freeze([
    "the stage manager", "the orchestra conductor",
    "the sound engineer", "the orchestra usher",
    "the musician who tuned by ear", "the fan with a folded program",
    "the one who clapped too early"
  ]),
  "Diner": Object.freeze([
    "the short-order cook", "the counter server",
    "the pie baker", "the breakfast host",
    "the regular who runs the jukebox", "the guest who ordered two stacks",
    "the cook with a lucky spatula"
  ]),
  "Farmers market": Object.freeze([
    "the grower", "the honey seller",
    "the flower arranger", "the cheese maker",
    "the shopper with a wicker hat", "the farmer with purple carrots",
    "the shopper who swapped jam"
  ]),
  "Ferry terminal": Object.freeze([
    "the deckhand", "the ticket agent",
    "the dockmaster", "the safety checker",
    "the sailor with a gull hat", "the one who waved at a boat",
    "the traveler with a seashell map"
  ]),
  "Food court": Object.freeze([
    "the tray collector", "the food vendor",
    "the seating host", "the smoothie maker",
    "the guest with four napkins", "the one who sampled every sauce",
    "the friend saving six seats"
  ]),
  "Food truck": Object.freeze([
    "the grill cook", "the window server",
    "the recipe developer", "the queue host",
    "the cook who made pickle fries", "the customer who brought a fork",
    "the owner with a rolling menu"
  ]),
  "Hiking trail": Object.freeze([
    "the hiking guide", "the park naturalist",
    "the boot fitter", "the wildlife tracker",
    "the hiker who packed two maps", "the one who whistled at a jay",
    "the climber with a snack stash"
  ]),
  "Ice cream shop": Object.freeze([
    "the scoop artist", "the flavor maker",
    "the frozen-treat server", "the freezer technician",
    "the kid who asked for a cloud", "the guest with six scoops",
    "the one who invented maple mint"
  ]),
  "Lakeside dock": Object.freeze([
    "the canoe instructor", "the dockhand",
    "the fishing guide", "the boat renter",
    "the fisher who forgot the bait", "the one who dropped a paddle",
    "the visitor with a paper boat"
  ]),
  "Newsroom": Object.freeze([
    "the editor", "the reporter",
    "the fact checker", "the camera operator",
    "the reporter who chased a hat", "the editor with a red pencil",
    "the one who filed upside down"
  ]),
  "Office tower": Object.freeze([
    "the elevator technician", "the lobby receptionist",
    "the courier", "the office manager",
    "the worker who lost a badge", "the one who booked two meetings",
    "the courier with a squeaky bag"
  ]),
  "Parade": Object.freeze([
    "the drum major", "the float builder",
    "the route marshal", "the uniform stitcher",
    "the marcher with mixed-up socks", "the one who waved at a dog",
    "the drummer who lost one stick"
  ]),
  "Picnic": Object.freeze([
    "the blanket coordinator", "the blanket caterer",
    "the lemonade seller", "the park helper",
    "the guest with a spare blanket", "the one who packed no forks",
    "the walker with a sandwich"
  ]),
  "Pizza parlor": Object.freeze([
    "the dough maker", "the oven chef",
    "the server", "the topping planner",
    "the cook who tossed dough high", "the guest who chose ten toppings",
    "the one who made a cheese rope"
  ]),
  "Playground": Object.freeze([
    "the play-area supervisor", "the swing attendant",
    "the bubble artist", "the tag referee",
    "the kid who queued for the slide", "the parent with an extra rope",
    "the one who counted every swing"
  ]),
  "Post office": Object.freeze([
    "the mail carrier", "the parcel sorter",
    "the stamp clerk", "the route planner",
    "the sender with a tiny box", "the one who mailed a card twice",
    "the carrier with postcards"
  ]),
  "Research lab": Object.freeze([
    "the lab technician", "the sample analyst",
    "the microscope specialist", "the safety officer",
    "the scientist with odd goggles", "the one who labeled a banana",
    "the researcher with a fern"
  ]),
  "Rescue center": Object.freeze([
    "the rescue coordinator", "the first-aid trainer",
    "the radio operator", "the supply captain",
    "the helper with extra socks", "the one who untangled every rope",
    "the rookie with a loud whistle"
  ]),
  "School concert": Object.freeze([
    "the choir director", "the backstage parent",
    "the sheet-music helper", "the solo singer",
    "the parent who brought earplugs", "the singer who lost a shoe",
    "the one who hummed wrong notes"
  ]),
  "Science fair": Object.freeze([
    "the experiment coach", "the poster artist",
    "the ribbon judge", "the demo host",
    "the kid who built a volcano", "the one whose robot smiled",
    "the judge with a big clipboard"
  ]),
  "Street fair": Object.freeze([
    "the craft seller", "the chalk artist",
    "the ring-toss host", "the lemonade vendor",
    "the artist with a painted nose", "the one who won a rubber duck",
    "the shopper with glitter shoes"
  ]),
  "Tea house": Object.freeze([
    "the tea blender", "the teapot collector",
    "the tea server", "the kettle keeper",
    "the host who steeped it too long", "the guest with a tiny spoon",
    "the one who named each teapot"
  ]),
  "Town hall": Object.freeze([
    "the meeting chair", "the clerk",
    "the microphone technician", "the agenda coordinator",
    "the neighbor with a question", "the one who rang early",
    "the speaker with a wobbly podium"
  ]),
  "Town square": Object.freeze([
    "the fountain attendant", "the chess-table coach",
    "the plaza guide", "the clockkeeper",
    "the regular who fed a pigeon", "the one who started a singalong",
    "the visitor with a huge umbrella"
  ]),
  "Treehouse": Object.freeze([
    "the carpenter", "the lookout",
    "the birdhouse builder", "the fort architect",
    "the kid who named every branch", "the one who forgot the ladder",
    "the builder with a compass"
  ]),
  "Waterfall": Object.freeze([
    "the park guide", "the trail steward",
    "the photographer", "the nature educator",
    "the visitor with rainbow notes", "the one who wore two ponchos",
    "the guide who saw a small frog"
  ]),
  "Workshop": Object.freeze([
    "the woodworker", "the repair technician",
    "the tool maker", "the safety mentor",
    "the maker who glued a hat", "the one who measured twice",
    "the tinkerer with a wonky wheel"
  ])
});

function rolesForLocation(locationName) {
  return LOCATION_ROLE_CATALOG[locationName] || [];
}

module.exports = {
  LOCATION_ROLE_CATALOG,
  rolesForLocation
};