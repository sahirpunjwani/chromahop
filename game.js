const cv  = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 680, H = 340, T = 32;

let gs = 'menu', score = 0, coins = 0, lives = 3, level = 1;
let hp = 100, maxHp = 100;
let cam = { x: 0 };
let keys = {}, tL = false, tR = false, tJ = false;
let raf, particles = [], tick = 0;
let player, world;

/* ── HUD ───────────────────────────────────────────── */
function updateHUD() {
  document.getElementById('sv').textContent  = score;
  document.getElementById('cv').textContent  = coins;
  document.getElementById('lv').textContent  = lives;
  document.getElementById('lev').textContent = level;
  const pct = Math.max(0, hp / maxHp);
  const fill = document.getElementById('hpFill');
  fill.style.width = (pct * 100) + '%';
  fill.style.background = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#e67e22' : '#e74c3c';
}

/* ── WORLD ─────────────────────────────────────────── */
const LAYOUTS = [
  [ {x:0,y:9,w:12},{x:13,y:9,w:6},{x:20,y:7,w:5},{x:26,y:9,w:5},
    {x:32,y:7,w:4},{x:37,y:5,w:4},{x:42,y:7,w:6},{x:49,y:9,w:6},
    {x:56,y:7,w:4},{x:61,y:5,w:5},{x:67,y:8,w:8} ],
  [ {x:0,y:9,w:10},{x:11,y:8,w:4},{x:16,y:6,w:4},{x:21,y:8,w:5},
    {x:27,y:9,w:4},{x:32,y:7,w:3},{x:36,y:5,w:4},{x:41,y:7,w:4},
    {x:46,y:9,w:5},{x:52,y:7,w:4},{x:57,y:5,w:4},{x:62,y:7,w:5},
    {x:68,y:9,w:8} ],
  [ {x:0,y:9,w:8},{x:9,y:7,w:4},{x:14,y:5,w:3},{x:18,y:7,w:4},
    {x:23,y:9,w:3},{x:27,y:7,w:3},{x:31,y:5,w:3},{x:35,y:7,w:4},
    {x:40,y:9,w:5},{x:46,y:7,w:3},{x:50,y:5,w:3},{x:54,y:7,w:4},
    {x:59,y:9,w:6},{x:66,y:7,w:5},{x:72,y:9,w:8} ]
];

const PLAT_COLORS = [
  '#1e3a5f','#1a3a2a','#2d1b4e','#3a1a0a','#102a4a',
  '#2a0e44','#0e2e18','#3a1040','#0a2040','#3a1e00','#0a2a28'
];

function makeWorld(n) {
  const layout = LAYOUTS[Math.min(n - 1, 2)];
  const plats  = layout.map((p, i) => ({ ...p, col: PLAT_COLORS[i % PLAT_COLORS.length] }));
  const worldW = (plats[plats.length - 1].x + plats[plats.length - 1].w + 4) * T;

  /* Coins */
  const coinsList = [];
  plats.forEach(p => {
    for (let i = 1; i < p.w - 1; i += 2) {
      if (Math.random() > 0.28)
        coinsList.push({ x: (p.x + i) * T + 16, y: p.y * T - T * 0.75, type: 'coin', col: false });
    }
  });

  /* Health packs — one per ~3 platforms */
  plats.forEach((p, idx) => {
    if (idx % 3 === 2 && p.w >= 3) {
      const mx = p.x + Math.floor(p.w / 2);
      coinsList.push({ x: mx * T + 16, y: p.y * T - T * 0.75, type: 'hp', col: false });
    }
  });

  /* Enemies */
  const enemies = [];
  plats.slice(1, -1).forEach((p, i) => {
    if (p.w >= 3 && Math.random() > 0.3) {
      const spiked = (i % 3 === 2);
      enemies.push({
        x: (p.x + 1) * T, y: p.y * T - (spiked ? 30 : 26),
        w: 22, h: spiked ? 26 : 22,
        vx: (i % 2 ? 1 : -1) * (0.65 + n * 0.14),
        pMin: p.x * T, pMax: (p.x + p.w - 1) * T,
        alive: true, stomped: false, stompT: 0,
        spiked
      });
    }
  });

  const lastP = plats[plats.length - 1];
  const flagX = (lastP.x + Math.floor(lastP.w / 2)) * T;
  return { plats, pickups: coinsList, enemies, worldW, flagX };
}

/* ── PLAYER ────────────────────────────────────────── */
function initPlayer() {
  player = {
    x: 40, y: 200, w: 20, h: 28,
    vx: 0, vy: 0,
    onGround: false, facing: 1,
    jumpBuf: 0, coyote: 0, inv: 0,
    frame: 0, frameT: 0,
    hurtFlash: 0
  };
}

/* ── PARTICLES ─────────────────────────────────────── */
function spawnP(x, y, col, n = 10, upward = false) {
  for (let i = 0; i < n; i++) {
    const a  = upward
      ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI
      : Math.PI * 2 * i / n + Math.random() * 0.4;
    const sp = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (upward ? 2 : 0),
      life: 1,
      decay: 0.03 + Math.random() * 0.03,
      col,
      sz: 2.5 + Math.random() * 2.5
    });
  }
}

/* ── COLLISION ─────────────────────────────────────── */
function colRect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/* ── TAKE DAMAGE ───────────────────────────────────── */
function takeDamage(amt) {
  if (player.inv > 0) return;
  hp = Math.max(0, hp - amt);
  player.inv = 80;
  player.hurtFlash = 12;
  updateHUD();
  if (hp <= 0) die();
}

/* ── DEATH ─────────────────────────────────────────── */
function die() {
  lives--;
  updateHUD();
  spawnP(player.x + 10, player.y + 14, '#e74c3c', 20);
  if (lives <= 0) {
    gs = 'over';
    const ov = document.getElementById('ov');
    ov.style.display = 'flex';
    ov.innerHTML = `
      <h2 style="color:#e74c3c;letter-spacing:4px;">GAME OVER</h2>
      <p class="sub">Score: <b style="color:#e8c46a;">${score}</b> &nbsp;·&nbsp; Level ${level}</p>
      <button id="sb" onclick="startGame()">RETRY</button>
    `;
    return;
  }
  hp = maxHp;
  initPlayer();
  cam.x = 0;
  player.inv = 100;
  updateHUD();
}

/* ── START ─────────────────────────────────────────── */
function startGame() {
  document.getElementById('ov').style.display = 'none';
  cv.style.display = 'block';
  gs = 'playing';
  score = 0; coins = 0; lives = 3; level = 1; hp = maxHp;
  cam.x = 0; particles = []; tick = 0;
  initPlayer();
  world = makeWorld(level);
  updateHUD();
  if (raf) cancelAnimationFrame(raf);
  loop();
}

/* ── UPDATE ────────────────────────────────────────── */
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
  if (player.hurtFlash > 0) player.hurtFlash--;
  if (J) player.jumpBuf = 8;

  const accel = 0.46, fric = 0.80, maxSpd = 3.2;
  if (L) { player.vx -= accel; player.facing = -1; }
  if (R) { player.vx += accel; player.facing =  1; }
  if (!L && !R) player.vx *= fric;
  player.vx = Math.max(-maxSpd, Math.min(maxSpd, player.vx));

  if (player.jumpBuf > 0 && (player.onGround || player.coyote > 0)) {
    player.vy      = -9.2;
    player.jumpBuf = 0;
    player.coyote  = 0;
    spawnP(player.x + 10, player.y + 28, '#3a3a6a', 5, true);
  }

  player.vy  = Math.min(player.vy + 0.42, 13);
  player.x  += player.vx;
  player.y  += player.vy;

  /* Platform collision */
  player.onGround = false;
  world.plats.forEach(p => {
    const px = p.x * T, py = p.y * T, pw = p.w * T, ph = T * 2;
    if (!colRect(player.x, player.y, player.w, player.h, px, py, pw, ph)) return;
    const ol = (player.x + player.w) - px, or_ = (px + pw) - player.x;
    const ot = (player.y + player.h) - py, ob  = (py + ph) - player.y;
    const mx = Math.min(ol, or_), my = Math.min(ot, ob);
    if (my < mx) {
      if (ot < ob) {
        player.y = py - player.h;
        if (player.vy >= 0) { player.vy = 0; player.onGround = true; player.coyote = 6; }
      } else {
        player.y = py + ph;
        if (player.vy < 0) player.vy = 0;
      }
    } else {
      if (ol < or_) { player.x = px - player.w; player.vx = 0; }
      else          { player.x = px + pw;        player.vx = 0; }
    }
  });

  /* World bounds */
  if (player.x < 0)                       { player.x = 0;                       player.vx = 0; }
  if (player.x + player.w > world.worldW) { player.x = world.worldW - player.w; player.vx = 0; }
  if (player.y > H + 80) { die(); return; }

  /* Pickups */
  world.pickups.forEach(pk => {
    if (pk.col) return;
    if (Math.abs(player.x + 10 - pk.x) < 18 && Math.abs(player.y + 14 - pk.y) < 20) {
      pk.col = true;
      if (pk.type === 'coin') {
        coins++; score += 50;
        spawnP(pk.x, pk.y, '#e8c46a', 8);
        updateHUD();
      } else {
        hp = Math.min(maxHp, hp + 40);
        spawnP(pk.x, pk.y, '#2ecc71', 10, true);
        updateHUD();
      }
    }
  });

  /* Enemies */
  world.enemies.forEach(e => {
    if (!e.alive) return;
    if (e.stomped) { e.stompT++; if (e.stompT > 25) e.alive = false; return; }

    e.x += e.vx;
    if (e.x <= e.pMin || e.x + e.w >= e.pMax) e.vx *= -1;

    if (colRect(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)) {
      if (!e.spiked && player.vy > 0 && (player.y + player.h) < (e.y + 14)) {
        e.stomped  = true;
        player.vy  = -6.5;
        score     += 100;
        spawnP(e.x + 11, e.y, '#c0392b', 12);
        updateHUD();
      } else {
        takeDamage(e.spiked ? 35 : 20);
        /* Knockback */
        player.vx = (player.x < e.x ? -4 : 4);
        player.vy = -3;
      }
    }
  });

  /* Flag */
  if (Math.abs((player.x + 10) - world.flagX) < 30 && player.y < H - 10) {
    score += 500;
    level++;
    hp = Math.min(maxHp, hp + 20);
    spawnP(W / 2 + cam.x, H / 2, '#c8c8e0', 28);
    cam.x = 0;
    initPlayer();
    world = makeWorld(level);
    updateHUD();
    return;
  }

  cam.x = Math.max(0, Math.min(player.x - W * 0.32, world.worldW - W));

  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x  += p.vx; p.y  += p.vy; p.vy += 0.18; p.life -= p.decay;
  });
}

/* ── DRAW HELPERS ──────────────────────────────────── */
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* ── DRAW BG ───────────────────────────────────────── */
function drawBG() {
  ctx.fillStyle = '#0d0d1c';
  ctx.fillRect(0, 0, W, H);

  /* Far buildings */
  const buildingData = [
    {seed:83,w:38,h:55},{seed:197,w:28,h:80},{seed:312,w:44,h:45},
    {seed:445,w:32,h:65},{seed:558,w:52,h:38},{seed:671,w:26,h:90},
    {seed:789,w:40,h:50},{seed:902,w:36,h:72},{seed:1015,w:30,h:42},
  ];
  buildingData.forEach(b => {
    const x = ((b.seed * 11 - cam.x * 0.08 + tick * 0.06) % (W + 80)) - 40;
    ctx.fillStyle = '#131326';
    ctx.fillRect(x, H - b.h - 20, b.w, b.h);
    /* Windows */
    ctx.fillStyle = '#1e1e3a';
    for (let wy = H - b.h; wy < H - 22; wy += 10) {
      for (let wx = x + 4; wx < x + b.w - 4; wx += 8) {
        if ((wx + wy * 3 + b.seed) % 5 !== 0)
          ctx.fillRect(wx, wy, 4, 5);
      }
    }
  });

  /* Stars */
  const stars = [83,197,312,445,558,671,789,902,1015,1128,1241,1354,1467,1580,1693];
  stars.forEach((s, i) => {
    const sx = ((s * 17 - cam.x * 0.02) % (W + 60)) - 30;
    const sy = (s * 13) % 130 + 8;
    const br = Math.sin(tick * 0.035 + i * 0.7) * 0.35 + 0.65;
    ctx.globalAlpha = br * 0.5;
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
  });
  ctx.globalAlpha = 1;
}

/* ── DRAW GROUND ───────────────────────────────────── */
function drawGround() {
  for (let x = 0; x < world.worldW; x += T) {
    const sx = x - cam.x;
    if (sx < -T || sx > W + T) continue;
    ctx.fillStyle = '#1a2e1a'; ctx.fillRect(sx, H - 20, T, 20);
    ctx.fillStyle = '#223a22'; ctx.fillRect(sx, H - 20, T,  4);
    ctx.fillStyle = '#142014'; ctx.fillRect(sx + 1, H - 16, T - 2, 16);
  }
}

/* ── DRAW PLATFORMS ────────────────────────────────── */
function drawPlats() {
  world.plats.forEach(p => {
    const px = p.x * T - cam.x, py = p.y * T, pw = p.w * T;
    if (px + pw < 0 || px > W) return;

    ctx.fillStyle = p.col;
    ctx.fillRect(px, py, pw, T * 2);

    /* Top edge highlight */
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(px, py, pw, 3);

    /* Tile grid */
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i < p.w; i++) {
      ctx.strokeRect(px + i * T, py, T, T);
      ctx.strokeRect(px + i * T, py + T, T, T);
    }

    /* Border */
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, T * 2 - 1);
  });
}

/* ── DRAW PICKUPS ──────────────────────────────────── */
function drawPickups() {
  world.pickups.forEach(pk => {
    if (pk.col) return;
    const x = pk.x - cam.x;
    if (x < -20 || x > W + 20) return;
    const bob = Math.sin(tick * 0.07 + pk.x * 0.04) * 3;

    if (pk.type === 'coin') {
      ctx.fillStyle = '#e8c46a';
      ctx.beginPath();
      ctx.arc(x, pk.y + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5e08a';
      ctx.beginPath();
      ctx.arc(x - 1.5, pk.y + bob - 1.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a0831a';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(x, pk.y + bob, 6, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      /* Health pack — cross shape */
      const cx = x, cy = pk.y + bob;
      ctx.fillStyle = '#1a3a1a';
      roundRect(cx - 9, cy - 9, 18, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(cx - 2, cy - 7, 4, 14);
      ctx.fillRect(cx - 7, cy - 2, 14, 4);
      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth   = 1;
      roundRect(cx - 9, cy - 9, 18, 18, 3);
      ctx.stroke();
    }
  });
}

/* ── DRAW ENEMIES ──────────────────────────────────── */
function drawEnemies() {
  world.enemies.forEach(e => {
    if (!e.alive) return;
    const ex = e.x - cam.x;
    if (ex < -40 || ex > W + 40) return;

    if (e.stomped) {
      ctx.globalAlpha = Math.max(0, 1 - e.stompT / 25);
      ctx.fillStyle   = '#3a1515';
      ctx.fillRect(ex, e.y + e.h - 6, e.w, 5);
      ctx.globalAlpha = 1;
      return;
    }

    if (!e.spiked) {
      /* ── Normal enemy: simple boxy creature ── */
      ctx.fillStyle = '#2a1010';
      ctx.fillRect(ex, e.y, e.w, e.h);

      ctx.fillStyle = '#c0392b';
      ctx.fillRect(ex + 2, e.y + 2, e.w - 4, e.h - 4);

      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(ex + 2, e.y + 2, e.w - 4, 4);

      const eyeDir = e.vx > 0 ? 1 : -1;
      const eyeX   = ex + e.w * 0.5 + eyeDir * 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(eyeX, e.y + 9, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(eyeX + eyeDir * 0.8, e.y + 9, 1.8, 0, Math.PI * 2); ctx.fill();

      /* Angry brow */
      ctx.strokeStyle = '#111';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(eyeX - 3.5, e.y + 5);
      ctx.lineTo(eyeX + 3.5 * eyeDir * 0.5, e.y + 6.5);
      ctx.stroke();

      /* Legs */
      const lb = Math.sin(tick * 0.2 + e.x * 0.1) * 2.5;
      ctx.fillStyle = '#8b0000';
      ctx.fillRect(ex + 2,        e.y + e.h - 2, 6, 3 + lb);
      ctx.fillRect(ex + e.w - 8,  e.y + e.h - 2, 6, 3 - lb);

    } else {
      /* ── Spiked enemy ── */
      const cx = ex + e.w / 2, cy = e.y + e.h * 0.6;

      /* Body */
      ctx.fillStyle = '#0d1f30';
      ctx.beginPath();
      ctx.ellipse(cx, cy, e.w / 2, e.h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1a4a6a';
      ctx.beginPath();
      ctx.ellipse(cx, cy, e.w / 2 - 2, e.h * 0.45 - 2, 0, 0, Math.PI * 2);
      ctx.fill();

      /* Spikes on top */
      ctx.fillStyle = '#5dade2';
      const spikeCount = 5;
      for (let i = 0; i < spikeCount; i++) {
        const angle = Math.PI + (Math.PI / (spikeCount - 1)) * i;
        const bx1 = cx + Math.cos(angle - 0.18) * (e.w / 2 - 1);
        const by1 = cy + Math.sin(angle - 0.18) * (e.h * 0.4);
        const bx2 = cx + Math.cos(angle + 0.18) * (e.w / 2 - 1);
        const by2 = cy + Math.sin(angle + 0.18) * (e.h * 0.4);
        const tipX = cx + Math.cos(angle) * (e.w / 2 + 8);
        const tipY = cy + Math.sin(angle) * (e.h * 0.4 + 9);
        ctx.beginPath();
        ctx.moveTo(bx1, by1);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(bx2, by2);
        ctx.fill();
      }

      /* Eyes — glowing */
      const eyeDir = e.vx > 0 ? 1 : -1;
      ctx.fillStyle = '#7ec8e3';
      ctx.beginPath(); ctx.arc(cx + eyeDir * 4, cy - 2, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx + eyeDir * 4, cy - 2, 1.5, 0, Math.PI * 2); ctx.fill();

      /* Legs */
      const lb = Math.sin(tick * 0.2 + e.x * 0.1) * 2;
      ctx.fillStyle = '#1a4a6a';
      ctx.fillRect(ex + 2,       e.y + e.h - 4, 6, 4 + lb);
      ctx.fillRect(ex + e.w - 8, e.y + e.h - 4, 6, 4 - lb);
    }
  });
}

/* ── DRAW PLAYER ───────────────────────────────────── */
function drawPlayer() {
  const flash = player.hurtFlash > 0 && Math.floor(player.hurtFlash / 2) % 2 === 0;
  if (player.inv > 0 && Math.floor(player.inv / 5) % 2 === 0) return;

  const px = player.x - cam.x, py = player.y;
  ctx.save();
  if (player.facing < 0) {
    ctx.translate(px + player.w, 0);
    ctx.scale(-1, 1);
    ctx.translate(-px, 0);
  }

  const alpha = flash ? 0.5 : 1;
  ctx.globalAlpha = alpha;

  /* Shadow */
  if (player.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px + player.w / 2, py + player.h + 2, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Legs */
  const lb = player.onGround ? Math.sin(tick * 0.25) * 3 : 0;
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(px + 2,             py + 22, 7, 6 + (lb > 0 ? lb : 0));
  ctx.fillRect(px + player.w - 9,  py + 22, 7, 6 + (lb > 0 ? -lb : 0));

  /* Body */
  ctx.fillStyle = '#2a2a5a';
  roundRect(px + 1, py + 12, player.w - 2, 12, 2);
  ctx.fill();
  ctx.fillStyle = '#3a3a7a';
  ctx.fillRect(px + 2, py + 12, player.w - 4, 3);

  /* Scarf / accent stripe */
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(px + 1, py + 14, player.w - 2, 3);

  /* Head */
  ctx.fillStyle = '#c8a882';
  roundRect(px + 2, py + 2, player.w - 4, 12, 3);
  ctx.fill();

  /* Hair / top */
  ctx.fillStyle = '#1a1a2e';
  roundRect(px, py, player.w, 8, 3);
  ctx.fill();

  /* Visor strip */
  ctx.fillStyle = '#5dade2';
  ctx.fillRect(px + 2, py + 6, player.w - 4, 3);

  /* Eye */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px + player.w - 8, py + 7, 5, 4);
  ctx.fillStyle = '#222';
  ctx.fillRect(px + player.w - 7, py + 8, 2, 2);

  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── DRAW FLAG ─────────────────────────────────────── */
function drawFlag() {
  const fx = world.flagX - cam.x;
  if (fx < -20 || fx > W + 20) return;

  ctx.strokeStyle = '#555577'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(fx, H - 22); ctx.lineTo(fx, H - 120); ctx.stroke();

  const wave = Math.sin(tick * 0.1) * 3;
  ctx.fillStyle = '#c8c8e0';
  ctx.beginPath();
  ctx.moveTo(fx, H - 120);
  ctx.lineTo(fx + 22 + wave, H - 110);
  ctx.lineTo(fx, H - 100);
  ctx.fill();

  ctx.strokeStyle = '#aaaacc'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx, H - 120);
  ctx.lineTo(fx + 22 + wave, H - 110);
  ctx.lineTo(fx, H - 100);
  ctx.stroke();
}

/* ── DRAW PARTICLES ────────────────────────────────── */
function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life * 0.9);
    ctx.fillStyle   = p.col;
    ctx.beginPath();
    ctx.arc(p.x - cam.x, p.y, p.sz * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

/* ── DRAW PROGRESS ─────────────────────────────────── */
function drawProgress() {
  const prog = Math.max(0, Math.min(1, player.x / Math.max(1, world.worldW - W)));
  const bw = 140, bh = 4, bx = W / 2 - bw / 2, by = 10;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#3a3a6a';          ctx.fillRect(bx, by, bw * prog, bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
  ctx.strokeRect(bx, by, bw, bh);

  /* Mini flag icon */
  ctx.fillStyle = '#555577';
  ctx.fillRect(bx + bw - 1, by - 4, 1.5, 10);
  ctx.fillStyle = '#c8c8e0';
  ctx.fillRect(bx + bw + 1, by - 3, 6, 4);
}

/* ── RENDER ────────────────────────────────────────── */
function render() {
  ctx.clearRect(0, 0, W, H);
  drawBG();
  drawGround();
  drawPlats();
  drawFlag();
  drawPickups();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawProgress();
}

/* ── LOOP ──────────────────────────────────────────── */
function loop() {
  raf = requestAnimationFrame(loop);
  update();
  render();
}

/* ── INPUT ─────────────────────────────────────────── */
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

cv.style.display = 'none';