import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, catchError, of, tap } from 'rxjs';
import { Client, IMessage } from '@stomp/stompjs';
import { AuthService } from './auth.service';

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  read: boolean;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly apiUrl =
    `${environment.apiUrl}/notifications`;

  readonly notifications =
    signal<NotificationItem[]>([]);

  readonly unreadCount =
    computed(() =>
      this.notifications()
        .filter(notification => !notification.read)
        .length
    );

  private stompClient: Client | null = null;
  private websocketConnected = false;

  loadNotifications():
    Observable<NotificationItem[]> {

    return this.http
      .get<NotificationItem[]>(
        `${this.apiUrl}/me`
      )
      .pipe(
        tap((notifications) => {
          this.notifications.set(notifications);
        }),
        catchError((error) => {

          console.error(
            '[AGDD] Failed to load notifications:',
            error
          );

          return of(this.notifications());
        })
      );
  }

  markAsRead(id: number):
    Observable<void> {

    return this.http
      .patch<void>(
        `${this.apiUrl}/${id}/read`,
        {}
      )
      .pipe(
        tap(() => {

          this.notifications.update(
            notifications =>
              notifications.map(notification =>
                notification.id === id
                  ? {
                      ...notification,
                      read: true
                    }
                  : notification
              )
          );
        }),
        catchError((error) => {

          console.error(
            '[AGDD] Failed to mark notification as read:',
            error
          );

          return of(void 0);
        })
      );
  }

  markAllAsRead():
    Observable<void> {

    return this.http
      .patch<void>(
        `${this.apiUrl}/me/read-all`,
        {}
      )
      .pipe(
        tap(() => {

          this.notifications.update(
            notifications =>
              notifications.map(notification => ({
                ...notification,
                read: true
              }))
          );
        }),
        catchError((error) => {

          console.error(
            '[AGDD] Failed to mark all notifications as read:',
            error
          );

          return of(void 0);
        })
      );
  }

  refresh(): void {
    this.loadNotifications().subscribe();
  }

  /**
   * Connect Angular to Spring Boot STOMP WebSocket.
   *
   * Backend endpoint:
   *   /ws/notifications
   *
   * User destination:
   *   /user/queue/notifications
   */
  connectWebSocket(): void {

    if (this.websocketConnected) {
      return;
    }

    const token = this.authService.getToken();

    if (!token) {
      console.warn(
        '[AGDD] WebSocket not started: no JWT token.'
      );
      return;
    }

    const backendBase =
      environment.apiUrl.replace(/\/api\/?$/, '');

    const wsProtocol =
      backendBase.startsWith('https://')
        ? 'wss'
        : 'ws';

    const backendHost =
      backendBase
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');

    const brokerURL =
      `${wsProtocol}://${backendHost}/ws/notifications`;

    console.log(
      '[AGDD] Connecting WebSocket:',
      brokerURL
    );

    this.stompClient = new Client({
      brokerURL,

      connectHeaders: {
        Authorization: `Bearer ${token}`
      },

      reconnectDelay: 5000,

      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      debug: (message: string) => {
        console.debug('[AGDD][STOMP]', message);
      }
    });

    this.stompClient.onConnect = () => {

      this.websocketConnected = true;

      console.log(
        '[AGDD] WebSocket connected successfully.'
      );

      this.stompClient?.subscribe(
        '/user/queue/notifications',
        (message: IMessage) => {

          this.handleRealtimeNotification(message);
        }
      );
    };

    this.stompClient.onDisconnect = () => {

      this.websocketConnected = false;

      console.log(
        '[AGDD] WebSocket disconnected.'
      );
    };

    this.stompClient.onStompError = (frame) => {

      this.websocketConnected = false;

      console.error(
        '[AGDD] STOMP broker error:',
        frame.headers['message'],
        frame.body
      );
    };

    this.stompClient.onWebSocketError = (error) => {

      this.websocketConnected = false;

      console.error(
        '[AGDD] WebSocket connection error:',
        error
      );
    };

    this.stompClient.activate();
  }

  disconnectWebSocket(): void {

    if (!this.stompClient) {
      return;
    }

    console.log(
      '[AGDD] Disconnecting WebSocket.'
    );

    this.websocketConnected = false;

    this.stompClient.deactivate();

    this.stompClient = null;
  }

  requestBrowserPermission(): void {

    if (
      typeof window === 'undefined' ||
      !('Notification' in window)
    ) {
      return;
    }

    if (Notification.permission === 'default') {

      Notification.requestPermission()
        .then(permission => {

          console.log(
            '[AGDD] Browser notification permission:',
            permission
          );
        })
        .catch(error => {

          console.warn(
            '[AGDD] Browser notification permission failed:',
            error
          );
        });
    }
  }

  private handleRealtimeNotification(
    message: IMessage
  ): void {

    try {

      const notification =
        JSON.parse(
          message.body
        ) as NotificationItem;

      if (!notification || !notification.id) {
        console.warn(
          '[AGDD] Invalid realtime notification:',
          message.body
        );
        return;
      }

      this.notifications.update(
        currentNotifications => {

          const alreadyExists =
            currentNotifications.some(
              existing =>
                existing.id === notification.id
            );

          if (alreadyExists) {
            return currentNotifications;
          }

          return [
            notification,
            ...currentNotifications
          ].slice(0, 30);
        }
      );

      console.log(
        '[AGDD] Realtime notification received:',
        notification
      );

      this.showBrowserNotification(
        notification
      );

    } catch (error) {

      console.error(
        '[AGDD] Failed to parse realtime notification:',
        error,
        message.body
      );
    }
  }

  private showBrowserNotification(
    notification: NotificationItem
  ): void {

    if (
      typeof window === 'undefined' ||
      !('Notification' in window)
    ) {
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    try {

      const browserNotification =
        new Notification(
          `AGDD — ${notification.title}`,
          {
            body: notification.message,
            tag: `agdd-notification-${notification.id}`
          }
        );

      browserNotification.onclick = () => {

        window.focus();
        browserNotification.close();
      };

    } catch (error) {

      console.warn(
        '[AGDD] Browser notification could not be displayed:',
        error
      );
    }
  }
}
