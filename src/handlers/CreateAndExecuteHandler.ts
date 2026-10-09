import { dfsSafeFactoryAbi } from '../abi';
import { resolveAddresses } from '../config/addresses';
import type { ResolvedTxSenderConfig } from '../config/TxSenderConfig';
import { getDefaultSafeWalletObject, isMultisigSafeWallet, isSafeWallet } from '../services/safe';
import { getProxyWalletByAddress } from '../services/wallets';
import {
  type EthereumAddress, ProxyType, type TxReceipt, TxType,
} from '../types';
import TxWrapper from '../TxWrapper';
import { CREATE_AND_EXECUTE_ACTION, CREATE_AND_EXECUTE_PROTOCOL } from '../core/executors/SignCreateAndExecuteExecutor';
import ProxyWalletHandler from './ProxyWalletHandler';

export type TxToExecuteParams = { proxyForExecution: EthereumAddress; useCreateAndExecute: boolean };

export type TxToExecuteType = ((params: TxToExecuteParams) => TxWrapper)[];

/**
 * Runs txs through an existing 1/1 Safe or DSProxy, or when the account has none, through a
 * Safe deployed in the same tx via `DFSSafeFactory.createSafeAndExecute`.
 */
export default class CreateAndExecuteHandler {
  constructor(
    private config: ResolvedTxSenderConfig,
    private txs: TxWrapper[],
    private proxyWallet: ProxyWalletHandler,
  ) {}

  private get state() { return this.config.state; }

  private findOneOfOneOrDsProxy() {
    return this.state.getSmartWallets().find((wallet) => (
      wallet.type === ProxyType.DSProxy || (isSafeWallet(wallet) && !isMultisigSafeWallet(wallet))
    ));
  }

  /** Callers queueing txs for the executing wallet must use this exact selection. */
  async planProxyForExecution(): Promise<TxToExecuteParams> {
    const selected = this.state.getProxyAddress();
    const known = selected ? getProxyWalletByAddress(this.state, selected) : undefined;
    let proxyForExecution = known && !isMultisigSafeWallet(known) ? selected : '';
    let useCreateAndExecute = false;
    if (!proxyForExecution) proxyForExecution = this.findOneOfOneOrDsProxy()?.address || '';
    if (!proxyForExecution) {
      proxyForExecution = await this.proxyWallet.predictSafeAddress();
      useCreateAndExecute = true;
    }
    return { proxyForExecution, useCreateAndExecute };
  }

  async handleCreateAndExecute(txsToExecute: TxToExecuteType, label: string) {
    const { hooks, signatures } = this.config;
    const { proxyForExecution, useCreateAndExecute } = await this.planProxyForExecution();

    // The encoder routes by the active wallet, so a different 1/1 or DSProxy must become active first.
    await hooks.onSelectProxyWallet?.(proxyForExecution);

    const safeCreateParams = await this.proxyWallet.getSafeCreationParams();
    const account = this.state.getAccount();
    const wrappedTxs = txsToExecute.map((build) => build({ proxyForExecution, useCreateAndExecute }));
    this.txs.push(...wrappedTxs);
    if (!useCreateAndExecute) return;

    const recipeTxEthValue = wrappedTxs.reduce((acc, tx) => {
      const val = tx.getEthValue();
      return val && val !== '0' ? val : acc;
    }, '0');

    const createAndExecuteTx = new TxWrapper(TxType.Normal, {
      executingAddress: account,
      title: label || 'Create Safe and Execute',
      category: '',
      protocol: CREATE_AND_EXECUTE_PROTOCOL,
      ethValue: recipeTxEthValue,
      contractCallParams: {
        address: resolveAddresses(this.state.getNetwork(), this.config.addresses).dfsSafeFactory,
        abi: dfsSafeFactoryAbi,
        method: 'createSafeAndExecute',
        methodParams: () => {
          const signature = signatures.get(CREATE_AND_EXECUTE_PROTOCOL, CREATE_AND_EXECUTE_ACTION);
          const safeTx = signatures.getSafeTxData();
          if (!signature || !safeTx) throw new Error('Create-and-execute signature missing; queue a SignForCreateAndExecute tx first');
          const { nonce: _nonce, ...rest } = safeTx;
          return [
            { singleton: safeCreateParams[0], initializer: safeCreateParams[1], saltNonce: safeCreateParams[2] },
            { ...rest, signatures: signature },
          ];
        },
      },
    });

    createAndExecuteTx.setOnExecuteSuccess(async (receipt: TxReceipt) => {
      const log = this.proxyWallet.findProxyCreationLog(receipt);
      // CREATE2 makes the predicted address authoritative when the event is missing.
      const newSafeAddress = log ? this.proxyWallet.parseSafeCreationEvent(log) : proxyForExecution;
      const safeWallet = getDefaultSafeWalletObject({
        address: newSafeAddress, owners: [account], threshold: 1, version: ProxyWalletHandler.ACTIVE_VERSION,
      });
      await hooks.onSmartWalletCreated?.(safeWallet, receipt, { changeWallet: true });
    });
    this.txs.push(createAndExecuteTx);
  }
}
