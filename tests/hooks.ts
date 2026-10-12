import { assert } from 'chai';
import sinon from 'sinon';
import { encodeAbiParameters, type Hex } from 'viem';
import { erc20Abi } from '../src/abi';
import { DEFAULT_ADDRESSES } from '../src/config/addresses';
import { resolveConfig } from '../src/config/TxSenderConfig';
import TxExecutor from '../src/core/TxExecutor';
import ProxyWalletHandler from '../src/handlers/ProxyWalletHandler';
import type { SmartWalletCreationEvent } from '../src/interfaces';
import { silentLogger } from '../src/interfaces/Logger';
import { compareAddresses } from '../src/services/utils';
import TxSender from '../src/TxSender';
import TxWrapper from '../src/TxWrapper';
import {
  AccountType, NetworkNumber, ProxyType, TxOnBehalf, TxType,
} from '../src/types';
import {
  ACCOUNT, createMockApi, createMockChain, createMockConfig, createMockState, DS_PROXY, receipt, SAFE, SPENDER, TOKEN, TX_HASH,
} from './utils/mocks';

const approveTx = (executingAddress = ACCOUNT) => new TxWrapper(TxType.Normal, {
  title: 'Approve DAI',
  protocol: 'maker',
  category: 'approve',
  executingAddress,
  contractCallParams: {
    address: TOKEN, abi: erc20Abi, method: 'approve', methodParams: [SPENDER, '1000'],
  },
});

const monitorCalls = (api: ReturnType<typeof createMockApi>) => (api.fetch as unknown as sinon.SinonStub).getCalls()
  .filter((c) => String(c.args[0]).includes('tx-monitor/register'));

describe('tx monitoring', () => {
  afterEach(() => sinon.restore());

  it('registers the tx with the backend and hands the payload to onTxHash', async () => {
    const api = createMockApi();
    const onTxHash = sinon.spy();
    const sender = new TxSender([approveTx()], createMockConfig({ api, hooks: { onTxHash } }));

    await sender.execute();

    const calls = monitorCalls(api);
    assert.lengthOf(calls, 1);
    assert.equal(calls[0].args[0], 'https://mock.defisaver.test/api/tx-monitor/register');
    assert.deepEqual(JSON.parse(calls[0].args[1].body), {
      address: ACCOUNT,
      txHash: TX_HASH,
      title: 'Approve DAI',
      category: 'approve',
      onBehalf: TxOnBehalf.EOA,
      smartWalletAddress: '',
      isSafeMultisigTx: false,
      network: NetworkNumber.Eth,
      forkId: '',
    });
    sinon.assert.calledWith(onTxHash, TX_HASH, sinon.match.instanceOf(TxWrapper), sinon.match({ txHash: TX_HASH, onBehalf: TxOnBehalf.EOA }));
  });

  it('registers smart wallet txs under the executing wallet and forks with the fork monitor', async () => {
    const api = createMockApi();
    const state = createMockState({ proxyAddress: SAFE, getForkId: () => 'fork-1', getAccountType: () => AccountType.GnosisSafe });
    const config = resolveConfig(createMockConfig({ api, state }));
    const tx = approveTx(DS_PROXY);
    const { txUtils } = new TxExecutor(config).createContext(tx);

    const registration = await txUtils.buildTxMonitorRegistration(tx, TX_HASH);
    assert.equal(registration.smartWalletAddress, DS_PROXY);
    assert.equal(registration.onBehalf, TxOnBehalf.SW);
    assert.equal(tx.getOnBehalf(), TxOnBehalf.SW);
    assert.isTrue(registration.isSafeMultisigTx);
    assert.equal(registration.forkId, 'fork-1');

    const explicit = approveTx(DS_PROXY);
    explicit.setOnBehalf(TxOnBehalf.EOA);
    assert.equal((await txUtils.buildTxMonitorRegistration(explicit, TX_HASH)).onBehalf, TxOnBehalf.EOA);

    await config.api.registerTxForMonitoring(registration);
    const [call] = monitorCalls(api);
    assert.equal(call.args[0], 'https://mock.defisaver.test/api/fork-tx-monitor/register');
    assert.equal(JSON.parse(call.args[1].body).forkId, 'fork-1');
  });

  it('does not fail the tx when registration fails', async () => {
    const api = createMockApi();
    (api.fetch as unknown as sinon.SinonStub).callsFake(async (url: string) => (String(url).includes('tx-monitor')
      ? { ok: false, text: async () => 'down', json: async () => ({}) }
      : { ok: true, text: async () => '', json: async () => ({ ok: true }) }));
    const captureException = sinon.spy();
    const sender = new TxSender([approveTx()], createMockConfig({ api, logger: { ...silentLogger, captureException } }));

    const receipts = await sender.execute();

    assert.equal(receipts![0]?.transactionHash, TX_HASH);
    await new Promise((resolve) => { setImmediate(resolve); });
    sinon.assert.calledWith(captureException, sinon.match.instanceOf(Error), sinon.match({ type: 'registerTxForMonitoring' }));
  });
});

describe('smart wallet creation', () => {
  afterEach(() => sinon.restore());

  const { safeProxyFactory130: factory, safeSingleton130: singleton } = DEFAULT_ADDRESSES[NetworkNumber.Eth];

  const creationReceipt = () => receipt({
    to: factory,
    logs: [{
      address: factory,
      topics: [ProxyWalletHandler.PROXY_CREATION_EVENT],
      data: encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [SAFE as Hex, singleton as Hex]),
    }],
  });

  /** Only the factory and the token have code, so the first predicted Safe address is free. */
  const setup = (outcome: Error | ReturnType<typeof receipt>) => {
    const chain = createMockChain();
    chain.getCode.callsFake(async (address: string) => (compareAddresses(address, factory) || compareAddresses(address, TOKEN) ? '0x6000' : '0x'));
    chain.sendTransaction.callsFake(async (_params: unknown, onTxHash: (h: string) => Promise<void>) => {
      await onTxHash(TX_HASH);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    });
    const events: SmartWalletCreationEvent[] = [];
    const sender = new TxSender([], createMockConfig({ chain, hooks: { onSmartWalletCreation: (event) => { events.push(event); } } }));
    return { sender, events, chain };
  };

  it('fires request and success with the parsed Safe for a plain create', async () => {
    const { sender, events } = setup(creationReceipt());
    const onExecuteSuccess = sinon.spy();

    await sender.handleCreateProxy({ onExecuteSuccess, changeWallet: false });
    await sender.execute();

    assert.deepEqual(events.map((e) => e.phase), ['request', 'success']);
    assert.equal(events[0].origin, 'create');
    assert.isFalse(events[0].changeWallet);
    assert.equal(events[1].wallet?.type, ProxyType.Safe);
    assert.isTrue(compareAddresses(events[1].wallet?.address || '', SAFE));
    assert.equal(events[1].receipt?.transactionHash, TX_HASH);
    sinon.assert.calledOnce(onExecuteSuccess);
  });

  it('fires failure when the creation tx fails', async () => {
    const { sender, events } = setup(new Error('wallet rejected'));
    const onExecuteError = sinon.spy();

    await sender.handleCreateProxy({ onExecuteError });
    await sender.execute().catch(() => undefined);

    assert.deepEqual(events.map((e) => e.phase), ['request', 'failure']);
    assert.isTrue(events[0].changeWallet);
    assert.instanceOf(events[1].error, Error);
    sinon.assert.calledOnce(onExecuteError);
  });

  it('plans execution through the selected wallet, else a 1/1, else a predicted Safe', async () => {
    const { chain } = setup(creationReceipt());
    const dsProxy = { type: ProxyType.DSProxy, address: DS_PROXY };

    const selected = new TxSender([], createMockConfig({ chain, state: createMockState({ wallets: [dsProxy], proxyAddress: DS_PROXY }) }));
    assert.deepEqual(await selected.planProxyForExecution(), { proxyForExecution: DS_PROXY, useCreateAndExecute: false });

    const fallback = new TxSender([], createMockConfig({ chain, state: createMockState({ wallets: [dsProxy] }) }));
    assert.deepEqual(await fallback.planProxyForExecution(), { proxyForExecution: DS_PROXY, useCreateAndExecute: false });

    const none = new TxSender([], createMockConfig({ chain, state: createMockState() }));
    const plan = await none.planProxyForExecution();
    assert.isTrue(plan.useCreateAndExecute);
    assert.match(plan.proxyForExecution, /^0x[0-9a-fA-F]{40}$/);
    assert.equal(plan.proxyForExecution, await none.predictSafeAddress());
  });
});
