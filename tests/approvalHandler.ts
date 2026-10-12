import { assert } from 'chai';
import sinon from 'sinon';
import { resolveConfig } from '../src/config/TxSenderConfig';
import ApprovalHandler from '../src/handlers/ApprovalHandler';
import type { ApprovalEvent } from '../src/interfaces';
import TxSender from '../src/TxSender';
import type TxWrapper from '../src/TxWrapper';
import {
  ACCOUNT, createMockChain, createMockConfig, createMockState, DS_PROXY, SPENDER, TOKEN,
} from './utils/mocks';

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

describe('ApprovalHandler hooks', () => {
  afterEach(() => sinon.restore());

  const NFT = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

  it('reports ERC-20 approvals with kind, token address and phases', async () => {
    const events: ApprovalEvent[] = [];
    const sender = new TxSender([], createMockConfig({ chain: createMockChain({ allowance: 0n }), hooks: { onApproval: (e) => { events.push(e); } } }));

    await sender.handleApproval({
      isSpenderProxy: false, asset: 'DAI', spender: SPENDER, amount: '100', shouldBump: false, approveType: 'Smart Wallet',
    });
    await sender.execute();

    assert.deepEqual(events.map((e) => e.phase), ['request', 'success']);
    assert.include(events[1], {
      kind: 'erc20', asset: 'DAI', assetAddress: TOKEN.toLowerCase(), spender: SPENDER, isRevoke: false,
    });
    assert.isUndefined(events[1].tokenId);
  });

  it('reports ERC-721 approvals with the token id', async () => {
    const events: ApprovalEvent[] = [];
    const sender = new TxSender([], createMockConfig({
      chain: createMockChain(),
      state: createMockState({ proxyAddress: DS_PROXY }),
      hooks: { onApproval: (e) => { events.push(e); } },
    }));

    const onApprovalsBegin = sinon.spy();
    const onApprovalsSuccess = sinon.spy();
    await sender.handleMultipleApprovals({
      approvals: [{
        owner: ACCOUNT, nft: NFT, tokenId: '42', specialApproveLabel: 'uniswap v3',
      }],
      approvalTokenAmounts: {},
      onApprovalsBegin,
      onApprovalsSuccess,
      onApprovalsError: sinon.spy(),
    });
    assert.equal(sender.txs[0].getTitle(), 'Approve Smart Wallet for NFT #42');
    await sender.execute();

    assert.deepEqual(events.map((e) => e.phase), ['request', 'success']);
    assert.include(events[1], {
      kind: 'erc721', asset: 'NFT#42', assetAddress: NFT, tokenId: '42', spender: DS_PROXY,
    });
    sinon.assert.calledOnce(onApprovalsBegin);
    sinon.assert.calledOnce(onApprovalsSuccess);
  });
});
