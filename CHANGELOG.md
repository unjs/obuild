# Changelog


## v0.3.2

[compare changes](https://github.com/unjs/obuild/compare/v0.3.1...v0.3.2)

### 🩹 Fixes

- Correctly apply transform `filter` hook ([eee3f4d](https://github.com/unjs/obuild/commit/eee3f4d))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.3.1

[compare changes](https://github.com/unjs/obuild/compare/v0.3.0...v0.3.1)

### 🚀 Enhancements

- Basic transform filter support ([aebfaca](https://github.com/unjs/obuild/commit/aebfaca))

### 🏡 Chore

- Update deps ([b3abd69](https://github.com/unjs/obuild/commit/b3abd69))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.3.0

[compare changes](https://github.com/unjs/obuild/compare/v0.2.1...v0.3.0)

### 🚀 Enhancements

- **transform:** Add resolve options for `TransformEntry` ([#32](https://github.com/unjs/obuild/pull/32))

### 🩹 Fixes

- Move to `pathe` ([#57](https://github.com/unjs/obuild/pull/57))
- **stub:** Use relative paths in stubs to fix Windows resolution ([#51](https://github.com/unjs/obuild/pull/51))

### 💅 Refactors

- Remove extra await ([#45](https://github.com/unjs/obuild/pull/45))

### 📖 Documentation

- Fix `defineBuildConfig` import ([#36](https://github.com/unjs/obuild/pull/36))
- Capitalise titles ([#44](https://github.com/unjs/obuild/pull/44))

### 📦 Build

- ⚠️  Update deps ([b576b72](https://github.com/unjs/obuild/commit/b576b72))

### 🏡 Chore

- Update eslint config ([a2e3d88](https://github.com/unjs/obuild/commit/a2e3d88))
- Update imports ([3a1f342](https://github.com/unjs/obuild/commit/3a1f342))
- Use native node typescript support ([#54](https://github.com/unjs/obuild/pull/54))

#### ⚠️ Breaking Changes

- ⚠️  Update deps ([b576b72](https://github.com/unjs/obuild/commit/b576b72))

### ❤️ Contributors

- Author: Sunny-117 <zhiqiangfu6@gmail.com>
- Daniel Schmitz ([@blouflashdb](https://github.com/blouflashdb))
- Abeer0 ([@iiio2](https://github.com/iiio2))
- Damian Głowala ([@DamianGlowala](https://github.com/DamianGlowala))
- Pooya Parsa ([@pi0](https://github.com/pi0))
- Typed SIGTERM ([@typed-sigterm](https://github.com/typed-sigterm))
- Balázs Németh ([@zsilbi](https://github.com/zsilbi))

## v0.2.1

[compare changes](https://github.com/unjs/obuild/compare/v0.2.0...v0.2.1)

### 🩹 Fixes

- Programmatic build with string entries ([#30](https://github.com/unjs/obuild/pull/30))

### 💅 Refactors

- Fix stub cli messages ([5c02fed](https://github.com/unjs/obuild/commit/5c02fed))

### 🏡 Chore

- Update deps ([4351bb8](https://github.com/unjs/obuild/commit/4351bb8))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))
- Balázs Németh ([@zsilbi](https://github.com/zsilbi))

## v0.2.0

[compare changes](https://github.com/unjs/obuild/compare/v0.1.1...v0.2.0)

### 🚀 Enhancements

- Passthrough stub mode ([#28](https://github.com/unjs/obuild/pull/28))
- Add `+x` permission to CLI entries ([#26](https://github.com/unjs/obuild/pull/26))
- ⚠️  Allow passing all `dts` options for bundle ([2bab1e8](https://github.com/unjs/obuild/commit/2bab1e8))
- ⚠️  Allow passing all `oxc-transform` options ([5729956](https://github.com/unjs/obuild/commit/5729956))
- Allow passing all rolldown config to build entries ([edd39af](https://github.com/unjs/obuild/commit/edd39af))
- ⚠️  Unified config for programmatic api ([33a5869](https://github.com/unjs/obuild/commit/33a5869))

### 📖 Documentation

- Update usage ([6d5567e](https://github.com/unjs/obuild/commit/6d5567e))

### 🏡 Chore

- **release:** V0.1.1 ([2ee321a](https://github.com/unjs/obuild/commit/2ee321a))
- Add link to difference explanations ([7deb98d](https://github.com/unjs/obuild/commit/7deb98d))
- Update deps ([974d495](https://github.com/unjs/obuild/commit/974d495))
- Update readme ([aa3bf38](https://github.com/unjs/obuild/commit/aa3bf38))
- Update deps ([db5b27f](https://github.com/unjs/obuild/commit/db5b27f))
- Update readme ([170ebb4](https://github.com/unjs/obuild/commit/170ebb4))
- Fix test script ([12214eb](https://github.com/unjs/obuild/commit/12214eb))

### ✅ Tests

- Add initial tests ([44f23f7](https://github.com/unjs/obuild/commit/44f23f7))

#### ⚠️ Breaking Changes

- ⚠️  Allow passing all `dts` options for bundle ([2bab1e8](https://github.com/unjs/obuild/commit/2bab1e8))
- ⚠️  Allow passing all `oxc-transform` options ([5729956](https://github.com/unjs/obuild/commit/5729956))
- ⚠️  Unified config for programmatic api ([33a5869](https://github.com/unjs/obuild/commit/33a5869))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))
- Kricsleo ([@kricsleo](https://github.com/kricsleo))

## v0.1.1

[compare changes](https://github.com/unjs/obuild/compare/v0.1.0...v0.1.1)

### 🚀 Enhancements

- Better bundle analyzes ([67bd713](https://github.com/unjs/obuild/commit/67bd713))

### 🩹 Fixes

- Default rolldown platform to `neutral` ([2930787](https://github.com/unjs/obuild/commit/2930787))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.1.0

[compare changes](https://github.com/unjs/obuild/compare/v0.0.8...v0.1.0)

### 🚀 Enhancements

- ⚠️  Map dist paths based on source ([4170d54](https://github.com/unjs/obuild/commit/4170d54))

### 💅 Refactors

- Show dist info in cli output ([a6d475b](https://github.com/unjs/obuild/commit/a6d475b))

#### ⚠️ Breaking Changes

- ⚠️  Map dist paths based on source ([4170d54](https://github.com/unjs/obuild/commit/4170d54))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.0.8

[compare changes](https://github.com/unjs/obuild/compare/v0.0.7...v0.0.8)

### 🚀 Enhancements

- Support minify and declaration options (per entry) ([#20](https://github.com/unjs/obuild/pull/20))

### 💅 Refactors

- Switch to tinyglobby ([#22](https://github.com/unjs/obuild/pull/22))

### 🏡 Chore

- Update deps ([9b72c42](https://github.com/unjs/obuild/commit/9b72c42))

### ❤️ Contributors

- Restent Ou ([@gxres042](https://github.com/gxres042))
- Pooya Parsa ([@pi0](https://github.com/pi0))
- Victor Berchet ([@vicb](https://github.com/vicb))

## v0.0.7

[compare changes](https://github.com/unjs/obuild/compare/v0.0.6...v0.0.7)

### 🚀 Enhancements

- `rolldownOutput` hook ([473da81](https://github.com/unjs/obuild/commit/473da81))

### 🩹 Fixes

- Safe hash for rolldown chunks ([7c8dacc](https://github.com/unjs/obuild/commit/7c8dacc))

### 📦 Build

- Update dependencies ([21f6e1b](https://github.com/unjs/obuild/commit/21f6e1b))

### 🏡 Chore

- Use `.nvmrc` ([#19](https://github.com/unjs/obuild/pull/19))
- Update used by ([643ad16](https://github.com/unjs/obuild/commit/643ad16))
- Update type imports ([0344c18](https://github.com/unjs/obuild/commit/0344c18))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))
- Bushuai <bushuai@yahoo.com>

## v0.0.6

[compare changes](https://github.com/unjs/obuild/compare/v0.0.5...v0.0.6)

### 🩹 Fixes

- Externalize subpath exports of deps as well ([d6343a0](https://github.com/unjs/obuild/commit/d6343a0))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.0.5

[compare changes](https://github.com/unjs/obuild/compare/v0.0.4...v0.0.5)

### 🚀 Enhancements

- Support `build.config` ([#9](https://github.com/unjs/obuild/pull/9))
- Expose programmatic `build` ([e35a743](https://github.com/unjs/obuild/commit/e35a743))
- **cli:** Support multi input bundle entries ([e5e2b61](https://github.com/unjs/obuild/commit/e5e2b61))
- Basic hooks via config ([3ac4a9a](https://github.com/unjs/obuild/commit/3ac4a9a))

### 🩹 Fixes

- Correct the src directory in the transform complete message ([#10](https://github.com/unjs/obuild/pull/10))

### 🏡 Chore

- Update readme ([b46d8a4](https://github.com/unjs/obuild/commit/b46d8a4))
- Fix typo ([4d8c877](https://github.com/unjs/obuild/commit/4d8c877))
- Update readme ([7bfc621](https://github.com/unjs/obuild/commit/7bfc621))
- Update readme ([359223c](https://github.com/unjs/obuild/commit/359223c))
- **readme:** Add `omnichron` to `used by` section ([#8](https://github.com/unjs/obuild/pull/8))
- Update deps ([1b43ed6](https://github.com/unjs/obuild/commit/1b43ed6))
- Update readme ([#17](https://github.com/unjs/obuild/pull/17))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))
- Restent Ou ([@gxres042](https://github.com/gxres042))
- Connor Pearson ([@cjpearson](https://github.com/cjpearson))
- Dominik Opyd <dominik.opyd@gmail.com>
- Oskar Lebuda ([@OskarLebuda](https://github.com/OskarLebuda))

## v0.0.4

[compare changes](https://github.com/unjs/obuild/compare/v0.0.3...v0.0.4)

### 🩹 Fixes

- Increase node compat by conditionally using fs.glob ([7bb2595](https://github.com/unjs/obuild/commit/7bb2595))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.0.3

[compare changes](https://github.com/unjs/obuild/compare/v0.0.2...v0.0.3)

### 🚀 Enhancements

- Simple cli arg parser ([84ae630](https://github.com/unjs/obuild/commit/84ae630))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.0.2

[compare changes](https://github.com/unjs/obuild/compare/v0.0.1...v0.0.2)

### 🏡 Chore

- Update deps ([4e04096](https://github.com/unjs/obuild/commit/4e04096))

### 🤖 CI

- Use node 22 ([0945c9b](https://github.com/unjs/obuild/commit/0945c9b))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

## v0.0.1


### 📦 Build

- Temp fix for cli bin ([1396284](https://github.com/unjs/obuild/commit/1396284))

### 🏡 Chore

- Apply automated updates ([f942fe5](https://github.com/unjs/obuild/commit/f942fe5))
- Update lockfile ([c4005cb](https://github.com/unjs/obuild/commit/c4005cb))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))

