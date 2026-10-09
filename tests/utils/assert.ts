import { assert } from 'chai';

/** chai has no built-in `rejects`; keep it dependency-free. */
export const assertRejects = async (promise: Promise<unknown>, match: RegExp | string) => {
  try {
    await promise;
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    if (typeof match === 'string') assert.include(message, match);
    else assert.match(message, match);
    return;
  }
  assert.fail('Expected promise to reject');
};

/** Reads a required secret from .env; returns undefined so callers can `this.skip()`. */
export const envSecret = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
};
