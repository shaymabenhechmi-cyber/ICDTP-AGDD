import { CommonModule } from '@angular/common';

import {
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';

import {
  MatBadgeModule
} from '@angular/material/badge';

import {
  MatButtonModule
} from '@angular/material/button';

import {
  MatIconModule
} from '@angular/material/icon';

import {
  MatMenuModule
} from '@angular/material/menu';

import {
  MatToolbarModule
} from '@angular/material/toolbar';

import {
  MatTooltipModule
} from '@angular/material/tooltip';

import {
  Router,
  RouterLink
} from '@angular/router';

import {
  AuthService
} from '../../../core/services/auth.service';

import {
  ThemeService
} from '../../../core/services/theme.service';

import {
  NotificationService,
  NotificationItem
} from '../../../core/services/notification.service';


@Component({

  selector: 'app-navbar',

  standalone: true,

  imports: [

    CommonModule,

    RouterLink,

    MatToolbarModule,

    MatIconModule,

    MatButtonModule,

    MatMenuModule,

    MatBadgeModule,

    MatTooltipModule

  ],

  templateUrl:
    './navbar.component.html',

  styleUrl:
    './navbar.component.scss'

})
export class NavbarComponent
  implements OnInit, OnDestroy {


  private readonly authService =
    inject(AuthService);


  private readonly router =
    inject(Router);


  private readonly notificationService =
    inject(NotificationService);


  /**
   * KEEP DARK MODE EXACTLY AS IT IS.
   */
  readonly themeService =
    inject(ThemeService);


  /**
   * Reactive current user.
   */
  readonly currentUser =
    this.authService.currentUser;


  /**
   * Notifications coming from backend.
   */
  readonly notifications =
    this.notificationService.notifications;


  /**
   * Number of unread notifications.
   */
  readonly unreadCount =
    this.notificationService.unreadCount;


  ngOnInit(): void {

    /*
     * Load existing notifications from the database.
     */
    this.loadNotifications();

    /*
     * Ask permission for native browser notifications.
     *
     * This is optional. If the browser blocks it,
     * the AGDD notification menu still works normally.
     */
    this.notificationService
      .requestBrowserPermission();

    /*
     * Start realtime STOMP WebSocket connection.
     *
     * Backend:
     *   /ws/notifications
     *
     * User queue:
     *   /user/queue/notifications
     */
    this.notificationService
      .connectWebSocket();

  }


  ngOnDestroy(): void {

    /*
     * Close WebSocket when Navbar is destroyed.
     */
    this.notificationService
      .disconnectWebSocket();

  }


  /**
   * Load current user's notifications.
   */
  loadNotifications(): void {

    this.notificationService
      .loadNotifications()
      .subscribe();

  }


  /**
   * Refresh notifications when menu is opened.
   */
  refreshNotifications(): void {

    this.notificationService
      .refresh();

  }


  /**
   * Mark one notification as read.
   */
  markAsRead(
    notification: NotificationItem
  ): void {

    if (notification.read) {
      return;
    }

    this.notificationService
      .markAsRead(notification.id)
      .subscribe();

  }


  /**
   * Mark all notifications as read.
   */
  markAllAsRead(): void {

    if (this.unreadCount() === 0) {
      return;
    }

    this.notificationService
      .markAllAsRead()
      .subscribe();

  }


  /**
   * Notification icon according to type.
   */
  notificationIcon(
    type: string
  ): string {

    switch (type) {

      case 'CRITICAL':
        return 'error';

      case 'WARNING':
        return 'warning_amber';

      case 'INFO':
      default:
        return 'info_outline';

    }

  }


  /**
   * Generate user initials.
   */
  initials(): string {

    const user =
      this.currentUser();

    if (!user) {
      return '';
    }

    return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
      .toUpperCase();

  }


  /**
   * Format notification date/time.
   */
  formatNotificationTime(
    createdAt: string
  ): string {

    if (!createdAt) {
      return '';
    }

    const date =
      new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return createdAt;
    }

    return new Intl.DateTimeFormat(
      undefined,
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
    ).format(date);

  }


  /**
   * KEEP DARK MODE EXACTLY AS IT IS.
   */
  toggleTheme(): void {

    this.themeService.toggle();

  }


  /**
   * Logout.
   */
  logout(): void {

    /*
     * Disconnect realtime notifications BEFORE
     * removing the JWT token.
     */
    this.notificationService
      .disconnectWebSocket();

    this.authService.logout();

    this.router.navigate([
      '/login'
    ]);

  }

}
