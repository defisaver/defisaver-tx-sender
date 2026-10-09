import { assert } from 'chai';
import sinon from 'sinon';
import { decodeFunctionData } from 'viem';
import { safeAbi } from '../src/abi';
import { DfsApi } from '../src/api/DfsApi';
import TxExecutor from '../src/core/TxExecutor';
import SafeMultisigGasEstimator from '../src/core/encoders/safe/SafeMultisigGasEstimator';
import TxSender from '../src/TxSender';
import {
  ExecutionType, ProxyType, SafeOperation, SafeVersion, TxType,
} from '../src/types';
import type { EncoderSendRet, EncoderSignRet } from '../src/types/encoding';
import { assertRejects } from './utils/assert';
import {
  ACCOUNT, createMockChain, createMockConfig, createMockState, DS_PROXY, SAFE, SPENDER, TOKEN,
} from './utils/mocks';

const DATA = '0x095ea7b3000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000003e8';

const safeWallet = (owners: string[]) => ({
  type: ProxyType.Safe as const, address: SAFE, owners, threshold: owners.length, version: SafeVersion.v130,
});

describe('handleRawTx', () => {
  afterEach(() => sinon.restore());

  it('queues a Raw tx from the account by default', () => {
    const sender = new TxSender([], createMockConfig());
    const tx = sender.handleRawTx({ to: TOKEN, data: DATA, title: 'Raw approve', value: '5' });
    assert.lengthOf(sender.txs, 1);
    assert.equal(tx.type, TxType.Raw);
    assert.equal(tx.executingAddress, ACCOUNT);
    assert.equal(tx.getEthValue(), '5');
    assert.deepEqual(tx.rawTxCallParams, { from: ACCOUNT, to: TOKEN, data: DATA });
  });

  it('rejects empty calldata and bad addresses', () => {
    const sender = new TxSender([], createMockConfig());
    assert.throws(() => sender.handleRawTx({ to: TOKEN, data: '0x', title: 'x' }), /non-empty hex/);
    assert.throws(() => sender.handleRawTx({ to: '0x123', data: DATA, title: 'x' }), /Address/);
  });

  it('sends raw calldata unchanged from an EOA', async () => {
    const chain = createMockChain({ estimateGas: 50_000 });
    const sender = new TxSender([], createMockConfig({ chain }));
    const { config } = sender;
    const tx = sender.handleRawTx({ to: TOKEN, data: DATA, title: 'Raw', value: '7' });

    const ctx = new TxExecutor(config).createContext(tx);
    const encoded = await ctx.encoder.encodeTx() as EncoderSendRet;
    assert.equal(encoded.type, ExecutionType.Send);
    assert.deepInclude(encoded.txParams, { from: ACCOUNT, to: TOKEN, data: DATA, value: '7' });
    assert.isFalse(encoded.failing);
  });

  it('relays raw calldata through a 1/1 Safe as a plain CALL', async () => {
    const state = createMockState({ wallets: [safeWallet([ACCOUNT])], proxyAddress: SAFE });
    const sender = new TxSender([], createMockConfig({ state }));
    const { config } = sender;
    const tx = sender.handleRawTx({ to: TOKEN, data: DATA, title: 'Raw via Safe', executingAddress: SAFE, value: '3' });

    const ctx = new TxExecutor(config).createContext(tx);
    const encoded = await ctx.encoder.encodeTx() as EncoderSendRet;
    assert.equal(encoded.txParams.to, SAFE);
    assert.equal(encoded.txParams.value, '3');
    const decoded = decodeFunctionData({ abi: safeAbi, data: encoded.txParams.data as `0x${string}` });
    assert.equal(decoded.functionName, 'execTransaction');
    const [to, value, data, operation] = decoded.args as unknown as unknown[];
    assert.equal(to, TOKEN);
    assert.equal(value, 3n);
    assert.equal(data, DATA);
    assert.equal(operation, SafeOperation.Call);
  });

  it('produces a CALL hash to sign for an m/n Safe', async () => {
    const state = createMockState({ wallets: [safeWallet([ACCOUNT, SPENDER])], proxyAddress: SAFE });
    const sender = new TxSender([], createMockConfig({ state }));
    sinon.stub(DfsApi.prototype, 'getNextSafeNonce').resolves(1);
    sinon.stub(SafeMultisigGasEstimator.prototype, 'estimateMultisigTxGas').resolves({ realGas: 90_000, failing: false });
    const { config } = sender;
    const tx = sender.handleRawTx({ to: TOKEN, data: DATA, title: 'Raw multisig', executingAddress: SAFE });

    const ctx = new TxExecutor(config).createContext(tx);
    assert.equal(await ctx.encoder.getExecutionType(), ExecutionType.Sign);
    const encoded = await ctx.encoder.encodeTx() as EncoderSignRet;
    assert.equal(encoded.txDataHashParams[0], TOKEN);
    assert.equal(encoded.txDataHashParams[2], DATA);
    assert.equal(encoded.txDataHashParams[3], SafeOperation.Call);
    assert.equal(encoded.txDataParams.operation, SafeOperation.Call);
  });

  it('refuses raw calldata through delegatecall-only wallets', async () => {
    const state = createMockState({ wallets: [{ type: ProxyType.DSProxy, address: DS_PROXY }], proxyAddress: DS_PROXY });
    const sender = new TxSender([], createMockConfig({ state }));
    const { config } = sender;
    const tx = sender.handleRawTx({ to: TOKEN, data: DATA, title: 'Raw via DSProxy', executingAddress: DS_PROXY });
    const ctx = new TxExecutor(config).createContext(tx);
    await assertRejects(ctx.encoder.encodeTx(), /not via DSProxy/);
    await assertRejects(ctx.encoder.estimateTx(), /not via DSProxy/);
  });
});
