import { assert } from 'chai';
import sinon from 'sinon';
import { erc20Abi } from '../src/abi';
import TxSender from '../src/TxSender';
import TxWrapper from '../src/TxWrapper';
import { AccountType, TxType } from '../src/types';
import { assertRejects } from './utils/assert';
import {
  ACCOUNT, createMockChain, createMockConfig, createMockState, createMockUi, SPENDER, TOKEN, TX_HASH,
} from './utils/mocks';

const approveTx = () => new TxWrapper(TxType.Normal, {
  title: 'Approve DAI',
  protocol: 'maker',
  executingAddress: ACCOUNT,
  contractCallParams: {
    address: TOKEN, abi: erc20Abi, method: 'approve', methodParams: [SPENDER, '1000'],
  },
});

describe('TxSender.execute', () => {
  afterEach(() => sinon.restore());

  it('encodes, confirms, sends and notifies for a direct EOA tx', async () => {
    const chain = createMockChain({ estimateGas: 60_000 });
    const ui = createMockUi();
    const hooks = {
      onTxHash: sinon.spy(), onTxMined: sinon.spy(), onQueueStart: sinon.spy(), onQueueProgress: sinon.spy(),
    };
    const sender = new TxSender([approveTx()], createMockConfig({ chain, ui, hooks }));

    const receipts = await sender.execute();

    assert.lengthOf(receipts!, 1);
    assert.equal(receipts![0]?.transactionHash, TX_HASH);
    sinon.assert.calledOnce(ui.confirmSend);
    const sent = chain.sendTransaction.firstCall.args[0];
    assert.equal(sent.type, '0x2');
    assert.equal(sent.gas, 120_000);
    assert.equal(sent.maxFeePerGas, '0x6fc23ac00');
    assert.isUndefined(sent.gasPrice);
    sinon.assert.calledWith(hooks.onTxHash, TX_HASH, sinon.match.instanceOf(TxWrapper));
    sinon.assert.calledWith(hooks.onTxMined, TX_HASH, sinon.match.instanceOf(TxWrapper));
    sinon.assert.calledOnce(hooks.onQueueStart);
    sinon.assert.calledWith(hooks.onQueueProgress, 1, 1);
    assert.equal(ui.notifications['0-Approve DAI'].status, 'confirmed');
  });

  it('throws a user-canceled TxError and fails the notification when the dialog is dismissed', async () => {
    const ui = createMockUi();
    ui.confirmSend.resolves(false);
    const tx = approveTx();
    const onError = sinon.spy();
    tx.setOnExecuteError(onError);
    const sender = new TxSender([tx], createMockConfig({ ui }));

    await assertRejects(sender.execute(), 'User canceled the transaction');
    sinon.assert.calledOnce(onError);
    assert.equal(ui.notifications['0-Approve DAI'].status, 'failed');
  });

  it('surfaces reverted txs as errors', async () => {
    const chain = createMockChain();
    chain.sendTransaction.callsFake(async (_p: unknown, onTxHash: (h: string) => Promise<void>) => {
      await onTxHash(TX_HASH);
      return { transactionHash: TX_HASH, status: false, gasUsed: 1, blockNumber: 1, from: ACCOUNT, to: TOKEN, logs: [] };
    });
    const sender = new TxSender([approveTx()], createMockConfig({ chain }));
    await assertRejects(sender.execute(), /reverted/);
  });

  it('refuses to execute in view-only mode', async () => {
    const state = createMockState({ getAccountType: () => AccountType.ViewOnly });
    const sender = new TxSender([approveTx()], createMockConfig({ state }));
    await assertRejects(sender.execute(), /view-only/);
  });

  it('skips the confirm dialog when connected through a Safe app', async () => {
    const ui = createMockUi();
    const chain = createMockChain();
    const state = createMockState({ getAccountType: () => AccountType.GnosisSafe });
    const sender = new TxSender([approveTx()], createMockConfig({ ui, chain, state }));
    await sender.execute();
    sinon.assert.notCalled(ui.confirmSend);
    sinon.assert.calledOnce(chain.sendTransaction);
  });

  it('batches multiple txs through wallet_sendCalls', async () => {
    const chain = createMockChain();
    const ui = createMockUi();
    const sender = new TxSender([approveTx(), approveTx()], createMockConfig({ chain, ui }));
    await sender.execute([], { batch: true });
    sinon.assert.calledOnce(ui.confirmBatch);
    sinon.assert.notCalled(chain.sendTransaction);
    const req = chain.sendCalls.firstCall.args[0];
    assert.lengthOf(req.calls, 2);
    assert.equal(req.calls[0].value, '0x0');
    assert.equal(req.chainId, 1);
  });

  it('estimates every queued tx', async () => {
    const sender = new TxSender([approveTx(), approveTx()], createMockConfig({ chain: createMockChain({ estimateGas: 60_000 }) }));
    const estimates = await sender.estimate();
    assert.lengthOf(estimates!, 2);
    assert.include(estimates![0], { failing: false, realGas: 60_000, gas: 72_000 });
  });

  it('requires configure() or an explicit config', () => {
    assert.throws(() => new TxSender(), /configure/);
  });
});
