import type { Hex, PublicClient, TransactionReceipt, WalletClient } from 'viem';
import type { ChainAdapter, EIP712TypedData, EthereumAddress, TxReceipt } from '@defisaver/tx-sender';

export interface ViemAdapterOptions {
  publicClient: PublicClient; // Read client. May point at a fork or a different RPC than the wallet.
  walletClient: WalletClient; // Signing client with an account attached.
}

const toReceipt = (r: TransactionReceipt): TxReceipt => ({
  transactionHash: r.transactionHash,
  status: r.status === 'success',
  gasUsed: Number(r.gasUsed),
  blockNumber: Number(r.blockNumber),
  from: r.from,
  to: r.to,
  logs: r.logs.map((log) => ({ address: log.address, topics: [...log.topics], data: log.data, logIndex: log.logIndex })),
});

const asHex = (value: string | undefined) => (value === undefined ? undefined : BigInt(value));

/** `ChainAdapter` backed by viem's public and wallet clients. */
export const createViemAdapter = ({ publicClient, walletClient }: ViemAdapterOptions): ChainAdapter => ({
  getChainId: () => walletClient.getChainId(),

  getCode: async (address) => (await publicClient.getCode({ address: address as Hex })) || '0x',

  getGasPrice: async () => (await publicClient.getGasPrice()).toString(),

  getLatestBaseFee: async () => {
    const block = await publicClient.getBlock({ blockTag: 'latest' });
    return block.baseFeePerGas === null || block.baseFeePerGas === undefined ? undefined : block.baseFeePerGas.toString();
  },

  call: async (req) => {
    const { data } = await publicClient.call({
      to: req.to as Hex,
      data: req.data,
      account: req.from as Hex | undefined,
      value: asHex(req.value),
      gasPrice: asHex(req.gasPrice),
      gas: req.gas === undefined ? undefined : BigInt(req.gas),
    });
    return data || '0x';
  },

  estimateGas: async (req) => Number(await publicClient.estimateGas({
    account: req.from as Hex,
    to: req.to as Hex,
    data: req.data,
    value: asHex(req.value),
    gasPrice: asHex(req.gasPrice),
  })),

  getTransactionReceipt: async (hash) => {
    try {
      return toReceipt(await publicClient.getTransactionReceipt({ hash: hash as Hex }));
    } catch {
      return null;
    }
  },

  sendTransaction: async (params, onTxHash) => {
    const account = walletClient.account;
    if (!account) throw new Error('walletClient has no account');
    const base = {
      account,
      chain: walletClient.chain,
      to: params.to as Hex,
      data: params.data as Hex,
      value: BigInt(params.value),
      gas: BigInt(params.gas),
    };
    const hash = params.type === '0x2'
      ? await walletClient.sendTransaction({
        ...base, type: 'eip1559', maxFeePerGas: asHex(params.maxFeePerGas), maxPriorityFeePerGas: asHex(params.maxPriorityFeePerGas),
      })
      : await walletClient.sendTransaction({ ...base, type: 'legacy', gasPrice: asHex(params.gasPrice) });
    await onTxHash(hash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return toReceipt(receipt);
  },

  signMessage: (message, signer) => walletClient.signMessage({ account: signer as Hex, message }),

  signTypedData: (typedData: EIP712TypedData, signer: EthereumAddress) => {
    // viem derives EIP712Domain from `domain`; passing it explicitly is rejected.
    const { EIP712Domain: _domain, ...types } = typedData.types;
    return walletClient.signTypedData({
      account: signer as Hex,
      domain: {
        ...typedData.domain,
        chainId: typedData.domain.chainId === undefined ? undefined : Number(typedData.domain.chainId),
        verifyingContract: typedData.domain.verifyingContract as Hex | undefined,
      },
      types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    });
  },

  sendCalls: async ({ from, chainId, calls }) => walletClient.request({
    method: 'wallet_sendCalls' as never,
    params: [{
      version: '2.0.0',
      from,
      chainId: `0x${chainId.toString(16)}`,
      atomicRequired: true,
      calls,
    }] as never,
  }),
});
