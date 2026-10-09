import sinon from 'sinon';
import { decodeFunctionData, encodeAbiParameters, type Hex } from 'viem';
import type { ChainAdapter, StateProvider, TxHooks, UiAdapter } from '../../src/interfaces';
import type { DfsApiOptions } from '../../src/api/DfsApi';
import type { TxSenderConfig } from '../../src/config/TxSenderConfig';
import { silentLogger } from '../../src/interfaces/Logger';
import { AccountType, type AnyProxyWallet, NetworkNumber, type TxReceipt } from '../../src/types';
import { safeAbi } from '../../src/abi';

export const ACCOUNT = '0x1111111111111111111111111111111111111111';
export const SPENDER = '0x2222222222222222222222222222222222222222';
export const TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'; // DAI
export const DS_PROXY = '0x3333333333333333333333333333333333333333';
export const SAFE = '0x4444444444444444444444444444444444444444';
export const TX_HASH = '0xabc0000000000000000000000000000000000000000000000000000000000001';
export const SAFE_TX_HASH = '0x5555555555555555555555555555555555555555555555555555555555555555';

export const receipt = (overrides: Partial<TxReceipt> = {}): TxReceipt => ({
  transactionHash: TX_HASH,
  status: true,
  gasUsed: 50_000,
  blockNumber: 1,
  from: ACCOUNT,
  to: TOKEN,
  logs: [],
  ...overrides,
});

export interface MockChainOptions {
  allowance?: bigint;
  estimateGas?: number | Error;
  chainId?: number;
}

export type StubbedChain = { [K in keyof ChainAdapter]-?: sinon.SinonStub };

/** In-memory ChainAdapter. `call` understands ERC20 allowance/decimals/symbol and Safe getTransactionHash/nonce. */
export const createMockChain = (opts: MockChainOptions = {}): ChainAdapter & StubbedChain => {
  const { allowance = 0n, estimateGas = 100_000, chainId = 1 } = opts;
  const chain = {
    getChainId: sinon.stub().resolves(chainId),
    getCode: sinon.stub().resolves('0x6000'),
    getGasPrice: sinon.stub().resolves('2000000000'),
    getLatestBaseFee: sinon.stub().resolves('1000000000'),
    call: sinon.stub().callsFake(async ({ data, to }: { data: Hex; to: string }) => {
      const selector = data.slice(0, 10);
      // allowance(address,address) / borrowAllowance
      if (selector === '0xdd62ed3e' || selector === '0x6bd76d24') return encodeAbiParameters([{ type: 'uint256' }], [allowance]);
      if (selector === '0x313ce567') return encodeAbiParameters([{ type: 'uint8' }], [18]); // decimals
      if (selector === '0x95d89b41') return encodeAbiParameters([{ type: 'string' }], ['MOCK']); // symbol
      if (selector === '0xaffed0e0') return encodeAbiParameters([{ type: 'uint256' }], [7n]); // nonce
      try {
        const decoded = decodeFunctionData({ abi: safeAbi, data });
        if (decoded.functionName === 'getTransactionHash') return SAFE_TX_HASH as Hex;
      } catch { /* not a safe call */ }
      throw new Error(`mock call: unhandled selector ${selector} on ${to}`);
    }),
    estimateGas: sinon.stub().callsFake(async () => {
      if (estimateGas instanceof Error) throw estimateGas;
      return estimateGas;
    }),
    getTransactionReceipt: sinon.stub().resolves(receipt()),
    sendTransaction: sinon.stub().callsFake(async (_params: unknown, onTxHash: (h: string) => Promise<void>) => {
      await onTxHash(TX_HASH);
      return receipt();
    }),
    signMessage: sinon.stub().resolves(`0x${'11'.repeat(64)}1b`),
    signTypedData: sinon.stub().resolves(`0x${'22'.repeat(64)}1c`),
    sendCalls: sinon.stub().resolves({ id: 'batch-1' }),
    signSafeTx: undefined as unknown as sinon.SinonStub,
  };
  delete (chain as { signSafeTx?: unknown }).signSafeTx;
  return chain as unknown as ChainAdapter & StubbedChain;
};

export const createMockState = (overrides: Partial<StateProvider> & { wallets?: AnyProxyWallet[]; proxyAddress?: string } = {}): StateProvider => {
  const { wallets = [], proxyAddress = '', ...rest } = overrides;
  return {
    getNetwork: () => NetworkNumber.Eth,
    getAccount: () => ACCOUNT,
    getAccountType: () => AccountType.Browser,
    getProxyAddress: () => proxyAddress,
    getSmartWallets: () => wallets,
    getForkId: () => undefined,
    ...rest,
  };
};

export type StubbedUi = UiAdapter & {
  notifications: Record<string, Record<string, unknown>>;
  confirmSend: sinon.SinonStub;
  confirmSign: sinon.SinonStub;
  confirmBatch: sinon.SinonStub;
  confirmDialog: sinon.SinonStub;
};

export const createMockUi = (): StubbedUi => {
  const notifications: Record<string, Record<string, unknown>> = {};
  return {
    notifications,
    createNotificationId: (tx) => `0-${tx.getTitle()}`,
    confirmSend: sinon.stub().resolves({
      isTxSaver: false, gasPrice: '20', gasLimit: 120_000, maxFee: '30', priorityFee: '1', isType2: true, failed: false,
    }),
    confirmSign: sinon.stub().resolves(true),
    confirmBatch: sinon.stub().resolves(true),
    confirmDialog: sinon.stub().resolves(true),
    addNotification: (payload) => { notifications[payload.id] = { ...payload }; },
    changeNotification: (id, changes) => { notifications[id] = { ...(notifications[id] || {}), ...changes }; },
  };
};

/** Backend options with a fetch stub that answers every endpoint the tests hit. */
export const createMockApi = (): DfsApiOptions => ({
  apiUrl: 'https://mock.defisaver.test',
  fetch: sinon.stub().callsFake(async (url: string | URL | Request) => {
    const u = String(url);
    const body = u.includes('/safe/nonce') ? { ok: true, data: 3 }
      : u.includes('/txsaver/submit') ? { txId: 42 }
        : u.includes('/txsaver/status') ? { status: 'SUCCESSFUL', txHash: TX_HASH }
          : { ok: true };
    return { ok: true, json: async () => body, text: async () => JSON.stringify(body) } as Response;
  }) as unknown as typeof fetch,
});

export const createMockConfig = (overrides: Partial<TxSenderConfig> & { hooks?: TxHooks } = {}): TxSenderConfig => ({
  chain: createMockChain(),
  state: createMockState(),
  ui: createMockUi(),
  api: createMockApi(),
  logger: silentLogger,
  ...overrides,
});
