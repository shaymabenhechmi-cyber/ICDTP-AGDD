import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { SettingsService } from '../../core/services/settings.service';
import { RobotSettings } from '../../core/models/settings.model';

import {
  Subscription,
  interval,
  switchMap,
  startWith,
  catchError,
  of
} from 'rxjs';

import { RobotControlService } from '../../core/services/robot-control.service';
import { TopCameraComponent } from '../top-camera/top-camera.component';
import { SideCameraComponent } from '../side-camera/side-camera.component';


@Component({
  selector: 'app-robot-control',
  standalone: true,

  imports: [
    CommonModule,
    MatIconModule,
    TopCameraComponent,
    SideCameraComponent
  ],

  templateUrl: './robot-control.component.html',
  styleUrl: './robot-control.component.scss'
})
export class RobotControlComponent implements OnInit, OnDestroy {

  private readonly robotControl =
    inject(RobotControlService);

  private statusSub?: Subscription;
  private pipelineSub?: Subscription;
    private readonly settingsService = inject(SettingsService);

  private robotSettings = signal<RobotSettings | null>(null);

  mode =
    signal<'simulation' | 'real'>('simulation');

  pipelineState =
    signal('idle');

  pipelineStep =
    signal('');

  pipelineMessage =
    signal('');

  busy =
    signal(false);

  errorMessage =
    signal('');


  ngOnInit(): void {

    this.refreshPipelineState();
    this.loadRobotSettings();
    this.pipelineSub = interval(1200)
      .pipe(
        startWith(0),

        switchMap(() =>
          this.robotControl
            .getPipelineState()
            .pipe(
              catchError(() => of(null))
            )
        )
      )

      .subscribe(state => {

        if (!state) {
          return;
        }

        const normalizedState =
          String(
            state.state ??
            state.status ??
            'idle'
          ).toLowerCase();

        this.pipelineState.set(
          normalizedState
        );

        this.pipelineStep.set(
          state.step ??
          state.currentStep ??
          ''
        );

        this.pipelineMessage.set(
          state.message ??
          ''
        );


        if (
          normalizedState === 'running' ||
          normalizedState === 'stopped' ||
          normalizedState === 'error' ||
          normalizedState === 'idle'
        ) {
          this.busy.set(false);
        }

      });
  }

    // Load saved robot settings and use the saved mode as the starting mode
  private loadRobotSettings(): void {
    this.settingsService.get<RobotSettings>('robot').subscribe({
      next: payload => {
        this.robotSettings.set(payload.values);
        this.mode.set(payload.values.mode ?? 'simulation');
      },
      error: err => {
        console.error('Unable to load robot settings:', err);
        this.errorMessage.set('Unable to load robot settings.');
      }
    });
  }

  // Which machine the robot commands must go to, based on the mode
  private buildTarget() {
    const s = this.robotSettings();
    if (!s) {
      return null;
    }

    const isSim = this.mode() === 'simulation';

    return {
      mode: this.mode(),
      robotHost: isSim ? s.simulationUnityHost : s.realRobotHost,
      robotPort: Number(isSim ? s.simulationUnityPort : s.realRobotPort),
      treatmentHost: s.treatmentHost,
      treatmentPort: Number(s.treatmentPort)
    };
  }

  private refreshPipelineState(): void {

    this.robotControl
      .getPipelineState()
      .subscribe({

        next: state => {

          const normalizedState =
            String(
              state?.state ??
              state?.status ??
              'idle'
            ).toLowerCase();

          this.pipelineState.set(
            normalizedState
          );

          this.pipelineStep.set(
            state?.step ??
            state?.currentStep ??
            ''
          );

          this.pipelineMessage.set(
            state?.message ??
            ''
          );
        },

        error: error => {

          console.error(
            'Unable to read pipeline state:',
            error
          );

        }

      });
  }


  startRobot(): void {

    if (this.busy()) {
      return;
    }


        const target = this.buildTarget();

    if (!target || !target.robotHost) {
      this.errorMessage.set(
        this.mode() === 'real'
          ? 'Real robot IP is not configured in Robot Settings.'
          : 'Simulation robot IP is not configured in Robot Settings.'
      );
      return;
    }


    this.busy.set(true);
    this.errorMessage.set('');

    this.pipelineState.set('starting');


    this.robotControl
      .start(target)
      .subscribe({

        next: response => {

          console.log(
            'Robot pipeline started:',
            response
          );

          this.pipelineMessage.set(
            response?.message ??
            'Robot pipeline is starting...'
          );

        },


        error: error => {

          console.error(
            'Robot start error:',
            error
          );

          this.busy.set(false);

          this.pipelineState.set('error');

          this.errorMessage.set(
            'Unable to start the robot pipeline.'
          );

        }

      });
  }


  stopRobot(): void {

    this.errorMessage.set('');
    this.busy.set(true);


    this.robotControl
      .stop(this.buildTarget() ?? undefined)
      .subscribe({

        next: response => {

          console.log(
            'Robot pipeline stopped:',
            response
          );

          this.busy.set(false);

          this.pipelineState.set(
            'stopped'
          );

          this.pipelineStep.set('');

          this.pipelineMessage.set(
            response?.message ??
            'Robot stopped.'
          );

        },


        error: error => {

          console.error(
            'Robot stop error:',
            error
          );

          this.busy.set(false);

          this.pipelineState.set(
            'error'
          );

          this.errorMessage.set(
            'Unable to stop the robot pipeline.'
          );

        }

      });
  }

  setMode(mode: 'simulation' | 'real'): void {
    this.mode.set(mode);
    this.errorMessage.set('');

  

    const current = this.robotSettings();
    if (!current) {
      return;
    }

    const isSim = mode === 'simulation';

      const updated: RobotSettings = {
  ...current,
  mode,
  robotHost: isSim ? current.simulationUnityHost : current.realRobotHost,
  tcpPort: Number(isSim ? current.simulationUnityPort : current.realRobotPort)
};

    this.settingsService.save<RobotSettings>('robot', updated).subscribe({
      next: () => this.robotSettings.set(updated),
      error: err => {
        console.error('Unable to save robot mode:', err);
        this.errorMessage.set('Unable to save the robot mode.');
      }
    });
  }


  get pipelineLabel(): string {

    switch (this.pipelineState()) {

      case 'starting':
        return 'STARTING';

      case 'running':
        return 'RUNNING';

      case 'stopped':
        return 'STOPPED';

      case 'error':
        return 'ERROR';

      case 'idle':
      default:
        return 'IDLE';
    }
  }


  get pipelineIcon(): string {

    switch (this.pipelineState()) {

      case 'running':
        return 'check_circle';

      case 'starting':
        return 'sync';

      case 'stopped':
        return 'stop_circle';

      case 'error':
        return 'error';

      default:
        return 'radio_button_unchecked';
    }
  }


  get robotStatusLabel(): string {

    switch (this.pipelineState()) {

      case 'running':
        return 'ONLINE';

      case 'starting':
        return 'STARTING';

      case 'stopped':
        return 'STOPPED';

      case 'error':
        return 'ERROR';

      default:
        return 'IDLE';
    }
  }


  get robotStatusClass(): string {

    switch (this.pipelineState()) {

      case 'running':
        return 'online';

      case 'starting':
        return 'starting';

      case 'stopped':
        return 'stopped';

      case 'error':
        return 'error';

      default:
        return 'idle';
    }
  }


  ngOnDestroy(): void {

    this.statusSub?.unsubscribe();

    this.pipelineSub?.unsubscribe();
  }
}
