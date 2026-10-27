import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  MatSnackBar,
  MatSnackBarModule
} from '@angular/material/snack-bar';

import { SettingsService } from '../../../core/services/settings.service';
import { CameraSettings } from '../../../core/models/settings.model';


const DEFAULTS: CameraSettings = {

  activeCamera: 'top',
    // STREAM URLS (empty = use environment value)
  topSimulationUrl: '',
  topRealUrl: '',
  sideSimulationUrl: '',
  sideRealUrl: '',
  // TOP CAMERA
  topZoom: 100,
  topFrameWidth: 100,
  topFrameHeight: 70,

  // SIDE CAMERA
  sideZoom: 100,
  sideFrameWidth: 100,
  sideFrameHeight: 70,

  // IMAGE
  brightness: 50,
  contrast: 50,
  exposure: 50,

  // VIDEO
  resolution: '1920x1080',
  frameRate: 30,
  autoWhiteBalance: true

};


@Component({
  selector: 'app-camera-settings',

  standalone: true,

  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatButtonModule,
    MatSliderModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatSnackBarModule
  ],

  templateUrl: './camera-settings.component.html',

  styleUrl: '../settings-detail.scss'
})
export class CameraSettingsComponent implements OnInit {

  private settingsService = inject(SettingsService);

  private snackBar = inject(MatSnackBar);


  loading = signal(true);

  saving = signal(false);


  settings = signal<CameraSettings>({
    ...DEFAULTS
  });


  resolutions = [
    '1280x720',
    '1920x1080',
    '2560x1440',
    '3840x2160'
  ];


  ngOnInit(): void {

    this.settingsService
      .get<CameraSettings>('camera')
      .subscribe({

        next: (payload) => {

          this.settings.set({
            ...DEFAULTS,
            ...payload.values
          });

          this.loading.set(false);

        },

        error: (error) => {

          console.error(
            'Error loading camera settings:',
            error
          );

          this.settings.set({
            ...DEFAULTS
          });

          this.loading.set(false);

          this.snackBar.open(
            'Unable to load camera settings. Using defaults.',
            'Close',
            {
              duration: 3000
            }
          );

        }

      });

  }


  update<K extends keyof CameraSettings>(
    key: K,
    value: CameraSettings[K]
  ): void {

    this.settings.update(current => ({
      ...current,
      [key]: value
    }));

  }


  save(): void {

    this.saving.set(true);


    this.settingsService
      .save(
        'camera',
        this.settings()
      )
      .subscribe({

        next: () => {

          this.saving.set(false);

          this.snackBar.open(
            'Camera settings saved successfully',
            'Close',
            {
              duration: 2500
            }
          );

        },

        error: (error) => {

          console.error(
            'Error saving camera settings:',
            error
          );

          this.saving.set(false);

          this.snackBar.open(
            'Error saving camera settings',
            'Close',
            {
              duration: 3000
            }
          );

        }

      });

  }


  resetToDefaults(): void {

    this.settings.set({
      ...DEFAULTS
    });

    this.snackBar.open(
      'Camera settings reset to defaults',
      'Close',
      {
        duration: 2000
      }
    );

  }

}