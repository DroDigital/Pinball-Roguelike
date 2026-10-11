/**
 * Tiny worker pool for the balance tools. The calling module runs itself in each worker
 * (via worker-entry.mjs, which registers tsx) and answers its job through `workerJob`.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';

export const IS_MAIN = isMainThread;

export function defaultWorkers(): number {
  return Math.max(1, cpus().length);
}

/** Run each job in its own worker thread of `moduleUrl`; resolves with results in order. */
export function runPool<J, R>(moduleUrl: string, jobs: J[]): Promise<R[]> {
  return Promise.all(
    jobs.map(
      (job) =>
        new Promise<R>((resolve, reject) => {
          const w = new Worker(new URL('./worker-entry.mjs', import.meta.url), {
            workerData: { ...job, __module: moduleUrl },
          });
          w.on('message', (m: R) => resolve(m));
          w.on('error', reject);
        }),
    ),
  );
}

/** Worker side: compute and post the result for this thread's job. */
export function workerJob<J, R>(fn: (job: J) => R): void {
  if (isMainThread) return;
  parentPort!.postMessage(fn(workerData as J));
}

/** Split [0, n) into `parts` contiguous ranges. */
export function ranges(n: number, parts: number): { from: number; to: number }[] {
  const per = Math.ceil(n / parts);
  const out: { from: number; to: number }[] = [];
  for (let p = 0; p < parts; p++) {
    const from = p * per;
    const to = Math.min(n, from + per);
    if (from < to) out.push({ from, to });
  }
  return out;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

export function argNum(args: string[], k: string, d: number): number {
  const i = args.indexOf(k);
  return i >= 0 ? Number(args[i + 1]) : d;
}

export function argStr(args: string[], k: string, d: string): string {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
}
