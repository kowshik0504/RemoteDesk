import { EventEmitter } from 'node:events';
import type {
  TicketEventType,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '../../shared/types.ts';

export interface EventActor {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface TicketEventPayload {
  eventType: TicketEventType;
  ticketId: number | null;
  ticketCode: string;
  ticketTitle: string;
  requesterId: number;
  requesterName: string;
  requesterEmail: string;
  actor: EventActor;
  summary: string;
  metadata?: {
    previousStatus?: TicketStatus;
    newStatus?: TicketStatus;
    previousPriority?: TicketPriority;
    newPriority?: TicketPriority;
    commentPreview?: string;
    isInternalComment?: boolean;
    changedFields?: string[];
  };
}

type EventHandlerFn = (payload: TicketEventPayload) => Promise<void> | void;

class TicketEventBus extends EventEmitter {
  private handlers: Map<TicketEventType | '*', EventHandlerFn[]> = new Map();

  public subscribe(
    eventType: TicketEventType | '*',
    handler: EventHandlerFn
  ): () => void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
    return () => {
      const list = this.handlers.get(eventType) ?? [];
      this.handlers.set(
        eventType,
        list.filter((fn) => fn !== handler)
      );
    };
  }

  public async publish(payload: TicketEventPayload): Promise<void> {
    this.emit(payload.eventType, payload);
    this.emit('*', payload);

    const specificHandlers = this.handlers.get(payload.eventType) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];
    const allHandlers = [...specificHandlers, ...wildcardHandlers];

    await Promise.all(
      allHandlers.map(async (handler) => {
        try {
          await handler(payload);
        } catch (err) {
          console.error(
            `[TicketEventBus] Handler failed for event ${payload.eventType}:`,
            err
          );
        }
      })
    );
  }
}

export const ticketEventBus = new TicketEventBus();
