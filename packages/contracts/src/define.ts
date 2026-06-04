import type { Schema } from 'effect';

/**
 * Contract format (decision #5, Option 2 — stable Effect v3).
 *
 * A contract is a plain Schema triple. No `@effect/rpc`, no `Rpc.make`: on stable v3 that would
 * mean pulling a whole package just for a descriptor shape. The home-made IPC registry
 * (`makeIpcMethod` / `makeIpcSubscription`) reads `.payload` / `.success` / `.item` / `.error`
 * off these objects. Method-vs-subscription is the helper you pick — not a `stream` flag.
 *
 * This package stays schema-only: these helpers just wrap schemas in a tagged object. No IO.
 */

export interface MethodContract<
  P extends Schema.Schema.All,
  S extends Schema.Schema.All,
  E extends Schema.Schema.All,
> {
  readonly _tag: 'Method';
  readonly payload: P;
  readonly success: S;
  readonly error: E;
}

export interface SubscriptionContract<
  P extends Schema.Schema.All,
  I extends Schema.Schema.All,
  E extends Schema.Schema.All,
> {
  readonly _tag: 'Subscription';
  readonly payload: P;
  readonly item: I;
  readonly error: E;
}

export const defineMethod = <
  P extends Schema.Schema.All,
  S extends Schema.Schema.All,
  E extends Schema.Schema.All,
>(contract: {
  payload: P;
  success: S;
  error: E;
}): MethodContract<P, S, E> => ({ _tag: 'Method', ...contract });

export const defineSubscription = <
  P extends Schema.Schema.All,
  I extends Schema.Schema.All,
  E extends Schema.Schema.All,
>(contract: {
  payload: P;
  item: I;
  error: E;
}): SubscriptionContract<P, I, E> => ({ _tag: 'Subscription', ...contract });
