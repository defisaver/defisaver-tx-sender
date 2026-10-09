import {
  encodeFunctionData, keccak256, toHex, type Hex,
} from 'viem';
import { safeAbi, safeProxyFactoryAbi } from '../abi';
import { SAFE_REFUND_RECEIVER, ZERO_ADDRESS } from '../config/constants';
import { resolveAddresses } from '../config/addresses';
import type { ResolvedTxSenderConfig } from '../config/TxSenderConfig';
import { getDefaultSafeWalletObject, predictSafeAddress } from '../services/safe';
import { compareAddresses, isEmptyBytes, requireAddress } from '../services/utils';
import {
  type EthereumAddress,
  type SafeSetupParams,
  SafeVersion,
  type SafeWallet,
  type TxLog,
  type TxReceipt,
  TxType,
} from '../types';
import TxWrapper from '../TxWrapper';

export interface CreateProxyParams {
  onExecuteBegin?: () => unknown | Promise<unknown>;
  onExecuteSuccess?: (receipt: TxReceipt) => unknown | Promise<unknown>;
  onExecuteError?: (error: Error) => unknown | Promise<unknown>;
  changeWallet?: boolean; // Make the new Safe the active smart wallet. Forwarded to `hooks.onSmartWalletCreated`.
}

/** Creates 1/1 Safe smart wallets through `SafeProxyFactory.createProxyWithNonce` with a deterministic salt. */
export default class ProxyWalletHandler {
  static ACTIVE_VERSION = SafeVersion.v130;

  static PROXY_CREATION_EVENT = keccak256(toHex('ProxyCreation(address,address)'));

  /** 'DeFi Saver' in hex; salt = prefix + sequential nonce so addresses are predictable per owner. */
  private static saltPrefix = '44654669205361766572';

  constructor(private config: ResolvedTxSenderConfig, private txs: TxWrapper[]) {}

  private get state() { return this.config.state; }

  private get chain() { return this.config.chain; }

  private get addresses() { return resolveAddresses(this.state.getNetwork(), this.config.addresses); }

  getSafeSetupParams(owners: EthereumAddress[], threshold: number): SafeSetupParams {
    return [owners, threshold, ZERO_ADDRESS, '0x', this.addresses.safeFallbackHandler130, ZERO_ADDRESS, 0, SAFE_REFUND_RECEIVER];
  }

  private encodeSetup(setupParams: SafeSetupParams): Hex {
    const [owners, threshold, to, data, fallbackHandler, paymentToken, payment, paymentReceiver] = setupParams;
    return encodeFunctionData({
      abi: safeAbi,
      functionName: 'setup',
      args: [owners as Hex[], BigInt(threshold), to as Hex, data as Hex, fallbackHandler as Hex, paymentToken as Hex, BigInt(payment), paymentReceiver as Hex],
    });
  }

  private countOneOfOneWallets() {
    return this.state.getSmartWallets().filter((wallet) => (wallet as SafeWallet)?.owners?.length === 1).length;
  }

  /** Finds the first salt whose predicted address has no code yet. Guards against a backend that missed a creation. */
  private async findFreeSalt(setupParamsEncoded: Hex): Promise<{ salt: string; address: EthereumAddress }> {
    const { safeProxyFactory130, safeSingleton130 } = this.addresses;
    const start = this.countOneOfOneWallets() + 1;
    const failAfter = 10;
    for (let nonce = start; nonce < start + failAfter; nonce += 1) {
      const salt = `${ProxyWalletHandler.saltPrefix}${nonce}`;
      const address = await predictSafeAddress(this.chain, safeProxyFactory130, safeSingleton130, setupParamsEncoded, salt);
      const bytecode = await this.chain.getCode(address);
      if (!bytecode || isEmptyBytes(bytecode)) return { salt, address };
    }
    throw new Error('Could not determine nonce & salt for creating a smart wallet');
  }

  private async getSalt(setupParams: SafeSetupParams) {
    const isOneOfOne = setupParams[0].length === 1;
    if (isOneOfOne) return (await this.findFreeSalt(this.encodeSetup(setupParams))).salt;
    return ProxyWalletHandler.saltPrefix + Date.now().toString();
  }

  /** `[singleton, initializer, saltNonce]` for `DFSSafeFactory.createSafeAndExecute`. */
  async getSafeCreationParams(): Promise<[EthereumAddress, Hex, string]> {
    const setupParams = this.getSafeSetupParams([this.state.getAccount()], 1);
    const setupParamsEncoded = this.encodeSetup(setupParams);
    const salt = await this.getSalt(setupParams);
    return [this.addresses.safeSingleton130, setupParamsEncoded, salt];
  }

  async predictSafeAddress(): Promise<EthereumAddress> {
    const setupParams = this.getSafeSetupParams([this.state.getAccount()], 1);
    return (await this.findFreeSalt(this.encodeSetup(setupParams))).address;
  }

  parseSafeCreationEvent(log: TxLog): EthereumAddress {
    let newSafeAddress: string;
    if (ProxyWalletHandler.ACTIVE_VERSION === SafeVersion.v130) {
      newSafeAddress = `0x${log.data.substr(26, 40)}`; // not indexed
    } else if (ProxyWalletHandler.ACTIVE_VERSION === SafeVersion.v141) {
      newSafeAddress = `0x${log.topics[1].substr(26)}`; // indexed
    } else {
      throw new Error(`Factory ${ProxyWalletHandler.ACTIVE_VERSION} unsupported`);
    }
    requireAddress(newSafeAddress);
    return newSafeAddress;
  }

  findProxyCreationLog(receipt: TxReceipt): TxLog | undefined {
    const factory = this.addresses.safeProxyFactory130;
    return receipt.logs.find((log) => compareAddresses(log.address, factory) && log.topics[0] === ProxyWalletHandler.PROXY_CREATION_EVENT);
  }

  async handleCreateProxy(params: CreateProxyParams = {}) {
    const {
      onExecuteBegin, onExecuteSuccess, onExecuteError, changeWallet = true,
    } = params;
    const account = this.state.getAccount();
    const owners = [account];
    const threshold = 1;
    const setupParams = this.getSafeSetupParams(owners, threshold);
    const salt = await this.getSalt(setupParams);
    const { safeProxyFactory130, safeSingleton130 } = this.addresses;

    const createSafeWalletTx = new TxWrapper(TxType.Normal, {
      executingAddress: account,
      title: this.config.messages.createSmartWallet,
      category: '',
      checkReturnValue: true,
      returnValueFailureMessage: 'Error fetching Proxy address',
      contractCallParams: {
        address: safeProxyFactory130,
        abi: safeProxyFactoryAbi,
        method: 'createProxyWithNonce',
        methodParams: [safeSingleton130, this.encodeSetup(setupParams), salt],
      },
    });

    createSafeWalletTx.setOnExecuteBegin(async () => {
      await onExecuteBegin?.();
    });
    createSafeWalletTx.setOnExecuteSuccess(async (receipt: TxReceipt) => {
      const log = this.findProxyCreationLog(receipt);
      if (!log) throw new Error('ProxyCreation event not found in receipt');
      const safeWallet = getDefaultSafeWalletObject({
        address: this.parseSafeCreationEvent(log), owners, threshold, version: ProxyWalletHandler.ACTIVE_VERSION,
      });
      await this.config.hooks.onSmartWalletCreated?.(safeWallet, receipt, { changeWallet });
      await onExecuteSuccess?.(receipt);
    });
    createSafeWalletTx.setOnExecuteError(async (err: Error) => {
      await onExecuteError?.(err);
    });
    this.txs.push(createSafeWalletTx);
  }
}
