/**
 * A minimal typed event bus for cross-module communication.
 *
 * Use this sparingly — prefer React context/props for most cases.
 * This is meant for decoupled concerns like "agent task completed → refresh balance".
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventMap {
  "agent:task_completed": { taskId: string; status: "completed" | "failed" | "cancelled" };
  "sessions:external_changed": Record<string, never>;
}

type Listener<T> = (payload: T) => void;
type Unsubscribe = () => void;

class TypedEventBus<TEventMap> {
  private listeners = new Map<keyof TEventMap, Set<Listener<any>>>();

  on<K extends keyof TEventMap>(
    event: K,
    listener: Listener<TEventMap[K]>,
  ): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    this.listeners.get(event)?.forEach((listener) => {
      listener(payload);
    });
  }

  /** Remove all listeners for a specific event. */
  clear(event: keyof TEventMap): void {
    this.listeners.delete(event);
  }

  /** Remove all listeners for all events. */
  clearAll(): void {
    this.listeners.clear();
  }
}

/**
 * Global application event bus.
 *
 * Extend the `EventMap` interface (via declaration merging in a module file)
 * to add typed event contracts.
 *
 * @example
 * ```ts
 * // In a module file:
 * declare module "@/lib/event-bus" {
 *   interface EventMap {
 *     "user:logged_in": { userId: string };
 *   }
 * }
 *
 * // Emit:
 * appEventBus.emit("user:logged_in", { userId: "abc" });
 *
 * // Subscribe:
 * appEventBus.on("user:logged_in", ({ userId }) => { ... });
 * ```
 */
export const appEventBus = new TypedEventBus<EventMap>();
