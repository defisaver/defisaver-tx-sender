import type { Abi } from 'viem';
import type { ChainAdapter, ContractCallParams, EIP712TypedData, Hex, TxReceipt, TxWParam } from '@defisaver/tx-sender';

/* Structural types so web3 is not a dependency. Compatible with web3 v1 and v4 instances. */

interface Web3Receipt {
  transactionHash: string;
  status: boolean | bigint | number;
  gasUsed: number | bigint;
  blockNumber: number | bigint;
  from: string;
  to: string | null;
  logs: { address: string; topics: string[]; data: string; logIndex?: number | bigint }[];
  events?: Record<string, unknown>;
  txId?: string;
}

interface PromiEvent extends Promise<Web3Receipt> {
  on(event: 'transactionHash', cb: (hash: string) => void): PromiEvent;
  on(event: 'receipt', cb: (receipt: Web3Receipt) => void): PromiEvent;
  on(event: 'error', cb: (error: unknown) => void): PromiEvent;
}

export interface Web3Like {
  eth: {
    getChainId(): Promise<number | bigint>;
    getCode(address: string): Promise<string>;
    getGasPrice(): Promise<string | bigint>;
    getBlock(block: 'latest'): Promise<{ baseFeePerGas?: string | number | bigint | null }>;
    call(tx: Record<string, unknown>): Promise<string>;
    estimateGas(tx: Record<string, unknown>): Promise<number | bigint>;
    getTransactionReceipt(hash: string): Promise<Web3Receipt | null>;
    sendTransaction(tx: Record<string, unknown>): PromiEvent;
    personal: { sign(message: string, address: string, password: string): Promise<string> };
  };
  currentProvider?: { request?(args: { method: string; params?: unknown[] }): Promise<unknown> } | null;
}

export interface Web3AdapterOptions {
  web3: Web3Like; // Read-only instance (RPC, possibly a fork).
  web3Signer?: Web3Like; // Wallet-connected instance used for signing and sending. Defaults to `web3`.
}

const toReceipt = (r: Web3Receipt): TxReceipt => ({
  transactionHash: r.transactionHash,
  status: typeof r.status === 'boolean' ? r.status : Number(r.status) === 1,
  gasUsed: Number(r.gasUsed),
  blockNumber: Number(r.blockNumber),
  from: r.from,
  to: r.to,
  logs: r.logs.map((log) => ({ ...log, logIndex: log.logIndex === undefined ? undefined : Number(log.logIndex) })),
  events: r.events,
  txId: r.txId,
});

/** `ChainAdapter` backed by web3.js. Works with both v1 and v4 instances. */
export const createWeb3Adapter = ({ web3, web3Signer = web3 }: Web3AdapterOptions): ChainAdapter => ({
  getChainId: async () => Number(await web3Signer.eth.getChainId()),

  getCode: (address) => web3.eth.getCode(address),

  getGasPrice: async () => (await web3.eth.getGasPrice()).toString(),

  getLatestBaseFee: async () => {
    const block = await web3.eth.getBlock('latest');
    const fee = block.baseFeePerGas;
    return fee === undefined || fee === null ? undefined : fee.toString();
  },

  call: async (req) => (await web3.eth.call({
    to: req.to, data: req.data, from: req.from, value: req.value, gasPrice: req.gasPrice, gas: req.gas,
  })) as Hex,

  estimateGas: async (req) => Number(await web3.eth.estimateGas({
    from: req.from, to: req.to, data: req.data, value: req.value, gasPrice: req.gasPrice,
  })),

  getTransactionReceipt: async (hash) => {
    const receipt = await web3.eth.getTransactionReceipt(hash);
    return receipt ? toReceipt(receipt) : null;
  },

  sendTransaction: (params, onTxHash) => new Promise<TxReceipt>((resolve, reject) => {
    let settled = false;
    let hashHandled: Promise<void> = Promise.resolve();
    const { addSuffix: _addSuffix, ...tx } = params;
    // Do not pass undefined props: Trezor's provider fails on them.
    const cleaned = Object.fromEntries(Object.entries(tx).filter(([, v]) => v !== undefined));
    web3Signer.eth.sendTransaction(cleaned)
      .on('transactionHash', (hash) => { hashHandled = onTxHash(hash); })
      .on('receipt', async (receipt) => {
        if (settled) return;
        settled = true;
        try {
          await hashHandled;
          resolve(toReceipt(receipt));
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      })
      .catch((error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
  }),

  signMessage: (message, signer) => web3Signer.eth.personal.sign(message, signer, '') as Promise<Hex>,

  signTypedData: async (typedData: EIP712TypedData, signer) => {
    const provider = web3Signer.currentProvider;
    if (!provider?.request) throw new Error('web3Signer.currentProvider does not support request()');
    return provider.request({ method: 'eth_signTypedData_v4', params: [signer, JSON.stringify(typedData)] }) as Promise<Hex>;
  },

  sendCalls: async ({ from, chainId, calls }) => {
    const provider = web3.currentProvider;
    if (!provider?.request) throw new Error('web3.currentProvider does not support request()');
    return provider.request({
      method: 'wallet_sendCalls',
      params: [{ version: '2.0.0', from, chainId: `0x${chainId.toString(16)}`, atomicRequired: true, calls }],
    });
  },
});

interface Web3ContractLike {
  options: { address: string; jsonInterface: unknown };
}

/** Converts a web3 `Contract` instance into the SDK's provider-agnostic `ContractCallParams`. */
export const fromWeb3Contract = (
  contract: Web3ContractLike,
  method: string,
  methodParams?: TxWParam<unknown[]>,
  ethValue?: string,
): ContractCallParams => ({
  address: contract.options.address,
  abi: contract.options.jsonInterface as Abi,
  method,
  methodParams,
  ethValue,
});
