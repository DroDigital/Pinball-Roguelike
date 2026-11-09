/** Which top lane does each plunger pull drop into? Prints the windows for PLUNGER.lanePull. */
import { makeSim } from '../src/bot/scenarios';
import { emptyInput } from '../src/sim/sim';

const hits: Record<string, number[]> = { laneA: [], laneB: [], laneC: [] };
for (let pull = 0.4; pull <= 1.0001; pull += 0.01) {
  for (let seed = 1; seed <= 3; seed++) {
    const sim = makeSim(seed);
    sim.serveBall(false);
    for (let i = 0; i < 240; i++) sim.stepOnce(emptyInput());
    for (let i = 0; i < 5; i++) sim.stepOnce({ ...emptyInput(), pull });
    let lane = '-';
    let cursor = sim.events.head;
    for (let i = 0; i < 240 * 6 && lane === '-'; i++) {
      sim.stepOnce(emptyInput());
      cursor = sim.events.read(cursor, (e) => {
        if (e.type === 'trigger' && e.id.startsWith('lane') && e.dir > 0 && lane === '-')
          lane = e.id;
      });
    }
    if (lane !== '-') hits[lane].push(pull);
  }
}
for (const [k, v] of Object.entries(hits)) {
  if (!v.length) console.log(k, 'never');
  else
    console.log(
      k,
      `n=${v.length} min ${Math.min(...v).toFixed(2)} max ${Math.max(...v).toFixed(2)} mid ${((Math.min(...v) + Math.max(...v)) / 2).toFixed(3)}`,
    );
}
