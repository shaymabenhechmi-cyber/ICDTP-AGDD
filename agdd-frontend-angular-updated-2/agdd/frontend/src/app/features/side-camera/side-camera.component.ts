import {
  Component,
  OnInit,
  OnChanges,
  SimpleChanges,
  Input,
  inject,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { environment } from '../../../environments/environment';

import { SettingsService } from '../../core/services/settings.service';

import { CameraSettings } from '../../core/models/settings.model';


@Component({
  selector: 'app-side-camera',

  standalone: true,

  imports: [
    CommonModule,
    MatIconModule
  ],

  template: `

    <div class="camera-page">

      <!-- HEADER -->

      <div class="detail-header">

        <div>

          <h1>

            <mat-icon>
              camera_alt
            </mat-icon>

            Side Camera

          </h1>

          <p>
            Live side camera feed and YOLO defect detection.
          </p>

        </div>

      </div>


      <!-- CAMERA -->

      <div
        class="camera-wrapper"

        [style.height]="
          frameHeight() + 'vh'
        ">


        @if (hasError()) {

          <!-- ERROR -->

          <div class="camera-error">

            <mat-icon>
              error_outline
            </mat-icon>

            <p>

              Flux indisponible sur
              {{ streamUrl }}.

              Vérifie que le serveur caméra side
              (port {{ port }}) est bien lancé.

            </p>

          </div>


        } @else {


          <!-- STREAM -->

          <img

            [src]="streamUrl"

            (error)="onError()"

            (load)="onLoad()"

            alt="Side camera stream"

            class="camera-stream"


            [style.width.%]="
              frameWidth()
            "


            [style.transform]="
              'scale(' + zoom() / 100 + ')'
            "


            [style.filter]="
              'brightness(' +
              brightnessCss() +
              '%) contrast(' +
              contrastCss() +
              '%)'
            "

          />

        }

      </div>


    </div>

  `,


  styles: [`

    .camera-page {

      padding: 16px;

      width: 100%;

      box-sizing: border-box;

    }


    .detail-header {

      margin-bottom: 16px;

    }


    .detail-header h1 {

      display: flex;

      align-items: center;

      gap: 10px;

    }


    .camera-wrapper {

      position: relative;

      width: 100%;

      min-height: 300px;

      max-height: 90vh;

      display: flex;

      align-items: center;

      justify-content: center;

      background: #111;

      border-radius: 10px;

      overflow: hidden;

      transition:
        height 0.25s ease;

    }


    .camera-stream {

      display: block;

      max-width: 100%;

      max-height: 100%;

      object-fit: contain;

      transform-origin: center center;

      transition:
        width 0.25s ease,
        transform 0.25s ease,
        filter 0.25s ease;

    }


    .camera-error {

      color: #f44336;

      display: flex;

      flex-direction: column;

      align-items: center;

      justify-content: center;

      gap: 8px;

      padding: 24px;

      text-align: center;

    }


    .camera-error mat-icon {

      font-size: 42px;

      width: 42px;

      height: 42px;

    }

  `]

})


export class SideCameraComponent
  implements OnInit, OnChanges {


  private settingsService =
    inject(SettingsService);


  hasError =
    signal(false);


  // ==========================================
  // CAMERA MODE
  // ==========================================

  @Input()
  cameraMode: 'simulation' | 'real' = 'simulation';


   get streamUrl(): string {

    if (this.cameraMode === 'simulation') {
      return this.simulationUrl().trim()
        || environment.simulationSideCameraUrl;
    }

    return this.realUrl().trim()
      || environment.realSideCameraUrl;

  }


  get port(): string {

    return this.cameraMode === 'simulation'

      ? '55002'

      : 'Real Camera';

  }


  // ==========================================
  // DISPLAY SETTINGS
  // ==========================================
    simulationUrl = signal('');

  realUrl = signal('');
  zoom =
    signal(100);


  frameWidth =
    signal(100);


  frameHeight =
    signal(70);


  brightness =
    signal(50);


  contrast =
    signal(50);


  // ==========================================
  // MODE CHANGE
  // ==========================================

  ngOnChanges(
    changes: SimpleChanges
  ): void {

    if (changes['cameraMode']) {

      this.hasError.set(false);

    }

  }


  // ==========================================
  // INIT
  // ==========================================

  ngOnInit(): void {

    this.loadSettings();

  }


  // ==========================================
  // LOAD SETTINGS
  // ==========================================

  private loadSettings(): void {

    this.settingsService
      .get<CameraSettings>('camera')
      .subscribe({

        next: (payload) => {

          const settings =
            payload.values;

                    this.simulationUrl.set(
            settings.sideSimulationUrl ?? ''
          );

          this.realUrl.set(
            settings.sideRealUrl ?? ''
          );
          
          this.zoom.set(
            settings.sideZoom ?? 100
          );


          this.frameWidth.set(
            settings.sideFrameWidth ?? 100
          );


          this.frameHeight.set(
            settings.sideFrameHeight ?? 70
          );


          this.brightness.set(
            settings.brightness ?? 50
          );


          this.contrast.set(
            settings.contrast ?? 50
          );

        },


        error: (error) => {

          console.error(
            'Unable to load side camera settings:',
            error
          );

        }

      });

  }


  // ==========================================
  // CSS BRIGHTNESS
  // ==========================================

  brightnessCss(): number {

    /*
     * 50 = normal
     *
     * 0   = dark
     * 50  = normal
     * 100 = bright
     */

    return this.brightness() * 2;

  }


  // ==========================================
  // CSS CONTRAST
  // ==========================================

  contrastCss(): number {

    return this.contrast() * 2;

  }


  // ==========================================
  // STREAM EVENTS
  // ==========================================

  onError(): void {

    this.hasError.set(true);

  }


  onLoad(): void {

    this.hasError.set(false);

  }

}