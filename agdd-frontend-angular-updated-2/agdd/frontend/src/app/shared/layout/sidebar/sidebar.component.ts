import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
  visitorHidden?: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatListModule,
    MatIconModule
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {

  private readonly authService =
    inject(AuthService);

  private readonly allMenuItems: MenuItem[] = [

    {
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard'
    },

    {
      label: 'Robot Control',
      icon: 'precision_manufacturing',
      route: '/robot-control',
      visitorHidden: true
    },

    {
      label: 'Digital Twin',
      icon: 'view_in_ar',
      route: '/digital-twin'
    },

    /*
     * Cameras are available for ALL authenticated users:
     * ADMIN
     * OPERATOR
     * VISITOR
     */
    {
      label: 'Top Camera',
      icon: 'photo_camera',
      route: '/top-camera'
    },

    {
      label: 'Side Camera',
      icon: 'camera_alt',
      route: '/side-camera'
    },

    {
      label: 'Users',
      icon: 'group',
      route: '/users',
      adminOnly: true
    },

    {
      label: 'Settings',
      icon: 'settings',
      route: '/settings',
      adminOnly: true
    }
  ];

  menuItems =
    computed<MenuItem[]>(() => {

      const role =
        String(
          this.authService.currentUser()?.role ?? ''
        )
          .trim()
          .toUpperCase();

      const isAdmin =
        role === 'ADMIN';

      return this.allMenuItems.filter(
        item => {

          // ADMIN-only items
          if (item.adminOnly && !isAdmin) {
            return false;
          }

          // Hide Robot Control from VISITOR
          if (item.visitorHidden && role === 'VISITOR') {
            return false;
          }

          return true;
        }
      );
    });

  logout(): void {
    this.authService.logout();
  }
}
