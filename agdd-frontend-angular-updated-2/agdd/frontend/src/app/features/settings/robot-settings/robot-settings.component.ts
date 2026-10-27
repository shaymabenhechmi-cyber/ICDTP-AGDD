import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { SettingsService } from '../../../core/services/settings.service';
import { RobotSettings } from '../../../core/models/settings.model';

const SIM_TOP_CAMERA_PORT = 55000;
const SIM_SIDE_CAMERA_PORT = 55002;

const DEFAULTS: RobotSettings = {
  armSpeed: 60,
  gripForce: 45,
  safetyZoneRadius: 80,
  sortingMode: 'defectType',
  autoReturnHome: true,

  // Simulation robot (Unity / Windows)
  simulationUnityHost: '192.168.100.243',
  simulationUnityPort: 9090,

  // Real robot
  realRobotHost: '',
  realRobotPort: 0,

  // Treatment server (Ubuntu / ROS 2)
  treatmentHost: '192.168.100.161',
  treatmentPort: 9090,

  // Active mode
  robotHost: '192.168.100.161',
  tcpPort: 9090,
  mode: 'simulation'
};

@Component({
  selector: 'app-robot-settings',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  templateUrl: './robot-settings.component.html',
  styleUrl: './robot-settings.component.scss'
})
export class RobotSettingsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly snackBar = inject(MatSnackBar);

  loading = signal(true);
  saving = signal(false);
  saved = signal(false);
  error = signal('');

  settings = signal<RobotSettings>({ ...DEFAULTS });

  ngOnInit(): void {
    this.settingsService.get<RobotSettings>('robot').subscribe({
      next: payload => {
        this.settings.set({
          ...DEFAULTS,
          ...payload.values
        });
        this.loading.set(false);
      },
      error: err => {
        console.error('Error loading robot settings:', err);
        this.error.set(
          'Unable to load robot settings. Showing default values.'
        );
        this.loading.set(false);
      }
    });
  }

  update<K extends keyof RobotSettings>(
    key: K,
    value: RobotSettings[K]
  ): void {
    this.settings.update(current => ({
      ...current,
      [key]: value
    }));

    this.saved.set(false);
    this.error.set('');
  }

  private validPort(port: number): boolean {
    return Number.isInteger(Number(port)) &&
      Number(port) >= 1 &&
      Number(port) <= 65535;
  }

  save(): void {
    const current = this.settings();
    const isSim = current.mode === 'simulation';

    const requiredHosts = [
      isSim
        ? { label: 'Simulation Robot IP Address', value: current.simulationUnityHost }
        : { label: 'Real Robot IP Address', value: current.realRobotHost },
      { label: 'Treatment Server IP Address', value: current.treatmentHost }
    ];

    const requiredPorts = [
      isSim
        ? { label: 'Simulation Robot Port', value: current.simulationUnityPort }
        : { label: 'Real Robot Port', value: current.realRobotPort },
      { label: 'Treatment Server Port', value: current.treatmentPort }
    ];

    const missingHost = requiredHosts.find(item => !item.value?.trim());

    if (missingHost) {
      this.error.set(`${missingHost.label} is required.`);
      return;
    }

    const invalidPort = requiredPorts.find(
      item => !this.validPort(Number(item.value))
    );

    if (invalidPort) {
      this.error.set(`${invalidPort.label} must be between 1 and 65535.`);
      return;
    }

    // Same behavior as before: simulation -> ROS host, real -> robot host
    const payload: RobotSettings = {
      ...current,
      simulationUnityPort: Number(current.simulationUnityPort),
      realRobotPort: Number(current.realRobotPort),
      treatmentPort: Number(current.treatmentPort),
      robotHost: isSim ? current.treatmentHost : current.realRobotHost,
      tcpPort: Number(isSim ? current.treatmentPort : current.realRobotPort)
    };

    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');

    this.settingsService.save<RobotSettings>('robot', payload).subscribe({
      next: response => {
        this.settings.set({ ...DEFAULTS, ...response.values });

        if (payload.mode === 'simulation') {
          this.settingsService.updateRobotConfig({
            mode: 'simulation',
            simulationCameraHost: payload.simulationUnityHost,
            simulationTopCameraPort: SIM_TOP_CAMERA_PORT,
            simulationSideCameraPort: SIM_SIDE_CAMERA_PORT
          }).subscribe({
            next: result => {
              this.saving.set(false);

              if (result.ok) {
                this.saved.set(true);
                this.snackBar.open(
                  'Settings saved in MySQL and sent to Ubuntu successfully.',
                  'Close',
                  { duration: 3500 }
                );
              } else {
                this.error.set(
                  'Settings saved in MySQL, but Ubuntu rejected the configuration: ' + result.message
                );
              }
            },
            error: err => {
              console.error('Error sending settings to Ubuntu:', err);
              this.saving.set(false);
              this.error.set(
                'Settings saved in MySQL, but sending them to Ubuntu failed. Check the server connection.'
              );
            }
          });
          return;
        }

        this.saving.set(false);
        this.saved.set(true);
        this.snackBar.open(
          'Robot settings saved successfully.',
          'Close',
          { duration: 2500 }
        );
      },
      error: err => {
        console.error('Error saving robot settings:', err);
        this.saving.set(false);
        this.error.set('Unable to save settings. Check the backend connection.');
      }
    });
  }

  resetToDefaults(): void {
    this.settings.set({ ...DEFAULTS });
    this.saved.set(false);
    this.error.set('');
  }
}