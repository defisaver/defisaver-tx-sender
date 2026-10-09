import type { Action } from '@defisaver/sdk';

/** Rewrites relative `$-n` param references to absolute `$i` indexes. */
export const processActionsForPrev = (recipeActions: Action[]) => {
  recipeActions.forEach((action, i) => {
    const index = action.args.findIndex((val) => typeof val === 'string' && val.startsWith('$-'));
    if (index !== -1) {
      const subBy = +(action.args[index] as string).slice(1);
      const replaceBy = `$${i + 1 + subBy}`;
      // Mutating the sdk Action in place is the contract the app relies on.
      action.args[index] = replaceBy; // eslint-disable-line no-param-reassign
      action.mappableArgs[index] = replaceBy; // eslint-disable-line no-param-reassign
    }
  });
  return recipeActions;
};
