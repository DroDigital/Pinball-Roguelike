import { TABLE } from '../src/content/table';
import { tableSvg } from './lib/svg';
import { svgToPng } from './lib/render-png';
import { writeFileSync } from 'node:fs';

const svg = tableSvg(TABLE, {
  scale: 26,
  showTagged: process.argv.includes('--tagged'),
  labels: process.argv.includes('--labels'),
});
writeFileSync('tools/out/table.svg', svg);
await svgToPng(svg, 'tools/out/table.png');
console.log('wrote tools/out/table.png');
