import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom } from 'rxjs';
import { ChatService, ChatMessage } from '../../core/services/chat.service';
import { AuthService } from '../../core/services/auth.service';
import { FirebaseService } from '../../core/services/firebase.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  private chatService = inject(ChatService);
  private authService = inject(AuthService);
  private firebase = inject(FirebaseService);
  private http = inject(HttpClient);

  @ViewChild('messagesEnd') messagesEnd!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  messages$ = this.chatService.messages$;
  roomState$ = this.chatService.roomState$;
  aiTyping$ = this.chatService.aiTyping$;
  connectionStatus$ = this.chatService.connectionStatus$;

  messageText = '';
  roomId = signal('');
  joinRoomId = '';
  view = signal<'lobby' | 'chat'>('lobby');
  loading = signal(false);
  error = signal('');
  notification = signal('');

  private subs = new Subscription();
  private shouldScroll = false;

  get currentUid(): string {
    return this.firebase.currentUser?.uid ?? '';
  }

  get currentDisplayName(): string {
    const user = this.firebase.currentUser;
    return user?.displayName || user?.email || 'User';
  }

  ngOnInit() {
    this.subs.add(
      this.chatService.events$.subscribe((evt) => {
        if (evt.type === 'join') {
          const p = evt.payload as { display_name: string };
          this.showNotification(`${p.display_name} se unió al chat`);
        } else if (evt.type === 'leave') {
          const p = evt.payload as { display_name: string };
          this.showNotification(`${p.display_name} abandonó el chat`);
        }
      })
    );

    this.subs.add(
      this.chatService.messages$.subscribe(() => {
        this.shouldScroll = true;
      })
    );

    this.subs.add(
      this.chatService.aiTyping$.subscribe(() => {
        this.shouldScroll = true;
      })
    );
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.chatService.disconnect();
  }

  async createRoom() {
    this.loading.set(true);
    this.error.set('');
    try {
      const token = await this.firebase.getIdToken();
      const res = await firstValueFrom(
        this.http.post<{ room_id: string }>(
          `${environment.apiUrl}/api/chat/rooms?id_token=${token}`,
          {}
        )
      );
      this.roomId.set(res.room_id);
      await this.enterRoom(res.room_id);
    } catch {
      this.error.set('Error al crear la sala. Revisá la conexión.');
    } finally {
      this.loading.set(false);
    }
  }

  async joinRoom() {
    const id = this.joinRoomId.trim();
    if (!id) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.enterRoom(id);
    } catch {
      this.error.set('No se pudo unir a esa sala.');
    } finally {
      this.loading.set(false);
    }
  }

  private async enterRoom(roomId: string) {
    this.roomId.set(roomId);
    await this.chatService.joinRoom(roomId);
    this.view.set('chat');
  }

  sendMessage() {
    const content = this.messageText.trim();
    if (!content) return;
    this.chatService.sendMessage(content);
    this.messageText = '';
    this.messageInput?.nativeElement?.focus();
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  leaveRoom() {
    this.chatService.disconnect();
    this.view.set('lobby');
    this.roomId.set('');
    this.joinRoomId = '';
  }

  async copyRoomId() {
    await navigator.clipboard.writeText(this.roomId());
    this.showNotification('¡ID copiado al portapapeles!');
  }

  isMine(msg: ChatMessage): boolean {
    return msg.sender_id === this.currentUid;
  }

  isAI(msg: ChatMessage): boolean {
    return msg.sender_type === 'ai';
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async logout() {
    this.chatService.disconnect();
    await this.authService.logout();
  }

  private scrollToBottom() {
    try {
      this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  private showNotification(msg: string) {
    this.notification.set(msg);
    setTimeout(() => this.notification.set(''), 3000);
  }
}
