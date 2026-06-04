import type { MethodContract, SubscriptionContract } from '@gitoui/contracts/define';
import { Cause, Effect, Exit, Fiber, Schema, Stream } from 'effect';
import { ipcMain } from 'electron';

// The 3-case plain-data envelope (decision #5/#7, ADR-0003). The boundary NEVER throws.
export type IpcResult =
  | { readonly _tag: 'Success'; readonly value: unknown }
  | { readonly _tag: 'Failure'; readonly error: unknown }
  | { readonly _tag: 'Defect'; readonly defect: { readonly message: string } };

export type IpcStreamMsg =
  | { readonly _tag: 'Event'; readonly value: unknown }
  | { readonly _tag: 'Failure'; readonly error: unknown }
  | { readonly _tag: 'Defect'; readonly defect: { readonly message: string } }
  | { readonly _tag: 'Done' };

type AnyMethod = MethodContract<Schema.Schema.All, Schema.Schema.All, Schema.Schema.All>;
type AnySub = SubscriptionContract<Schema.Schema.All, Schema.Schema.All, Schema.Schema.All>;

// Handlers are fully provided (R = never): the wiring (methods.ts) supplies the Layers.
type MethodHandler<C extends AnyMethod> = (
  payload: C['payload']['Type'],
) => Effect.Effect<C['success']['Type'], C['error']['Type']>;

type SubHandler<C extends AnySub> = (
  payload: C['payload']['Type'],
) => Stream.Stream<C['item']['Type'], C['error']['Type']>;

// Contracts store schemas as the broad `All` type (to admit `Schema.Never` errors). At the runtime
// boundary we treat them as concrete no-context schemas for decode/encode — they always are.
const asSchema = (s: Schema.Schema.All): Schema.Schema.AnyNoContext =>
  s as unknown as Schema.Schema.AnyNoContext;

const defect = (cause: Cause.Cause<unknown>): IpcResult => ({
  _tag: 'Defect',
  defect: { message: Cause.pretty(cause) },
});

const defectMsg = (cause: Cause.Cause<unknown>): IpcStreamMsg => ({
  _tag: 'Defect',
  defect: { message: Cause.pretty(cause) },
});

/** Request/response on `ipcMain.handle`. Decode → handle → encode → 3-case envelope. */
export const makeIpcMethod = <C extends AnyMethod>(
  channel: string,
  contract: C,
  handler: MethodHandler<C>,
): void => {
  const decode = Schema.decodeUnknown(asSchema(contract.payload));
  const encodeSuccess = Schema.encodeUnknown(asSchema(contract.success));
  const encodeError = Schema.encodeUnknown(asSchema(contract.error));

  ipcMain.handle(channel, async (_event, raw): Promise<IpcResult> => {
    const program = decode(raw).pipe(
      Effect.flatMap((payload) => handler(payload)),
      Effect.flatMap((success) => encodeSuccess(success)),
      Effect.map((value): IpcResult => ({ _tag: 'Success', value })),
      Effect.catchAll((error) =>
        encodeError(error).pipe(
          Effect.map((encoded): IpcResult => ({ _tag: 'Failure', error: encoded })),
          Effect.orElseSucceed(
            (): IpcResult => ({ _tag: 'Failure', error: { _tag: 'UnknownError' } }),
          ),
        ),
      ),
    );
    const exit = await Effect.runPromiseExit(program);
    return Exit.match(exit, { onSuccess: (r) => r, onFailure: defect });
  });
};

/**
 * Streaming via `webContents.send` (decision #5, ADR-0003). Teardown on THREE triggers:
 * explicit unsubscribe, window `destroyed`, and renderer navigation/reload (incl. HMR).
 */
export const makeIpcSubscription = <C extends AnySub>(
  channel: string,
  contract: C,
  handler: SubHandler<C>,
): void => {
  const decode = Schema.decodeUnknown(asSchema(contract.payload));
  const encodeItem = Schema.encodeUnknown(asSchema(contract.item));
  const encodeError = Schema.encodeUnknown(asSchema(contract.error));
  const fibers = new Map<string, Fiber.RuntimeFiber<void, never>>();

  const stop = (id: string) => {
    const fiber = fibers.get(id);
    if (fiber) {
      fibers.delete(id);
      Effect.runFork(Fiber.interrupt(fiber));
    }
  };

  ipcMain.on(`${channel}:subscribe`, (event, msg: { id: string; payload: unknown }) => {
    const { id } = msg;
    const sender = event.sender;
    const send = (m: IpcStreamMsg) => {
      if (!sender.isDestroyed()) sender.send(`${channel}:${id}`, m);
    };

    const program = decode(msg.payload).pipe(
      Effect.flatMap((payload) =>
        handler(payload).pipe(
          Stream.mapEffect((item) => encodeItem(item)),
          Stream.runForEach((value) => Effect.sync(() => send({ _tag: 'Event', value }))),
        ),
      ),
      Effect.matchCauseEffect({
        onSuccess: () => Effect.sync(() => send({ _tag: 'Done' })),
        onFailure: (cause) => {
          const failure = Cause.failureOption(cause);
          if (failure._tag === 'Some') {
            return encodeError(failure.value).pipe(
              Effect.map((error): IpcStreamMsg => ({ _tag: 'Failure', error })),
              Effect.orElseSucceed((): IpcStreamMsg => defectMsg(cause)),
              Effect.flatMap((m) => Effect.sync(() => send(m))),
            );
          }
          return Effect.sync(() => send(defectMsg(cause)));
        },
      }),
    );

    fibers.set(id, Effect.runFork(program));

    sender.once('destroyed', () => stop(id));
    sender.once('did-start-navigation', () => stop(id));
  });

  ipcMain.on(`${channel}:unsubscribe`, (_event, msg: { id: string }) => stop(msg.id));
};
