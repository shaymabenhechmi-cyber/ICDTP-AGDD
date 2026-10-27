import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [

  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component')
        .then(m => m.LoginComponent)
  },

  {
    path: 'register',
    loadComponent: () =>
      import('./features/register/register.component')
        .then(m => m.RegisterComponent)
  },

  {
    path: '',
    loadComponent: () =>
      import('./shared/layout/main-layout/main-layout.component')
        .then(m => m.MainLayoutComponent),

    canActivate: [authGuard],

    children: [

      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },

      /* =========================
         ALL AUTHENTICATED USERS
         ========================= */

      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component')
            .then(m => m.DashboardComponent)
      },

      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile-settings.component')
            .then(m => m.ProfileSettingsComponent)
      },

      {
        path: 'digital-twin',
        loadComponent: () =>
          import('./pages/digital-twin/digital-twin')
            .then(m => m.DigitalTwin)
      },

      {
        path: 'top-camera',
        loadComponent: () =>
          import('./features/top-camera/top-camera.component')
            .then(m => m.TopCameraComponent)
      },

      {
        path: 'side-camera',
        loadComponent: () =>
          import('./features/side-camera/side-camera.component')
            .then(m => m.SideCameraComponent)
      },

      /* =========================
         ADMIN + OPERATOR
         ========================= */

      {
        path: 'robot-control',

        loadComponent: () =>
          import('./features/robot-control/robot-control.component')
            .then(m => m.RobotControlComponent),

        canActivate: [roleGuard],

        data: {
          roles: ['ADMIN', 'OPERATOR'],
          title: 'Robot Control',
          icon: 'precision_manufacturing'
        }
      },

      /* =========================
         ADMIN ONLY
         ========================= */

      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.component')
            .then(m => m.UsersComponent),

        canActivate: [adminGuard]
      },

      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component')
            .then(m => m.SettingsComponent),

        canActivate: [adminGuard]
      },

      {
        path: 'settings/camera',
        loadComponent: () =>
          import('./features/settings/camera-settings/camera-settings.component')
            .then(m => m.CameraSettingsComponent),

        canActivate: [adminGuard]
      },

      {
        path: 'settings/system',
        loadComponent: () =>
          import('./features/settings/system-settings/system-settings.component')
            .then(m => m.SystemSettingsComponent),

        canActivate: [adminGuard]
      }

    ]
  },

  {
    path: '**',
    redirectTo: 'login'
  }

];

