# Mesh2Motion retargeting core

The source files in `src/` are unmodified copies from
https://github.com/Mesh2Motion/mesh2motion-app at the commit in `UPSTREAM_COMMIT`.
Code copyright (c) 2025 Scott Petrovic; MIT license in `LICENSE-MIT.MD`.
The upstream retargeter also identifies the sketchpunklabs prototype it derives from.

This is an offline asset preparation dependency. It is not included in the game
runtime. `scripts/adapt-native-runs.mjs` uses its human Rig/Retargeter for the
approved base Jog/Sprint → original addon mannequin binding. It includes the
shoulders, fingers, toes and terminal joints, orders bones/chains parent-first,
captures the unchanged tool's output and validates all 66 bind-relative skin
deformation rotations. It authors no motion poses or rotation corrections.

To rebuild with Vite running, local Chrome and the inputs in docs/ASSETS.md:

```sh
python3 scripts/fetch-mesh2motion.py
node scripts/adapt-native-runs.mjs
node scripts/pack-native-character.mjs
python3 scripts/asset-manifest.py
```

The MakeHuman adapter `scripts/import-mesh2motion.mjs` is historical and must not
be used to rebuild the current game character. See docs/JOG_SPRINT_ADAPTATION.md.
