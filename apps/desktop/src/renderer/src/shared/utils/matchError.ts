/**
 * Exhaustive matcher for the plain tagged-error objects that cross the IPC boundary (decision #8 —
 * "the one place the hybrid pinches"). Effect stops at the boundary, so the renderer never gets a
 * compiler-*tracked* error channel; this recovers the *type-level* ergonomics instead: the error
 * union is supplied by the caller (derive it from the contract — see `#renderer/shared/git/errors`),
 * every variant must be handled, so adding one in `core`/contracts stops this call from compiling.
 *
 * The boundary throws an `unknown` (Style A re-throw) and can carry a **Defect** (a bug, not a
 * business error) or any non-tagged value — so a `_` fallback is mandatory, not optional. No `effect`
 * runtime is pulled in: this is a plain `_tag` switch over already-serialized data.
 */
export type ErrorHandlers<E extends { readonly _tag: string }, R> = {
  readonly [Tag in E['_tag']]: (error: Extract<E, { readonly _tag: Tag }>) => R;
} & {
  /** Defects + anything that isn't a known business error. Required: the throw is an `unknown`. */
  readonly _: (error: unknown) => R;
};

export function matchError<E extends { readonly _tag: string }, R>(
  error: unknown,
  handlers: ErrorHandlers<E, R>,
): R {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { _tag?: unknown })._tag === 'string'
  ) {
    const tag = (error as { _tag: string })._tag;
    const handler = (handlers as Record<string, ((error: unknown) => R) | undefined>)[tag];
    if (handler) return handler(error);
  }
  return handlers._(error);
}
