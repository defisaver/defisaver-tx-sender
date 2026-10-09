# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`@defisaver/tx-sender` is a TypeScript SDK extracted from `defisaver-app/client/src/txSender`. It encodes, estimates, confirms, signs and sends DeFi Saver transactions through EOAs and smart wallets (Safe 1/1 and m/n, DSProxy, Instadapp DSA, Summer.fi). It is published to npm and must stay framework-agnostic: no React, no Redux, no `window`, no hard dependency on a specific wallet library.

The README is the source of truth for the architecture. Read it before changing anything in `src/core`.

## Commands

```bash
npm install
cp .env.example .env                  # secrets for tests, git-ignored
npm run lint                          # eslint src/ --fix, @defisaver/eslint-config (eslint 8, .eslintrc.js)
npm run lint-check                    # no --fix, used by CI
npm run typecheck                     # tsc --noEmit (covers src, tests and examples)
npm test                              # mocha tests/* via ts-node/register (chai 4, sinon)
npm run test-single --name=txEncoder  # single file; $npm_config_name needs a POSIX shell, on Windows: npx mocha tests/txEncoder.ts
npm run build                         # lint → tsc -p tsconfig.cjs.json → cjs/, tsc -p tsconfig.esm.json → esm/
npm run version-bump                  # npm version patch + commit (what the PROD workflow does)
```

Build, test and publish setup intentionally mirrors `@defisaver/positions-sdk` (same scripts, tsconfig split, `.mocharc.json`, `.npmignore`, GitHub workflows). Keep them aligned; if positions-sdk changes its process, change it here the same way. Publishing happens through the *PROD - npm publish* / *DEV - npm publish* workflows, never from a laptop.

Two deliberate deviations from positions-sdk: `moduleResolution` is `node` (not `node16`) because viem ≥ 2.4x marks its type declarations as ESM, which `node16` refuses to `require` from a CommonJS build; and `target` is `ES2020` because the Safe gas code uses bigint literals.

## Layout

```
src/
  TxSender.ts            Public facade: queue of TxWrappers, execute / estimate / batch
  TxWrapper.ts           Description of one tx or signature
  index.ts               Public exports (keep this curated)
  interfaces/            Contracts the host app implements: ChainAdapter, StateProvider, UiAdapter, TxHooks, Logger
  config/                TxSenderConfig + resolveConfig, addresses per network, messages, constants
  core/                  TxEncoder, TxUtils, TxNotifier, TxExecutor, SignatureStore, TxError
  core/encoders/         One encoder per wallet type (EOA, DSProxy, DSA, SummerFi, safe/)
  core/executors/        One executor per TxType / ExecutionType flow
  handlers/              High-level builders: approvals, Safe creation, raw calldata, create-and-execute
  services/              Pure helpers: abi, gas, assets, safe, recipe, typedData, utils, wallets
  abi/                   Minimal ABI fragments (only the functions we call, no overloads)
  api/                   DfsApi: DeFi Saver backend calls (Safe service, TxSaver, tx-error). Built in, not injectable; app supplies URLs
tests/                   mocha + chai + sinon; utils/mocks.ts has in-memory adapters, utils/assert.ts has assertRejects/envSecret
examples/adapters/       Reference ChainAdapter implementations (viem, web3). Typechecked via the
                         `@defisaver/tx-sender` path alias in tsconfig, NOT published or exported.
```

## Rules

- **Injection over imports.** Anything app-specific (state, UI, analytics, wallet library) goes through an interface in `src/interfaces`. The DeFi Saver backend is not app-specific: `DfsApi` is SDK logic and only its URLs come from config. Never import `window`, Redux, React or a wallet library from `src/core`, `src/handlers` or `src/services`.
- **viem is the internal codec only.** It is used for ABI encoding, hashing and signature recovery. Sending and signing always go through `ChainAdapter`. Never create or call viem/web3 clients under `src`.
- **No wallet adapters in the package.** The app that installs the SDK implements `ChainAdapter`. Reference implementations live in `examples/adapters` and must not be exported from `src/index.ts` or added as package entry points.
- **Keep behaviour parity with the app.** The flows (confirm dialog results, notification statuses, swap-route retry loop, TxSaver switch, Safe V adjustment) were ported 1:1. If you change a flow, update the README sequence diagram and the tests.
- **Comments are short.** One line explaining *why* when the code is not obvious. Longer explanations belong in the README, not in JSDoc.
- **ABIs are minimal.** Add only the functions you call to `src/abi/index.ts`. Avoid overloads so `encodeCall` can resolve by name; use a full signature (`execute(address,bytes)`) when an overload is unavoidable.
- **Addresses live in `src/config/addresses.ts`** and can be overridden per network through `TxSenderConfig.addresses`. Do not hardcode addresses elsewhere.
- **Public API changes go through `src/index.ts`** and the README. The package has a single entry point.
- **Tests use `tests/utils/mocks.ts`.** Extend the mock `ChainAdapter.call` selector table instead of mocking viem. Stub prototypes with `sinon.stub(...)` and call `sinon.restore()` in `afterEach`.
- **Secrets never go in test files or git.** Private keys, RPC URLs and similar live in `.env` (ignored) with placeholders in `.env.example`. Read them via `envSecret()` and `this.skip()` when absent so CI without secrets stays green.
- 2-space indentation, LF line endings, single quotes, trailing commas. `npm run lint` enforces the org style; the build fails on lint errors, so run it before committing.

## Common tasks

- **New wallet type:** add an encoder in `src/core/encoders`, register it in the `ENCODERS` map in `TxEncoder.ts`, extend `ProxyType`, add its ABI fragment.
- **New tx flow:** add a `TxType`, an executor in `src/core/executors` extending `ExecutorBase`, and a case in `TxExecutor.getExecutor`.
- **New app side effect:** add an optional method to `TxHooks`, call it from the SDK, document it in the README hooks table.
- **New backend endpoint:** add a method to `src/api/DfsApi.ts`. Do not turn the backend into an injectable interface; only its URLs are configurable.
