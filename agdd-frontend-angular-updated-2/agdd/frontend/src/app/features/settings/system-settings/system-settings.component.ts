import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { SettingsService } from '../../../core/services/settings.service';
import { SystemSettings } from '../../../core/models/settings.model';
import { ThemeService } from '../../../core/services/theme.service';


const DEFAULTS: SystemSettings = {
  

  theme: 'dark',

  sessionTimeoutMinutes: 30,

  emailAlerts: true,
  pushAlerts: true,
  soundNotifications: false,

  dashboardAutoRefresh: true,
  dashboardRefreshInterval: 3,

  confirmRobotActions: true
};


@Component({
  selector: 'app-system-settings',
  standalone: true,

  imports: [
    CommonModule,
    RouterModule,
    FormsModule,

    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatFormFieldModule,
    MatSelectModule
  ],

  templateUrl: './system-settings.component.html',
  styleUrl: './system-settings.component.scss'
})
export class SystemSettingsComponent implements OnInit {

  private readonly settingsService =
    inject(SettingsService);

  private readonly themeService =
    inject(ThemeService);


  /* ============================================================
     STATE
     ============================================================ */

  settings =
    signal<SystemSettings>({
      ...DEFAULTS
    });

  loading =
    signal<boolean>(true);

  saving =
    signal<boolean>(false);

  saved =
    signal<boolean>(false);

  error =
    signal<string>('');


  


  /* ============================================================
     INIT
     ============================================================ */

  ngOnInit(): void {
    this.loadSettings();
  }


  /* ============================================================
     LOAD SETTINGS
     ============================================================ */

  private loadSettings(): void {

    this.loading.set(true);
    this.error.set('');

    this.settingsService
      .get<SystemSettings>('system')
      .subscribe({

        next: payload => {

          const loadedSettings: SystemSettings = {
            ...DEFAULTS,
            ...(payload?.values ?? {})
          };

          this.settings.set(
            loadedSettings
          );

          /*
           * Apply theme immediately.
           */
          this.applyTheme(
            loadedSettings.theme
          );

          this.loading.set(false);
        },

        error: error => {

          console.error(
            'Failed to load system settings:',
            error
          );

          /*
           * Use defaults if backend
           * is unavailable.
           */
          this.settings.set({
            ...DEFAULTS
          });

          this.applyTheme(
            DEFAULTS.theme
          );

          this.error.set(
            'Unable to load saved settings. Default values are being used.'
          );

          this.loading.set(false);
        }
      });
  }


  /* ============================================================
     UPDATE SETTING
     ============================================================ */

  update<K extends keyof SystemSettings>(
    key: K,
    value: SystemSettings[K]
  ): void {

    this.settings.update(current => ({
      ...current,
      [key]: value
    }));

    this.saved.set(false);
    this.error.set('');

    /*
     * Apply theme immediately.
     * User does NOT need to press Save
     * just to see Dark/Light.
     */
    if (key === 'theme') {

      this.applyTheme(
        value as SystemSettings['theme']
      );
    }
  }


  /* ============================================================
     APPLY THEME
     ============================================================ */

  private applyTheme(
    theme: SystemSettings['theme']
  ): void {

    /*
     * DARK
     */
    if (theme === 'dark') {

      this.themeService.setDarkMode(
        true
      );

      return;
    }


    /*
     * LIGHT
     */
    if (theme === 'light') {

      this.themeService.setDarkMode(
        false
      );

      return;
    }


    /*
     * SYSTEM DEFAULT
     */
    const prefersDark =
      window.matchMedia(
        '(prefers-color-scheme: dark)'
      ).matches;

    this.themeService.setDarkMode(
      prefersDark
    );
  }


  /* ============================================================
     SAVE
     ============================================================ */

  save(): void {

    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');


    const currentSettings =
      this.settings();


    this.settingsService
      .save<SystemSettings>(
        'system',
        currentSettings
      )
      .subscribe({

        next: payload => {

          const savedSettings: SystemSettings = {
            ...DEFAULTS,
            ...(payload?.values ?? currentSettings)
          };

          this.settings.set(
            savedSettings
          );

          /*
           * Make sure the selected theme
           * is still applied after saving.
           */
          this.applyTheme(
            savedSettings.theme
          );

          this.saving.set(false);
          this.saved.set(true);


          setTimeout(() => {

            this.saved.set(false);

          }, 2500);
        },


        error: error => {

          console.error(
            'Failed to save system settings:',
            error
          );

          this.saving.set(false);

          this.error.set(
            'Failed to save system settings.'
          );
        }
      });
  }


  /* ============================================================
     RESET TO DEFAULTS
     ============================================================ */

  resetToDefaults(): void {

    const defaults = {
      ...DEFAULTS
    };

    this.settings.set(
      defaults
    );

    /*
     * Apply default theme immediately.
     */
    this.applyTheme(
      defaults.theme
    );

    this.saved.set(false);
    this.error.set('');
  }


  /* ============================================================
     RESET DASHBOARD LAYOUT
     ============================================================ */

  resetDashboardLayout(): void {

    /*
     * This event is currently kept isolated
     * because the dashboard does not yet expose
     * a real persisted layout configuration.
     *
     * We don't pretend that a console.log is
     * a real reset operation.
     */

    console.log(
      '[AGDD] Dashboard layout reset requested.'
    );
  }
}