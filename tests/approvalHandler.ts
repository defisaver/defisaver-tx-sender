import { assert } from 'chai';
import { resolveConfig } from '../src/config/TxSenderConfig';
import ApprovalHandler from '../src/handlers/ApprovalHandler';
import type TxWrapper from '../src/TxWrapper';
import { createMockChain, createMockConfig, SPENDER } from './utils/mocks';

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

const handler = (allowance: bigint) => {
  const txs: TxWrapper[] = [];
  const config = resolveConfig(createMockConfig({ chain: createMockChain({ allowance }) }));
  return { handler: new ApprovalHandler(config, txs), txs };
};

describe('ApprovalHandler', () => {
  it('skips native assets', async () => {
    const { handler: h, txs } = handler(0n);
    const result = await h.handleApproval({ isSpenderProxy: false, asset: 'ETH', spender: SPENDER, amount: '1', shouldBump: false, approveType: 'Smart Wallet' });
    assert.deepEqual(result, []);
    assert.lengthOf(txs, 0);
  });

  it('queues nothing when allowance already covers the amount', async () => {
    const { handler: h, txs } = handler(10n ** 21n);
    await h.handleApproval({ isSpenderProxy: false, asset: 'DAI', spender: SPENDER, amount: '100', shouldBump: true, approveType: 'Smart Wallet' });
    assert.lengthOf(txs, 0);
  });

  it('queues a bumped exact approval when allowance is too low', async () => {
    const { handler: h, txs } = handler(0n);
    await h.handleApproval({ isSpenderProxy: false, asset: 'DAI', spender: SPENDER, amount: '100', shouldBump: true, approveType: 'Smart Wallet' });
    assert.lengthOf(txs, 1);
    const [tx] = txs;
    assert.equal(tx.getTitle(), 'Approve Smart Wallet for DAI');
    assert.isTrue(tx.isExactApproval);
    const [spender, amount] = await tx.getMethodParamsInTime();
    assert.equal(spender, SPENDER);
    assert.equal(amount, '100011000000000000000');
  });

  it('revokes first for USDT-like tokens with a non-zero allowance on mainnet', async () => {
    const { handler: h, txs } = handler(5n);
    await h.handleApproval({ isSpenderProxy: false, asset: 'USDT', spender: SPENDER, amount: '100', shouldBump: false, approveType: 'Smart Wallet', assetAddress: USDT });
    assert.lengthOf(txs, 2);
    assert.equal(txs[0].getTitle(), 'Remove approval Smart Wallet for USDT');
    assert.equal((await txs[0].getMethodParamsInTime())[1], '0');
    assert.equal((await txs[1].getMethodParamsInTime())[1], '100000000');
  });

  it('uses the proxy address lazily when the proxy is not created yet', async () => {
    const { handler: h, txs } = handler(0n);
    await h.handleApproval({ isSpenderProxy: true, asset: 'DAI', spender: '', amount: '1', shouldBump: false, approveType: 'Smart Wallet', useMaxuint: true });
    assert.lengthOf(txs, 1);
    assert.isFalse(txs[0].isExactApproval);
  });
});
