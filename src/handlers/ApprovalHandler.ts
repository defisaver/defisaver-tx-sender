import Dec from 'decimal.js';
import dfs, { Recipe } from '@defisaver/sdk';
import { getAssetInfo, getAssetInfoByAddress } from '@defisaver/tokens';
import { aaveDebtTokenAbi, erc20Abi, erc721Abi } from '../abi';
import { MAXUINT } from '../config/constants';
import type { ResolvedTxSenderConfig } from '../config/TxSenderConfig';
import { readContract } from '../services/abi';
import {
  bumpAmountForApproval,
  getErc20TokenData,
  getNetworkNativeAsset,
  getWrappedNativeAssetFromUnwrapped,
  isNativeAssetOnAnotherNetwork,
} from '../services/assets';
import { compareAddresses, requireAddress, toUnits } from '../services/utils';
import {
  type DecimalType,
  type EthereumAddress,
  NetworkNumber,
  type RecipeApproval,
  type RecipeAssetApproval,
  type RecipeNftApproval,
  TxType,
} from '../types';
import TxWrapper from '../TxWrapper';

export const APPROVE_TYPE_SMART_WALLET = 'Smart Wallet';

export interface ApprovalParams {
  isSpenderProxy: boolean; // Spend from the selected smart wallet instead of `spender`.
  asset: string; // Token symbol as known by @defisaver/tokens, or '' when only `assetAddress` is known.
  spender: EthereumAddress;
  amount: DecimalType; // Human units.
  shouldBump: boolean; // Multiply by CONTINUOUS_FEE_MULTIPLIER to cover accruing fees.
  approveType: string; // Free-form label, e.g. 'Smart Wallet' or 'Aave'. Mapped through `config.approveTypeLabels`.
  useMaxuint?: boolean;
  assetAddress?: EthereumAddress;
}

type Hook = () => unknown | Promise<unknown>;
type ErrorHook = (error: Error) => unknown | Promise<unknown>;

export interface MultipleApprovalsParams {
  approvals: RecipeApproval[];
  approvalTokenAmounts: Record<string, string>; // Human-unit amounts keyed by symbol.
  onApprovalsBegin: Hook;
  onApprovalsSuccess: Hook;
  onApprovalsError: ErrorHook;
}

export interface ApprovalsForProxyParams extends MultipleApprovalsParams {
  spender: EthereumAddress;
  title: string;
  /** Builds the recipe for the smart wallet to approve `spender`. Defaults to a plain `ApproveTokenAction` per asset. */
  buildRecipe?: (approvals: { asset: EthereumAddress; amountInWei: string }[], spender: EthereumAddress) => Promise<Recipe>;
}

const isRecipeNftApproval = (approval: RecipeApproval): approval is RecipeNftApproval => (approval as RecipeNftApproval).nft !== undefined;

/** Builds approve txs when on-chain allowance is below the required amount. */
export default class ApprovalHandler {
  constructor(private config: ResolvedTxSenderConfig, private txs: TxWrapper[]) {}

  private get state() { return this.config.state; }

  private get chain() { return this.config.chain; }

  private get network() { return this.state.getNetwork(); }

  private label(approveType: string) {
    return this.config.approveTypeLabels[approveType] || approveType;
  }

  private resolveSpender(isSpenderProxy: boolean, spender: EthereumAddress) {
    return isSpenderProxy ? this.state.getProxyAddress() : spender;
  }

  /** Allowance in wei, or MAXUINT for native assets. */
  async getAllowance(assetAddress: EthereumAddress, spender: EthereumAddress, isAaveV3VariableDebt = false): Promise<string> {
    const account = this.state.getAccount();
    const allowance = isAaveV3VariableDebt
      ? await readContract<bigint>(this.chain, assetAddress, aaveDebtTokenAbi, 'borrowAllowance', [account, spender])
      : await readContract<bigint>(this.chain, assetAddress, erc20Abi, 'allowance', [account, spender]);
    return allowance.toString();
  }

  async isApproved(assetAddress: EthereumAddress, spender: EthereumAddress, amountWei: string, isAaveV3VariableDebt = false) {
    const allowance = await this.getAllowance(assetAddress, spender, isAaveV3VariableDebt);
    return { allowance, approved: allowance === MAXUINT || new Dec(allowance).gte(amountWei) };
  }

  private needsReapprove(symbol: string, allowance: string) {
    return new Dec(allowance).gt(0) && this.config.tokensNeedReapprove.includes(symbol) && this.network === NetworkNumber.Eth;
  }

  private buildApproveTx(params: {
    assetLabel: string;
    assetAddress: EthereumAddress;
    isSpenderProxy: boolean;
    spender: EthereumAddress;
    approveType: string;
    amountWei: string;
    method: 'approve' | 'approveDelegation';
    isRevoke?: boolean;
  }) {
    const {
      assetLabel, assetAddress, isSpenderProxy, spender, approveType, amountWei, method, isRevoke = false,
    } = params;
    const { messages, hooks } = this.config;
    const tx = new TxWrapper(TxType.Normal, {
      category: '',
      executingAddress: this.state.getAccount(),
      title: `${isRevoke ? messages.removeApproval : messages.approve} ${this.label(approveType)} ${messages.for} ${assetLabel}`,
      approveData: () => ({
        asset: assetLabel, spender: this.resolveSpender(isSpenderProxy, spender), approveType, amount: amountWei, assetAddress,
      }),
      contractCallParams: {
        address: assetAddress,
        abi: method === 'approve' ? erc20Abi : aaveDebtTokenAbi,
        method,
        methodParams: () => [this.resolveSpender(isSpenderProxy, spender), amountWei],
      },
      isExactApproval: isRevoke || amountWei !== MAXUINT,
    });
    const event = { asset: assetLabel, approveType, isRevoke } as const;
    tx.setOnExecuteBegin(() => {
      const resolved = this.resolveSpender(isSpenderProxy, spender);
      requireAddress(resolved);
      hooks.onApproval?.({ ...event, phase: 'request', spender: resolved }, tx);
    });
    tx.setOnExecuteSuccess(() => hooks.onApproval?.({ ...event, phase: 'success', spender: this.resolveSpender(isSpenderProxy, spender) }, tx));
    tx.setOnExecuteError((error) => hooks.onApproval?.({
      ...event, phase: 'failure', spender: this.resolveSpender(isSpenderProxy, spender), error,
    }, tx));
    return tx;
  }

  async handleApproval(params: ApprovalParams): Promise<TxWrapper[]> {
    const {
      isSpenderProxy, spender, amount, shouldBump, approveType, useMaxuint = false,
    } = params;
    const network = this.network;
    if (params.asset === getNetworkNativeAsset(network)) return [];

    let asset = params.asset;
    if (isNativeAssetOnAnotherNetwork(asset, network)) asset = getWrappedNativeAssetFromUnwrapped(asset);
    const assetInfo = getAssetInfo(asset);
    const assetAddress = params.assetAddress || assetInfo.address;
    const tokenData = assetInfo.symbol === '?' ? await getErc20TokenData(this.chain, assetAddress, network) : assetInfo;
    const assetLabel = asset || tokenData.symbol;
    const amountWei = useMaxuint ? MAXUINT : toUnits(shouldBump ? bumpAmountForApproval(amount) : amount, tokenData.decimals);

    const base = {
      assetLabel, assetAddress, isSpenderProxy, spender, approveType,
    };
    const approveTx = this.buildApproveTx({ ...base, amountWei, method: 'approve' });

    if (!spender && isSpenderProxy) { // Proxy not created yet: spender is unknown until the creation tx runs, so always queue the approval.
      this.txs.push(approveTx);
      return [approveTx];
    }
    requireAddress(spender);

    const { allowance, approved } = await this.isApproved(assetAddress, spender, toUnits(amount, tokenData.decimals));
    if (approved) return [];

    const queued: TxWrapper[] = [];
    if (this.needsReapprove(assetLabel, allowance)) {
      queued.push(this.buildApproveTx({
        ...base, amountWei: '0', method: 'approve', isRevoke: true,
      }));
    }
    queued.push(approveTx);
    this.txs.push(...queued);
    return queued;
  }

  async handleAaveVariableDebtApproval(params: ApprovalParams & { assetAddress: EthereumAddress }): Promise<TxWrapper[]> {
    const {
      isSpenderProxy, spender, amount, shouldBump, approveType, useMaxuint = false, assetAddress,
    } = params;
    const tokenData = await getErc20TokenData(this.chain, assetAddress, this.network);
    const assetLabel = params.asset || tokenData.symbol;
    const amountWei = useMaxuint ? MAXUINT : toUnits(shouldBump ? bumpAmountForApproval(amount) : amount, tokenData.decimals);
    const approveTx = this.buildApproveTx({
      assetLabel, assetAddress, isSpenderProxy, spender, approveType, amountWei, method: 'approveDelegation',
    });

    if (!spender && isSpenderProxy) {
      this.txs.push(approveTx);
      return [approveTx];
    }
    requireAddress(spender);
    const { approved } = await this.isApproved(assetAddress, spender, toUnits(amount, tokenData.decimals), true);
    if (approved) return [];
    this.txs.push(approveTx);
    return [approveTx];
  }

  async handleNftApproval(params: {
    isSpenderProxy: boolean; spender: EthereumAddress; nftAddress: EthereumAddress; nftId: string; specialApproveLabel: string; approveType: string;
  }): Promise<TxWrapper[]> {
    const {
      isSpenderProxy, spender, nftAddress, nftId, specialApproveLabel, approveType,
    } = params;
    const approvedAddress = await readContract<string>(this.chain, nftAddress, erc721Abi, 'getApproved', [nftId]);
    if (compareAddresses(approvedAddress, spender)) return [];

    const { messages, hooks } = this.config;
    const tx = new TxWrapper(TxType.Normal, {
      category: '',
      executingAddress: this.state.getAccount(),
      title: `${messages.approve} ${this.label(APPROVE_TYPE_SMART_WALLET)} ${messages.for} NFT${specialApproveLabel === 'uniswap v3' ? ` #${nftId}` : ''}`,
      approveData: () => ({
        asset: '', spender: this.resolveSpender(isSpenderProxy, spender), approveType, amount: '0', assetAddress: '',
      }),
      contractCallParams: {
        address: nftAddress,
        abi: erc721Abi,
        method: 'approve',
        methodParams: () => [this.resolveSpender(isSpenderProxy, spender), nftId],
      },
    });
    const event = { asset: `NFT#${nftId}`, approveType, isRevoke: false } as const;
    tx.setOnExecuteBegin(() => {
      const resolved = this.resolveSpender(isSpenderProxy, spender);
      requireAddress(resolved);
      hooks.onApproval?.({ ...event, phase: 'request', spender: resolved }, tx);
    });
    tx.setOnExecuteSuccess(() => hooks.onApproval?.({ ...event, phase: 'success', spender: this.resolveSpender(isSpenderProxy, spender) }, tx));
    tx.setOnExecuteError((error) => hooks.onApproval?.({
      ...event, phase: 'failure', spender: this.resolveSpender(isSpenderProxy, spender), error,
    }, tx));
    this.txs.push(tx);
    return [tx];
  }

  /**
   * One approve tx per asset the account must approve for the selected smart wallet.
   * The begin/success/error hooks run only when at least one approval was queued.
   */
  async handleMultipleApprovals(params: MultipleApprovalsParams) {
    const {
      approvals, approvalTokenAmounts, onApprovalsBegin, onApprovalsSuccess, onApprovalsError,
    } = params;
    const account = this.state.getAccount();
    const proxyAddress = this.state.getProxyAddress();
    const network = this.network;
    const txCountPreApproval = this.txs.length;

    for (const approval of approvals) {
      if (!compareAddresses(approval.owner, account)) continue;
      if (isRecipeNftApproval(approval)) {
        await this.handleNftApproval({
          isSpenderProxy: true,
          spender: proxyAddress,
          nftAddress: approval.nft,
          nftId: approval.tokenId || '',
          specialApproveLabel: approval.specialApproveLabel || '',
          approveType: APPROVE_TYPE_SMART_WALLET,
        });
      } else {
        let asset = getAssetInfoByAddress(approval.asset);
        let assetAddressForHandleApproval: string | undefined;
        if (asset.symbol === '?') {
          const erc20Data = await getErc20TokenData(this.chain, approval.asset, network);
          const label = approval.specialApproveLabel;
          asset = {
            ...asset,
            symbol: label ? label.charAt(0).toUpperCase() + label.slice(1) : erc20Data.symbol,
            address: approval.asset,
            decimals: erc20Data.decimals,
          };
          assetAddressForHandleApproval = approval.asset;
        }
        const amount = approvalTokenAmounts[asset.symbol];
        await this.handleApproval({
          isSpenderProxy: true,
          asset: asset.symbol,
          spender: proxyAddress,
          amount,
          shouldBump: true,
          approveType: APPROVE_TYPE_SMART_WALLET,
          useMaxuint: amount === MAXUINT,
          assetAddress: assetAddressForHandleApproval,
        });
      }
    }

    if (this.txs.length === txCountPreApproval) return;
    this.txs[txCountPreApproval].setOnExecuteBegin(onApprovalsBegin);
    this.txs[this.txs.length - 1].setOnExecuteSuccess(onApprovalsSuccess);
    this.txs.slice(txCountPreApproval).forEach((tx) => tx.setOnExecuteError(onApprovalsError));
  }

  /** One recipe tx from the smart wallet approving `spender` for every asset still lacking allowance. */
  async handleApprovalsForProxy(params: ApprovalsForProxyParams) {
    const {
      approvals, approvalTokenAmounts, spender, onApprovalsBegin, onApprovalsSuccess, onApprovalsError, title,
    } = params;
    const proxyAddress = this.state.getProxyAddress();
    const network = this.network;

    const needed = (await Promise.all(approvals.map(async (approval) => {
      const { asset } = approval as RecipeAssetApproval;
      let info: { symbol: string; decimals: number } = getAssetInfoByAddress(asset);
      if (info.symbol === '?') info = await getErc20TokenData(this.chain, asset, network);
      const amountInWei = toUnits(bumpAmountForApproval(approvalTokenAmounts[info.symbol]), info.decimals);
      const allowance = await readContract<bigint>(this.chain, asset, erc20Abi, 'allowance', [proxyAddress, spender]);
      if (allowance.toString() === MAXUINT || new Dec(allowance.toString()).gte(amountInWei)) return null;
      return { asset, amountInWei };
    }))).filter((x): x is { asset: string; amountInWei: string } => x !== null);

    const buildRecipe = params.buildRecipe || (async (list: { asset: string; amountInWei: string }[], to: string) => new Recipe(
      'ApproveAssets',
      list.map(({ asset, amountInWei }) => new dfs.actions.basic.ApproveTokenAction(asset, to, amountInWei)),
    ));

    const approvalTx = new TxWrapper(TxType.Normal, {
      title,
      category: '',
      protocol: '',
      executingAddress: () => this.state.getProxyAddress(),
      recipe: () => buildRecipe(needed, spender),
      onExecuteBegin: onApprovalsBegin,
      onExecuteSuccess: onApprovalsSuccess,
      onExecuteError: onApprovalsError,
    });
    this.txs.push(approvalTx);
  }
}
