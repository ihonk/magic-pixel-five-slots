# Magic Fever QA

Run the deterministic production-logic checks with:

```sh
node qa/test-game.mjs
```

The harness extracts and evaluates the repository's real gameplay functions. It
does not copy the algorithms. DOM/WebGL-heavy reset behavior is checked against
the production function bodies. Covered behavior:

- four-direction connectivity (including L shapes and excluding diagonals);
- lowest occupied cell exposure independently for every column;
- largest exposed same-color target selection;
- five-full-slot deadlock;
- fuse traversal and largest exposed-component targeting;
- five-slot deadlock and pending-shot resolution guards;
- continue/revive preserving charges and queue order;
- restart cleanup of timers, projectiles, flashes, particles, hints, and intro;
- inter-level transition scheduling and wizard GPU resource disposal.

This is intentionally dependency-free so it can run in CI or locally with Node.
