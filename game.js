const cv  = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 680, H = 340, T = 32;

let gs = 'menu', score = 0, coins = 0, lives = 3, level = 1;
let cam = { x: 0 };
let keys = {}, tL = false, tR = false, tJ = false;
let raf, particles = [], tick = 0;
let player, world;

/* ─── HUD ─────────────────────────────────────────── */
function updateHUD() {
  document.getElementById('sv').textContent  = score;
  document.getElementById('cv').textContent  = coins;
  document.getElementById('lv').textContent  = lives;
  document.getElementById('lev').textContent = level;
}

/* ─── WORLD GENERATION ────────────────────────────── */
const LAYOUTS = [
  [
    {x:0,y:9,w:12},{x:13,y:9,w:6},{x:20,y:7,w:5},{x:26,y:9,w:5},
    {x:32,y:7,w:4},{x:37,y:5,w:4},{x:42,y:7,w:6},{x:49,y:9,w:6},
    {x:56,y:7,w:4},{x:61,y:5,w:5},{x:67,y:8,w:8}
  ],
  [
    {x:0,y:9,w:10},{x:11,y:8,w:4},{x:16,y:6,w:4},{x:21,y:8,w:5},
    {x:27,y:9,w:4},{x:32,y:7,w:3},{x:36,y:5,w:4},{x:41,y:7,w:4},
    {x:46,y:9,w:5},{x:52,y:7,w:4},{x:57,y:5,w:4},{x:62,y:7,w:5},
    {x:68,y:9,w:8}
  ],
  [
    {x:0,y:9,w:8},{x:9,y:7,w:4},{x:14,y:5,w:3},{x:18,y:7,w:4},
    {x:23,y:9,w:3},{x:27,y:7,w:3},{x:31,y:5,w:3},{x:35,y:7,w:4},
    {x:40,y:9,w:5},{x:46,y:7,w:3},{x:50,y:5,w:3},{x:54,y:7,w:4},
    {x:59,y:9,w:6},{x:66,y:7,w:5},{x:72,y:9,w:8}
  ]
];

const PLAT_COLORS = [
  '#3d5a80','#2e7d32','#6a1e77','#b5451b','#1565c0',
  '#4a148c','#1b5e20','#7b1fa2','#0d47a1','#e65100','#00695c'
];

function makeWorld(n) {
  const layout = LAYOUTS[Math.min(n - 1, 2)];
  const plats  = layout.map((p, i) => ({ ...p, col: PLAT_COLORS[i % PLAT_COLORS.length] }));
  const worldW = (plats[plats.length - 1].x + plats[plats.length - 1].w + 4) * T;

  const coinsList = [];
  plats.forEach(p => {
    for (let i = 1; i < p.w - 1; i += 2) {
      if (Math.random() > 0.25)
        coinsList.push({ x: (p.x + i) * T + 16, y: p.y * T - T * 0.7, col: false });
    }
  });

  const enemies = [];
  plats.slice(1, -1).forEach((p, i) => {
    if (p.w >= 3 && Math.random() > 0.35) {
      enemies.push({
        x: (p.x + 1) * T, y: p.y * T - 26,
        w: 22, h: 22,
        vx: (i % 2 ? 1 : -1) * (0.7 + n * 0.15),
        pMin: p.x * T, pMax: (p.x + p.w - 1) * T,
        alive: true, stomped: false, stompT: 0, col: p.col
      });
    }
  });

  const lastP  = plats[plats.length - 1];
  const flagX  = (lastP.x + Math.floor(lastP.w / 2)) * T;
  return { plats, coins: coinsList, enemies, worldW, flagX };
}

/* ─── PLAYER ──────────────────────────────────────── */
function initPlayer() {
  player = {
    x: 40, y: 200, w: 20, h: 26,
    vx: 0, vy: 0,
    onGround: false, facing: 1,
    jumpBuf: 0, coyote: 0, inv: 0,
    frame: 0, frameT: 0
  };
}

/* ─── PARTICLES ───────────────────────────────────── */
function spawnP(x, y, col, n = 10) {
  for (let i = 0; i < n; i++) {
    const a  = Math.PI * 2 * i / n + Math.random() * 0.4;
    const sp = 2 + Math.random() * 3.5;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1.5,
      life: 1,
      decay: 0.035 + Math.random() * 0.03,
      col,
      sz: 3 + Math.random() * 3
    });
  }
}

/* ─── COLLISION ───────────────────────────────────── */
function colRect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/* ─── DEATH ───────────────────────────────────────── */
function die() {
  lives--;
  updateHUD();
  spawnP(player.x + 10, player.y + 13, '#e74c3c', 18);

  if (lives <= 0) {
    gs = 'over';
    const ov = document.getElementById('ov');
    ov.style.display = 'flex';
    ov.innerHTML = `
      <h2 style="color:#e74c3c;">GAME OVER</h2>
      <p class="sub">Score: <b style="color:#e8c46a;">${score}</b> — Level ${level}</p>
      <button id="sb" onclick="startGame()">RETRY</button>
    `;
    return;
  }

  initPlayer();
  cam.x = 0;
  player.inv = 90;
}

/* ─── GAME START ──────────────────────────────────── */
function startGame() {
  document.getElementById('ov').style.display = 'none';
  cv.style.display = 'block';
  gs = 'playing';
  score = 0; coins = 0; lives = 3; level = 1;
  cam.x = 0; particles = []; tick = 0;
  initPlayer();
  world = makeWorld(level);
  updateHUD();
  if (raf) cancelAnimationFrame(raf);
  loop();
}

/* ─── UPDATE ──────────────────────────────────────── */
function update() {
  if (gs !== 'playing') return;
  tick++;

  const L = keys['ArrowLeft']  || keys['a'] || tL;
  const R = keys['ArrowRight'] || keys['d'] || tR;
  const J = keys['ArrowUp']    || keys[' '] || keys['z'] || tJ;

  player.frameT++;
  if (player.frameT > 7) { player.frame = (player.frame + 1) % 4; player.frameT = 0; }

  player.jumpBuf = Math.max(0, player.jumpBuf - 1);
  player.coyote  = Math.max(0, player.coyote  - 1);
  if (player.inv > 0) player.inv--;
  if (J) player.jumpBuf = 8;

  const accel = 0.48, fric = 0.80, maxSpd = 3.2;
  if (L) { player.vx -= accel; player.facing = -1; }
  if (R) { player.vx += accel; player.facing =  1; }
  if (!L && !R) player.vx *= fric;
  player.vx = Math.max(-maxSpd, Math.min(maxSpd, player.vx));

  if (player.jumpBuf > 0 && (player.onGround || player.coyote > 0)) {
    player.vy      = -9.2;
    player.jumpBuf = 0;
    player.coyote  = 0;
    spawnP(player.x + 10, player.y + 26, '#5dade2', 5);
  }

  player.vy  = Math.min(player.vy + 0.42, 13);
  player.x  += player.vx;
  player.y  += player.vy;

  /* Platform collision */
  player.onGround = false;
  world.plats.forEach(p => {
    const px = p.x * T, py = p.y * T, pw = p.w * T, ph = T * 2;
    if (!colRect(player.x, player.y, player.w, player.h, px, py, pw, ph)) return;

    const ol = (player.x + player.w) - px;
    const or_ = (px + pw) - player.x;
    const ot = (player.y + player.h) - py;
    const ob = (py + ph) - player.y;
    const mx = Math.min(ol, or_);
    const my = Math.min(ot, ob);

    if (my < mx) {
      if (ot < ob) {
        player.y = py - player.h;
        if (player.vy >= 0) { player.vy = 0; player.onGround = true; player.coyote = 6; }
      } else {
        player.y = py + ph;
        if (player.vy < 0) player.vy = 0;
      }
    } else {
      if (ol < or_) { player.x = px - player.w;  player.vx = 0; }
      else          { player.x = px + pw;         player.vx = 0; }
    }
  });

  /* World bounds */
  if (player.x < 0)                        { player.x = 0;                        player.vx = 0; }
  if (player.x + player.w > world.worldW)  { player.x = world.worldW - player.w;  player.vx = 0; }
  if (player.y > H + 80) { die(); return; }

  /* Coin pickup */
  world.coins.forEach(c => {
    if (c.col) return;
    if (Math.abs(player.x + 10 - c.x) < 18 && Math.abs(player.y + 13 - c.y) < 18) {
      c.col = true; coins++; score += 50;
      spawnP(c.x, c.y, '#e8c46a', 8);
      updateHUD();
    }
  });

  /* Enemy interaction */
  world.enemies.forEach(e => {
    if (!e.alive) return;
    if (e.stomped) { e.stompT++; if (e.stompT > 25) e.alive = false; return; }

    e.x += e.vx;
    if (e.x <= e.pMin || e.x + e.w >= e.pMax) e.vx *= -1;

    if (player.inv === 0 && colRect(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
      if (player.vy > 0 && (player.y + player.h) < (e.y + 14)) {
        e.stomped  = true;
        player.vy  = -6.5;
        score     += 100;
        spawnP(e.x + 11, e.y, '#e74c3c', 12);
        updateHUD();
      } else {
        die(); return;
      }
    }
  });

  /* Flag / level complete */
  if (Math.abs((player.x + 10) - world.flagX) < 30 && player.y < H - 10) {
    score += 500;
    level++;
    spawnP(W / 2 + cam.x, H / 2, '#e8c46a', 25);
    cam.x = 0;
    initPlayer();
    world = makeWorld(level);
    updateHUD();
    return;
  }

  /* Camera */
  cam.x = Math.max(0, Math.min(player.x - W * 0.32, world.worldW - W));

  /* Particles */
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.18;
    p.life -= p.decay;
  });
}

/* ─── DRAW ────────────────────────────────────────── */
function drawBG() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  /* Silhouette buildings */
  for (let i = 0; i < 7; i++) {
    const x  = ((i * 120 - cam.x * 0.1 + tick * 0.15) % (W + 80)) - 40;
    const bh = 20 + i * 8;
    const bw = 30 + i * 10;
    ctx.fillStyle = '#1e1e38';
    ctx.fillRect(x, H - bh - 20, bw, bh);
  }

  /* Stars */
  const starSeed = [83,197,312,445,558,671,789,902,1015,1128,1241,1354,1467];
  starSeed.forEach((s, i) => {
    const sx = ((s * 17 + tick * 0.05) % (W + 100)) - 50;
    const sy = (s * 13) % 120 + 10;
    const br = Math.sin(tick * 0.04 + i) * 0.3 + 0.7;
    ctx.globalAlpha = br * 0.6;
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + i % 2 * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawGround() {
  for (let x = 0; x < world.worldW; x += T) {
    const sx = x - cam.x;
    if (sx < -T || sx > W + T) continue;
    ctx.fillStyle = '#2e7d32'; ctx.fillRect(sx, H - 20, T, 20);
    ctx.fillStyle = '#388e3c'; ctx.fillRect(sx, H - 20, T,  5);
    ctx.fillStyle = '#1b5e20'; ctx.fillRect(sx + 1, H - 15, T - 2, 15);
  }
}

function drawPlats() {
  world.plats.forEach(p => {
    const px = p.x * T - cam.x, py = p.y * T, pw = p.w * T;
    if (px + pw < 0 || px > W) return;

    ctx.fillStyle = p.col;
    ctx.fillRect(px, py, pw, T * 2);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(px, py, pw, 5);

    for (let i = 0; i < p.w; i++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(px + i * T, py,     T, T);
      ctx.strokeRect(px + i * T, py + T, T, T);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(px, py, pw, T * 2);
  });
}

function drawCoins() {
  world.coins.forEach(c => {
    if (c.col) return;
    const cx = c.x - cam.x;
    if (cx < -20 || cx > W + 20) return;

    const bob = Math.sin(tick * 0.08 + c.x * 0.05) * 3;
    ctx.fillStyle = '#e8c46a';
    ctx.beginPath(); ctx.arc(cx, c.y + bob, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5e08a';
    ctx.beginPath(); ctx.arc(cx - 2, c.y + bob - 1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, c.y + bob, 7, 0, Math.PI * 2); ctx.stroke();
  });
}

function drawEnemies() {
  world.enemies.forEach(e => {
    if (!e.alive) return;
    const ex = e.x - cam.x;
    if (ex < -30 || ex > W + 30) return;

    if (e.stomped) {
      ctx.globalAlpha = Math.max(0, 1 - e.stompT / 25);
      ctx.fillStyle   = e.col;
      ctx.fillRect(ex, e.y + e.h - 6, e.w, 6);
      ctx.globalAlpha = 1;
      return;
    }

    ctx.fillStyle = e.col;
    ctx.fillRect(ex, e.y, e.w, e.h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(ex, e.y, e.w, 4);

    const eyeDir = e.vx > 0 ? 1 : -1;
    const eyeX   = ex + e.w * 0.5 + eyeDir * 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(eyeX, e.y + 7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath(); ctx.arc(eyeX + eyeDir, e.y + 7, 2, 0, Math.PI * 2); ctx.fill();

    const lb = Math.sin(tick * 0.18 + e.x * 0.1) * 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(ex + 5,       e.y + e.h); ctx.lineTo(ex + 3,       e.y + e.h + lb + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + e.w - 5, e.y + e.h); ctx.lineTo(ex + e.w - 3, e.y + e.h - lb + 4); ctx.stroke();
  });
}

function drawPlayer() {
  if (player.inv > 0 && Math.floor(player.inv / 4) % 2 === 0) return;

  const px = player.x - cam.x, py = player.y;
  ctx.save();
  if (player.facing < 0) {
    ctx.translate(px + player.w, 0);
    ctx.scale(-1, 1);
    ctx.translate(-px, 0);
  }

  /* Hat */
  ctx.fillStyle = '#e74c3c'; ctx.fillRect(px,     py,      player.w,     12);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(px + 1, py + 1,  player.w - 2,  5);
  /* Body */
  ctx.fillStyle = '#f39c12'; ctx.fillRect(px + 2, py + 12, player.w - 4, 14);
  ctx.fillStyle = '#e67e22'; ctx.fillRect(px + 2, py + 13, player.w - 4,  5);
  /* Face */
  ctx.fillStyle = '#fde3a7'; ctx.fillRect(px + player.w - 8, py + 3, 5, 6);
  ctx.fillStyle = '#222222'; ctx.fillRect(px + player.w - 6, py + 5, 2, 2);
  /* Legs */
  const lb = player.onGround ? Math.sin(tick * 0.22) * 2.5 : 0;
  ctx.fillStyle = '#27ae60';
  ctx.fillRect(px + 1,             py + 26, 7, lb > 0 ? 4 + lb : 4);
  ctx.fillRect(px + player.w - 8,  py + 26, 7, lb > 0 ? 4 - lb : 4);

  ctx.restore();
}

function drawFlag() {
  const fx = world.flagX - cam.x;
  if (fx < -20 || fx > W + 20) return;

  ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(fx, H - 22); ctx.lineTo(fx, H - 130); ctx.stroke();

  const wave = Math.sin(tick * 0.1) * 3;
  ctx.fillStyle = '#e74c3c';
  ctx.beginPath();
  ctx.moveTo(fx, H - 130);
  ctx.lineTo(fx + 26 + wave, H - 118);
  ctx.lineTo(fx, H - 106);
  ctx.fill();

  ctx.fillStyle = '#e8c46a';
  ctx.beginPath(); ctx.arc(fx, H - 133, 5, 0, Math.PI * 2); ctx.fill();
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle   = p.col;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y, p.sz * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawProgressBar() {
  const prog = Math.max(0, Math.min(1, player.x / (world.worldW - W)));
  const bw = 160, bh = 5, bx = W / 2 - bw / 2, by = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#e8c46a';          ctx.fillRect(bx, by, bw * prog, bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawBG();
  drawGround();
  drawPlats();
  drawFlag();
  drawCoins();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawProgressBar();
}

/* ─── LOOP ────────────────────────────────────────── */
function loop() {
  raf = requestAnimationFrame(loop);
  update();
  render();
}

/* ─── INPUT ───────────────────────────────────────── */
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
    e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

function setupBtn(id, press, release) {
  const b  = document.getElementById(id);
  const s  = e => { e.preventDefault(); press(); };
  const en = e => { e.preventDefault(); if (release) release(); };
  b.addEventListener('touchstart',  s,  { passive: false });
  b.addEventListener('touchend',    en, { passive: false });
  b.addEventListener('mousedown',   s);
  b.addEventListener('mouseup',     en);
  b.addEventListener('mouseleave',  en);
}

setupBtn('bL', () => tL = true,  () => tL = false);
setupBtn('bR', () => tR = true,  () => tR = false);
setupBtn('bJ', () => { tJ = true; setTimeout(() => tJ = false, 160); }, null);

/* Hide canvas until game starts */
cv.style.display = 'none';