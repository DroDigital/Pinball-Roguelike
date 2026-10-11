/**
 * The neighbor: knocking through the wall between rounds. They ask for something and offer
 * something back. Lines are dealt by presentation; the rules only pick the request and offer.
 * The voice should feel a little too familiar (see the Cellmate ending).
 */
export type NeighborAsk = 'coins' | 'tickets' | 'charm';
export type NeighborOffer = 'key' | 'contraband' | 'tip' | 'tickets';

export const NEIGHBOR_LINES = {
  knock: [
    'Three knocks. A pause. Two more.',
    'Knocking, low on the wall, where a hand would rest if you sat on the floor.',
    'Someone taps the bricks in the rhythm of a ball rolling down a lane.',
    'Knock. Knock. Then a scrape, like a chain being pulled tight.',
    'The wall knocks back before you touch it.',
  ],
  ask: {
    coins: [
      'Slide {amount} coins under. I know you have them. I can hear them in the tray.',
      '{amount} coins. Just {amount}. I am so close.',
      'We both owe the Warden. Give me {amount} and only one of us does.',
      'Coins. {amount}. The ATM in here eats them faster than yours does.',
      '{amount} coins and I stop knocking. For tonight.',
    ],
    tickets: [
      'A ticket. {amount} of them. The machine in here only takes tickets now.',
      'Push {amount} tickets through the crack. You will not miss them. You never do.',
      '{amount} tickets. I will tell you what they are for when you are older.',
      'I need {amount} tickets. Do not ask what for. You already know.',
      'Tickets. {amount}. The Warden counts them, but not well.',
    ],
    charm: [
      'Give me your {charm}. I had one just like it, once.',
      'The {charm}. I can feel it through the wall. Let me hold it.',
      'Your {charm}. You will get another. I never did.',
      'Slide the {charm} under. I know exactly how it hums.',
      'I need the {charm}. Trust me. You always trust me, eventually.',
    ],
  },
  offer: {
    key: 'In return: a Key. I do not need it any more.',
    contraband: 'In return: some {item}, fresh off the cart.',
    tip: 'In return: something about the machine that nobody told me.',
    tickets: 'In return: {amount} tickets. Clean ones.',
  },
  thanks: [
    'Thank you. You were always kind. It never helped.',
    'Got it. I will remember this. I already do.',
    'Good. That is what I would have done.',
    'Thank you. Do not tell the Warden.',
    'There. Now we are even. We were always even.',
  ],
  refused: [
    'Fine. I understand. I would have said no too.',
    'Silence. Then, very quietly, a laugh you almost recognise.',
    'Okay. Okay. I will ask again. I always do.',
    'The knocking stops. The chain on the other side goes slack.',
    'You will regret that. I know I did.',
  ],
  tip: 'The Cell Block. Knock it down from the top: the high target first, then the middle, then the low one. A brick behind it comes loose. They call it the Tunnel.',
};
