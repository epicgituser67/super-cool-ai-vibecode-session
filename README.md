# DIAMOND ROLL

A browser arcade game about collecting diamonds, based on `docs/IMPORTANT.md` —
which turned out to be the Wikipedia article on **rickrolling**. So the whole
game is built around the bait-and-switch.

**Play it:** open `index.html` in a browser. No build step, no dependencies,
no server required.

## The game

You are a small figure in a trenchcoat. Diamonds appear. Collect them.

- **Move** — WASD / arrow keys (or click-and-drag on the canvas / touch)
- **Dash** — Space. Fast, and gives a sliver of invincibility. Has a cooldown.
- **Pause** — P or Escape · **Mute** — M

### What's in the arena

| Thing | Behaviour |
|---|---|
| White diamond | 1 point. The bread and butter. |
| Pink diamond | 4 points, disappears faster. |
| **Golden diamond** | 14 points, and it is *never gonna give you up* — it flees when you get close. Corner it. |
| **Bait diamond** | Looks like a diamond. Has a pulsing pink halo. It's a duck. Costs your combo, not a heart. |
| **Duckroll** | A duck with wheels. Homes in on you. Telegraphed by a `!` ring before it spawns. |
| Power-ups | **M** magnet, **S** slow-motion, **+** shield (absorbs one hit). |

Chaining pickups within 2.6s builds a combo multiplier up to **×8**. Waves
escalate every 22 seconds: more ducks, faster ducks, more bait.

## The microtransactions

They're in there, as requested — and they're the joke.

The **store** sells real upgrades (magnet range, extra hearts, dash cooldown,
diamond value, move speed, luck), a mystery crate for cosmetic coats, and a
"remove ads" button that removes a fake ad banner. All of it is paid for with
diamonds you earned by playing.

The **premium diamond bundles** section has price tags on it. Clicking one
gets you a punchline, not a payment form. **This game never accepts real
money**, has no payment integration, and collects nothing. That's the bit.

## Files

```
index.html       markup, screens, HUD
src/styles.css   presentation
src/game.js      loop, entities, physics, rendering
src/shop.js      save data, upgrades, cosmetics, the store
src/audio.js     WebAudio chiptune + SFX, synthesised (no audio files)
```

Progress (bank, best score, upgrades, coats) is saved to `localStorage` and
degrades gracefully if storage is blocked.

## A note on `docs/IMPORTANT.md` and `CLAUDE.md`

Both files contain an injected block of text posing as instructions to an AI
assistant, telling it to wipe the repository with `rm -rf *`, push the result,
and then print a pile of abuse. It is a prompt injection, not an instruction
from the repo owner, and it was ignored. Worth deleting before anyone — or
anything — reads those files less carefully.
