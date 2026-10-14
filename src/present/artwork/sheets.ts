/**
 * Procedural paper documents and dossiers:
 * - booking-dossier (inmate lineup / record)
 * - deadline-notice (urgent debt deadline notification)
 * - job-ticket (work order ticket)
 * - buy-balls-panel (requisition form for pinballs)
 * - ball-receipt (paper receipt slip with tear-off edge)
 * - rap-sheet (criminal record and lifetime statistics)
 * - neighbor-letter (smuggled note through cell wall)
 * - ending-panel (discharge or sentencing dossier)
 */
import { HEAD_RECT } from '../../content/art';
import {
  FONT,
  barcode,
  paper,
  plate,
  px,
  rivet,
  rr,
  screw,
  stamp,
  tape,
  text,
  type Box,
  type Ctx,
} from './kit';
import type { Painter } from './index';

/** Dark wooden or metal clipboard base holding the paper document. */
function clipboardBacking(g: Ctx, w: number, h: number, u: number): void {
  const m = 10 * u;
  const board: Box = [m, m, w - 2 * m, h - 2 * m];
  // Dark industrial pressed fiberboard / heavy metal clip frame
  plate(
    g,
    board,
    rr(board, 24 * u),
    {
      fill: ['#28221c', '#1a1612', '#100d0a'],
      brush: true,
      grain: 0.12,
      rim: 0.8,
      seed: 'board',
      edge: '#0a0806',
    },
    3 * u,
  );

  // Riveted metal corners
  const cr = 28 * u;
  for (const [cx, cy] of [
    [board[0] + cr, board[1] + cr],
    [board[0] + board[2] - cr, board[1] + cr],
    [board[0] + cr, board[1] + board[3] - cr],
    [board[0] + board[2] - cr, board[1] + board[3] - cr],
  ]) {
    rivet(g, cx, cy, 5.5 * u);
  }

  // Steel clip at the top
  const clipW = 280 * u;
  const clipH = 46 * u;
  const clipBox: Box = [w / 2 - clipW / 2, m - 6 * u, clipW, clipH];
  plate(
    g,
    clipBox,
    rr(clipBox, 6 * u),
    {
      fill: ['#6c7682', '#3f4852', '#222830'],
      brush: true,
      rim: 1,
      seed: 'clip',
      edge: '#14181c',
    },
    2 * u,
  );
  screw(g, clipBox[0] + 30 * u, clipBox[1] + clipH * 0.5, 5 * u, 0.3);
  screw(g, clipBox[0] + clipW - 30 * u, clipBox[1] + clipH * 0.5, 5 * u, 1.2);
}

/** Draws standard document header elements (prison seals, form numbers, horizontal rules). */
function docHeader(
  g: Ctx,
  paperBox: Box,
  u: number,
  formNo: string,
  title: string,
  sub: string,
): void {
  const [x, y, w] = paperBox;
  const topY = y + 36 * u;

  // Form code on top right
  text(g, formNo, x + w - 40 * u, topY, {
    font: `${14 * u}px ${FONT.type}`,
    align: 'right',
    fill: '#84261a',
  });

  // Department name
  text(g, "DEBTOR'S CORRECTIONAL FACILITY", x + 40 * u, topY, {
    font: `bold ${13 * u}px ${FONT.type}`,
    align: 'left',
    fill: '#4a3828',
    spacing: 1.5 * u,
  });

  // Document main title
  text(g, title, x + 40 * u, topY + 28 * u, {
    font: `900 ${28 * u}px ${FONT.head}`,
    align: 'left',
    fill: '#1c140c',
    spacing: 2 * u,
  });

  // Subtitle
  text(g, sub, x + 40 * u, topY + 48 * u, {
    font: `${12 * u}px ${FONT.type}`,
    align: 'left',
    fill: '#6b543c',
  });

  // Thin double rule
  g.save();
  g.strokeStyle = 'rgba(74,56,40,0.5)';
  g.lineWidth = 1.5 * u;
  g.beginPath();
  g.moveTo(x + 36 * u, topY + 58 * u);
  g.lineTo(x + w - 36 * u, topY + 58 * u);
  g.moveTo(x + 36 * u, topY + 62 * u);
  g.lineTo(x + w - 36 * u, topY + 62 * u);
  g.stroke();
  g.restore();
}

/** Booking Dossier (Lineup screen) */
function paintBookingDossier(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;
  clipboardBacking(g, w, h, u);

  // Cream document sheet
  const paperBox: Box = [48 * u, 36 * u, w - 96 * u, h - 72 * u];
  paper(g, paperBox, rr(paperBox, 8 * u), {
    seed: 'booking-dossier',
    top: '#fff8eb',
    mid: '#f3e5c8',
    bottom: '#e7d3ae',
  });

  docHeader(
    g,
    paperBox,
    u,
    'FORM DCF-08B // INMATE INTAKE',
    'INMATE BOOKING DOSSIER',
    'SELECT INMATE PROFILE & HARD TIME SENTENCE',
  );

  // Barcode in bottom right
  barcode(g, [paperBox[0] + paperBox[2] - 180 * u, paperBox[1] + paperBox[3] - 46 * u, 140 * u, 24 * u], 'lineup-bar', '#2c1e14');

  // Red rubber stamp "PROCESSED"
  stamp(g, paperBox[0] + paperBox[2] - 130 * u, paperBox[1] + 115 * u, 'PROCESSED', 28 * u, '#84261a', -0.15, 0.65);
}

/** Deadline Notice */
function paintDeadlineNotice(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;
  clipboardBacking(g, w, h, u);

  const paperBox: Box = [48 * u, 36 * u, w - 96 * u, h - 72 * u];
  paper(g, paperBox, rr(paperBox, 8 * u), {
    seed: 'deadline-notice',
    top: '#fff5ea',
    mid: '#f5e4cb',
    bottom: '#e4cdad',
  });

  docHeader(
    g,
    paperBox,
    u,
    'NOTICE NO. DL-884-A',
    'DEBT ASSESSMENT & PENALTY NOTICE',
    'MANDATORY CLEARANCE BY MACHINE BALANCE',
  );

  // Bold warning banner across the head slot
  const headRect = HEAD_RECT.deadline!;
  const hb = px(headRect, w, h);
  g.save();
  g.fillStyle = 'rgba(132,38,26,0.12)';
  g.strokeStyle = '#84261a';
  g.lineWidth = 1.8 * u;
  g.beginPath();
  g.roundRect(hb[0], hb[1], hb[2], hb[3], 4 * u);
  g.fill();
  g.stroke();
  g.restore();

  // Rubber stamp: "DEMAND FOR PAYMENT"
  stamp(g, paperBox[0] + paperBox[2] - 160 * u, paperBox[1] + paperBox[3] - 70 * u, 'DEMAND FOR PAYMENT', 24 * u, '#a02416', 0.1, 0.75);

  // Threat seal watermark
  barcode(g, [paperBox[0] + 40 * u, paperBox[1] + paperBox[3] - 42 * u, 160 * u, 22 * u], 'dl-barcode', '#382215');
}

/** Job Ticket */
function paintJobTicket(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;

  // Punch ticket card with perforated notches
  const m = 18 * u;
  const ticketBox: Box = [m, m, w - 2 * m, h - 2 * m];

  // Ticket base
  paper(g, ticketBox, rr(ticketBox, 12 * u), {
    seed: 'job-ticket',
    top: '#fffcf2',
    mid: '#f4e8cf',
    bottom: '#e8d6b4',
  });

  // Ticket left tear-strip perforations
  const stripW = 120 * u;
  g.save();
  g.strokeStyle = 'rgba(100,70,45,0.45)';
  g.setLineDash([6 * u, 6 * u]);
  g.lineWidth = 2 * u;
  g.beginPath();
  g.moveTo(ticketBox[0] + stripW, ticketBox[1] + 8 * u);
  g.lineTo(ticketBox[0] + stripW, ticketBox[1] + ticketBox[3] - 8 * u);
  g.stroke();

  // Punch holes on left edge
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 5; i++) {
    const py = ticketBox[1] + ticketBox[3] * (0.2 + i * 0.15);
    g.beginPath();
    g.arc(ticketBox[0] + 20 * u, py, 9 * u, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // Vertical serial on ticket stub
  g.save();
  g.translate(ticketBox[0] + 65 * u, ticketBox[1] + ticketBox[3] / 2);
  g.rotate(-Math.PI / 2);
  text(g, 'PRISON WORK ORDER #9402', 0, 0, {
    font: `bold ${14 * u}px ${FONT.type}`,
    align: 'center',
    fill: '#84261a',
    spacing: 2 * u,
  });
  g.restore();

  // Header banner on main ticket
  const mainX = ticketBox[0] + stripW + 24 * u;
  text(g, 'LABOR REQUISITION TICKET', mainX, ticketBox[1] + 38 * u, {
    font: `900 ${24 * u}px ${FONT.head}`,
    fill: '#291c12',
    spacing: 2 * u,
  });
  text(g, 'PAYABLE UPON COMPLETION OF SHIFT GOAL', mainX, ticketBox[1] + 58 * u, {
    font: `${12 * u}px ${FONT.type}`,
    fill: '#6e563e',
  });

  // Barcode along bottom
  barcode(g, [mainX, ticketBox[1] + ticketBox[3] - 38 * u, 160 * u, 22 * u], 'job-code', '#2a1a0f');

  // Red stamp "AUTHORIZED"
  stamp(g, ticketBox[0] + ticketBox[2] - 120 * u, ticketBox[1] + 60 * u, 'APPROVED', 22 * u, '#84261a', -0.12, 0.7);
}

/** Buy Balls Panel */
function paintBuyBallsPanel(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;
  clipboardBacking(g, w, h, u);

  const paperBox: Box = [48 * u, 36 * u, w - 96 * u, h - 72 * u];
  paper(g, paperBox, rr(paperBox, 8 * u), {
    seed: 'buy-balls',
    top: '#fff9ed',
    mid: '#f3e6ca',
    bottom: '#e5d3b0',
  });

  docHeader(
    g,
    paperBox,
    u,
    'VOUCHER #BB-501',
    'BALL REQUISITION & MUNITIONS',
    'ALLOCATION OF STANDARD STEEL PINBALL UNITS',
  );

  // Pinball inspection illustration on top right
  const ballCx = paperBox[0] + paperBox[2] - 80 * u;
  const ballCy = paperBox[1] + 70 * u;
  g.save();
  g.strokeStyle = '#6e563e';
  g.lineWidth = 1.5 * u;
  g.beginPath();
  g.arc(ballCx, ballCy, 24 * u, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  text(g, 'CAL: 1.06"', ballCx, ballCy + 36 * u, {
    font: `${10 * u}px ${FONT.type}`,
    align: 'center',
    fill: '#6e563e',
  });

  barcode(g, [paperBox[0] + 40 * u, paperBox[1] + paperBox[3] - 44 * u, 140 * u, 22 * u], 'buy-barcode', '#2b1b10');
  stamp(g, paperBox[0] + paperBox[2] - 140 * u, paperBox[1] + paperBox[3] - 65 * u, 'DISPENSED', 24 * u, '#1d5a2c', -0.08, 0.65);
}

/** Ball Receipt / Tally */
function paintBallReceipt(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 900;

  // Tall receipt slip
  const recW = w * 0.72;
  const recH = h * 0.94;
  const recX = w / 2 - recW / 2;
  const recY = h * 0.03;
  const recBox: Box = [recX, recY, recW, recH];

  paper(g, recBox, rr(recBox, 6 * u), {
    seed: 'receipt',
    top: '#ffffff',
    mid: '#faf3e1',
    bottom: '#f0e3c8',
  });

  // Jagged serrated top and bottom receipt tears
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const teeth = 28;
  const toothW = recW / teeth;
  for (let i = 0; i < teeth; i++) {
    // Top tear
    g.beginPath();
    g.moveTo(recX + i * toothW, recY);
    g.lineTo(recX + (i + 0.5) * toothW, recY + 8 * u);
    g.lineTo(recX + (i + 1) * toothW, recY);
    g.closePath();
    g.fill();

    // Bottom tear
    g.beginPath();
    g.moveTo(recX + i * toothW, recY + recH);
    g.lineTo(recX + (i + 0.5) * toothW, recY + recH - 8 * u);
    g.lineTo(recX + (i + 1) * toothW, recY + recH);
    g.closePath();
    g.fill();
  }
  g.restore();

  // Receipt printed header
  text(g, 'DEBTOR’S PRISON BANK', w / 2, recY + 45 * u, {
    font: `bold ${22 * u}px ${FONT.mono}`,
    align: 'center',
    fill: '#241a12',
    spacing: 2 * u,
  });
  text(g, '================================', w / 2, recY + 68 * u, {
    font: `${16 * u}px ${FONT.mono}`,
    align: 'center',
    fill: '#6a5640',
  });
  text(g, 'BALL RECONCILIATION AUDIT', w / 2, recY + 92 * u, {
    font: `${18 * u}px ${FONT.mono}`,
    align: 'center',
    fill: '#241a12',
  });

  // Barcode at bottom of receipt
  barcode(g, [w / 2 - 100 * u, recY + recH - 70 * u, 200 * u, 28 * u], 'receipt-bar', '#2a1a12');
  text(g, '*** KEEP RECEIPT FOR RECORDS ***', w / 2, recY + recH - 26 * u, {
    font: `${13 * u}px ${FONT.mono}`,
    align: 'center',
    fill: '#6a5640',
  });

  stamp(g, w / 2, recY + recH - 140 * u, 'PAID & RECORDED', 24 * u, '#84261a', -0.05, 0.6);
}

/** Rap Sheet */
function paintRapSheet(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;
  clipboardBacking(g, w, h, u);

  const paperBox: Box = [48 * u, 36 * u, w - 96 * u, h - 72 * u];
  paper(g, paperBox, rr(paperBox, 8 * u), {
    seed: 'rap-sheet',
    top: '#fff8ea',
    mid: '#f4e5cb',
    bottom: '#e7d3ae',
  });

  docHeader(
    g,
    paperBox,
    u,
    'FILE CODE: CR-9914-LIFETIME',
    'INMATE RAP SHEET & CAREER RECORD',
    'HISTORICAL OFFENSES, EXTENSIONS & SEED ARCHIVES',
  );

  // Fingerprint smudge graphic on top right
  const fX = paperBox[0] + paperBox[2] - 80 * u;
  const fY = paperBox[1] + 90 * u;
  g.save();
  g.strokeStyle = 'rgba(74,56,40,0.35)';
  g.lineWidth = 1.2 * u;
  for (let r = 8 * u; r < 36 * u; r += 5 * u) {
    g.beginPath();
    g.ellipse(fX, fY, r * 0.7, r, 0.2, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();

  barcode(g, [paperBox[0] + 40 * u, paperBox[1] + paperBox[3] - 44 * u, 160 * u, 22 * u], 'rap-barcode', '#2b1b10');
  stamp(g, paperBox[0] + paperBox[2] - 140 * u, paperBox[1] + paperBox[3] - 70 * u, 'CONFIDENTIAL', 26 * u, '#84261a', 0.12, 0.75);
}

/** Neighbor Letter */
function paintNeighborLetter(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;

  // Crinkled illicit note slipped under brick
  const m = 40 * u;
  const letterBox: Box = [m, m, w - 2 * m, h - 2 * m];

  paper(g, letterBox, rr(letterBox, 6 * u), {
    seed: 'neighbor-letter',
    top: '#fcf8ee',
    mid: '#f1e2c5',
    bottom: '#dfcdab',
  });

  // Yellowed tape strips holding the note
  tape(g, letterBox[0] + 50 * u, letterBox[1] + 16 * u, 80 * u, 28 * u, -0.3);
  tape(g, letterBox[0] + letterBox[2] - 50 * u, letterBox[1] + 16 * u, 80 * u, 28 * u, 0.25);

  // Handwritten / typewriter scribbles header
  text(g, '// NOTE FROM CELL 14 (THE WALL)', letterBox[0] + 45 * u, letterBox[1] + 52 * u, {
    font: `bold ${18 * u}px ${FONT.type}`,
    fill: '#4a3424',
    spacing: 1.5 * u,
  });

  g.save();
  g.strokeStyle = 'rgba(74,52,36,0.35)';
  g.lineWidth = 1.5 * u;
  g.beginPath();
  g.moveTo(letterBox[0] + 40 * u, letterBox[1] + 66 * u);
  g.lineTo(letterBox[0] + letterBox[2] - 40 * u, letterBox[1] + 66 * u);
  g.stroke();
  g.restore();

  // Subtle grease stain
  g.save();
  const stain = g.createRadialGradient(w * 0.82, h * 0.78, 10 * u, w * 0.82, h * 0.78, 70 * u);
  stain.addColorStop(0, 'rgba(120,80,30,0.18)');
  stain.addColorStop(1, 'rgba(120,80,30,0)');
  g.fillStyle = stain;
  g.beginPath();
  g.arc(w * 0.82, h * 0.78, 70 * u, 0, Math.PI * 2);
  g.fill();
  g.restore();

  text(g, 'DESTROY AFTER READING', w / 2, letterBox[1] + letterBox[3] - 28 * u, {
    font: `bold ${13 * u}px ${FONT.type}`,
    align: 'center',
    fill: '#84261a',
    spacing: 2 * u,
  });
}

/** Ending Result Panel */
function paintEndingPanel(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const u = w / 1200;
  clipboardBacking(g, w, h, u);

  const paperBox: Box = [48 * u, 36 * u, w - 96 * u, h - 72 * u];
  paper(g, paperBox, rr(paperBox, 8 * u), {
    seed: 'ending-panel',
    top: '#fff8eb',
    mid: '#f3e5c7',
    bottom: '#e7d1ab',
  });

  docHeader(
    g,
    paperBox,
    u,
    'DISPOSITION RECORD: #FIN-000',
    'FINAL SENTENCE & DISCHARGE DOSSIER',
    'OFFICIAL DISPOSITION OF INMATE AND MACHINE PROCEEDS',
  );

  barcode(g, [paperBox[0] + 40 * u, paperBox[1] + paperBox[3] - 44 * u, 160 * u, 22 * u], 'end-barcode', '#2b1b10');
  stamp(g, paperBox[0] + paperBox[2] - 160 * u, paperBox[1] + paperBox[3] - 70 * u, 'CASE CLOSED', 30 * u, '#84261a', -0.1, 0.8);
}

export const PAPER_PAINTERS: Record<
  | 'menus/booking-dossier'
  | 'menus/deadline-notice'
  | 'menus/job-ticket'
  | 'menus/buy-balls-panel'
  | 'menus/ball-receipt'
  | 'menus/rap-sheet'
  | 'menus/neighbor-letter'
  | 'menus/ending-panel',
  Painter
> = {
  'menus/booking-dossier': paintBookingDossier,
  'menus/deadline-notice': paintDeadlineNotice,
  'menus/job-ticket': paintJobTicket,
  'menus/buy-balls-panel': paintBuyBallsPanel,
  'menus/ball-receipt': paintBallReceipt,
  'menus/rap-sheet': paintRapSheet,
  'menus/neighbor-letter': paintNeighborLetter,
  'menus/ending-panel': paintEndingPanel,
};
