import { assert } from 'chai';
import sinon from 'sinon';
import { DfsApi } from '../src/api/DfsApi';
import { erc20Abi, dsProxyAbi } from '../src/abi';
import { encodeCall, resolveAbiFunction } from '../src/services/abi';
import { buildTypedData, SignType } from '../src/services/typedData';
import { gweiToWei, isInsufficientFundsEstimateError, requireAddress, toUnits } from '../src/services/utils';
import TxError from '../src/core/TxError';
import { assertRejects } from './utils/assert';

describe('abi helpers', () => {
  it('resolves overloads by full signature', () => {
    const abi = [...dsProxyAbi, {
      type: 'function', name: 'execute', stateMutability: 'payable', inputs: [{ name: 'a', type: 'bytes' }, { name: 'b', type: 'bytes' }], outputs: [],
    }] as const;
    assert.throws(() => resolveAbiFunction(abi, 'execute', ['0x', '0x']), /overloaded/);
    assert.equal(resolveAbiFunction(abi, 'execute(address,bytes)').inputs[0].type, 'address');
    assert.isTrue(encodeCall(erc20Abi, 'approve', ['0x1111111111111111111111111111111111111111', '1']).startsWith('0x095ea7b3'));
  });
});

describe('utils', () => {
  it('converts units truncating extra decimals', () => {
    assert.equal(toUnits('1.5', 18), '1500000000000000000');
    assert.equal(toUnits('0.1234567891234567891234', 18), '123456789123456789');
    assert.equal(gweiToWei('30'), '30000000000');
  });

  it('detects insufficient funds estimate errors', () => {
    assert.isTrue(isInsufficientFundsEstimateError(new Error('gas required exceeds allowance (21000)')));
    assert.isTrue(isInsufficientFundsEstimateError({ data: { message: 'insufficient funds for transfer' } }));
    assert.isFalse(isInsufficientFundsEstimateError(new Error('execution reverted')));
  });

  it('validates addresses', () => {
    assert.throws(() => requireAddress(''), 'Address is empty string');
    assert.throws(() => requireAddress('0x0000000000000000000000000000000000000000'), 'Address is empty bytes');
    assert.doesNotThrow(() => requireAddress('0x1111111111111111111111111111111111111111'));
  });
});

describe('typed data', () => {
  it('builds EIP-712 payloads with nested types', () => {
    const data = buildTypedData(SignType.SetUserPositionManagers, SignType.EIP712Domain, {
      domain: { name: 'x', version: '1', chainId: 1, verifyingContract: '0x1111111111111111111111111111111111111111' },
      primaryType: SignType.SetUserPositionManagers,
      message: {},
    });
    assert.deepEqual(Object.keys(data.types), ['EIP712Domain', SignType.SetUserPositionManagers, SignType.PositionManagerUpdate]);
  });
});

describe('TxError', () => {
  it('maps wallet rejections and reverts to friendly messages', () => {
    assert.equal(new TxError(new Error('MetaMask Tx Signature: User denied transaction signature.'), 'id').message, "You've denied the transaction");
    assert.include(new TxError('Transaction has been reverted by the EVM', 'id', '0xabc').message, '0xabc');
    assert.equal(TxError.getTxError(new TxError('x', 'id'), 'other').notificationId, 'id');
  });
});

describe('DfsApi', () => {
  it('posts Safe txs with the fork id and throws on HTTP errors', async () => {
    const fetchStub = sinon.stub().callsFake(async (url: string, init?: RequestInit) => ({
      ok: !String(url).includes('fail'),
      json: async () => ({ ok: true, data: 5, txId: 9, body: init?.body }),
      text: async () => 'boom',
    }));
    const api = new DfsApi({ apiUrl: 'https://api', safeApiUrl: 'https://safe', fetch: fetchStub as unknown as typeof fetch });

    await api.postSafeTx({ txDataHash: '0x1' } as never, 'fork-1');
    const [url, init] = fetchStub.firstCall.args;
    assert.equal(url, 'https://safe/safe/tx');
    assert.include(JSON.parse(init.body), { txDataHash: '0x1', forkId: 'fork-1' });

    assert.equal(await api.getNextSafeNonce('0xa', '0xb', 1), 5);
    assert.equal(await api.submitTxToTxSaver(1, {} as never), 9);
    await assertRejects(api.getTxErrorData('fail'), 'boom');
    assert.throws(() => new DfsApi({ apiUrl: '' }), 'apiUrl is required');
  });
});
