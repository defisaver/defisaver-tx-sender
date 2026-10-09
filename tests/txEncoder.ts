import { assert } from 'chai';
import sinon from 'sinon';
import { decodeFunctionData } from 'viem';
import { dsProxyAbi, erc20Abi, safeAbi } from '../src/abi';
import { DfsApi } from '../src/api/DfsApi';
import { resolveConfig } from '../src/config/TxSenderConfig';
import TxExecutor from '../src/core/TxExecutor';
import SafeMultisigGasEstimator from '../src/core/encoders/safe/SafeMultisigGasEstimator';
import { ExecutionType, ProxyType, SafeVersion, TxType } from '../src/types';
import type { EncoderSendRet, EncoderSignRet } from '../src/types/encoding';
import TxWrapper from '../src/TxWrapper';
import { assertRejects } from './utils/assert';
import {
  ACCOUNT, createMockChain, createMockConfig, createMockState, DS_PROXY, SAFE, SAFE_TX_HASH, SPENDER, TOKEN,
} from './utils/mocks';

const approveTx = (executingAddress: string) => new TxWrapper(TxType.Normal, {
  title: 'Approve',
  executingAddress,
  contractCallParams: {
    address: TOKEN, abi: erc20Abi, method: 'approve', methodParams: [SPENDER, '1000'],
  },
});

describe('TxEncoder routing', () => {
  afterEach(() => sinon.restore());

  it('encodes a direct EOA call with a 1.2x gas multiplier for small txs', async () => {
    const chain = createMockChain({ estimateGas: 60_000 });
    const config = resolveConfig(createMockConfig({ chain }));
    const ctx = new TxExecutor(config).createContext(approveTx(ACCOUNT));

    const encoded = await ctx.encoder.encodeTx() as EncoderSendRet;
    assert.equal(encoded.type, ExecutionType.Send);
    assert.isFalse(encoded.failing);
    assert.equal(encoded.txParams.to, TOKEN);
    assert.equal(encoded.txParams.gas, 72_000);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: encoded.txParams.data as `0x${string}` });
    assert.equal(decoded.functionName, 'approve');
    assert.deepEqual(decoded.args, [SPENDER, 1000n]);
  });

  it('marks the encoding as failing when estimation throws', async () => {
    const chain = createMockChain({ estimateGas: new Error('insufficient funds for gas * price + value') });
    const config = resolveConfig(createMockConfig({ chain }));
    const ctx = new TxExecutor(config).createContext(approveTx(ACCOUNT));

    const encoded = await ctx.encoder.encodeTx() as EncoderSendRet;
    assert.isTrue(encoded.failing);
    assert.isTrue(encoded.insufficientFunds);
    assert.equal(encoded.realGas, 4_000_000);
  });

  it('wraps proxy calls in DSProxy.execute', async () => {
    const state = createMockState({ wallets: [{ type: ProxyType.DSProxy, address: DS_PROXY }], proxyAddress: DS_PROXY });
    const config = resolveConfig(createMockConfig({ state }));
    const ctx = new TxExecutor(config).createContext(approveTx(DS_PROXY));

    const encoded = await ctx.encoder.encodeTx() as EncoderSendRet;
    assert.equal(encoded.txParams.to, DS_PROXY);
    const decoded = decodeFunctionData({ abi: dsProxyAbi, data: encoded.txParams.data as `0x${string}` });
    assert.equal(decoded.functionName, 'execute');
    assert.equal(decoded.args?.[0], TOKEN);
  });

  it('sends 1/1 Safe txs through execTransaction with a pre-approved signature', async () => {
    const safe = { type: ProxyType.Safe as const, address: SAFE, owners: [ACCOUNT], threshold: 1, version: SafeVersion.v130 };
    const state = createMockState({ wallets: [safe], proxyAddress: SAFE });
    const config = resolveConfig(createMockConfig({ state }));
    const ctx = new TxExecutor(config).createContext(approveTx(SAFE));

    assert.equal(await ctx.encoder.getExecutionType(), ExecutionType.Send);
    const encoded = await ctx.encoder.encodeTx() as EncoderSendRet;
    const decoded = decodeFunctionData({ abi: safeAbi, data: encoded.txParams.data as `0x${string}` });
    assert.equal(decoded.functionName, 'execTransaction');
    const [to, , , operation, , , , , , signatures] = decoded.args as unknown as unknown[];
    assert.equal(to, TOKEN);
    assert.equal(operation, 1);
    assert.isTrue((signatures as string).endsWith('01'));
  });

  it('produces a hash to sign for m/n Safes', async () => {
    const safe = { type: ProxyType.Safe as const, address: SAFE, owners: [ACCOUNT, SPENDER], threshold: 2, version: SafeVersion.v130 };
    const state = createMockState({ wallets: [safe], proxyAddress: SAFE });
    const config = resolveConfig(createMockConfig({ state }));
    const nonceStub = sinon.stub(DfsApi.prototype, 'getNextSafeNonce').resolves(3);
    sinon.stub(SafeMultisigGasEstimator.prototype, 'estimateMultisigTxGas').resolves({ realGas: 150_000, failing: false });
    const ctx = new TxExecutor(config).createContext(approveTx(SAFE));

    assert.equal(await ctx.encoder.getExecutionType(), ExecutionType.Sign);
    const encoded = await ctx.encoder.encodeTx() as EncoderSignRet;
    assert.equal(encoded.type, ExecutionType.Sign);
    assert.equal(encoded.txDataHash, SAFE_TX_HASH);
    assert.equal(encoded.txDataHashParams[9], 3);
    assert.equal(encoded.safeAddress, SAFE);
    sinon.assert.calledWith(nonceStub, ACCOUNT, SAFE, 1, undefined);
  });

  it('rejects raw txs routed through a proxy', async () => {
    const state = createMockState({ wallets: [{ type: ProxyType.DSProxy, address: DS_PROXY }] });
    const config = resolveConfig(createMockConfig({ state }));
    const tx = new TxWrapper(TxType.Raw, { executingAddress: DS_PROXY, rawTxCallParams: { from: ACCOUNT, to: TOKEN, data: '0x1234' } });
    const ctx = new TxExecutor(config).createContext(tx);
    await assertRejects(ctx.encoder.encodeTx(), /raw calldata can be sent from the account or through a Safe/);
  });
});
