(() => {
'use strict';

// ---------- layout (virtual units: height is fixed, width follows the window) ----------
const H = 1100;
let W = 640;
const SKY_TOP = 78, GROUND_Y = 930, GAP_Y = 505;
const PIPE_W = 176, SPACING = 690, REST_OFF = 245;
const GAP_S = 350;          // static gap
const GAP_SQUEEZE = 236;    // partial close ("придавливание")
const GAP_NEAR = 70;        // almost full close
const HOVER_A = 125, HOVER_W = 2.8;   // hover stays inside the static gap, so any height passes
const BIRD_W = 86;
const DASH_DUR = 0.8;
const BOOST_CHANCE = 0.075, BOOST_MIN = 3, BOOST_MAX = 5;
const BAR_Y = 122, BAR_HW = 253;

// ---------- modes ----------
// HARD values after 98.36 are extrapolated and EASY is generated: replace them with the real tables.
const MAX_WIN = 55257.56;
const HARD = [1.39, 2.07, 3.17, 5.00, 8.19, 13.96, 25.06, 47.36, 98.36, 216.39, 508.52, 1271.30, 3432.51];
const EASY = (() => {
  const a = []; let v = 1.12;
  for (let i = 0; i < 23; i++) { a.push(Math.round(v * 100) / 100); v *= 1.1 + i * 0.016; }
  return a;
})();
const MODES = { easy: EASY, hard: HARD };
let mode = localStorage.getItem('tappy_mode') === 'easy' ? 'easy' : 'hard';
let STEPS = [...MODES[mode], MAX_WIN];
const isBonus = i => i > 0 && i % 4 === 0 && i < STEPS.length - 2;

// ---------- currencies ----------
// mul scales bet steps, chips and the default balance so amounts feel natural in each currency
const CURRENCIES = [
  { code: 'USD', sym: '$', mul: 1 },
  { code: 'EUR', sym: '€', mul: 1 },
  { code: 'RUB', sym: '₽', mul: 100 },
  { code: 'INR', sym: '₹', mul: 100 },
  { code: 'KZT', sym: '₸', mul: 500 },
  { code: 'UAH', sym: '₴', mul: 50 },
  { code: 'TRY', sym: '₺', mul: 50 },
  { code: 'BRL', sym: 'R$', mul: 5 },
  { code: 'UZS', sym: 'сум', mul: 10000 },
  { code: 'AZN', sym: '₼', mul: 2 },
  { code: 'BDT', sym: '৳', mul: 100 },
  { code: 'PKR', sym: '₨', mul: 300 },
];
let curIdx = Math.max(0, CURRENCIES.findIndex(c => c.code === localStorage.getItem('tappy_cur')));
const CUR = () => CURRENCIES[curIdx];
const BASE_BETS = [0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500];
let BETS = [], MAX_BET = 0;
function setBets() { BETS = BASE_BETS.map(b => b * CUR().mul); MAX_BET = BETS[BETS.length - 1]; }
setBets();
const FONT = 'Gamefront, monospace';
const SMOKE_FPS = 24;      // smoke.png flipbook speed, frames per second

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const backOut = t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// accelerate over the first `a`, cruise, brake over the last `b`
function easeTrap(u, a = 0.2, b = 0.25) {
  const v = 1 / (1 - a / 2 - b / 2);
  if (u < a) return 0.5 * v * u * u / a;
  if (u < 1 - b) return v * (a / 2 + u - a);
  return 1 - 0.5 * v * (1 - u) * (1 - u) / b;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const fmt = n => n.toFixed(2);
const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(2) + 'K' : n.toFixed(2);
const fmtWd = n => n >= 1e6 ? fmtK(n) : n.toFixed(2);
const fmtBal = n => { const [i, d] = n.toFixed(2).split('.'); return i.replace(/\B(?=(\d{3})+$)/g, ' ') + '.' + d; };
const fmtBet = n => Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2);

// ---------- assets ----------
const SRC = {
  bird: 'bird_icon-eNXnyw.webp', pipe: 'pipe_asset-R0PcPw.webp', city: 'city_asset--SkKnQ.webp',
  hills: 'cloud_asset-LGaL5Q.webp', grass: 'grass_asset-M4Rdow.webp', check: 'green_checkmark-ECs3jg.webp',
  checkB: 'green_checkmark_bonus-dqTL1A.webp', orange: 'orange_checkmark-JmrqWw.webp',
  orangeB: 'orange_checkmark_bonus-7c4E9g.webp', trophy: 'trophy-SgOHgQ.webp', trophyIcon: 'trophy-icon-I7V7bg.webp',
  board: 'bg-board-m-F461-g.webp', chipB: 'text-place-border-cin5UA.webp', spark: 'particle-Un4e1w.webp',
  smoke: 'smoke.png',
};
const IMG = {};
for (const k in SRC) { IMG[k] = new Image(); IMG[k].src = SRC[k]; }
const ok = im => im && im.complete && im.naturalWidth > 0;
if (document.fonts && document.fonts.load) document.fonts.load('700 40px Gamefront').catch(() => {});

// ---------- canvas / scaling ----------
const stage = document.getElementById('stage');
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let R = 1;
function resize() {
  const s = Math.min(innerHeight / H, innerWidth / 640);
  W = Math.round(clamp(innerWidth / s, 640, 1800));
  stage.style.width = W + 'px';
  stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  R = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * s));
  cv.width = Math.round(W * R); cv.height = Math.round(H * R);
}
addEventListener('resize', resize); resize();
const birdSX = () => W / 2 - clamp((820 - W) * 0.5, 0, 90);

// ---------- smoke.png ----------
// Flipbook, top of the sheet = first frame, bottom = last: the upright jets down the right column,
// then the flat cloud from the bottom row. Source-pixel rects [x, y, w, h], picked by eye.
const SMOKE_FRAMES = [
  [1721, 0, 208, 317],
  [1726, 572, 203, 322],
  [1726, 894, 198, 354],
  [1732, 1388, 192, 354],
  [458, 1784, 300, 281],
];
let smokeSheet = null, smokeMode = null;   // 'img': transparent sheet | 'svg': key the backdrop while drawing
function prepSmoke() {
  const im = IMG.smoke;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    if (p[3] > 200) {
      for (let i = 0; i < p.length; i += 4) {
        const l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) / 255;
        p[i + 3] = Math.round(255 * clamp((l - 0.5) * 4, 0, 1));
      }
      g.putImageData(d, 0, 0);
    }
    smokeSheet = c; smokeMode = 'img';
  } catch (e) {
    // a file:// page can't read pixels, so the dark backdrop is keyed out by an SVG filter at draw time
    smokeSheet = im; smokeMode = 'filter' in ctx ? 'svg' : 'img';
  }
}
if (ok(IMG.smoke)) prepSmoke(); else IMG.smoke.addEventListener('load', prepSmoke);

// ---------- dom ----------
const $ = id => document.getElementById(id);
const ui = {
  idle: $('idleCtl'), round: $('roundCtl'), play: $('playBtn'), repeat: $('repeatBtn'), dash: $('dashBtn'),
  wd: $('withdrawBtn'), wdVal: $('wdVal'), bet: $('betVal'), minus: $('betMinus'), plus: $('betPlus'),
  easy: $('modeEasy'), hard: $('modeHard'), easySteps: $('easySteps'), hardSteps: $('hardSteps'),
  bal: $('balVal'), wallet: $('wallet'), hand: $('hand'), mute: $('muteBtn'), chips: document.querySelectorAll('.bet-chip'),
  syms: document.querySelectorAll('.cur-sym'), codes: document.querySelectorAll('.cur-code'),
  wm: $('walletMenu'), wmInput: $('wmInput'), wmCur: $('wmCur'), wmApply: $('wmApply'), wmClose: $('wmClose'),
  wmNote: $('wmNote'), wmPresets: document.querySelectorAll('.wm-preset'),
};

// ---------- persistent demo wallet ----------
const START_BAL = () => 10000 * CUR().mul;
let balance = parseFloat(localStorage.getItem('tappy_bal'));
if (!isFinite(balance)) balance = START_BAL();
let bet = parseFloat(localStorage.getItem('tappy_betv'));
if (!(bet >= BETS[0] && bet <= MAX_BET)) bet = 2 * CUR().mul;
let lastBet = bet;
let rounds = parseInt(localStorage.getItem('tappy_rounds'), 10) || 0;
let muted = localStorage.getItem('tappy_mute') === '1';
const save = () => {
  localStorage.setItem('tappy_bal', balance.toFixed(2));
  localStorage.setItem('tappy_betv', String(bet));
  localStorage.setItem('tappy_rounds', rounds);
};

// ---------- audio ----------
let ac = null;
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(f0, f1, dur, type = 'square', vol = 0.06, delay = 0) {
  if (muted) return; const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.15) {
  if (muted) return; const a = audio(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = a.createBufferSource(), g = a.createGain(); s.buffer = buf; g.gain.value = vol;
  s.connect(g).connect(a.destination); s.start();
}
const sfx = {
  flap: () => { tone(420, 760, 0.12, 'square', 0.05); tone(300, 520, 0.1, 'triangle', 0.05, 0.08); },
  boost: () => { tone(220, 1400, 0.5, 'sawtooth', 0.04); noise(0.5, 0.08); },
  pass: () => { tone(880, 880, 0.08, 'square', 0.05); tone(1320, 1320, 0.16, 'square', 0.05, 0.08); },
  squeeze: () => { noise(0.1, 0.07); tone(140, 70, 0.12, 'triangle', 0.07); },
  close: () => { noise(0.14, 0.16); tone(170, 55, 0.18, 'triangle', 0.13); },
  click: () => tone(600, 500, 0.05, 'square', 0.03),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.18, 'square', 0.05, i * 0.09)),
};

// ---------- state ----------
let st = 'idle';            // idle | wait | dash | win | reset
let step = 0;               // pipes passed this round
let pipes = [];
let roundBet = 0;
const bird = { wx: 0, y: GAP_Y, rot: 0, sq: 1 };
let phase = 0;              // hover phase; frozen during a dash so the bird keeps its height
let cam = 0, anim = null, fx = [], trail = [], smokes = [], lines = [];
let fade = 0, fadeDir = 0, fadeCb = null;
let popup = null, refillT = -9;
let shownCoef = 1, barPos = 0, now = 0, boostK = 0;
const BG_DRIFT = 40;        // constant background scroll, world units per second (scaled by each layer's parallax)
let bgDrift = 0;

const pipeX = i => REST_OFF + i * SPACING;
const restX = k => pipeX(k) - REST_OFF;
const curCoef = () => step > 0 ? STEPS[step - 1] : 1;
const barL = () => W / 2 - BAR_HW, barR = () => W / 2 + BAR_HW;
const dotX = i => barL() + 16 + i * ((barR() - barL() - 64) / (STEPS.length - 2));
const barTarget = () => step === 0 ? barL() + 4 : step < STEPS.length ? dotX(step - 1) : barR() - 22;

function buildWorld() {
  STEPS = [...MODES[mode], MAX_WIN];
  pipes = STEPS.map((c, i) => ({
    x: pipeX(i), coef: c, max: i === STEPS.length - 1, bonus: isBonus(i),
    passT: -1, closedT: -1, closed: false, closeWait: 0,
    act: null, nextAct: now + rnd(0.2, 2),
  }));
  step = 0; anim = null; popup = null; trail = []; fx = []; smokes = []; lines = [];
  bird.wx = restX(0); bird.rot = 0; bird.sq = 1; boostK = 0;
  cam = bird.wx - birdSX(); shownCoef = 1; barPos = barTarget();
}

// ---------- pipe animations ----------
// Two snap animations, no easing: the pipe jumps from static to pressed, holds, and jumps back.
// squeeze ("придавливание") is the common one; near ("почти полное закрывание") is rarer.
const NEAR_CHANCE = 0.25;
const ACTS = {
  squeeze: { to: GAP_SQUEEZE, hold: [0.12, 0.22] },
  near: { to: GAP_NEAR, hold: [0.2, 0.35] },
};
function nextDelay() {
  const r = Math.random();
  return r < 0.35 ? rnd(0.1, 0.3) : r < 0.75 ? rnd(0.6, 1.6) : rnd(2.5, 5);
}

function pipeGap(p) {
  if (p.closed) return 0;
  if (p.act) return p.act.to;
  return GAP_S;
}

function startAct(p) {
  const type = Math.random() < NEAR_CHANCE ? 'near' : 'squeeze', a = ACTS[type];
  p.act = { type, t0: now, hit: false, to: a.to, hold: rnd(a.hold[0], a.hold[1]) };
  p.nextAct = now + p.act.hold + nextDelay();
}

function actHit(p) {
  if (p.act.type === 'squeeze') { sfx.squeeze(); smokeBurst(p, 0.26, 130); }
  else { sfx.close(); smokeBurst(p, 0.32, 170); }
}

// smoke.png flipbook squirting sideways out of both sides of the joint, as before
function smokeBurst(p, s, v) {
  for (const d of [-1, 1]) {
    smokes.push({ x: p.x + d * (PIPE_W / 2 - 4), y: GAP_Y, d, s, vx: d * v, t: 0, life: SMOKE_FRAMES.length / SMOKE_FPS });
  }
}

// ---------- round flow ----------
function play() {
  if (st !== 'idle') return;
  audio();
  if (balance < BETS[0]) { balance = START_BAL(); refillT = now; }
  if (bet > balance + 1e-9) { nudgeBalance(); return; }
  balance -= bet; roundBet = bet; lastBet = bet; rounds++; save();
  st = 'wait'; sfx.click(); updateUI();
  // auto-dash the first pipe so the round starts immediately
  setTimeout(() => { if (st === 'wait' && step === 0) dash(); }, 50);
}

// The bird keeps the height it had when DASH was pressed; the hover range fits inside the static gap,
// and every pipe on the dash path is forced open, so it always gets through.
function dash() {
  if (st !== 'wait' || step >= STEPS.length) return;
  const left = STEPS.length - step;
  let n = 1;
  if (left >= BOOST_MIN && Math.random() < BOOST_CHANCE) n = Math.min(left, BOOST_MIN + ((Math.random() * (BOOST_MAX - BOOST_MIN + 1)) | 0));
  const k0 = step, k1 = step + n - 1;
  for (let k = k0; k <= k1; k++) {
    const p = pipes[k];
    p.act = null; p.locked = true;
  }
  anim = { t: 0, x0: bird.wx, x1: restX(k1 + 1), dur: n === 1 ? DASH_DUR : 0.5 + n * 0.32, boost: n > 1, k0, k1 };
  st = 'dash'; bird.sq = 0.72;
  if (n > 1) sfx.boost(); else sfx.flap();
  updateUI();
}

function withdraw() {
  if (st !== 'wait' || step === 0) return;
  const coef = curCoef(), win = roundBet * coef, max = step === STEPS.length;
  balance += win; save();
  const title = max ? 'MAX WIN' : coef >= 25 ? 'EPIC WIN' : coef >= 10 ? 'MEGA WIN' : coef >= 4 ? 'BIG WIN' : 'YOU WIN';
  popup = { t: 0, coef, win, title, nextSpark: 0 };
  st = 'win'; sfx.win(); updateUI();
  for (let i = 0; i < 40; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(250, 650);
    fx.push({ type: 'spark', screen: true, x: W / 2, y: 480, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200,
      g: 900, drag: 1.5, t: 0, life: rnd(0.9, 1.6), s: rnd(5, 10), c: Math.random() < 0.5 ? '#ffd52e' : '#fff3a0' });
  }
}

function passPipe(k) {
  const p = pipes[k];
  p.passT = now; step = k + 1;
  p.closeWait = Math.random() < 0.5 ? 0 : rnd(0.3, 0.9);
  sfx.pass();
  if (p.bonus || p.max) tone(1760, 1760, 0.2, 'square', 0.04, 0.18);
  updateUI();
}

// passed pipe slams fully shut: smoke.png jets out of both sides of the joint
function closePipe(k) {
  const p = pipes[k];
  p.closed = true; p.closedT = now;
  sfx.close();
  smokeBurst(p, 0.36, 200);
}

function resetRound() {
  if (st === 'reset') return;
  st = 'reset'; fadeDir = 1; updateUI();
  fadeCb = () => { buildWorld(); st = 'idle'; fadeDir = -1; updateUI(); };
}

// ---------- update ----------
function update(dt) {
  now += dt;
  bgDrift += BG_DRIFT * dt;
  const prevY = bird.y;

  if (st === 'dash' && anim) {
    anim.t += dt;
    const u = clamp(anim.t / anim.dur, 0, 1);
    bird.wx = lerp(anim.x0, anim.x1, anim.boost ? easeTrap(u) : easeInOut(u));
    for (let k = anim.k0; k <= anim.k1; k++) if (pipes[k].passT < 0 && bird.wx > pipes[k].x) passPipe(k);
    if (anim.boost) {
      boostK = Math.min(1, boostK + dt * 5);
      if (Math.random() < dt * 40) {
        fx.push({ type: 'spark', x: bird.wx - rnd(10, 60), y: bird.y + rnd(-34, 34), vx: -rnd(60, 160), vy: rnd(-30, 30),
          drag: 2, t: 0, life: rnd(0.3, 0.55), s: rnd(5, 11), c: '#86ecff' });
      }
    } else if (Math.random() < dt * 30) trail.push({ x: bird.wx - 26, y: bird.y + rnd(-6, 6), t: 0 });
    if (u >= 1) {
      anim = null; st = 'wait';
      if (step === STEPS.length) withdraw();
      updateUI();
    }
  } else {
    // hover between the top and bottom positions; during a dash the phase is frozen
    phase += HOVER_W * dt;
  }
  if (!(st === 'dash' && anim && anim.boost)) boostK = Math.max(0, boostK - dt * 3);
  bird.y = GAP_Y - HOVER_A * Math.sin(phase);

  const vy = (bird.y - prevY) / Math.max(dt, 1e-4);
  bird.rot = lerp(bird.rot, clamp(vy / 650, -0.42, 0.4), 1 - Math.exp(-dt * 12));
  bird.sq = lerp(bird.sq, 1, 1 - Math.exp(-dt * 10));

  for (let i = 0; i < pipes.length; i++) {
    const p = pipes[i];
    // idle pipe animations
    if (p.act) {
      const a = p.act;
      if (!a.hit) { a.hit = true; if (Math.abs(p.x - cam - W / 2) < W / 2 + PIPE_W) actHit(p); }
      if (now - a.t0 >= a.hold) p.act = null;
    } else if (!p.locked && p.passT < 0 && now >= p.nextAct) startAct(p);
    // a passed pipe snaps shut once the bird is clear of it, sometimes after a short random wait
    if (p.passT >= 0 && !p.closed && bird.wx > p.x + PIPE_W / 2 + 46 && now >= p.passT + p.closeWait) closePipe(i);
  }

  if (st === 'win' && popup) {
    popup.t += dt;
    popup.nextSpark -= dt;
    if (popup.nextSpark <= 0 && popup.t > 0.3) {
      popup.nextSpark = 0.08;
      fx.push({ type: 'twinkle', screen: true, x: W / 2 + rnd(-130, 130), y: rnd(340, 650), t: 0, life: 0.6, s: rnd(8, 16) });
    }
    if (popup.t > 3.2) resetRound();
  }

  cam = lerp(cam, bird.wx - birdSX(), 1 - Math.exp(-dt * (anim && anim.boost ? 20 : 14)));
  shownCoef = curCoef();
  barPos = lerp(barPos, barTarget(), 1 - Math.exp(-dt * 7));

  // speed lines while boosting
  if (boostK > 0.2 && Math.random() < dt * 70 * boostK) {
    lines.push({ x: W + rnd(0, 200), y: rnd(SKY_TOP + 10, GROUND_Y - 10), w: rnd(60, 220), v: rnd(2200, 3400), t: 0 });
  }
  for (const l of lines) { l.t += dt; l.x -= l.v * dt; }
  lines = lines.filter(l => l.x + l.w > -20);

  for (const f of fx) {
    f.t += dt;
    if (f.drag) { f.vx *= Math.exp(-dt * f.drag); f.vy *= Math.exp(-dt * f.drag); }
    if (f.g) f.vy += f.g * dt;
    f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
  }
  fx = fx.filter(f => f.t < f.life);
  for (const s of smokes) { s.t += dt; s.vx *= Math.exp(-dt * 8); s.x += s.vx * dt; }
  smokes = smokes.filter(s => s.t < s.life);
  for (const t of trail) t.t += dt;
  trail = trail.filter(t => t.t < 0.35);

  if (fadeDir) {
    fade = clamp(fade + fadeDir * dt * 3.2, 0, 1);
    if (fadeDir > 0 && fade >= 1) { fadeDir = 0; const cb = fadeCb; fadeCb = null; cb && cb(); }
    else if (fadeDir < 0 && fade <= 0) fadeDir = 0;
  }
}

// ---------- drawing helpers ----------
function text(s, x, y, size, fill = '#fff', outline = '#4a3a44', align = 'center', ow = 0) {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (outline) {
    const o = ow || Math.max(2, Math.round(size / 10));
    ctx.lineJoin = 'round'; ctx.lineWidth = o * 2; ctx.strokeStyle = outline;
    ctx.strokeText(s, x, y + o * 0.8);
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = fill; ctx.fillText(s, x, y);
}
const measure = (s, size) => { ctx.font = `700 ${size}px ${FONT}`; return ctx.measureText(s).width; };
// coefficients get a thin outline
function coefText(v, x, y, size, fill = '#fff', outline = '#4a3a44') {
  const num = typeof v === 'string' ? v : fmt(v);
  const wn = measure(num, size), wx = measure('x', size * 0.6) + size * 0.08;
  const L = x - (wn + wx) / 2;
  const ow = Math.max(1, Math.round(size / 22));
  text('x', L + wx / 2, y + size * 0.06, size * 0.6, fill, outline, 'center', Math.max(1, Math.round(ow * 0.7)));
  text(num, L + wx + wn / 2, y, size, fill, outline, 'center', ow);
  return wn + wx;
}
function img(im, x, y, w, h, alpha = 1) {
  if (!ok(im)) return false;
  if (h == null) h = w * im.naturalHeight / im.naturalWidth;
  ctx.globalAlpha = alpha; ctx.drawImage(im, x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
  return true;
}
function tile(im, par, y, w) {
  if (!ok(im)) return;
  const h = w * im.naturalHeight / im.naturalWidth;
  let x0 = -(((cam + bgDrift) * par) % w); if (x0 > 0) x0 -= w;
  for (let x = x0; x < W; x += w - 1) ctx.drawImage(im, x, y, w, h);
}

// ---------- pipes ----------
function pipeDraw(p) {
  const x = p.x - cam;
  if (x < -PIPE_W || x > W + PIPE_W) return;
  const g = pipeGap(p) / 2, top = GAP_Y - g, bot = GAP_Y + g;
  const im = IMG.pipe;
  if (ok(im)) {
    const h = PIPE_W * im.naturalHeight / im.naturalWidth;
    ctx.drawImage(im, x - PIPE_W / 2, top - h, PIPE_W, h);
    ctx.save(); ctx.translate(x, bot); ctx.scale(1, -1);
    ctx.drawImage(im, -PIPE_W / 2, -h, PIPE_W, h); ctx.restore();
  } else {
    ctx.fillStyle = '#74c62e';
    ctx.fillRect(x - PIPE_W / 2 + 12, SKY_TOP, PIPE_W - 24, top - SKY_TOP);
    ctx.fillRect(x - PIPE_W / 2 + 12, bot, PIPE_W - 24, GROUND_Y - bot);
  }
}

// coefficients are static: no scaling, bobbing or wings
function pipeLabel(p, i) {
  const x = p.x - cam, y = GAP_Y;
  if (x < -240 || x > W + 240) return;
  if (p.closed) {
    const t = now - p.closedT, s = t < 0.35 ? backOut(clamp(t / 0.35, 0, 1)) : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    img(IMG.check, 0, 0, 104);
    ctx.restore();
    if (t < 0.7) img(IMG.checkB, x + 60, y - 10, 50, null, 1 - t / 0.7);
    return;
  }
  const a = p.passT >= 0 ? 1 - clamp((now - p.passT) / 0.2, 0, 1) : 1;
  if (a <= 0) return;
  ctx.globalAlpha = a;
  if (p.max) {
    if (!img(IMG.trophyIcon, x, y - 14, 84)) img(IMG.trophy, x, y - 14, 84);
    text('MAXWIN', x, y + 44, 22, '#ffd23f', '#5a2a00');
  } else {
    coefText(p.coef, x, y, 50, '#ffffff');
  }
  ctx.globalAlpha = 1;
}

function birdDraw() {
  const x = bird.wx - cam, y = bird.y;
  for (const t of trail) {
    const a = 1 - t.t / 0.35;
    ctx.fillStyle = `rgba(200,240,255,${a * 0.45})`;
    ctx.fillRect(t.x - cam - 60 * (1 - a), t.y - 9, 50 * a + 10, 18);
  }
  if (st === 'dash') {
    const len = 150 + boostK * 170;
    const g = ctx.createLinearGradient(x - len, 0, x - 20, 0);
    g.addColorStop(0, 'rgba(190,240,255,0)'); g.addColorStop(1, `rgba(190,240,255,${0.5 + boostK * 0.3})`);
    ctx.fillStyle = g; ctx.fillRect(x - len, y - 32, len - 20, 64);
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(bird.rot);
  ctx.scale(1 / Math.sqrt(bird.sq), bird.sq);
  if (boostK > 0) {
    // light-blue glow outline while boosting
    ctx.globalAlpha = boostK * 0.85;
    for (const [ox, oy] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      ctx.save(); ctx.translate(ox, oy); ctx.filter = 'brightness(0) invert(0.85) sepia(1) hue-rotate(150deg) saturate(4)';
      img(IMG.bird, 0, 0, BIRD_W); ctx.restore();
    }
    ctx.filter = 'none'; ctx.globalAlpha = 1;
  }
  if (!img(IMG.bird, 0, 0, BIRD_W)) { ctx.fillStyle = '#ffd23a'; ctx.fillRect(-40, -30, 80, 60); }
  ctx.restore();
}

function smokeDraw() {
  if (!smokeMode) return;
  for (const s of smokes) {
    const f = Math.min(SMOKE_FRAMES.length - 1, Math.floor(s.t * SMOKE_FPS));
    const [sx, sy, sw, sh] = SMOKE_FRAMES[f], w = Math.round(sw * s.s), h = Math.round(sh * s.s);
    // frames are upright; turn them so the base sits on the joint and the jet points away from the pipe
    ctx.save(); ctx.translate(Math.round(s.x - cam), Math.round(s.y)); ctx.rotate(s.d * Math.PI / 2);
    if (s.d < 0) ctx.scale(-1, 1);
    if (smokeMode === 'svg') ctx.filter = 'url(#smokeKey)';
    ctx.drawImage(smokeSheet, sx, sy, sw, sh, -Math.round(w / 2), -h, w, h);
    ctx.restore();
  }
}

function fxDraw() {
  for (const f of fx) {
    const u = f.t / f.life, a = 1 - u;
    const x = f.screen ? f.x : f.x - cam, y = f.y;
    if (f.type === 'spark') {
      ctx.fillStyle = f.c; ctx.globalAlpha = a;
      ctx.fillRect(x - f.s / 2, y - f.s / 2, f.s, f.s); ctx.globalAlpha = 1;
    } else if (f.type === 'twinkle') {
      const s = f.s * Math.sin(u * Math.PI);
      ctx.fillStyle = '#fff6b0';
      ctx.fillRect(x - s / 2, y - 2, s, 4); ctx.fillRect(x - 2, y - s / 2, 4, s);
    }
  }
}

function speedDraw() {
  if (!lines.length && boostK <= 0) return;
  if (boostK > 0) {
    const g = ctx.createLinearGradient(0, SKY_TOP, 0, GROUND_Y);
    g.addColorStop(0, `rgba(120,225,255,${boostK * 0.22})`);
    g.addColorStop(0.5, 'rgba(120,225,255,0)');
    g.addColorStop(1, `rgba(120,225,255,${boostK * 0.22})`);
    ctx.fillStyle = g; ctx.fillRect(0, SKY_TOP, W, GROUND_Y - SKY_TOP);
  }
  ctx.fillStyle = `rgba(255,255,255,${0.75 * Math.max(boostK, 0.3)})`;
  for (const l of lines) ctx.fillRect(Math.round(l.x), Math.round(l.y), l.w, 3);
}

function edgeStrip(y, down) {
  ctx.fillStyle = '#a7d65a'; ctx.fillRect(0, y - 6, W, 12);
  ctx.fillStyle = '#5d8f2c'; ctx.fillRect(0, down ? y + 6 : y - 9, W, 3);
  const off = Math.floor(-(cam % 24)) - 24;
  ctx.fillStyle = '#3f4a2a';
  for (let x = off; x < W + 24; x += 24) {
    if (down) { ctx.fillRect(x, y - 6, 12, 3); ctx.fillRect(x + 12, y - 3, 12, 3); }
    else { ctx.fillRect(x, y + 3, 12, 3); ctx.fillRect(x + 12, y, 12, 3); }
  }
}

// rounded rectangle traced in `px`-sized rows: smooth outline, still visibly pixel-stepped
function pxRound(x, y, w, h, r, px) {
  const n = Math.min(Math.ceil(r / px), Math.floor(h / (2 * px)));
  for (let i = 0; i < n; i++) {
    const yc = r - (i * px + px / 2);
    const ins = Math.round((r - Math.sqrt(Math.max(0, r * r - yc * yc))) / px) * px;
    ctx.fillRect(x + ins, y + i * px, w - ins * 2, px);
    ctx.fillRect(x + ins, y + h - (i + 1) * px, w - ins * 2, px);
  }
  ctx.fillRect(x, y + n * px, w, h - n * px * 2);
}
const pxDot = (cx, cy, d) => pxRound(cx - d / 2, cy - d / 2, d, d, d / 2, 2);

function maxWinBadge(cx, y) {
  text('MAXWIN', cx, y, 15, '#ffd23f', '#5a2a00', 'center', 3);
  const v = fmt(MAX_WIN), wv = measure(v, 19), wx = measure('x', 15) + 4;
  const L = cx - (wv + wx) / 2, vy = y + 25;
  text('x', L + wx / 2, vy + 1, 15, '#ffd23f', '#5a2a00', 'center', 3);
  text(v, L + wx + wv / 2, vy, 19, '#ffd23f', '#5a2a00', 'center', 3);
}

function hud() {
  const L = barL(), Rr = barR(), by = BAR_Y;
  // pixel-rounded track like дорожка.png
  const bl = Math.round(L), bw = Math.round(Rr - L);
  ctx.fillStyle = '#3a2a34'; pxRound(bl - 4, by - 15, bw + 8, 30, 12, 2);
  ctx.fillStyle = '#fbfaf2'; pxRound(bl, by - 11, bw, 22, 9, 2);
  for (let i = 0; i < STEPS.length - 1; i++) {
    const dx = Math.round(dotX(i)), done = i < step, bonus = pipes[i] && pipes[i].bonus;
    if (done) { ctx.fillStyle = '#5cc22e'; pxDot(dx, by, 12); }
    else if (bonus) {
      ctx.fillStyle = '#3a2a34'; pxDot(dx, by, 12);
      ctx.fillStyle = '#fbfaf2'; pxDot(dx, by, 6);
    } else { ctx.fillStyle = '#3a2a34'; pxDot(dx, by, 10); }
    if (bonus && !done) coefText(STEPS[i], dx, by + 34, 16, '#ffffff');
  }
  if (!img(IMG.trophyIcon, Rr - 20, by - 6, 50)) img(IMG.trophy, Rr - 20, by - 6, 50);
  if (step > 0 || st !== 'idle') img(IMG.bird, barPos, by - 2, 46);
  maxWinBadge(Rr - 34, by + 30);
  if (step > 0 && st !== 'win') coefText(shownCoef, W / 2, by + 104, W < 800 ? 64 : 76, '#ffffff');
}

function trophyWing(x, y, dir, flap) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.rotate(flap);
  ctx.fillStyle = '#7a3d06'; ctx.fillRect(-2, -14, 40, 30);
  ctx.fillStyle = '#ffd23a';
  ctx.fillRect(0, -12, 30, 8); ctx.fillRect(4, -4, 30, 8); ctx.fillRect(8, 4, 24, 8);
  ctx.fillStyle = '#ffb21f'; ctx.fillRect(0, -4, 6, 16);
  ctx.restore();
}

function popupDraw() {
  if (!popup) return;
  const t = popup.t;
  ctx.fillStyle = `rgba(10,30,40,${clamp(t / 0.25, 0, 1) * 0.45})`;
  ctx.fillRect(0, SKY_TOP, W, GROUND_Y - SKY_TOP);
  const s = t < 0.45 ? backOut(clamp(t / 0.45, 0, 1)) : 1;
  const bw = 296, bh = 310;
  ctx.save(); ctx.translate(W / 2, 520); ctx.scale(s, s);
  ctx.save(); ctx.rotate(now * 0.5); ctx.globalAlpha = 0.18 * clamp(t * 3, 0, 1);
  ctx.fillStyle = '#ffe680';
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -260); ctx.lineTo(30, -260); ctx.fill(); }
  ctx.restore(); ctx.globalAlpha = 1;
  if (!img(IMG.board, 0, 0, bw, bh)) { ctx.fillStyle = '#a0572a'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh); }
  ctx.fillStyle = 'rgba(255,190,120,0.25)'; ctx.beginPath(); ctx.arc(0, -40, 50, 0, 7); ctx.fill();
  const fl = Math.sin(now * 10) * 0.25;
  trophyWing(-36, -40, -1, fl); trophyWing(36, -40, 1, fl);
  const ts = 1 + Math.sin(now * 4) * 0.05;
  ctx.save(); ctx.translate(0, -42); ctx.scale(ts, ts);
  if (!img(IMG.trophyIcon, 0, 0, 70)) img(IMG.trophy, 0, 0, 70);
  ctx.restore();
  text(popup.title, 0, -bh / 2 + 8, 46, '#ffffff', '#4a2a14', 'center', 5);
  if (!img(IMG.chipB, 0, 78, 250, 96)) { ctx.fillStyle = '#7a3f1c'; ctx.fillRect(-125, 30, 250, 96); }
  const shown = popup.win * easeOut(clamp((t - 0.3) / 0.9, 0, 1));
  text(fmtK(shown), 0, 52, 44, '#ffd23f', '#5a2a00', 'center', 4);
  text(CUR().code, 0, 84, 16, '#e8c98a', '#5a2a00');
  text('X ' + fmt(popup.coef), 0, 108, 19, '#5cf04a', '#1d4a12');
  ctx.restore();
}

function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#d9cf96'; ctx.fillRect(0, 0, W, H);
  const hg = ctx.createLinearGradient(0, 0, 0, SKY_TOP);
  hg.addColorStop(0, '#c4b274'); hg.addColorStop(1, '#ddd29a');
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, SKY_TOP);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, SKY_TOP, W, GROUND_Y - SKY_TOP); ctx.clip();
  ctx.fillStyle = '#4ec0ca'; ctx.fillRect(0, SKY_TOP, W, GROUND_Y - SKY_TOP);
  tile(IMG.hills, 0.12, 540, 1024);
  tile(IMG.city, 0.25, 596, 760);
  ctx.fillStyle = '#6fcd7e'; ctx.fillRect(0, 850, W, GROUND_Y - 850);
  tile(IMG.grass, 0.45, 770, 1100);
  for (const p of pipes) pipeDraw(p);
  smokeDraw();
  pipes.forEach(pipeLabel);
  speedDraw();
  birdDraw();
  fxDraw();
  hud();
  popupDraw();
  ctx.restore();

  edgeStrip(SKY_TOP, true);
  edgeStrip(GROUND_Y, false);
  if (now - refillT < 2.5) {
    ctx.globalAlpha = clamp(2.5 - (now - refillT), 0, 1);
    text('DEMO BALANCE REFILLED', W / 2, 300, 22, '#ffffff', '#3a3a4a');
    ctx.globalAlpha = 1;
  }
  if (fade > 0) { ctx.fillStyle = `rgba(20,34,40,${fade})`; ctx.fillRect(0, SKY_TOP, W, GROUND_Y - SKY_TOP); }
}

// ---------- UI ----------
const SPK_ON = '<svg viewBox="0 0 14 14" shape-rendering="crispEdges" fill="#3a3a3a"><path d="M1 5h3V4h1V3h1V2h1v10H6v-1H5v-1H4V9H1z"/><path d="M9 5h1v4H9zM11 3h1v1h1v6h-1v1h-1v-2h1V5h-1z"/></svg>';
const SPK_OFF = '<svg viewBox="0 0 14 14" shape-rendering="crispEdges" fill="#3a3a3a"><path d="M1 5h3V4h1V3h1V2h1v10H6v-1H5v-1H4V9H1z"/><path d="M9 5h1v1h1V5h1v1h1v1h-1v1h1v1h-1v1h-1V9h-1v1H9V9h1V8h1V7h-1V6H9z"/></svg>';

function updateUI() {
  const inRound = st === 'wait' || st === 'dash' || st === 'win';
  ui.idle.classList.toggle('hidden', inRound);
  ui.round.classList.toggle('hidden', !inRound);
  const lock = st !== 'idle';
  ui.play.disabled = lock;
  ui.minus.disabled = lock || bet <= BETS[0] + 1e-9;
  ui.plus.disabled = lock || bet >= MAX_BET - 1e-9;
  ui.easy.classList.toggle('on', mode === 'easy');
  ui.hard.classList.toggle('on', mode === 'hard');
  ui.easySteps.textContent = (EASY.length + 1) + ' STEPS';
  ui.hardSteps.textContent = (HARD.length + 1) + ' STEPS';
  ui.dash.disabled = st !== 'wait' || step >= STEPS.length;
  ui.wd.disabled = st !== 'wait' || step === 0;
  ui.wdVal.textContent = fmtWd((inRound ? roundBet : bet) * curCoef());
  ui.bet.textContent = fmtBet(bet);
  ui.bal.textContent = fmtBal(balance);
  ui.syms.forEach(e => { e.textContent = CUR().sym; });
  ui.codes.forEach(e => { e.textContent = CUR().code; });
  ui.chips.forEach(c => { c.textContent = fmtBet(+c.dataset.v * CUR().mul); });
  ui.hand.classList.toggle('show', st === 'wait' && step === 0 && rounds <= 3);
  ui.mute.innerHTML = muted ? SPK_OFF : SPK_ON;
}
function nudgeBalance() {
  ui.wallet.animate([{ color: '#ff5a3c', transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }],
    { duration: 300, iterations: 2 });
}
function setBetValue(v) {
  if (st !== 'idle') return;
  bet = clamp(Math.round(v * 100) / 100, BETS[0], MAX_BET);
  sfx.click(); save(); updateUI();
}
function stepBet(d) {
  if (d > 0) setBetValue(BETS.find(b => b > bet + 1e-9) ?? MAX_BET);
  else setBetValue([...BETS].reverse().find(b => b < bet - 1e-9) ?? BETS[0]);
}
function setMode(m) {
  if (st !== 'idle' || mode === m) return;
  mode = m; localStorage.setItem('tappy_mode', m);
  sfx.click(); buildWorld(); updateUI();
}

const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); if (!el.disabled) fn(); });
tap(ui.play, play);
tap(ui.repeat, () => { setBetValue(lastBet); play(); });
tap(ui.dash, dash);
tap(ui.wd, withdraw);
tap(ui.minus, () => stepBet(-1));
tap(ui.plus, () => stepBet(1));
tap(ui.easy, () => setMode('easy'));
tap(ui.hard, () => setMode('hard'));
ui.chips.forEach(c => tap(c, () => setBetValue(+c.dataset.v * CUR().mul)));
tap(ui.mute, () => { muted = !muted; localStorage.setItem('tappy_mute', muted ? '1' : '0'); updateUI(); });
cv.addEventListener('pointerdown', () => { if (st === 'wait') dash(); else if (st === 'win' && popup && popup.t > 0.8) resetRound(); });

// ---------- balance & currency menu ----------
let wmCurIdx = curIdx;
function renderCurGrid() {
  ui.wmCur.innerHTML = '';
  CURRENCIES.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'px sm' + (i === wmCurIdx ? ' on' : '');
    b.innerHTML = `<b>${c.sym}</b><small>${c.code}</small>`;
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (i === wmCurIdx) return;
      // rescale the typed amount so switching currency keeps a sensible number
      const v = parseFloat(ui.wmInput.value);
      if (isFinite(v)) ui.wmInput.value = String(Math.round(v / CURRENCIES[wmCurIdx].mul * c.mul * 100) / 100);
      wmCurIdx = i; sfx.click(); renderCurGrid(); syncWmSym();
    });
    ui.wmCur.appendChild(b);
  });
}
function syncWmSym() {
  ui.wm.querySelector('.wm-sym').textContent = CURRENCIES[wmCurIdx].sym;
  ui.wmPresets.forEach(p => { p.textContent = fmtBal(+p.dataset.v * CURRENCIES[wmCurIdx].mul).replace(/\.00$/, ''); });
}
function openWallet() {
  wmCurIdx = curIdx;
  ui.wmInput.value = String(Math.round(balance * 100) / 100);
  const locked = st !== 'idle';
  ui.wmNote.classList.toggle('hidden', !locked);
  ui.wmApply.disabled = locked;
  renderCurGrid(); syncWmSym();
  ui.wm.classList.remove('hidden');
  sfx.click();
}
function closeWallet() { ui.wm.classList.add('hidden'); }
function applyWallet() {
  if (st !== 'idle') return;
  const v = parseFloat(String(ui.wmInput.value).replace(',', '.'));
  if (!(v >= 0) || !isFinite(v)) { ui.wmInput.focus(); return; }
  const prevMul = CUR().mul;
  curIdx = wmCurIdx; setBets();
  localStorage.setItem('tappy_cur', CUR().code);
  balance = Math.min(Math.round(v * 100) / 100, 1e12);
  bet = clamp(Math.round(bet / prevMul * CUR().mul * 100) / 100, BETS[0], MAX_BET);
  lastBet = bet;
  save(); updateUI(); closeWallet(); sfx.click();
}
ui.wallet.addEventListener('click', openWallet);
ui.wallet.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWallet(); } });
tap(ui.wmClose, closeWallet);
tap(ui.wmApply, applyWallet);
ui.wmPresets.forEach(p => tap(p, () => { ui.wmInput.value = String(+p.dataset.v * CURRENCIES[wmCurIdx].mul); sfx.click(); }));
ui.wm.addEventListener('pointerdown', e => { if (e.target === ui.wm) closeWallet(); });
ui.wmInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') applyWallet(); if (e.key === 'Escape') closeWallet(); });

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (!ui.wm.classList.contains('hidden')) { if (e.key === 'Escape') closeWallet(); return; }
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); st === 'idle' ? play() : dash(); }
  else if (e.code === 'Enter') { e.preventDefault(); st === 'idle' ? play() : withdraw(); }
  else if (e.code === 'ArrowLeft' || e.code === 'Minus') stepBet(-1);
  else if (e.code === 'ArrowRight' || e.code === 'Equal') stepBet(1);
});
addEventListener('resize', () => { barPos = barTarget(); });

// ---------- loop ----------
buildWorld(); updateUI();
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  update(dt); render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
