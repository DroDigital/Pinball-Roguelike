/**
 * Mugshots for the inmate lineup: a crude booking photo in front of a height chart, one face
 * per inmate (hair, scars, glasses), with the prisoner number on a placard. Locked inmates
 * are a shadow with a question mark.
 */
interface Face {
  skin: string;
  hair: string;
  /** 0 bald, 1 short, 2 long, 3 mohawk. */
  style: number;
  scar?: boolean;
  glasses?: boolean;
  beard?: boolean;
  patch?: boolean;
  grin?: boolean;
}

const FACES: Record<string, Face> = {
  debtor: { skin: '#c8a888', hair: '#4a3a2a', style: 1 },
  embezzler: { skin: '#d8b898', hair: '#8a8a88', style: 1, glasses: true },
  brawler: { skin: '#b08868', hair: '#2a1a10', style: 3, scar: true, grin: true },
  lifer: { skin: '#a89078', hair: '#d8d8d0', style: 2, beard: true },
  escapeArtist: { skin: '#c09878', hair: '#1a1a1a', style: 0, patch: true },
  snitch: { skin: '#d0b090', hair: '#a86a3a', style: 2, glasses: true },
};

export function paintMugshot(
  c: HTMLCanvasElement,
  id: string,
  number: string,
  locked: boolean,
): void {
  const W = (c.width = 96);
  const H = (c.height = 120);
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8b4a8';
  g.fillRect(0, 0, W, H);
  // Height chart.
  g.strokeStyle = 'rgba(40,36,30,0.55)';
  g.fillStyle = 'rgba(40,36,30,0.7)';
  g.font = '7px monospace';
  for (let i = 0; i < 9; i++) {
    const y = 8 + i * 12;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
    g.fillText(String(7 - Math.floor(i / 2)) + (i % 2 ? "'6" : "'0"), 2, y - 2);
  }
  const f = FACES[id] ?? FACES.debtor;
  const cx = W / 2;
  if (locked) {
    g.fillStyle = '#1a1814';
    head(g, cx, 44);
    g.fillRect(cx - 30, 74, 60, 46);
    g.fillStyle = '#b8b4a8';
    g.font = 'bold 24px monospace';
    g.textAlign = 'center';
    g.fillText('?', cx, 54);
    g.textAlign = 'left';
    return;
  }
  // Shoulders in prison orange.
  g.fillStyle = '#c8682a';
  g.fillRect(cx - 32, 78, 64, 42);
  g.fillStyle = f.skin;
  g.fillRect(cx - 7, 66, 14, 14);
  head(g, cx, 44);
  // Hair.
  g.fillStyle = f.hair;
  if (f.style === 1) g.fillRect(cx - 17, 22, 34, 9);
  if (f.style === 2) {
    g.fillRect(cx - 18, 22, 36, 9);
    g.fillRect(cx - 19, 26, 6, 30);
    g.fillRect(cx + 13, 26, 6, 30);
  }
  if (f.style === 3) g.fillRect(cx - 3, 16, 6, 14);
  // Eyes, brows, mouth.
  g.fillStyle = '#1a1410';
  g.fillRect(cx - 10, 40, 5, 3);
  g.fillRect(cx + 5, 40, 5, 3);
  g.fillRect(cx - 11, 36, 7, 2);
  g.fillRect(cx + 4, 36, 7, 2);
  if (f.grin) {
    g.fillRect(cx - 8, 56, 16, 2);
    g.fillStyle = '#e8e0c8';
    g.fillRect(cx - 6, 56, 12, 2);
  } else g.fillRect(cx - 6, 57, 12, 2);
  g.fillStyle = 'rgba(60,30,20,0.5)';
  g.fillRect(cx - 2, 44, 4, 8);
  if (f.glasses) {
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 1.5;
    g.strokeRect(cx - 13, 37, 10, 8);
    g.strokeRect(cx + 3, 37, 10, 8);
    g.beginPath();
    g.moveTo(cx - 3, 40);
    g.lineTo(cx + 3, 40);
    g.stroke();
  }
  if (f.patch) {
    g.fillStyle = '#101010';
    g.fillRect(cx + 3, 37, 10, 8);
    g.fillRect(cx - 17, 33, 34, 1.5);
  }
  if (f.scar) {
    g.strokeStyle = '#8a3a2a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx - 14, 34);
    g.lineTo(cx - 6, 52);
    g.stroke();
  }
  if (f.beard) {
    g.fillStyle = f.hair;
    g.fillRect(cx - 14, 52, 28, 12);
    g.fillStyle = '#1a1410';
    g.fillRect(cx - 6, 56, 12, 2);
  }
  // The placard.
  g.fillStyle = '#1a1814';
  g.fillRect(cx - 26, 88, 52, 22);
  g.fillStyle = '#e8e4d8';
  g.font = 'bold 11px monospace';
  g.textAlign = 'center';
  g.fillText(number, cx, 103);
  g.textAlign = 'left';
}

function head(g: CanvasRenderingContext2D, cx: number, cy: number): void {
  g.beginPath();
  g.ellipse(cx, cy, 17, 23, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - 21, cy - 4, 5, 10);
  g.fillRect(cx + 16, cy - 4, 5, 10);
}
