import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { environment } from '../../../environments/environment';

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: 'user' | 'ai';
  content: string;
  timestamp: string;
}

export interface RoomUser {
  uid: string;
  display_name: string;
}

export interface RoomState {
  room_id: string;
  users: RoomUser[];
  ai_responding: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

@Injectable({ providedIn: 'root' })
export class ChatService implements OnDestroy {
  private firebase = inject(FirebaseService);

  private ws: WebSocket | null = null;
  private currentRoomId: string | null = null;

  messages$ = new BehaviorSubject<ChatMessage[]>([]);
  roomState$ = new BehaviorSubject<RoomState | null>(null);
  aiTyping$ = new BehaviorSubject<boolean>(false);
  connectionStatus$ = new BehaviorSubject<ConnectionStatus>('disconnected');
  events$ = new Subject<{ type: string; payload: unknown }>();

  async joinRoom(roomId: string): Promise<void> {
    const token = await this.firebase.getIdToken();
    const user = this.firebase.currentUser;
    if (!token || !user) throw new Error('Not authenticated');

    const displayName = user.displayName || user.email || 'User';

    this.disconnect();
    this.messages$.next([]);
    this.currentRoomId = roomId;
    this.connectionStatus$.next('connecting');

    const params = new URLSearchParams({ token, display_name: displayName });
    const url = `${environment.wsUrl}/api/chat/ws/${roomId}?${params}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connectionStatus$.next('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      this.connectionStatus$.next('disconnected');
      this.ws = null;
    };

    this.ws.onerror = () => {
      this.connectionStatus$.next('error');
    };
  }

  private handleServerMessage(msg: { type: string; payload: unknown }) {
    switch (msg.type) {
      case 'message': {
        const incoming = msg.payload as ChatMessage;
        this.messages$.next([...this.messages$.value, incoming]);
        break;
      }
      case 'history': {
        const history = (msg.payload as { messages: ChatMessage[] }).messages;
        this.messages$.next(history);
        break;
      }
      case 'room_state': {
        this.roomState$.next(msg.payload as RoomState);
        break;
      }
      case 'ai_typing': {
        const typing = (msg.payload as { typing: boolean }).typing;
        this.aiTyping$.next(typing);
        break;
      }
      case 'join':
      case 'leave': {
        this.events$.next(msg);
        const current = this.roomState$.value;
        if (current) {
          const payload = msg.payload as RoomUser;
          if (msg.type === 'join') {
            const already = current.users.some((u) => u.uid === payload.uid);
            if (!already) {
              this.roomState$.next({ ...current, users: [...current.users, payload] });
            }
          } else {
            this.roomState$.next({
              ...current,
              users: current.users.filter((u) => u.uid !== payload.uid),
            });
          }
        }
        break;
      }
    }
  }

  sendMessage(content: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'message', payload: { content } }));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentRoomId = null;
    this.roomState$.next(null);
    this.aiTyping$.next(false);
    this.connectionStatus$.next('disconnected');
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
