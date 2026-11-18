# Toolchain baseline for the bun-native scaffold

Ticket: issue #4 ("Pin the bun-native toolchain versions and root configs"), part of #1.
Date: 2026-11-18.
Scope: root config + version pins only. Does not edit the map (issue #1).

## Method

1. Used `ctx7` first for Bun, Oxlint, Oxfmt, Vitest, TypeScript and fast-check (team
   policy in `~/.config/opencode/docs/tooling.md`, "Library search: ctx7 first, always").
   All six libraries resolved in the trusted index with High reputation.
2. Read team rules `rules/general.md` (#8, #11, #15, #18, #19) and `rules/linting.md`
   (#1, #3a, #4-#10, package gate).
3. Copied the machine-readable configs from `configs/.oxfmtrc.json` and
   `configs/.oxlintrc.json` verbatim.
4. Confirmed exact versions with `npm view <pkg> version` and `npm view <pkg> dist-tags`.
5. Read bootstrap pack sections 7 and 21. Its pnpm / Biome / Vitest defaults are
   overridden by the chosen bun-native stack.

## Answer summary

| Item | Decision |
| --- | --- |
| `packageManager` | `bun@1.4.4` |
| workspaces | `["apps/*", "packages/*"]` + `"private": true` |
| Formatter config | Root `.oxfmtrc.json`, copied verbatim from team `configs/` |
| Linter config | Root `.oxlintrc.json`, copied verbatim from team `configs/` |
| `bunfig.toml` | Not needed. Do not add `[fmt]` there. Do not add the `oxfmt` package. |
| TypeScript base | Strict ESM, `noEmit`, extensionless imports (`allowImportingTsExtensions: false`) |
| Test runner | `bun test --check` by default. No Vitest at scaffold time. |
| fast-check | Runs under `bun test` with `fc.assert` inside `test()` blocks. Only test dependency. |
| Version pins | Bun `1.4.4`; TypeScript `7.0.2`; fast-check `4.10.2` |

---

## 1. Root `package.json`: `packageManager` and workspaces

Use the latest stable Bun from the registry as an exact pin:

```json
{
  "name": "graveshift",
  "private": true,
  "packageManager": "bun@1.4.4",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "format": "bun fmt",
    "format:check": "bun fmt --check",
    "lint": "bun lint --no-script --max-warnings=0 --allow-unsupported",
    "typecheck": "bun check --no-script",
    "test": "bun test --check && bun test"
  },
  "devDependencies": {
    "typescript": "7.0.2",
    "fast-check": "4.10.2"
  }
}
```

- `private: true` prevents accidental publishing (ctx7: Bun, `docs/guides/install/workspaces.mdx`).
- `workspaces` uses glob patterns; `packages/*` makes each subdirectory a workspace
  (ctx7: Bun, `docs/pm/workspaces.mdx` and `docs/guides/install/workspaces.mdx`).
- `examples/haunted-candy-shop` stays out of `workspaces`: bootstrap §12 puts it in its
  own public repo and only vendors it for local runs. Add `examples/*` later if the
  vendored demo becomes an editable local package.
- Link local packages with `"workspace:*"` (ctx7: Bun workspaces docs).
- Team rule `general.md` #18 requires the `bun@1.x` value to come from `packageManager`;
  CI must use `oven-sh/setup-bun@v2` with `bun-version-file: package.json`
  (team rule `rules/github-actions.md` #1) so no hand-typed tag is used.
- Install with `bun install`; use `bun install --frozen-lockfile` in CI and Docker
  (`general.md` #18).

## 2. Root `.oxfmtrc.json` and `.oxlintrc.json`; `bunfig.toml`

Copy both files verbatim to the repo root. Do not add per-app overrides
(`linting.md` #1, #4; `general.md` #19 needs a repo-wide grep for old tool names).

### `.oxfmtrc.json` (exact bytes from team `configs/`)

```json
{
  "singleQuote": true,
  "sortPackageJson": false,
  "ignorePatterns": ["*.md", "**/next-env.d.ts"]
}
```

### `.oxlintrc.json` (exact bytes from team `configs/`)

```json
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "plugins": ["react", "react_perf", "nextjs", "typescript", "import", "jest", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  },
  "rules": {
    "no-unused-vars": [
      "error",
      {
        "varsIgnorePattern": "^_",
        "argsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }
    ],
    "no-explicit-any": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-debugger": "warn",
    "react/react-in-jsx-scope": "off",
    "react/no-array-index-key": "warn",
    "eslint/no-underscore-dangle": "off",
    "import/no-duplicates": ["error", { "prefer-inline": true }],
    "import/no-named-as-default-member": "off",
    "import/no-unassigned-import": "off",
    "max-lines": ["error", 300]
  },
  "overrides": [
    {
      "files": ["**/*.{test,spec}.{ts,tsx}"],
      "plugins": ["jest", "vitest"],
      "rules": {
        "no-explicit-any": "off",
        "jest/expect-expect": "off",
        "vitest/expect-expect": "off",
        "jest/no-conditional-expect": "off",
        "vitest/no-conditional-expect": "off",
        "jest/valid-title": "off",
        "vitest/valid-title": "off",
        "vitest/require-mock-type-parameters": "off"
      }
    }
  ],
  "ignorePatterns": [
    "node_modules/**",
    "dist/**",
    ".next/**",
    "coverage/**",
    ".turbo/**",
    "build/**",
    "www/**",
    "test-results/**",
    ".expo/**",
    "**/next-env.d.ts"
  ]
}
```

### `bunfig.toml`: no

- `bun fmt` reads `.oxfmtrc.json` natively (ctx7: Bun, `docs/guides/format/migrate-from-oxfmt.mdx`
  and `docs/format/index.mdx`). It also reads `.oxfmtrc.jsonc` and `oxfmt.config.ts`,
  but the team baseline requires the static JSON file.
- Do not migrate formatter settings into `bunfig.toml [fmt]`. Without `.oxfmtrc.json`,
  Bun falls back to its own printer and reformats most files (team `linting.md` #1,
  Gia Su Anh Minh 2026-10, ADR-0012).
- Remove the `oxfmt` package (`bun remove oxfmt`); run `bun fmt --doctor` to prove
  100% native formatting and zero removable packages.
- Markdown stays in `ignorePatterns`; never auto-format `*.md` (`linting.md` #3).
- Keep type-aware linting off (`linting.md` #5). Type checks belong to `bun check`.
- Resolve findings in code or scoped `overrides`; never use inline disable comments
  (`linting.md` #10).

## 3. `tsconfig.base.json` for strict ESM TypeScript

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": false,
    "types": ["bun"]
  }
}
```

Rationale and sources:

- Bun's recommended config uses `lib: ["ESNext"]`, `target: "ESNext"`,
  `moduleDetection: "force"`, `moduleResolution: "bundler"`, `verbatimModuleSyntax: true`,
  `noEmit: true`, `strict: true`, `skipLibCheck: true`, `noFallthroughCasesInSwitch: true`,
  `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`
  (ctx7: Bun, `docs/typescript-6.mdx` and `docs/guides/runtime/typescript.mdx`).
- TypeScript 7's generated template also defaults `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules` and `skipLibCheck`
  to true (ctx7: TypeScript, `tsc/internal/execute/tsc/init.go`). We set them explicitly
  so behavior does not depend on the compiler version.
- `allowImportingTsExtensions: false` is mandatory here. Team `general.md` #11 forbids
  file extensions in import specifiers. This deliberately differs from Bun's default
  recommendation of `true`.
- `noEmit: true` matches the bun-native rule: workspace packages that export source
  (`./index.ts`) set `"build"`, `"typecheck"`, `"format"` and `"format:check"` to
  `bun check` / `bun fmt`, never `tsc -b` (`general.md` #18). Restore `tsc -b` only for a
  package that publishes declarations under `dist/`.
- `types: ["bun"]` gives `bun:test` globals to the guardrail packages. Browser apps
  (Next.js dashboard) extend this base and override `types` and `lib` as needed.
- `erasableSyntaxOnly: true` keeps source runnable by Bun without a transpile step
  (no enums, namespaces or parameter properties).

## 4. Test runner and fast-check property tests

- Default: `bun test --check`. It type-checks the test files and everything they import,
  then runs the tests; a type error exits 1 and runs no tests
  (ctx7: Bun, `docs/test/index.mdx` and `docs/runtime/check.mdx`).
- Team `general.md` #18: use `bun test --check` by default. Use Vitest only when
  `vi.hoisted`, browser mode, or branch coverage is required. None of these is in the
  scaffold, so Vitest is not a dependency at this stage.
- fast-check is test-runner agnostic and has a first-party Bun test-runner tutorial
  (ctx7: fast-check, `website/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-bun-test-runner.md`).
  Guardrail packages (policy, redactor, state machine, approvals, patch guard, audit
  chain — bootstrap §14) will write `import { describe, it, expect } from 'bun:test'`
  plus `import * as fc from 'fast-check'`, and call `fc.assert(fc.property(...))`
  inside `it()` blocks. The package gate stays `bun test --check` before `bun test`.
- Only test dependency: `fast-check` pinned to `4.10.2` (`bun add -D fast-check@4.10.2`).
- If branch coverage or browser mode becomes necessary later, add Vitest then, together
  with `@vitest/coverage-v8` and `@fast-check/vitest`. Do not pre-install them now.
  Bootstrap §7/§14 lists Vitest, but the bun-native decision overrides that default.

## 5. Exact version pins

`npm view` on 2026-11-18 (registry is the confirmation step, after ctx7):

| Package | Pin | Registry evidence |
| --- | --- | --- |
| bun | `1.4.4` | `npm view bun version` = `1.4.4`; dist-tags `latest: 1.4.4`, `canary: 1.4.4-canary.20261117.1` |
| typescript | `7.0.2` | `npm view typescript version` = `7.0.2`; dist-tags `latest: 7.0.2` (`rc: 7.0.1-rc`, `next: 7.1.0-dev...`) |
| fast-check | `4.10.2` | `npm view fast-check version` = `4.10.2`; dist-tag `latest: 4.10.2` |
| vitest | not installed | Registry latest is `5.1.0`; only add if a rule #18 exception appears |
| oxlint / oxfmt | not installed | `bun lint` and `bun fmt` are built into Bun; registry latest `1.94.0` / `0.79.0` only for reference |

- Bootstrap §7 says "TypeScript 5.x" and "take the latest stable". These conflict;
  the explicit instruction to confirm with the package registry governs, so pin the
  stable `7.0.2`, not a 5.x release.
- Bootstrap §21 item 6 asks to verify Vitest and fast-check majors at D0-D1. Done above.

### `bun lint --no-script` and the canary question

Team `rules/linting.md` #3a says Bun 1.4.4 stable lacks `--no-script` and that a canary
build supports it. Direct check on this machine on 2026-11-18 contradicts that:

- `bun --version` = `1.4.4`; `bun lint --help` in a directory without `package.json`
  lists `--no-script  Run the linter even if the project has a lint script`.
- Probe with a `package.json` whose `lint` script echoes `SCRIPT_RAN`:
  `bun lint` printed `SCRIPT_RAN`; `bun lint --no-script` bypassed the script and
  invoked the linter. Behavior is correct.

Decision: pin stable `bun@1.4.4` in `packageManager`. Do not add a canary to the
lockfile. Still keep the rule's CI guard, because the rule says never trust the local
Bun build:

```sh
(cd "$(mktemp -d)" && bun lint --help | grep -q -- --no-script)
```

If that guard fails on the CI image, pin the canary separately at a distinct path:
`bun@1.4.4-canary.20261117.1` (current registry `canary` tag). Do not put a canary in
`packageManager` for the whole repo.
Per `general.md` #8, suggest updating `rules/linting.md` #3a: the statement about
Bun 1.4.4 stable is stale for the current 1.4.4 release; keep the CI assertion.

## 6. Commands that must pass

Run in this order. The formatter must run before the linter (`linting.md` #9,
`general.md` #15): `bun fmt` expands compact syntax by 1.4x-2.5x and exposes
`max-lines: 300` overruns that a pre-format lint would miss.

1. Format (write, then verify in CI):

   ```sh
   bun fmt
   bun fmt --check
   ```

2. Lint (root, all workspaces, zero warnings):

   ```sh
   bun lint --no-script --max-warnings=0 --allow-unsupported
   ```

3. Typecheck:

   ```sh
   bun check --no-script
   ```

4. Test (type-check the tests first, then run them):

   ```sh
   bun test --check
   bun test
   ```

`--no-script` on `bun check` forces the type checker even if a `check` script is
added later (ctx7: Bun, `docs/runtime/check.mdx`).
`--allow-unsupported` is required by the team baseline for the oxlint flag set.
`--no-script` on `bun lint` prevents the `lint` script from re-entering `bun lint`
until `E2BIG` (`linting.md` #3a; Ecopick 2026-11 precedent).
CI gate order: `format:check` before `lint`, so a lint failure cannot hide format debt
(`linting.md` #9a). Do not use inline disable comments; grep changed files for
`disable-next-line|oxlint-ignore` before claiming zero findings (`linting.md` #10).

## Sources

- ctx7 (queried first): library IDs `/oven-sh/bun`, `/microsoft/typescript`,
  `/dubzzz/fast-check`, `/vitest-dev/vitest`, and resolved Oxlint/Oxfmt docs.
  Library IDs resolved with `ctx7 library <name>`; docs with `ctx7 docs <id> <query>`.
- Team rules:
  - https://raw.githubusercontent.com/The-Resonance-Team/skills/main/rules/general.md (#8, #11, #15, #18, #19)
  - https://raw.githubusercontent.com/The-Resonance-Team/skills/main/rules/linting.md (#1, #3a, #4-#10, #13b, package gate)
  - https://raw.githubusercontent.com/The-Resonance-Team/skills/main/rules/github-actions.md (#1)
- Machine configs:
  - https://raw.githubusercontent.com/The-Resonance-Team/skills/main/configs/.oxfmtrc.json
  - https://raw.githubusercontent.com/The-Resonance-Team/skills/main/configs/.oxlintrc.json
- Tooling policy: `~/.config/opencode/docs/tooling.md` ("Library search: ctx7 first, always").
- Registry: `npm view bun version|dist-tags`, `npm view typescript version|dist-tags`,
  `npm view fast-check version|dist-tags`, `npm view vitest version`.
- Bootstrap pack: `/Users/xirothedev/Downloads/GRAVESHIFT_BOOTSTRAP.md` §7 and §21 (also §12, §14).
- Ticket: https://github.com/The-Resonance-Team/graveshift/issues/4
