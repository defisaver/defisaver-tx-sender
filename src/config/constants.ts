export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const MAXUINT = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
export const SAFE_REFUND_RECEIVER = '0x25aa0f9a42eE4Ea2Dc7f3c9fF02F558dcb0445a3';

/** Appended to calldata so DeFi Saver txs can be identified on-chain. */
export const DEFISAVER_IDENTIFICATION_SUFFIX = '1115098f';

/** 1 gwei, used when every gas price source fails during estimation. */
export const ESTIMATION_GAS_PRICE_FALLBACK = '1000000000';

/** Gas used when estimation fails; keeps the confirm dialog usable so the user sees the failure. */
export const FAILED_ESTIMATE_GAS = 4_000_000;

export const SWAP_SOURCE_NONE = 'none';

/** Approval amounts are bumped by this to cover continuously accruing fees. */
export const CONTINUOUS_FEE_MULTIPLIER = 1.00011;

/** Mainnet tokens that revert on approve(n) when allowance is non-zero. */
export const TOKENS_NEED_REAPPROVE = ['KNCL', 'USDT', 'MANA', 'ENJ', 'CRV', 'BADGER', 'SNT', 'BNT', 'LDO', 'OMG', 'TRAC'];
