/**
 * The Warden: never seen, terse, darkly funny. Lines are grouped by trigger; presentation
 * deals them from a shuffled deck per trigger so they rarely repeat.
 */
export type WardenTrigger =
  | 'intro'
  | 'deadlinePaid'
  | 'redCall'
  | 'sentence'
  | 'sentenceSurvived'
  | 'loan'
  | 'payEarly'
  | 'fall'
  | 'centerDrain'
  | 'bigPayday'
  | 'riot'
  | 'tilt'
  | 'jobDone'
  | 'lastCall'
  | 'hangUp';

export const WARDEN: Record<WardenTrigger, string[]> = {
  intro: [
    'You owe me. The machine is how you pay. The trapdoor is how you do not.',
    'Good morning. Your debt woke up before you did.',
    'The ATM shows what you owe. The machine shows how you will pay it. I show nothing.',
    'Flip, plunge, deposit. Miss the deadline and the floor remembers you.',
    'Everyone in this block owes me. Most of them are under it.',
  ],
  deadlinePaid: [
    'Paid. For now.',
    'The floor holds. Do not get comfortable on it.',
    'Exact change would have been impressive. This will do.',
    'You bought yourself another week of the same room.',
    'Good. The interest was getting lonely.',
    'I almost had the trapdoor oiled. Next time.',
  ],
  redCall: [
    'Different line this time. I have an offer. It has teeth.',
    'Listen carefully. I only make this offer to people I like. I like no one.',
    'Something for something. You will feel the something later.',
    'The red phone only rings for the desperate. Hello.',
    'I can make the machine kinder. I cannot make it free.',
  ],
  sentence: [
    'A small adjustment for your last round. Character building.',
    'I have changed the rules. You may thank me in coins.',
    'Your sentence starts at the end. That is how sentences work.',
    'The last round will be a little different. A little worse.',
    'Read the card. Then read it again. Then play anyway.',
  ],
  sentenceSurvived: [
    'You survived the sentence. The sentence is not offended.',
    'Hm. You played through that. Noted.',
    'Most people complain. You just flipped. Unsettling.',
    'The adjustment is lifted. Do not mistake it for mercy.',
    'Still here. The paperwork is annoyed.',
  ],
  loan: [
    'A loan. How brave. How expensive.',
    'Borrowing from me to pay me. I admire the circle.',
    'Half again on top. I will remember the number so you do not have to.',
    'Money now, more money later. The oldest machine there is.',
    'Signed. The ink is still warm. So is the trapdoor.',
  ],
  payEarly: [
    'Early? Suspicious. Accepted.',
    'Paid ahead. Have some tickets. Do not spend them on hope.',
    'You skipped my sentence. Rude. Efficient.',
    'Early money is still money. Better, even.',
    'Ahead of schedule. I will have to make a new schedule.',
  ],
  fall: [
    'Short.',
    'The floor has opinions about unpaid debts.',
    'Mind the gap.',
    'Another mark on the wall. The wall is filling up.',
    'Down you go. The machine will miss you. Briefly.',
  ],
  centerDrain: [
    'Straight down the middle. Like your prospects.',
    'Nothing you could do. Except everything.',
    'The drain thanks you for your business.',
    'Right between the flippers. Poetic.',
    'That one did not even pretend to be close.',
  ],
  bigPayday: [
    'Payday. Do not spend it all on breathing.',
    'Look at you, rich for a minute.',
    'That will cover some of it. Some.',
    'The machine paid. The machine always collects later.',
    'Enjoy the sound. It is the only nice one in here.',
  ],
  riot: [
    'A riot. In my block. How festive.',
    'Three balls loose. Count them before they count you.',
    'Noise. I can hear it through the walls.',
    'Riot all you like. The bars are bolted.',
    'Everyone out of their cells. Nobody out of the building.',
  ],
  tilt: [
    'Hands off the furniture.',
    'The machine does not like to be shaken. Neither do I.',
    'Tilt. Everything that ball earned is mine now.',
    'Violence is not a strategy. It is a fee.',
    'You shook it. It shook you back.',
  ],
  jobDone: [
    'The job is done. The debt is not.',
    'Competent. Do not let it become a habit.',
    'Payment for services rendered. Do not frame it.',
    'A job well done. In here that is suspicious.',
    'You did as you were told. Good. Again.',
  ],
  lastCall: [
    'Last call. Two sentences. One chance.',
    'This is the big one. I have been saving it for you.',
    'Final deadline. After this, the door. Or the floor.',
    'Every debt ends somewhere. Yours ends this week.',
    'Last call. Make it loud.',
  ],
  hangUp: [
    'Your loss. Literally.',
    'Click. Coward.',
    'No deal. The offer remembers you.',
    'Suit yourself. The red phone does not ring for long.',
    'Hung up on me. Bold. Pointless, but bold.',
  ],
};
