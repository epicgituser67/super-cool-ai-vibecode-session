/* DIAMOND ROLL — an arcade diamond collector built on the bait-and-switch.
   Collect diamonds, dodge duckrolls, and learn not to trust a diamond that
   glows pink. No build step: open index.html and play. */
(function (global) {
  'use strict';

  var W = 960, H = 600;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  var Sound = global.Sound;
  var Shop = global.Shop;
  var save = Shop.save;

  // ---------------------------------------------------------------- state
  var state = 'title';
  var G = null;              // active run
  var lastT = 0;
  var pointer = { active: false, x: 0, y: 0 };
  var keys = Object.create(null);

  var DIAMOND_KINDS = {
    white: { value: 1, r: 9, ttl: 15, color: '#bfe9ff', glow: '#7ce8ff' },
    pink: { value: 4, r: 10, ttl: 9, color: '#ffa8d6', glow: '#ff5fae' },
    gold: { value: 14, r: 12, ttl: 8, color: '#ffe9a8', glow: '#ffd24a' }
  };

  var QUIPS = [
    'You were never gonna give up. The ducks disagreed.',
    'A desert you, they did.',
    'Statistically, most of those diamonds were real.',
    'Somewhere, a duck is telling this story differently.',
    'Never gonna run around and — oh. You ran around.',
    'The store is right there. Just saying.'
  ];

  // ---------------------------------------------------------------- DOM
  var el = {
    hud: id('hud'),
    score: id('hud-score'),
    diamonds: id('hud-diamonds'),
    wave: id('hud-wave'),
    hearts: id('hud-hearts'),
    comboBar: id('combo-bar'),
    comboText: id('combo-text'),
    dashBar: id('dash-bar'),
    toasts: id('toast-layer'),
    title: id('screen-title'),
    pause: id('screen-pause'),
    over: id('screen-over'),
    shop: id('screen-shop'),
    modal: id('modal'),
    adbar: id('adbar')
  };

  function id(x) { return document.getElementById(x); }

  // ---------------------------------------------------------------- helpers
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  function toast(text) {
    var n = document.createElement('div');
    n.className = 'toast';
    n.textContent = text;
    el.toasts.appendChild(n);
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2100);
  }

  function modal(title, body) {
    id('modal-title').textContent = title;
    id('modal-body').textContent = body;
    el.modal.classList.remove('hidden');
  }

  function upg(x) { return Shop.lvl(x); }

  // ---------------------------------------------------------------- run setup
  function newRun() {
    return {
      t: 0,
      score: 0,
      diamonds: 0,
      wave: 1,
      waveTimer: 22,
      hearts: 3 + upg('heart'),
      maxHearts: 3 + upg('heart'),
      player: {
        x: W / 2, y: H / 2, r: 14,
        vx: 0, vy: 0,
        dashCd: 0, dashTime: 0, invuln: 0,
        shield: false, bob: 0, lean: 0
      },
      diamondList: [],
      ducks: [],
      spawners: [],
      powerups: [],
      particles: [],
      floaters: [],
      chain: 0,
      comboTimer: 0,
      spawnTimer: 0,
      powerTimer: 9,
      magnetTime: 0,
      slowTime: 0,
      shake: 0,
      over: false
    };
  }

  function baseSpeed() { return 240 + upg('boots') * 26; }
  function magnetRadius() { return 34 + upg('magnet') * 34; }
  function dashCooldown() { return 2.3 - upg('dash') * 0.36; }
  function luck() { return upg('luck'); }

  // ---------------------------------------------------------------- spawning
  function spawnDiamond(g, forceKind) {
    var roll = Math.random();
    var kind = forceKind;
    if (!kind) {
      var goldChance = 0.035 + luck() * 0.025;
      var pinkChance = 0.2;
      kind = roll < goldChance ? 'gold' : roll < goldChance + pinkChance ? 'pink' : 'white';
    }
    var def = DIAMOND_KINDS[kind];
    var baitChance = g.wave < 3 ? 0 : Math.min(0.18, 0.04 * (g.wave - 2));
    var bait = kind !== 'gold' && Math.random() < baitChance;
    var p = g.player;
    var x, y, tries = 0;
    do {
      x = rand(40, W - 40);
      y = rand(60, H - 40);
      tries++;
    } while (tries < 12 && (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < 90 * 90);

    g.diamondList.push({
      x: x, y: y, r: def.r, kind: kind, bait: bait,
      ttl: def.ttl, maxTtl: def.ttl,
      spin: rand(0, Math.PI * 2), spinRate: rand(1.4, 2.6),
      vx: 0, vy: 0, born: 0
    });
  }

  function queueDuck(g) {
    var side = Math.floor(rand(0, 4)) % 4;
    var x, y;
    if (side === 0) { x = rand(30, W - 30); y = 46; }
    else if (side === 1) { x = W - 26; y = rand(60, H - 30); }
    else if (side === 2) { x = rand(30, W - 30); y = H - 26; }
    else { x = 26; y = rand(60, H - 30); }
    g.spawners.push({ x: x, y: y, t: 0.85 });
  }

  function makeDuck(g, x, y) {
    g.ducks.push({
      x: x, y: y, r: 15,
      vx: 0, vy: 0,
      speed: Math.min(210, 62 + g.wave * 8),
      turn: Math.min(4.2, 1.5 + g.wave * 0.16),
      wobble: rand(0, Math.PI * 2),
      roll: 0
    });
  }

  function spawnPowerup(g) {
    var types = ['magnet', 'slow', 'shield'];
    var t = types[Math.floor(Math.random() * types.length)];
    g.powerups.push({
      x: rand(60, W - 60), y: rand(80, H - 60),
      r: 15, type: t, ttl: 11, spin: 0
    });
  }

  function burst(g, x, y, color, n, power) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2), s = rand(40, 60) * (power || 1);
      g.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.3, 0.7), max: 0.7,
        size: rand(1.5, 3.6), color: color
      });
    }
  }

  function floatText(g, x, y, text, color) {
    g.floaters.push({ x: x, y: y, text: text, color: color, life: 0.9 });
  }

  // ---------------------------------------------------------------- update
  function update(g, dt) {
    g.t += dt;

    // --- wave progression
    g.waveTimer -= dt;
    if (g.waveTimer <= 0) {
      g.wave++;
      g.waveTimer = 22;
      toast('WAVE ' + g.wave);
      var add = Math.min(4, 1 + Math.floor(g.wave / 3));
      for (var w = 0; w < add; w++) queueDuck(g);
      Sound.power();
    }

    // --- keep the arena stocked
    var want = Math.min(16, 6 + Math.floor(g.wave * 0.9));
    g.spawnTimer -= dt;
    if (g.diamondList.length < want && g.spawnTimer <= 0) {
      spawnDiamond(g);
      g.spawnTimer = 0.32;
    }

    var wantDucks = Math.min(15, Math.floor(g.wave * 0.9));
    if (g.ducks.length + g.spawners.length < wantDucks) queueDuck(g);

    g.powerTimer -= dt;
    if (g.powerTimer <= 0) {
      spawnPowerup(g);
      g.powerTimer = rand(13, 19) - luck() * 2.2;
    }

    updatePlayer(g, dt);
    updateDiamonds(g, dt);
    updateSpawners(g, dt);
    updateDucks(g, dt);
    updatePowerups(g, dt);
    updateEffects(g, dt);

    // --- combo decay
    if (g.comboTimer > 0) {
      g.comboTimer -= dt;
      if (g.comboTimer <= 0) g.chain = 0;
    }

    g.magnetTime = Math.max(0, g.magnetTime - dt);
    g.slowTime = Math.max(0, g.slowTime - dt);
    g.shake = Math.max(0, g.shake - dt * 34);
  }

  function updatePlayer(g, dt) {
    var p = g.player;
    var ax = 0, ay = 0;

    if (keys.left) ax -= 1;
    if (keys.right) ax += 1;
    if (keys.up) ay -= 1;
    if (keys.down) ay += 1;

    if (!ax && !ay && pointer.active) {
      var dx = pointer.x - p.x, dy = pointer.y - p.y;
      var d = Math.hypot(dx, dy);
      if (d > 8) { ax = dx / d; ay = dy / d; }
    }

    var mag = Math.hypot(ax, ay);
    if (mag > 0) { ax /= mag; ay /= mag; }

    var speed = baseSpeed() * (p.dashTime > 0 ? 2.7 : 1);
    var accel = p.dashTime > 0 ? 26 : 14;
    p.vx += (ax * speed - p.vx) * Math.min(1, accel * dt);
    p.vy += (ay * speed - p.vy) * Math.min(1, accel * dt);

    p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r + 24, H - p.r);

    p.bob += dt * (2 + Math.hypot(p.vx, p.vy) / 90);
    p.lean += ((p.vx / 320) - p.lean) * Math.min(1, 8 * dt);

    p.dashCd = Math.max(0, p.dashCd - dt);
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.invuln = Math.max(0, p.invuln - dt);

    if (p.dashTime > 0 && Math.random() < 0.7) {
      g.particles.push({
        x: p.x, y: p.y + 6, vx: rand(-20, 20), vy: rand(-10, 20),
        life: 0.3, max: 0.3, size: rand(2, 4), color: '#7ce8ff'
      });
    }
  }

  function doDash(g) {
    var p = g.player;
    if (p.dashCd > 0) return;
    p.dashCd = dashCooldown();
    p.dashTime = 0.18;
    p.invuln = Math.max(p.invuln, 0.3);
    Sound.dash();
    burst(g, p.x, p.y, '#7ce8ff', 8, 0.7);
  }

  function updateDiamonds(g, dt) {
    var p = g.player;
    var mr = g.magnetTime > 0 ? 230 : magnetRadius();

    for (var i = g.diamondList.length - 1; i >= 0; i--) {
      var d = g.diamondList[i];
      d.ttl -= dt;
      d.born += dt;
      d.spin += d.spinRate * dt;

      var dx = p.x - d.x, dy = p.y - d.y;
      var dd = Math.hypot(dx, dy) || 1;

      if (d.kind === 'gold') {
        // Never gonna give you up: it keeps its distance.
        if (dd < 210) {
          var flee = (210 - dd) / 210;
          d.vx -= (dx / dd) * flee * 620 * dt;
          d.vy -= (dy / dd) * flee * 620 * dt;
        }
        d.vx *= 0.94; d.vy *= 0.94;
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < 30 || d.x > W - 30) { d.vx *= -0.7; d.x = clamp(d.x, 30, W - 30); }
        if (d.y < 60 || d.y > H - 30) { d.vy *= -0.7; d.y = clamp(d.y, 60, H - 30); }
      } else if (dd < mr) {
        var pull = (1 - dd / mr) * 560 * dt;
        d.x += (dx / dd) * pull;
        d.y += (dy / dd) * pull;
      }

      if (dd < p.r + d.r) { collect(g, d, i); continue; }
      if (d.ttl <= 0) {
        g.diamondList.splice(i, 1);
        burst(g, d.x, d.y, '#4a3f70', 5, 0.5);
      }
    }
  }

  function collect(g, d, index) {
    var p = g.player;
    g.diamondList.splice(index, 1);

    if (d.bait) {
      // Bait and switch: it was a duck the whole time. It costs you the combo,
      // not a heart — so kick the duck clear and grant a moment of grace.
      burst(g, d.x, d.y, '#ff5fae', 22, 1.3);
      makeDuck(g, d.x, d.y);
      var fresh = g.ducks[g.ducks.length - 1];
      var away = Math.atan2(d.y - p.y, d.x - p.x) + rand(-0.4, 0.4);
      fresh.vx = Math.cos(away) * 300;
      fresh.vy = Math.sin(away) * 300;
      p.invuln = Math.max(p.invuln, 0.7);
      g.chain = 0;
      g.comboTimer = 0;
      g.shake = Math.max(g.shake, 8);
      floatText(g, d.x, d.y, 'ROLLED!', '#ff5fae');
      Sound.deny();
      return;
    }

    var def = DIAMOND_KINDS[d.kind];
    g.chain++;
    g.comboTimer = 2.6;
    var mult = comboMult(g);
    var value = def.value + upg('value');
    var points = value * mult;

    g.score += points;
    g.diamonds += value;

    burst(g, d.x, d.y, def.glow, d.kind === 'gold' ? 26 : 10, d.kind === 'gold' ? 1.4 : 1);
    floatText(g, d.x, d.y, '+' + points + (mult > 1 ? ' x' + mult : ''), def.glow);

    if (d.kind === 'gold') {
      Sound.gold();
      g.shake = Math.max(g.shake, 5);
      toast('GOLDEN DIAMOND!');
    } else {
      Sound.pickup(g.chain);
    }
  }

  function comboMult(g) {
    return clamp(1 + Math.floor(g.chain / 4), 1, 8);
  }

  function updateSpawners(g, dt) {
    for (var i = g.spawners.length - 1; i >= 0; i--) {
      var s = g.spawners[i];
      s.t -= dt;
      if (s.t <= 0) {
        makeDuck(g, s.x, s.y);
        g.spawners.splice(i, 1);
      }
    }
  }

  function updateDucks(g, dt) {
    var p = g.player;
    var slow = g.slowTime > 0 ? 0.4 : 1;

    for (var i = 0; i < g.ducks.length; i++) {
      var k = g.ducks[i];
      k.wobble += dt * 3;
      var dx = p.x - k.x, dy = p.y - k.y;
      var d = Math.hypot(dx, dy) || 1;
      var tx = (dx / d) * k.speed * slow + Math.cos(k.wobble) * 26;
      var ty = (dy / d) * k.speed * slow + Math.sin(k.wobble * 0.8) * 26;

      k.vx += (tx - k.vx) * Math.min(1, k.turn * dt);
      k.vy += (ty - k.vy) * Math.min(1, k.turn * dt);
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.roll += k.vx * dt * 0.08;

      if (k.x < k.r) { k.x = k.r; k.vx = Math.abs(k.vx); }
      if (k.x > W - k.r) { k.x = W - k.r; k.vx = -Math.abs(k.vx); }
      if (k.y < k.r + 24) { k.y = k.r + 24; k.vy = Math.abs(k.vy); }
      if (k.y > H - k.r) { k.y = H - k.r; k.vy = -Math.abs(k.vy); }

      if (dist2(k, p) < (k.r + p.r - 4) * (k.r + p.r - 4)) hit(g, k);
    }
  }

  function hit(g, duck) {
    var p = g.player;
    if (p.invuln > 0) return;

    // Shove the duck away so it cannot chain-hit through the i-frames.
    var a = Math.atan2(duck.y - p.y, duck.x - p.x);
    duck.vx = Math.cos(a) * 320;
    duck.vy = Math.sin(a) * 320;

    if (p.shield) {
      p.shield = false;
      p.invuln = 1.0;
      burst(g, p.x, p.y, '#7ce8ff', 20, 1.1);
      floatText(g, p.x, p.y - 20, 'SHIELD DOWN', '#7ce8ff');
      Sound.hurt();
      return;
    }

    g.hearts--;
    p.invuln = 1.7;
    g.chain = 0;
    g.comboTimer = 0;
    g.shake = Math.max(g.shake, 14);
    burst(g, p.x, p.y, '#ff5fae', 24, 1.2);
    Sound.hurt();

    if (g.hearts <= 0) endRun(g);
  }

  function updatePowerups(g, dt) {
    var p = g.player;
    for (var i = g.powerups.length - 1; i >= 0; i--) {
      var u = g.powerups[i];
      u.ttl -= dt;
      u.spin += dt * 1.8;
      if (u.ttl <= 0) { g.powerups.splice(i, 1); continue; }
      if (dist2(u, p) < (u.r + p.r) * (u.r + p.r)) {
        g.powerups.splice(i, 1);
        applyPowerup(g, u.type);
        burst(g, u.x, u.y, '#ffffff', 16, 1);
        Sound.power();
      }
    }
  }

  function applyPowerup(g, type) {
    if (type === 'magnet') {
      g.magnetTime = 6.5;
      toast('MAGNET — never gonna let you down');
    } else if (type === 'slow') {
      g.slowTime = 5.5;
      toast('SLOW — ducks in treacle');
    } else {
      g.player.shield = true;
      toast('SHIELD — one free mistake');
    }
  }

  function updateEffects(g, dt) {
    var i, o;
    for (i = g.particles.length - 1; i >= 0; i--) {
      o = g.particles[i];
      o.life -= dt;
      if (o.life <= 0) { g.particles.splice(i, 1); continue; }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vx *= 0.94;
      o.vy *= 0.94;
    }
    for (i = g.floaters.length - 1; i >= 0; i--) {
      o = g.floaters[i];
      o.life -= dt;
      o.y -= 34 * dt;
      if (o.life <= 0) g.floaters.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- render
  function render(g) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    drawBackground(g);

    if (g.shake > 0.2) {
      ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake));
    }

    drawSpawners(g);
    g.powerups.forEach(drawPowerup);
    g.diamondList.forEach(drawDiamond);
    g.ducks.forEach(drawDuck);
    drawParticles(g);
    drawPlayer(g);
    drawFloaters(g);
    drawVignette();
    ctx.restore();
  }

  function drawBackground(g) {
    var grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#160d33');
    grd.addColorStop(0.6, '#0d0821');
    grd.addColorStop(1, '#070412');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // slow drifting grid
    var t = g ? g.t : 0;
    ctx.strokeStyle = 'rgba(124, 232, 255, 0.06)';
    ctx.lineWidth = 1;
    var step = 48;
    var off = (t * 14) % step;
    ctx.beginPath();
    for (var x = -step; x <= W + step; x += step) {
      ctx.moveTo(x + off, 0); ctx.lineTo(x + off, H);
    }
    for (var y = -step; y <= H + step; y += step) {
      ctx.moveTo(0, y + off); ctx.lineTo(W, y + off);
    }
    ctx.stroke();

    if (g && g.slowTime > 0) {
      ctx.fillStyle = 'rgba(124, 232, 255, 0.05)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawDiamond(d) {
    var def = DIAMOND_KINDS[d.kind];
    var blink = d.ttl < 2 && Math.floor(d.ttl * 8) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(Math.sin(d.spin) * 0.35);

    // Bait tell: a pink halo that pulses. Learn it or keep getting rolled.
    if (d.bait) {
      ctx.beginPath();
      ctx.arc(0, 0, d.r + 7 + Math.sin(d.spin * 2) * 1.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 95, 174, 0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.shadowColor = def.glow;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, -d.r);
    ctx.lineTo(d.r * 0.72, 0);
    ctx.lineTo(0, d.r);
    ctx.lineTo(-d.r * 0.72, 0);
    ctx.closePath();
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.moveTo(0, -d.r);
    ctx.lineTo(d.r * 0.72, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();

    ctx.strokeStyle = def.glow;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -d.r);
    ctx.lineTo(d.r * 0.72, 0);
    ctx.lineTo(0, d.r);
    ctx.lineTo(-d.r * 0.72, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawDuck(k) {
    ctx.save();
    ctx.translate(k.x, k.y);
    var face = k.vx < 0 ? -1 : 1;
    ctx.scale(face, 1);

    // wheels
    ctx.fillStyle = '#26202f';
    [-7, 7].forEach(function (ox) {
      ctx.save();
      ctx.translate(ox, 11);
      ctx.rotate(k.roll);
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b5f92';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-4, 0); ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.restore();
    });

    // body
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.beginPath();
    ctx.arc(8, -8, 7, 0, Math.PI * 2);
    ctx.fill();

    // beak
    ctx.fillStyle = '#ef7d21';
    ctx.beginPath();
    ctx.moveTo(13, -9);
    ctx.lineTo(22, -6);
    ctx.lineTo(13, -4);
    ctx.closePath();
    ctx.fill();

    // eye
    ctx.fillStyle = '#1a1226';
    ctx.beginPath();
    ctx.arc(10, -10, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(g) {
    var p = g.player;
    var skin = Shop.COSMETICS[save.coat] || Shop.COSMETICS.classic;
    var flicker = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.lean * 0.25);
    ctx.globalAlpha = flicker ? 0.4 : 1;

    if (g.magnetTime > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 230, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(124,232,255,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (p.shield) {
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(124,232,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    var bob = Math.sin(p.bob * 4) * 1.6;

    // coat
    ctx.fillStyle = skin.coat;
    ctx.beginPath();
    ctx.moveTo(-11, 16 + bob);
    ctx.lineTo(-8, -4 + bob);
    ctx.lineTo(8, -4 + bob);
    ctx.lineTo(11, 16 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -4 + bob);
    ctx.lineTo(0, 15 + bob);
    ctx.stroke();

    // head
    ctx.fillStyle = '#f0c9a8';
    ctx.beginPath();
    ctx.arc(0, -11 + bob, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // the hair
    ctx.fillStyle = '#c2521f';
    ctx.beginPath();
    ctx.moveTo(-7.5, -13 + bob);
    ctx.quadraticCurveTo(-2, -25 + bob, 9, -19 + bob);
    ctx.quadraticCurveTo(3, -15 + bob, 7.5, -12 + bob);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawPowerup(u) {
    var colors = { magnet: '#7ce8ff', slow: '#a8ff9e', shield: '#ffd24a' };
    var label = { magnet: 'M', slow: 'S', shield: '+' };
    var c = colors[u.type];
    var pulse = 1 + Math.sin(u.spin * 3) * 0.08;
    var fade = u.ttl < 3 ? (Math.floor(u.ttl * 6) % 2 === 0 ? 0.35 : 1) : 1;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(u.x, u.y);
    ctx.scale(pulse, pulse);
    ctx.rotate(u.spin * 0.5);
    ctx.shadowColor = c;
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(10,7,20,0.9)';
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = (Math.PI / 3) * i - Math.PI / 2;
      var x = Math.cos(a) * u.r, y = Math.sin(a) * u.r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.rotate(-u.spin * 0.5);
    ctx.fillStyle = c;
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label[u.type], 0, 1);
    ctx.restore();
  }

  function drawSpawners(g) {
    g.spawners.forEach(function (s) {
      var k = 1 - s.t / 0.85;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.strokeStyle = 'rgba(242, 201, 76, ' + (0.35 + k * 0.5) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + (1 - k) * 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(242, 201, 76, 0.9)';
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, 5);
      ctx.restore();
    });
  }

  function drawParticles(g) {
    g.particles.forEach(function (o) {
      ctx.globalAlpha = clamp(o.life / o.max, 0, 1);
      ctx.fillStyle = o.color;
      ctx.fillRect(o.x - o.size / 2, o.y - o.size / 2, o.size, o.size);
    });
    ctx.globalAlpha = 1;
  }

  function drawFloaters(g) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Trebuchet MS", sans-serif';
    g.floaters.forEach(function (o) {
      ctx.globalAlpha = clamp(o.life / 0.9, 0, 1);
      ctx.fillStyle = o.color;
      ctx.fillText(o.text, o.x, o.y);
    });
    ctx.globalAlpha = 1;
  }

  function drawVignette() {
    var grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- HUD
  var hudCache = {};

  function syncHud(g) {
    if (hudCache.score !== g.score) { el.score.textContent = g.score; hudCache.score = g.score; }
    if (hudCache.dia !== g.diamonds) { el.diamonds.textContent = g.diamonds; hudCache.dia = g.diamonds; }
    if (hudCache.wave !== g.wave) { el.wave.textContent = g.wave; hudCache.wave = g.wave; }

    var heartStr = '';
    for (var i = 0; i < g.maxHearts; i++) heartStr += i < g.hearts ? '♥' : '♡';
    if (hudCache.hearts !== heartStr) { el.hearts.textContent = heartStr; hudCache.hearts = heartStr; }

    var pct = clamp(g.comboTimer / 2.6, 0, 1) * 100;
    el.comboBar.style.width = pct + '%';
    var mult = comboMult(g);
    var ct = g.chain > 1 ? 'COMBO x' + mult + '  (' + g.chain + ')' : '';
    if (hudCache.combo !== ct) { el.comboText.textContent = ct; hudCache.combo = ct; }

    var dashPct = g.player.dashCd <= 0 ? 100 : (1 - g.player.dashCd / dashCooldown()) * 100;
    el.dashBar.style.width = dashPct + '%';
    el.dashBar.style.background = g.player.dashCd <= 0 ? '#7ce8ff' : '#6b5f92';
  }

  // ---------------------------------------------------------------- flow
  function show(node) { node.classList.remove('hidden'); }
  function hide(node) { node.classList.add('hidden'); }

  function refreshTitle() {
    id('title-best').textContent = save.best;
    id('title-bank').textContent = save.bank;
  }

  /* The fake ad only shows during a run — nagging you on the menus would be
     realistic, but this is a game, not a punishment. */
  function syncAdBar() {
    if (save.noAds || state !== 'play') hide(el.adbar); else show(el.adbar);
  }

  function startRun() {
    G = newRun();
    hudCache = {};
    state = 'play';
    hide(el.title); hide(el.over); hide(el.shop); hide(el.pause);
    show(el.hud);
    syncAdBar();
    Sound.unlock();
    Sound.startMusic();
    for (var i = 0; i < 6; i++) spawnDiamond(G);
    queueDuck(G);
  }

  function endRun(g) {
    if (g.over) return;
    g.over = true;
    state = 'over';
    Sound.over();
    Shop.addDiamonds(g.diamonds);
    Shop.recordRun(g.score);
    id('over-score').textContent = g.score;
    id('over-best').textContent = save.best;
    id('over-earned').textContent = g.diamonds;
    id('over-quip').textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    hide(el.hud);
    show(el.over);
    syncAdBar();
    refreshTitle();
  }

  function openShop() {
    state = 'shop';
    Shop.render();
    hide(el.title); hide(el.over); hide(el.pause);
    show(el.shop);
  }

  function closeShop() {
    hide(el.shop);
    refreshTitle();
    syncAdBar();
    state = 'title';
    show(el.title);
  }

  function togglePause(force) {
    if (state === 'play' && force !== false) {
      state = 'pause';
      show(el.pause);
    } else if (state === 'pause') {
      state = 'play';
      hide(el.pause);
      lastT = performance.now();
    }
  }

  function quitToTitle() {
    if (G && !G.over) {
      Shop.addDiamonds(G.diamonds);
      Shop.recordRun(G.score);
    }
    G = null;
    state = 'title';
    hide(el.pause); hide(el.hud); hide(el.over);
    syncAdBar();
    refreshTitle();
    show(el.title);
  }

  // ---------------------------------------------------------------- loop
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (state === 'play' && G) {
      update(G, dt);
      render(G);
      syncHud(G);
    } else if (G && (state === 'pause' || state === 'over')) {
      render(G);
    } else {
      drawBackground({ t: now / 1000, slowTime: 0 });
      drawVignette();
    }
  }

  // ---------------------------------------------------------------- input
  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down'
  };

  document.addEventListener('keydown', function (e) {
    var k = KEYMAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); return; }

    if (e.code === 'Space') {
      e.preventDefault();
      if (state === 'play' && G) doDash(G);
      else if (state === 'title') startRun();
      return;
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'play' || state === 'pause') togglePause();
      return;
    }
    if (e.code === 'KeyM') {
      var m = Sound.toggleMute();
      save.muted = m;
      Shop.persist();
      toast(m ? 'MUTED' : 'UNMUTED');
      return;
    }
    if (e.code === 'Enter' && state === 'over') startRun();
  });

  document.addEventListener('keyup', function (e) {
    var k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });

  function pointerPos(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (state !== 'play') return;
    canvas.setPointerCapture(e.pointerId);
    pointer.active = true;
    var p = pointerPos(e);
    pointer.x = p.x; pointer.y = p.y;
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!pointer.active) return;
    var p = pointerPos(e);
    pointer.x = p.x; pointer.y = p.y;
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { pointer.active = false; });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'play') togglePause(true);
  });

  // ---------------------------------------------------------------- wiring
  id('btn-play').addEventListener('click', function () { Sound.unlock(); startRun(); });
  id('btn-shop').addEventListener('click', function () { Sound.unlock(); openShop(); });
  id('btn-shop2').addEventListener('click', openShop);
  id('btn-shop-back').addEventListener('click', closeShop);
  id('btn-again').addEventListener('click', startRun);
  id('btn-resume').addEventListener('click', function () { togglePause(); });
  id('btn-quit').addEventListener('click', quitToTitle);
  id('modal-ok').addEventListener('click', function () { hide(el.modal); });

  id('ad-close').addEventListener('click', function () {
    hide(el.adbar);
    if (!save.noAds) {
      setTimeout(function () { if (!save.noAds && state === 'play') show(el.adbar); }, 12000);
    }
  });

  id('ad-copy').addEventListener('click', function () {
    modal('YOU CLICKED THE AD',
      'There is no ad. There is no duck with wheels waiting on the other side of that link. ' +
      'There is only this box, and the quiet realisation that you would have clicked it anyway.');
  });

  Shop.mount({
    itemsEl: id('shop-items'),
    fakeEl: id('shop-fake'),
    bankEl: id('shop-bank'),
    modal: modal,
    toast: toast
  });
  Shop.onAdsRemoved = syncAdBar;

  /* Small handle for debugging and automated smoke tests. */
  global.DiamondRoll = {
    get run() { return G; },
    get state() { return state; },
    start: startRun,
    quit: quitToTitle
  };

  Sound.setMuted(!!save.muted);
  refreshTitle();
  lastT = performance.now();
  requestAnimationFrame(frame);
})(window);
