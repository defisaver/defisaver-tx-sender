import Dec from 'decimal.js';
import { SWAP_SOURCE_NONE } from '../../config/constants';
import type {
  GasEstimate, RecipeSwapInfo, RecipeWithSwap, TxReceipt,
} from '../../types';
import type { EstimationFailed, ExecutionResult } from '../../types/encoding';
import type { ExecutionContext } from '../ExecutionContext';
import type TxError from '../TxError';

/**
 * Execute loop shared by every executor. Handles the optional pre-estimate swap-route retry,
 * re-encoding after a failed estimate in the confirm dialog, and lifecycle hooks on the tx.
 */
export abstract class AbstractExecutor {
  protected abstract executeInternal(context: ExecutionContext): Promise<ExecutionResult>;

  protected abstract estimateInternal(context: ExecutionContext): Promise<GasEstimate>;

  protected abstract handleError(err: unknown, context: ExecutionContext): Promise<TxError>;

  /** Re-estimates while blacklisting failing swap sources. Returns the swap info used for logging. */
  private async findWorkingSwapRoute(context: ExecutionContext): Promise<RecipeSwapInfo | null> {
    const { tx, env } = context;
    const { logger } = env.config;
    let swapInfo: RecipeSwapInfo | null = null;
    let forceExecuteBestOption = false;
    let shouldRepeat = true;

    while (shouldRepeat) {
      const { failing, insufficientFunds, recipe } = await this.estimateInternal(context);
      const swap = (recipe as RecipeWithSwap | undefined)?.swap;
      if (!swap) break;

      swapInfo = swap;
      tx.swapOrders = swap.fetchedSwapOrders || [];
      const {
        lastFoundExchangeSource, price: minPrice, lastFoundPrice, amount, toTokenData, fromTokenData,
      } = swap;
      const logData = {
        network: env.network, amount, from: fromTokenData.symbol, to: toTokenData.symbol,
      };

      if (forceExecuteBestOption) {
        tx.swapInjectInfo = null;
        break;
      }
      if (failing) {
        if (insufficientFunds) break;
        if (!lastFoundExchangeSource || lastFoundExchangeSource === SWAP_SOURCE_NONE) {
          tx.swapSourcesBlacklist = [];
          forceExecuteBestOption = true;
          logger.warn('Swap not finding a working route. Forming recipe with best option.', logData);
        } else {
          logger.info('Swap estimated to fail. Finding a new route.', { ...logData, source: lastFoundExchangeSource });
          tx.addSwapSourceToBlacklist(lastFoundExchangeSource);
        }
      } else if (tx.swapSourcesBlacklist.length > 0) {
        const originalToAmount = new Dec(amount).mul(minPrice || 0).toString();
        const newToAmount = new Dec(amount).mul(lastFoundPrice).toString();
        const delta = new Dec(originalToAmount).sub(newToAmount).toString();
        tx.swapInjectInfo = {
          originalAmount: originalToAmount,
          newAmount: newToAmount,
          changePercent: new Dec(delta).div(originalToAmount).mul(100).toString(),
          asset: toTokenData.symbol,
          newSource: lastFoundExchangeSource || 'Unknown',
        };
      }
      if (!failing) shouldRepeat = false;
    }
    return swapInfo;
  }

  private logSwapOutcome(context: ExecutionContext, swap: RecipeSwapInfo, receipt: TxReceipt) {
    const { tx, env } = context;
    const { logger } = env.config;
    const { transactionHash, status } = receipt;
    const {
      lastFoundExchangeSource, price: minPrice, amount, toTokenData, fromTokenData, lastFoundPrice,
    } = swap;
    const log = status ? logger.info.bind(logger) : logger.warn.bind(logger);
    const base = {
      network: env.network, amount, from: fromTokenData.symbol, to: toTokenData.symbol, source: lastFoundExchangeSource, minPrice, transactionHash,
    };
    if (tx.swapSourcesBlacklist.length > 0) {
      log(`Swap ${status ? 'working' : 'failed'} with an injected route.`, {
        ...base, newMinPrice: lastFoundPrice, blacklistedSources: tx.swapSourcesBlacklist.join(', '),
      });
    } else {
      log(`Swap ${status ? 'working' : 'failed'}.`, base);
    }
  }

  async executeTx(context: ExecutionContext): Promise<ExecutionResult> {
    const { tx, env } = context;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const swapInfo = tx.shouldCheckEstimate ? await this.findWorkingSwapRoute(context) : null;
        await tx.onExecuteBegin();
        const result = await this.executeInternal(context);
        if ((result as EstimationFailed).failed) {
          env.config.logger.info('Transaction estimated to fail in confirm dialog. Re-encoding.', {
            network: env.network,
            ...(swapInfo ? {
              amount: swapInfo.amount, from: swapInfo.fromTokenData.symbol, to: swapInfo.toTokenData.symbol, source: swapInfo.lastFoundExchangeSource,
            } : {}),
          });
          continue;
        }
        if (swapInfo && (result as TxReceipt).transactionHash) {
          try { this.logSwapOutcome(context, swapInfo, result as TxReceipt); } catch { /* logging only */ }
        }
        await tx.onExecuteSuccess(result as TxReceipt);
        return result;
      } catch (e) {
        const err = await this.handleError(e, context);
        await tx.onExecuteError(err);
        throw err;
      }
    }
  }

  async estimateTx(context: ExecutionContext): Promise<GasEstimate> {
    try {
      return await this.estimateInternal(context);
    } catch (e) {
      throw await this.handleError(e, context);
    }
  }
}
