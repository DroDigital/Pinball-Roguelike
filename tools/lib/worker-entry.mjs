// Worker bootstrap: tsx loader hooks are per-thread, so register them before importing TS.
import { register } from 'tsx/esm/api';
import { workerData } from 'node:worker_threads';

register();
await import(workerData.__module);
