# Vendored harfbuzzjs (rebuilt with vertical layout)

Upstream: https://github.com/harfbuzz/harfbuzzjs tag `v0.10.3`
(HarfBuzz submodule `da69b6585cad71ff72d06d7563952cbf52b7735a`, HarfBuzz 14.0.0).

The npm release is built with `-DHB_TINY`, which implies `HB_NO_VERTICAL`:
GPOS y-advance application and vertical metrics are compiled out, so the
in-app shaping preview could never show `vkrn` (vertical kerning) effects.

This copy is byte-identical to the npm package except:

- `config-override.h`: added `#undef HB_NO_VERTICAL` (the only source change;
  the file is included here for provenance).
- `hb.js` / `hb.wasm`: rebuilt from that config with
  `docker run --rm -v "$PWD":/src -w /src emscripten/emsdk:3.1.56 make hb.js`.
  hb.wasm grows ~11 KB (397 KB -> 408 KB).
- `package.json`: version suffixed `-kumiko.1`, `scripts.prepare` removed so
  installs never try to run make.

`hbjs.js`, `index.js`, and `LICENSE` are unmodified upstream files.

To upgrade: clone the new upstream tag with submodules, re-apply the
one-line `config-override.h` change, rebuild with the same container, and
re-run `test/openTypeFeatures/verticalKerning.test.ts` — it asserts that
ttb shaping applies the vkrn y-advance.
