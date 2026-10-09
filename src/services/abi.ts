import {
  type Abi,
  type AbiFunction,
  decodeFunctionResult,
  encodeFunctionData,
  toFunctionSignature,
} from 'viem';
import type { ChainAdapter, CallRequest } from '../interfaces/ChainAdapter';
import type { EthereumAddress, Hex } from '../types';

/** Resolves `method` by name, or by full signature (`execute(address,bytes)`) when overloads exist. */
export const resolveAbiFunction = (abi: Abi, method: string, args: unknown[] = []): AbiFunction => {
  const fns = abi.filter((item): item is AbiFunction => item.type === 'function');
  if (method.includes('(')) {
    const bySig = fns.find((fn) => toFunctionSignature(fn) === method);
    if (!bySig) throw new Error(`ABI has no function with signature ${method}`);
    return bySig;
  }
  const byName = fns.filter((fn) => fn.name === method);
  if (byName.length === 0) throw new Error(`ABI has no function named ${method}`);
  if (byName.length === 1) return byName[0];
  const byArity = byName.filter((fn) => fn.inputs.length === args.length);
  if (byArity.length === 1) return byArity[0];
  throw new Error(`Function ${method} is overloaded, pass the full signature instead`);
};

export const encodeCall = (abi: Abi, method: string, args: unknown[] = []): Hex => {
  const fn = resolveAbiFunction(abi, method, args);
  return encodeFunctionData({ abi: [fn], functionName: fn.name, args: args as never });
};

export const readContract = async <T = unknown>(
  chain: ChainAdapter,
  address: EthereumAddress,
  abi: Abi,
  method: string,
  args: unknown[] = [],
  extra: Partial<CallRequest> = {},
): Promise<T> => {
  const fn = resolveAbiFunction(abi, method, args);
  const data = encodeFunctionData({ abi: [fn], functionName: fn.name, args: args as never });
  const result = await chain.call({ ...extra, to: address, data });
  return decodeFunctionResult({ abi: [fn], functionName: fn.name, data: result }) as T;
};
