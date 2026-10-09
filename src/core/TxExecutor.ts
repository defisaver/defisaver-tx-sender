import type { ResolvedTxSenderConfig } from '../config/TxSenderConfig';
import { resolveAddresses } from '../config/addresses';
import {
  AccountType, ExecutionType, type GasEstimate, TxType,
} from '../types';
import type TxWrapper from '../TxWrapper';
import type { Env, ExecutionContext } from './ExecutionContext';
import TxEncoder from './TxEncoder';
import TxNotifier from './TxNotifier';
import TxUtils from './TxUtils';
import type { AbstractExecutor } from './executors/AbstractExecutor';
import CancelPendingMultisigTxExecutor from './executors/CancelPendingMultisigTxExecutor';
import SendNormalTxExecutor from './executors/SendNormalTxExecutor';
import SendTxSaverTxExecutor from './executors/SendTxSaverTxExecutor';
import SignCreateAndExecuteExecutor from './executors/SignCreateAndExecuteExecutor';
import SignNewMultisigTxExecutor from './executors/SignNewMultisigTxExecutor';
import SignPendingMultisigTxExecutor from './executors/SignPendingMultisigTxExecutor';
import SignTypedTxExecutor from './executors/SignTypedTxExecutor';

export interface PreparedTx {
  ctx: ExecutionContext;
  executionType: ExecutionType;
  executor: AbstractExecutor;
}

/** Builds the per-tx context and picks the executor for a `TxType` / `ExecutionType` pair. */
export default class TxExecutor {
  constructor(private config: ResolvedTxSenderConfig) {}

  createEnv(): Env {
    const { state } = this.config;
    const network = state.getNetwork();
    const accountType = state.getAccountType();
    return {
      config: this.config,
      network,
      account: state.getAccount(),
      accountType,
      isFork: accountType === AccountType.Fork,
      forkId: state.getForkId?.(),
      addresses: resolveAddresses(network, this.config.addresses),
    };
  }

  createContext(tx: TxWrapper): ExecutionContext {
    const env = this.createEnv();
    return {
      tx,
      env,
      encoder: new TxEncoder(tx, env),
      txUtils: new TxUtils(env),
      notifier: new TxNotifier(tx, env),
    };
  }

  getExecutor(tx: TxWrapper, executionType: ExecutionType): AbstractExecutor {
    const txType = tx.getType();
    switch (txType) {
      case TxType.Normal:
      case TxType.Raw:
        return executionType === ExecutionType.Sign ? new SignNewMultisigTxExecutor() : new SendNormalTxExecutor();
      case TxType.ExecutePendingTx:
        return new SendNormalTxExecutor();
      case TxType.SignPendingTx:
        return new SignPendingMultisigTxExecutor();
      case TxType.CancelPendingTx:
        return new CancelPendingMultisigTxExecutor();
      case TxType.TypedSignature:
        return new SignTypedTxExecutor();
      case TxType.SignForCreateAndExecute:
        return new SignCreateAndExecuteExecutor();
      case TxType.ExecutePendingTxSaverTx:
        return new SendTxSaverTxExecutor();
      default:
        throw new Error(`No executor for txType ${txType}`);
    }
  }

  async prepareTx(tx: TxWrapper): Promise<PreparedTx> {
    const ctx = this.createContext(tx);
    const executionType = await ctx.encoder.getExecutionType();
    return { ctx, executionType, executor: this.getExecutor(tx, executionType) };
  }

  async estimateTx(tx: TxWrapper): Promise<GasEstimate> {
    const { ctx, executor } = await this.prepareTx(tx);
    return executor.estimateTx(ctx);
  }
}
