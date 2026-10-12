import { assert } from 'chai';
import Dec from 'decimal.js';
import sinon from 'sinon';
import { actionAddresses } from '@defisaver/sdk';
import { encodeAbiParameters, type Hex, padHex } from 'viem';
import { erc20Abi } from '../src/abi';
import { DEFAULT_ADDRESSES } from '../src/config/addresses';
import { silentLogger } from '../src/interfaces/Logger';
import {
  DFS_SELL_TOPIC, parseAaveFlashLoanFees, parseDfsReceiptEvents, parseSellEvents, parseSwapRate, SWAP_TOPIC, TRANSFER_TOPIC, TRANSFORMED_ERC20_TOPIC,
} from '../src/services/receiptEvents';
import TxSender from '../src/TxSender';
import TxWrapper from '../src/TxWrapper';
import { type EventData, NetworkNumber, TxType } from '../src/types';
import {
  ACCOUNT, createMockChain, createMockConfig, FEE_ADDRESS, receipt, SPENDER, TOKEN,
} from './utils/mocks';

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WRAPPER = '0x8888888888888888888888888888888888888888';
const addresses = DEFAULT_ADDRESSES[NetworkNumber.Eth];
const uint = (value: bigint) => encodeAbiParameters([{ type: 'uint256' }], [value]);

/** `DFSSell` action event: the name hash in topics[1], the payload wrapped in `bytes`. */
const sellLog = (sellToken: string, buyToken: string, sellAmount: bigint, buyAmount: bigint) => ({
  address: WRAPPER,
  topics: [padHex('0x01', { size: 32 }), DFS_SELL_TOPIC],
  data: encodeAbiParameters([{ type: 'bytes' }], [encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    [WRAPPER, sellToken as Hex, buyToken as Hex, sellAmount, buyAmount, 0n],
  )]),
});

const transferLog = (token: string, to: string, value: bigint) => ({
  address: token,
  topics: [TRANSFER_TOPIC, padHex(ACCOUNT, { size: 32 }), padHex(to as Hex, { size: 32 })],
  data: uint(value),
});

const swapLog = (in0: bigint, in1: bigint, out0: bigint, out1: bigint) => ({
  address: SPENDER,
  topics: [SWAP_TOPIC],
  data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [in0, in1, out0, out1]),
});

describe('receipt events', () => {
  afterEach(() => sinon.restore());

  const parse = (logs: ReturnType<typeof transferLog>[], extra: { additionalInfo?: Record<string, string>; logger?: typeof silentLogger } = {}) => parseDfsReceiptEvents({
    chain: createMockChain(), receipt: receipt({ logs }), network: NetworkNumber.Eth, addresses, ...extra,
  });

  it('decodes DFSSell events into recipe swaps with token data', async () => {
    const logs = [sellLog(TOKEN, WETH, 3000n * 10n ** 18n, 10n ** 18n), sellLog(TOKEN, WETH, 0n, 0n)];
    assert.lengthOf(parseSellEvents(receipt({ logs })), 2);

    const { recipeSwaps, swapRate } = await parse(logs, { additionalInfo: { firstToken: 'DAI', secondToken: 'ETH' } });

    assert.lengthOf(recipeSwaps, 1); // Empty sells are dropped.
    assert.equal(recipeSwaps[0].sellToken.symbol, 'DAI');
    assert.equal(recipeSwaps[0].buyToken.symbol, 'WETH');
    assert.equal(recipeSwaps[0].sellAmount, '3000');
    assert.equal(recipeSwaps[0].buyAmount, '1');
    assert.equal(recipeSwaps[0].swapRate, '3000');
    assert.equal(recipeSwaps[0].wrapper, WRAPPER);
    assert.isUndefined(swapRate); // Only computed when there are no recipe swaps.
  });

  it('sums service fee transfers per asset and unwraps WETH', async () => {
    const { fees } = await parse([
      transferLog(TOKEN, FEE_ADDRESS, 5n * 10n ** 18n),
      transferLog(TOKEN, FEE_ADDRESS, 25n * 10n ** 17n),
      transferLog(WETH, FEE_ADDRESS, 10n ** 16n),
      transferLog(TOKEN, SPENDER, 10n ** 18n), // not a fee
    ]);

    assert.deepEqual(fees, [
      { feeAsset: 'DAI', feeAmount: 7.5, type: 'service' },
      { feeAsset: 'ETH', feeAmount: 0.01, type: 'service' },
    ]);
  });

  it('keeps the swaps and reports when the fee recipient lookup fails', async () => {
    const chain = createMockChain();
    chain.call.rejects(new Error('rpc down'));
    const captureException = sinon.spy();

    const result = await parseDfsReceiptEvents({
      chain,
      receipt: receipt({ logs: [sellLog(TOKEN, WETH, 3000n * 10n ** 18n, 10n ** 18n), transferLog(TOKEN, FEE_ADDRESS, 10n ** 18n)] }),
      network: NetworkNumber.Eth,
      addresses,
      logger: { ...silentLogger, captureException },
    });

    assert.lengthOf(result.recipeSwaps, 1);
    assert.deepEqual(result.fees, []);
    sinon.assert.calledWith(captureException, sinon.match.instanceOf(Error), sinon.match({ type: 'parseServiceFees' }));
  });

  it('reports the Aave flashloan fee as the delta between loan and repayment', () => {
    const flAaveV2 = (actionAddresses(NetworkNumber.Eth as unknown as null) as unknown as Record<string, string>).FLAaveV2;
    const fees = parseAaveFlashLoanFees(receipt({
      logs: [transferLog(WETH, flAaveV2, 100n * 10n ** 18n), transferLog(WETH, flAaveV2, 10009n * 10n ** 16n)],
    }), NetworkNumber.Eth);

    assert.lengthOf(fees, 1);
    assert.equal(fees[0].feeAsset, 'ETH');
    assert.equal(fees[0].type, 'aaveFL');
    assert.closeTo(fees[0].feeAmount, 0.09, 1e-9);
  });

  it('falls back to a swap rate from 0x or on-chain Swap events when there is no DFSSell', async () => {
    const info = { firstToken: 'ETH', secondToken: 'DAI' };
    const zeroX = {
      address: addresses.zeroXExchangeProxy,
      topics: [TRANSFORMED_ERC20_TOPIC, padHex(ACCOUNT, { size: 32 })],
      data: encodeAbiParameters(
        [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
        [WETH, TOKEN, 10n ** 18n, 3000n * 10n ** 18n],
      ),
    };
    assert.equal(parseSwapRate(receipt({ logs: [zeroX] }), info, NetworkNumber.Eth, addresses.zeroXExchangeProxy), new Dec(1).div(3000).toString());

    const onChain = [swapLog(10n ** 18n, 0n, 0n, 1500n * 10n ** 18n), swapLog(0n, 10n ** 18n, 3000n * 10n ** 18n, 0n)];
    const { swapRate, recipeSwaps } = await parse(onChain, { additionalInfo: info });
    assert.deepEqual(recipeSwaps, []);
    assert.equal(swapRate, new Dec(1).div(3000).toString()); // amount in from the first hop, amount out from the last

    assert.isUndefined((await parse(onChain)).swapRate); // needs firstToken / secondToken
  });

  it('attaches the parsed events to the confirmed notification, unless the hook overrides parsing', async () => {
    const tx = () => new TxWrapper(TxType.Normal, {
      title: 'Sell DAI',
      protocol: 'exchange',
      category: 'sell',
      executingAddress: ACCOUNT,
      contractCallParams: {
        address: TOKEN, abi: erc20Abi, method: 'approve', methodParams: [SPENDER, '1'],
      },
    });
    const minedWith = (logs: ReturnType<typeof transferLog>[]) => {
      const chain = createMockChain();
      chain.sendTransaction.callsFake(async (_params: unknown, onTxHash: (h: string) => Promise<void>) => {
        await onTxHash(receipt().transactionHash);
        return receipt({ logs });
      });
      return chain;
    };
    const confirmedEventData = (ui: ReturnType<typeof createMockConfig>['ui']) => (Object.values((ui as unknown as { notifications: Record<string, { eventData?: EventData }> }).notifications)
      .find((n) => n.eventData)?.eventData);

    const builtIn = createMockConfig({ chain: minedWith([sellLog(TOKEN, WETH, 3000n * 10n ** 18n, 10n ** 18n), transferLog(TOKEN, FEE_ADDRESS, 10n ** 18n)]) });
    await new TxSender([tx()], builtIn).execute();
    const eventData = confirmedEventData(builtIn.ui);
    assert.equal(eventData?.recipeSwaps[0].swapRate, '3000');
    assert.deepEqual(eventData?.fees, [{ feeAsset: 'DAI', feeAmount: 1, type: 'service' }]);

    const custom: EventData = { recipeSwaps: [], fees: [], swapRate: '42' };
    const overridden = createMockConfig({
      chain: minedWith([sellLog(TOKEN, WETH, 3000n * 10n ** 18n, 10n ** 18n)]),
      hooks: { parseReceiptEvents: async () => custom },
    });
    await new TxSender([tx()], overridden).execute();
    assert.deepEqual(confirmedEventData(overridden.ui), custom);
  });
});
