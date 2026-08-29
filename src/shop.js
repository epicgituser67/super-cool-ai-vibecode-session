/* Save data, upgrades, cosmetics and the (satirical) store.
   Every purchase is paid for with diamonds earned in-game.
   The "premium bundles" take no money and never will — they are a joke. */
(function (global) {
  'use strict';

  var KEY = 'diamondroll.save.v1';

  var DEFAULT_SAVE = {
    bank: 0,
    best: 0,
    runs: 0,
    ups: { magnet: 0, heart: 0, dash: 0, value: 0, boots: 0, luck: 0 },
    noAds: false,
    coat: 'classic',
    owned: ['classic'],
    muted: false,
    sawBundleJoke: false
  };

  var COSMETICS = {
    classic: { name: 'Trenchcoat Classic', coat: '#2f2a52', accent: '#d9d2ff' },
    parade:  { name: 'Parade Float',       coat: '#c8324f', accent: '#ffe6a8' },
    duck:    { name: 'Duck Sympathiser',   coat: '#c8a227', accent: '#fff4c2' },
    anon:    { name: 'Anonymous Grey',     coat: '#3b4250', accent: '#c9d6e8' },
    vapour:  { name: 'Bait & Switch',      coat: '#7a2ff5', accent: '#7ce8ff' },
    gold:    { name: 'Solid Gold Roll',    coat: '#b08400', accent: '#ffd24a' }
  };

  /* Upgrades. cost(level) is what the NEXT level costs. */
  var UPGRADES = [
    {
      id: 'magnet', name: 'DIAMOND MAGNET', max: 5,
      desc: 'Never gonna let you down: diamonds drift toward you from further away.',
      cost: function (l) { return 35 + l * 45; }
    },
    {
      id: 'heart', name: 'SPARE HEART', max: 3,
      desc: 'Start each run with one more heart. Duckrolls are unimpressed.',
      cost: function (l) { return 120 + l * 160; }
    },
    {
      id: 'dash', name: 'DASH TUNING', max: 4,
      desc: 'Shorter dash cooldown. Dashing also gives you a sliver of invincibility.',
      cost: function (l) { return 60 + l * 70; }
    },
    {
      id: 'value', name: 'CUT & POLISH', max: 5,
      desc: 'Every diamond is worth +1. Compounds viciously with big combos.',
      cost: function (l) { return 80 + l * 95; }
    },
    {
      id: 'boots', name: 'DANCING BOOTS', max: 4,
      desc: 'Move faster. Mildly awkward choreography, objectively better numbers.',
      cost: function (l) { return 55 + l * 65; }
    },
    {
      id: 'luck', name: 'RENEWED INTEREST', max: 3,
      desc: 'Golden diamonds and power-ups show up more often.',
      cost: function (l) { return 140 + l * 180; }
    }
  ];

  var FAKE_BUNDLES = [
    { name: 'HANDFUL OF DIAMONDS', amount: '100 💎', price: '$0.99' },
    { name: 'BUCKET OF DIAMONDS', amount: '1,200 💎', price: '$9.99', tag: 'BEST VALUE' },
    { name: 'PARADE FLOAT OF DIAMONDS', amount: '15,000 💎', price: '$99.99', tag: 'WHALE TIER' },
    { name: 'SEASON PASS: NEVER GONNA', amount: '90 days of FOMO', price: '$14.99' }
  ];

  var BUNDLE_QUIPS = [
    'The payment form is a music video. There is no payment form. This game never takes real money.',
    'You clicked a buy button and got a joke instead. That is the entire premise of this repository.',
    'We are contractually unable to give you up, let you down, or charge your card.',
    'Monetisation strategy: none. Go earn them with the arrow keys.'
  ];

  var save = load();

  function load() {
    var s = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        Object.keys(DEFAULT_SAVE).forEach(function (k) {
          if (parsed[k] !== undefined && parsed[k] !== null) s[k] = parsed[k];
        });
        // Repair partially-written upgrade maps from older saves.
        Object.keys(DEFAULT_SAVE.ups).forEach(function (k) {
          if (typeof s.ups[k] !== 'number') s.ups[k] = 0;
        });
        if (!Array.isArray(s.owned) || !s.owned.length) s.owned = ['classic'];
        if (!COSMETICS[s.coat]) s.coat = 'classic';
      }
    } catch (e) {
      /* Private mode, blocked storage, corrupt JSON — play with defaults. */
    }
    return s;
  }

  function persist() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(save));
    } catch (e) { /* nothing worth losing a run over */ }
  }

  var Shop = {
    save: save,
    COSMETICS: COSMETICS,
    UPGRADES: UPGRADES,

    lvl: function (id) { return save.ups[id] || 0; },
    persist: persist,

    addDiamonds: function (n) {
      save.bank = Math.max(0, save.bank + n);
      persist();
    },

    recordRun: function (score) {
      save.runs++;
      if (score > save.best) save.best = score;
      persist();
    },

    /* Render callbacks are injected by game.js so the store can talk back. */
    mount: function (opts) {
      Shop._itemsEl = opts.itemsEl;
      Shop._fakeEl = opts.fakeEl;
      Shop._bankEl = opts.bankEl;
      Shop._modal = opts.modal;   // function(title, body)
      Shop._toast = opts.toast;   // function(text)
    },

    render: function () {
      Shop._bankEl.textContent = save.bank;
      Shop._itemsEl.innerHTML = '';
      Shop._fakeEl.innerHTML = '';

      UPGRADES.forEach(function (u) {
        var lvl = Shop.lvl(u.id);
        var maxed = lvl >= u.max;
        var price = maxed ? 0 : u.cost(lvl);
        var card = el('div', 'card' + (maxed ? ' maxed' : ''));
        card.appendChild(el('div', 'card-name', u.name));
        card.appendChild(el('div', 'card-lvl', pips(lvl, u.max)));
        card.appendChild(el('div', 'card-desc', u.desc));
        var btn = document.createElement('button');
        btn.textContent = maxed ? 'MAXED' : price + ' 💎';
        btn.disabled = maxed || save.bank < price;
        btn.addEventListener('click', function () {
          if (save.bank < price) { global.Sound.deny(); return; }
          save.bank -= price;
          save.ups[u.id] = lvl + 1;
          persist();
          global.Sound.buy();
          Shop._toast(u.name + ' → LVL ' + (lvl + 1));
          Shop.render();
        });
        card.appendChild(btn);
        Shop._itemsEl.appendChild(card);
      });

      Shop._itemsEl.appendChild(lootCard());
      Shop._itemsEl.appendChild(adCard());
      Shop._itemsEl.appendChild(wardrobeCard());

      FAKE_BUNDLES.forEach(function (b, i) {
        var card = el('div', 'card fake');
        card.appendChild(el('div', 'card-name', b.name));
        card.appendChild(el('div', 'card-lvl', b.tag || 'LIMITED TIME'));
        card.appendChild(el('div', 'card-desc', b.amount));
        var btn = document.createElement('button');
        btn.textContent = b.price;
        btn.addEventListener('click', function () {
          var body = BUNDLE_QUIPS[i % BUNDLE_QUIPS.length];
          if (!save.sawBundleJoke) {
            save.sawBundleJoke = true;
            save.bank += 25;
            persist();
            body += ' Here are 25 diamonds for your trouble.';
            global.Sound.buy();
          } else {
            global.Sound.deny();
          }
          Shop._modal('BAIT, MEET SWITCH', body);
          Shop.render();
        });
        card.appendChild(btn);
        Shop._fakeEl.appendChild(card);
      });
    }
  };

  function lootCard() {
    var LOOT_COST = 70;
    var card = el('div', 'card');
    card.appendChild(el('div', 'card-name', 'MYSTERY CRATE'));
    card.appendChild(el('div', 'card-lvl', owned() + '/' + Object.keys(COSMETICS).length + ' COATS'));
    card.appendChild(el('div', 'card-desc', 'A random coat you do not own yet. Duplicates are refunded, because duplicate protection should not be a business model.'));
    var btn = document.createElement('button');
    var all = owned() >= Object.keys(COSMETICS).length;
    btn.textContent = all ? 'ALL OWNED' : LOOT_COST + ' 💎';
    btn.disabled = all || save.bank < LOOT_COST;
    btn.addEventListener('click', function () {
      if (save.bank < LOOT_COST) { global.Sound.deny(); return; }
      var pool = Object.keys(COSMETICS).filter(function (k) { return save.owned.indexOf(k) < 0; });
      if (!pool.length) { global.Sound.deny(); return; }
      save.bank -= LOOT_COST;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      save.owned.push(pick);
      save.coat = pick;
      persist();
      global.Sound.power();
      Shop._modal('CRATE OPENED', 'You got: ' + COSMETICS[pick].name + '. It has been equipped, because scrolling through a wardrobe is nobody\'s idea of a good time.');
      Shop.render();
    });
    card.appendChild(btn);
    return card;
  }

  function adCard() {
    var COST = 220;
    var card = el('div', 'card' + (save.noAds ? ' maxed' : ''));
    card.appendChild(el('div', 'card-name', 'REMOVE ADS'));
    card.appendChild(el('div', 'card-lvl', save.noAds ? 'PURCHASED' : 'ONE TIME'));
    card.appendChild(el('div', 'card-desc', 'Permanently silences the fake ad banner. The ad was fake. The removal is real. Make of that what you will.'));
    var btn = document.createElement('button');
    btn.textContent = save.noAds ? 'ENJOY THE SILENCE' : COST + ' 💎';
    btn.disabled = save.noAds || save.bank < COST;
    btn.addEventListener('click', function () {
      if (save.bank < COST) { global.Sound.deny(); return; }
      save.bank -= COST;
      save.noAds = true;
      persist();
      global.Sound.buy();
      Shop._toast('ADS REMOVED');
      Shop.render();
      if (Shop.onAdsRemoved) Shop.onAdsRemoved();
    });
    card.appendChild(btn);
    return card;
  }

  function wardrobeCard() {
    var card = el('div', 'card');
    card.appendChild(el('div', 'card-name', 'WARDROBE'));
    card.appendChild(el('div', 'card-lvl', COSMETICS[save.coat].name.toUpperCase()));
    card.appendChild(el('div', 'card-desc', 'Click a coat you own to wear it.'));
    var row = el('div', 'card-desc');
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    row.style.gap = '6px';
    save.owned.forEach(function (id) {
      var c = COSMETICS[id];
      if (!c) return;
      var sw = document.createElement('button');
      sw.title = c.name;
      sw.style.width = '26px';
      sw.style.height = '26px';
      sw.style.padding = '0';
      sw.style.background = c.coat;
      sw.style.borderColor = save.coat === id ? c.accent : 'transparent';
      sw.style.borderWidth = '2px';
      sw.addEventListener('click', function () {
        save.coat = id;
        persist();
        global.Sound.pickup(1);
        Shop.render();
      });
      row.appendChild(sw);
    });
    card.appendChild(row);
    return card;
  }

  function owned() { return save.owned.length; }

  function pips(lvl, max) {
    var s = '';
    for (var i = 0; i < max; i++) s += i < lvl ? '●' : '○';
    return s;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  global.Shop = Shop;
})(window);
