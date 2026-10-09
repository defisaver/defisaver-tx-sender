# Examples

Reference code that is **not** part of the published package. Copy what you need into your app and adapt it.

- `adapters/viem.ts` – `ChainAdapter` built on viem's `PublicClient` + `WalletClient`.
- `adapters/web3.ts` – `ChainAdapter` built on web3.js (v1 or v4), plus `fromWeb3Contract` to turn a web3 `Contract` into `ContractCallParams`.

Both files are typechecked against `src` in this repo (`npm run typecheck`) so they stay in sync with the `ChainAdapter` interface.
