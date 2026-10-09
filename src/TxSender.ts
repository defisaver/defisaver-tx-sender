import { resolveConfig, type ResolvedTxSenderConfig, type TxSenderConfig } from './config/TxSenderConfig';
import TxExecutor from './core/TxExecutor';
import TxError from './core/TxError';
import ApprovalHandler, { type ApprovalParams, type ApprovalsForProxyParams, type MultipleApprovalsParams } from './handlers/ApprovalHandler';
import CreateAndExecuteHandler, { type TxToExecuteType } from './handlers/CreateAndExecuteHandler';
import ProxyWalletHandler, { type CreateProxyParams } from './handlers/ProxyWalletHandler';
import RawTxHandler, { type RawTxParams } from './handlers/RawTxHandler';
import { toHex } from './services/utils';
import {
  AccountType,
  type EthereumAddress,
  ExecutionType,
  type GasEstimate,
  type MultisigTx,
  type TxReceipt,
  TxType,
} from './types';
import type { EncoderSendRet } from './types/encoding';
import TxWrapper from './TxWrapper';

export interface ExecuteOptions {
  batch?: boolean; // Send all queued txs as one EIP-5792 `wallet_sendCalls` batch (needs `chain.sendCalls` and `ui.confirmBatch`).
}

export type PendingTxType = TxType.SignPendingTx | TxType.ExecutePendingTx | TxType.CancelPendingTx | TxType.ExecutePendingTxSaverTx;

/**
 * Queue of `TxWrapper`s executed sequentially. Configure once with `TxSender.configure(config)`
 * or pass a config per instance.
 */
export default class TxSender {
  private static defaultConfig?: ResolvedTxSenderConfig;

  readonly config: ResolvedTxSenderConfig;

  txs: TxWrapper[];

  private txExecutor: TxExecutor;

  private approvals: ApprovalHandler;

  private proxyWallet: ProxyWalletHandler;

  private createAndExecute: CreateAndExecuteHandler;

  private rawTx: RawTxHandler;

  static configure(config: TxSenderConfig) {
    TxSender.defaultConfig = resolveConfig(config);
  }

  constructor(txs: TxWrapper[] = [], config?: TxSenderConfig) {
    const resolved = config ? resolveConfig(config) : TxSender.defaultConfig;
    if (!resolved) throw new Error('TxSender: call TxSender.configure(config) or pass a config to the constructor');
    this.config = resolved;
    this.txs = txs;
    this.txExecutor = new TxExecutor(resolved);
    this.approvals = new ApprovalHandler(resolved, this.txs);
    this.proxyWallet = new ProxyWalletHandler(resolved, this.txs);
    this.createAndExecute = new CreateAndExecuteHandler(resolved, this.txs, this.proxyWallet);
    this.rawTx = new RawTxHandler(resolved, this.txs);
  }

  addTx(tx: TxWrapper) {
    this.txs.push(tx);
  }

  handleApproval(params: ApprovalParams) {
    return this.approvals.handleApproval(params);
  }

  handleAaveVariableDebtApproval(params: ApprovalParams & { assetAddress: EthereumAddress }) {
    return this.approvals.handleAaveVariableDebtApproval(params);
  }

  handleMultipleApprovals(params: MultipleApprovalsParams) {
    return this.approvals.handleMultipleApprovals(params);
  }

  handleApprovalsForProxy(params: ApprovalsForProxyParams) {
    return this.approvals.handleApprovalsForProxy(params);
  }

  handleCreateProxy(params?: CreateProxyParams) {
    return this.proxyWallet.handleCreateProxy(params);
  }

  predictSafeAddress() {
    return this.proxyWallet.predictSafeAddress();
  }

  /** Queues pre-encoded calldata. Runs from the account, or as a plain CALL through a Safe. */
  handleRawTx(params: RawTxParams) {
    return this.rawTx.handleRawTx(params);
  }

  handleCreateAndExecute(txsToExecute: TxToExecuteType, label: string) {
    return this.createAndExecute.handleCreateAndExecute(txsToExecute, label);
  }

  /** Queues a sign / execute / cancel for a pending Safe multisig tx fetched from the backend. */
  handlePendingTx(txType: PendingTxType, multisigTx: MultisigTx, safeAddress: EthereumAddress) {
    const isCancel = txType === TxType.CancelPendingTx;
    this.addTx(new TxWrapper(txType, {
      executingAddress: safeAddress,
      title: `${isCancel ? 'Cancel - ' : ''}${multisigTx.meta.title}`,
      protocol: multisigTx.meta.protocol,
      minGas: isCancel ? 0 : multisigTx.meta.minGas,
      extraGas: isCancel ? 0 : multisigTx.meta.extraGas,
      category: multisigTx.meta.category,
      additionalInfo: isCancel ? undefined : multisigTx.meta.additionalInfo,
      pendingTxData: {
        txDataHashParams: multisigTx.txData,
        txDataHash: multisigTx.txDataHash,
        signatures: multisigTx.signatures,
        txId: multisigTx.id,
        txSaverMeta: multisigTx.meta.txSaverMeta,
      },
    }));
  }

  private canExecute() {
    if (this.config.state.getAccountType() === AccountType.ViewOnly) {
      throw new Error(this.config.messages.viewOnlyMode);
    }
  }

  private async executeTxBatch(): Promise<undefined> {
    const {
      chain, ui, hooks, messages,
    } = this.config;
    if (!chain.sendCalls) throw new Error('TxSender: chain adapter does not implement sendCalls');
    if (!ui.confirmBatch) throw new Error('TxSender: ui adapter does not implement confirmBatch');

    const txBatch: EncoderSendRet[] = [];
    for (const [i, tx] of this.txs.entries()) {
      tx.id = i;
      const { ctx } = await this.txExecutor.prepareTx(tx);
      txBatch.push(await ctx.encoder.encodeForBatch());
      hooks.onQueueProgress?.(i + 1, this.txs.length);
    }

    const lastTx = this.txs[this.txs.length - 1];
    const baseId = `${ui.createNotificationId(lastTx)}-batch`;
    const confirmationId = `${baseId}-Confirmation`;
    const confirmed = await ui.confirmBatch({
      id: confirmationId, protocol: 'exchange', title: lastTx.title, transactionList: this.txs,
    });
    if (!confirmed) throw new TxError(messages.userCanceled, confirmationId, undefined, undefined, undefined, messages);

    const progressId = `${baseId}-Progress`;
    ui.addNotification({
      id: progressId,
      status: 'pending',
      title: lastTx.title,
      description: 'Signing new transaction batch.',
      protocol: 'exchange',
      additionalInfo: lastTx.additionalInfo,
    });
    const from = txBatch[0].txParams.from;
    const calls = txBatch.map(({ txParams }) => ({ to: txParams.to, data: txParams.data, value: toHex(txParams.value) }));
    try {
      await chain.sendCalls({ from, chainId: this.config.state.getNetwork(), calls });
      ui.changeNotification(progressId, { status: 'success', description: 'Transaction batch sent successfully.' });
      return undefined;
    } catch (err) {
      ui.changeNotification(progressId, { status: 'failed', description: 'User canceled transaction batch.' });
      throw err;
    }
  }

  private async executeTxIterator(returnValues: (TxReceipt | undefined)[]) {
    const { hooks } = this.config;
    hooks.onQueueStart?.(this.txs);
    try {
      for (const [i, tx] of this.txs.entries()) {
        tx.id = i;
        const { ctx, executionType, executor } = await this.txExecutor.prepareTx(tx);
        const result = await executor.executeTx(ctx);
        returnValues.push(executionType === ExecutionType.Send ? (result as TxReceipt) : undefined);
        hooks.onQueueProgress?.(i + 1, this.txs.length);
      }
      setTimeout(() => hooks.onQueueEnd?.(), 5000);
      return returnValues;
    } catch (err) {
      hooks.onQueueEnd?.();
      throw err;
    }
  }

  /**
   * Executes queued txs in order. Resolves with one receipt per sent tx (undefined for signatures).
   * With `batch: true` and more than one tx, sends everything as a single EIP-5792 batch and resolves with undefined.
   */
  async execute(returnValues: (TxReceipt | undefined)[] = [], options: ExecuteOptions = {}): Promise<(TxReceipt | undefined)[] | undefined> {
    this.canExecute();
    if (!this.txs.length) return undefined;
    if (options.batch && this.txs.length > 1) return this.executeTxBatch();
    return this.executeTxIterator(returnValues);
  }

  async estimate(returnValues: (GasEstimate | undefined)[] = []) {
    this.canExecute();
    if (!this.txs.length) return undefined;
    for (const tx of this.txs) {
      returnValues.push(await this.txExecutor.estimateTx(tx));
    }
    return returnValues;
  }

  async estimateTx(txId: number) {
    this.canExecute();
    const tx = this.txs.find((t) => t.id === txId);
    if (!tx) throw new Error('Tx not found');
    return this.txExecutor.estimateTx(tx);
  }
}
