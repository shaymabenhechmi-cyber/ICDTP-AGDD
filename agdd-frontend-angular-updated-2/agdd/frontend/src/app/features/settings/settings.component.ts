import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface SettingCard {
  title: string;
  icon: string;
  description: string;
  route: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {

  settingCards: SettingCard[] = [

    {
      title: 'Profile & Account',
      icon: 'account_circle',
      description:
        'Manage your personal information, email address and account security.',
      route: '/profile'
    },

    {
      title: 'Camera Settings',
      icon: 'photo_camera',
      description:
        'Zoom, frame size, brightness, contrast, resolution and frame rate for both cameras.',
      route: '/settings/camera'
    },

    {
      title: 'Robot Settings',
      icon: 'precision_manufacturing',
      description:
        'Configure the robot connection, TCP endpoint and operating mode.',
      route: '/settings/robot'
    },

    {
      title: 'System Settings',
      icon: 'tune',
      description:
        'Language, session timeout, theme and notification preferences.',
      route: '/settings/system'
    }

  ];

}