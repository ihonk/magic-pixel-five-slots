# Magic Fever QA

Run the deterministic production-logic checks with:

```sh
node qa/test-game.mjs
```

The harness evaluates the repository's real `game.js` with small DOM, Three.js,
and fake-timer adapters. It does not copy the game algorithms. Covered behavior:

- four-direction connectivity (including L shapes and excluding diagonals);
- lowest occupied cell exposure independently for every column;
- largest exposed same-color target selection;
- five-full-slot deadlock;
- last-component level completion and delayed win modal;
- effect lifecycle cleanup;
- restart state restoration and isolation from pre-restart timers.

This is intentionally dependency-free so it can run in CI or locally with Node.
