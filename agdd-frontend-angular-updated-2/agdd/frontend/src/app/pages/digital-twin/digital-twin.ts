import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  signal,
  computed
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import {
  Subscription,
  catchError,
  forkJoin,
  of
} from 'rxjs';

import { RobotControlService } from '../../core/services/robot-control.service';

/* =========================================================
   UNITY TYPES
   ========================================================= */

declare global {
  interface Window {
    unityInstance?: UnityInstance;

    createUnityInstance?: (
      canvas: HTMLCanvasElement,
      config: UnityConfig,
      onProgress?: (progress: number) => void
    ) => Promise<UnityInstance>;
  }
}

interface UnityInstance {
  SendMessage: (
    gameObject: string,
    method: string,
    value?: string | number
  ) => void;

  Quit: () => Promise<void>;

  SetFullscreen?: (
    fullscreen: 0 | 1
  ) => void;
}

interface UnityConfig {
  dataUrl: string;
  frameworkUrl: string;
  codeUrl: string;
  streamingAssetsUrl: string;
  companyName: string;
  productName: string;
  productVersion: string;
}

/* =========================================================
   ROBOT TYPES
   ========================================================= */

interface RobotService {
  name: string;
  running: boolean;
  pid: number | null;
}

interface RobotStatusResponse {
  items?: RobotService[];
}

interface PipelineResponse {
  state?: string;
  message?: string;
  step?: string | null;
}

/* =========================================================
   CONFIG
   ========================================================= */

const UNITY_BUILD_NAME = 'WebGLBuild';
const UNITY_BASE_PATH = 'assets/unity';

const STATUS_POLL_MS = 2000;
const UNITY_LOAD_TIMEOUT_MS = 60000;

/* =========================================================
   COMPONENT
   ========================================================= */

@Component({
  selector: 'app-digital-twin',
  standalone: true,

  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],

  templateUrl: './digital-twin.html',
  styleUrl: './digital-twin.css'
})
export class DigitalTwin
  implements OnInit, OnDestroy {

  /* =========================================================
     CANVAS
     ========================================================= */

  @ViewChild('unityCanvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  /* =========================================================
     UNITY UI STATE
     ========================================================= */

  loading = signal(true);

  loadProgress = signal(0);

  errorMsg = signal<string | null>(null);

  isFullscreen = signal(false);

  /* =========================================================
     PIPELINE UI STATE
     ========================================================= */

  pipelineRunning = signal(false);

  pipelineBusy = signal(false);

  pipelineError = signal<string | null>(null);

  /* =========================================================
     ROBOT UI STATE
     ========================================================= */

  robotServices = signal<RobotService[]>([]);

  robotState = signal('idle');

  robotMessage = signal('Pipeline stopped.');

  robotStep = signal<string | null>(null);

  robotLoading = signal(true);

  robotError = signal('');

  /* =========================================================
     PIPELINE STEPS
     ========================================================= */

  pipelineSteps = [
    'PICK',
    'DETECT',
    'GRIP',
    'INSPECT',
    'DECIDE',
    'SORT',
    'RELEASE',
    'COMPLETE'
  ];

  /* =========================================================
     COMPUTED VALUES
     ========================================================= */

  runningServices = computed(() => {
    return this.robotServices()
      .filter(service => service.running)
      .length;
  });

  robotStatus = computed(() => {

    const services = this.robotServices();

    if (!services.length) {
      return 'OFFLINE';
    }

    const running = services.filter(
      service => service.running
    ).length;

    if (
      running === services.length &&
      running > 0
    ) {
      return 'RUNNING';
    }

    if (running > 0) {
      return 'PARTIAL';
    }

    return 'IDLE';
  });

  robotStatusClass = computed(() => {

    switch (this.robotStatus()) {

      case 'RUNNING':
        return 'running';

      case 'PARTIAL':
        return 'partial';

      case 'IDLE':
        return 'idle';

      default:
        return 'offline';
    }
  });

  normalizedRobotStep = computed(() => {
    return this.normalizeStep(
      this.robotStep()
    );
  });

  pipelineIndex = computed(() => {

    const step = this.normalizedRobotStep();

    if (!step) {
      return -1;
    }

    return this.pipelineSteps.indexOf(step);
  });

  pipelineProgress = computed(() => {

    const index = this.pipelineIndex();

    if (index < 0) {
      return 0;
    }

    return (
      ((index + 1) /
        this.pipelineSteps.length) *
      100
    );
  });

  /* =========================================================
     PRIVATE STATE
     ========================================================= */

  private unityInstance:
    UnityInstance | null = null;

  private scriptEl:
    HTMLScriptElement | null = null;

  private statusPollHandle:
    ReturnType<typeof setInterval> | null = null;

  private unityLoadTimeout:
    ReturnType<typeof setTimeout> | null = null;

  private robotSubscription:
    Subscription | null = null;

  private destroyed = false;

  /* =========================================================
     CONSTRUCTOR
     ========================================================= */

  constructor(
    private robotControl: RobotControlService,
    private ngZone: NgZone
  ) {}

  /* =========================================================
     INIT
     ========================================================= */

  ngOnInit(): void {

    this.destroyed = false;

    console.log(
      '[DigitalTwin] Component initialized.'
    );

    this.loadUnityScript();

    this.refreshRobot();

    this.statusPollHandle = setInterval(
      () => {

        if (!this.destroyed) {
          this.refreshRobot();
        }

      },
      STATUS_POLL_MS
    );
  }

  /* =========================================================
     START PIPELINE
     ========================================================= */

  startPipeline(): void {

    if (this.pipelineBusy()) {
      return;
    }

    this.pipelineBusy.set(true);

    this.pipelineError.set(null);

    this.robotControl.start().subscribe({

      next: () => {

        this.pipelineBusy.set(false);

        this.refreshRobot();
      },

      error: err => {

        this.pipelineBusy.set(false);

        this.pipelineError.set(
          'Unable to start the inspection pipeline. Check that the robot control service is running.'
        );

        console.error(
          '[DigitalTwin] startPipeline error:',
          err
        );
      }
    });
  }

  /* =========================================================
     STOP PIPELINE
     ========================================================= */

  stopPipeline(): void {

    if (this.pipelineBusy()) {
      return;
    }

    this.pipelineBusy.set(true);

    this.pipelineError.set(null);

    this.robotControl.stop().subscribe({

      next: () => {

        this.pipelineBusy.set(false);

        this.refreshRobot();
      },

      error: err => {

        this.pipelineBusy.set(false);

        this.pipelineError.set(
          'Unable to stop the inspection pipeline.'
        );

        console.error(
          '[DigitalTwin] stopPipeline error:',
          err
        );
      }
    });
  }

  /* =========================================================
     REFRESH ROBOT
     ========================================================= */

  private refreshRobot(): void {

    if (this.destroyed) {
      return;
    }

    this.robotError.set('');

    this.robotSubscription?.unsubscribe();

    this.robotSubscription = forkJoin({

      status: this.robotControl.status().pipe(

        catchError(error => {

          console.error(
            '[DigitalTwin] Robot status error:',
            error
          );

          return of(null);
        })
      ),

      pipeline:
        this.robotControl
          .getPipelineState()
          .pipe(

            catchError(error => {

              console.error(
                '[DigitalTwin] Pipeline state error:',
                error
              );

              return of(null);
            })
          )

    }).subscribe({

      next: result => {

        if (this.destroyed) {
          return;
        }

        /*
         * Both APIs unavailable.
         */

        if (
          result.status === null &&
          result.pipeline === null
        ) {

          this.robotError.set(
            'Robot control service unavailable.'
          );

          this.robotLoading.set(false);

          this.pipelineRunning.set(false);

          return;
        }

        /*
         * Robot services.
         */

        if (result.status) {

          const response =
            result.status as RobotStatusResponse;

          const services =
            Array.isArray(response.items)

              ? response.items.map(item => ({

                  name: String(
                    item.name ?? 'Unknown'
                  ),

                  running: Boolean(
                    item.running
                  ),

                  pid:
                    item.pid !== null &&
                    item.pid !== undefined

                      ? Number(item.pid)

                      : null
                }))

              : [];

          this.robotServices.set(
            services
          );

          const allRunning =
            services.length > 0 &&
            services.every(
              service => service.running
            );

          this.pipelineRunning.set(
            allRunning
          );
        }

        /*
         * Pipeline state.
         */

        if (result.pipeline) {

          const response =
            result.pipeline as PipelineResponse;

          const rawState =
            String(
              response.state ?? 'idle'
            ).toLowerCase();

          this.robotState.set(
            rawState
          );

          const message =
            this.fixEncoding(
              String(
                response.message ??
                'Pipeline stopped.'
              )
            );

          this.robotMessage.set(
            this.toEnglishRobotMessage(
              message,
              rawState
            )
          );

          this.robotStep.set(

            response.step !== null &&
            response.step !== undefined

              ? String(response.step)

              : null
          );
        }

        this.robotLoading.set(false);
      },

      error: error => {

        if (this.destroyed) {
          return;
        }

        console.error(
          '[DigitalTwin] Robot refresh error:',
          error
        );

        this.robotLoading.set(false);

        this.robotError.set(
          'Unable to retrieve robot status.'
        );
      }
    });
  }

  /* =========================================================
     PIPELINE HELPERS
     ========================================================= */

  isPipelineActive(
    step: string
  ): boolean {

    return (
      this.normalizedRobotStep() === step
    );
  }

  isPipelineComplete(
    step: string
  ): boolean {

    const current =
      this.pipelineIndex();

    const index =
      this.pipelineSteps.indexOf(step);

    if (
      current < 0 ||
      index < 0
    ) {
      return false;
    }

    if (index < current) {
      return true;
    }

    if (
      current ===
        this.pipelineSteps.length - 1 &&
      index === current
    ) {
      return true;
    }

    return false;
  }

  /* =========================================================
     NORMALIZE PIPELINE STEP
     ========================================================= */

  private normalizeStep(
    value: string | null
  ): string | null {

    if (!value) {
      return null;
    }

    const raw =
      String(value)
        .trim()
        .toUpperCase();

    if (!raw) {
      return null;
    }

    const compact =
      raw.replace(
        /[\s_-]+/g,
        ''
      );

    const mapping:
      Record<string, string> = {

      PICK: 'PICK',
      PICKING: 'PICK',
      PICKINGGEAR: 'PICK',

      DETECT: 'DETECT',
      DETECTION: 'DETECT',
      DETECTING: 'DETECT',

      GRIP: 'GRIP',
      GRIPPING: 'GRIP',
      GRIPPINGGEAR: 'GRIP',

      INSPECT: 'INSPECT',
      INSPECTION: 'INSPECT',
      INSPECTING: 'INSPECT',

      DECIDE: 'DECIDE',
      DECISION: 'DECIDE',
      DECIDING: 'DECIDE',

      SORT: 'SORT',
      SORTING: 'SORT',
      SORTINGGEAR: 'SORT',

      RELEASE: 'RELEASE',
      RELEASING: 'RELEASE',
      RELEASINGGEAR: 'RELEASE',

      COMPLETE: 'COMPLETE',
      COMPLETED: 'COMPLETE',
      COMPLETION: 'COMPLETE'
    };

    if (mapping[compact]) {
      return mapping[compact];
    }

    const detectedStep =
      this.pipelineSteps.find(
        step => raw.includes(step)
      );

    return detectedStep ?? null;
  }

  /* =========================================================
     ROBOT MESSAGE TRANSLATION
     ========================================================= */

  private toEnglishRobotMessage(
    message: string,
    state: string
  ): string {

    const normalized =
      message
        .toLowerCase()
        .trim();

    if (
      normalized.includes('arrÃªt') ||
      normalized.includes('arrÃƒÂªt') ||
      normalized.includes('stopped')
    ) {
      return 'Pipeline stopped.';
    }

    if (
      normalized.includes('running') ||
      normalized.includes('started')
    ) {
      return 'Inspection pipeline is running.';
    }

    if (
      normalized.includes('pause') ||
      state === 'paused'
    ) {
      return 'Pipeline paused.';
    }

    if (
      normalized.includes('error') ||
      normalized.includes('failed')
    ) {
      return 'Pipeline error detected.';
    }

    if (
      normalized.includes('gear')
    ) {
      return message;
    }

    if (
      state === 'running'
    ) {
      return 'Inspection pipeline is running.';
    }

    if (
      state === 'idle'
    ) {
      return 'Pipeline ready.';
    }

    return (
      message ||
      'Pipeline ready.'
    );
  }

  /* =========================================================
     FIX ENCODING
     ========================================================= */

  private fixEncoding(
    value: string
  ): string {

    return value
      .replace(
        'arrÃƒÂªtÃƒÂ©',
        'arrÃªtÃ©'
      )
      .replace(
        'arrÃƒÂªt',
        'arrÃªt'
      );
  }

  /* =========================================================
     LOAD UNITY LOADER
     ========================================================= */

  private loadUnityScript(): void {

    if (this.destroyed) {
      return;
    }

    console.log(
      '[DigitalTwin] Loading Unity loader...'
    );

    this.loading.set(true);

    this.loadProgress.set(0);

    this.errorMsg.set(null);

    this.clearUnityTimeout();

    /*
     * Remove old loader.
     */

    const existing =
      document.getElementById(
        'unity-loader-script'
      );

    if (existing) {
      existing.remove();
    }

    /*
     * Create loader.
     */

    this.scriptEl =
      document.createElement(
        'script'
      );

    this.scriptEl.id =
      'unity-loader-script';

    const loaderUrl =
      `${UNITY_BASE_PATH}/Build/${UNITY_BUILD_NAME}.loader.js`;

    this.scriptEl.src =
      loaderUrl;

    this.scriptEl.onload = () => {

      console.log(
        '[DigitalTwin] Unity loader loaded.'
      );

      this.initUnity();
    };

    this.scriptEl.onerror = () => {

      console.error(
        '[DigitalTwin] Unity loader failed:',
        loaderUrl
      );

      this.loading.set(false);

      this.errorMsg.set(
        `Unable to load Unity loader: ${loaderUrl}`
      );
    };

    document.body.appendChild(
      this.scriptEl
    );
  }

  /* =========================================================
     INITIALIZE UNITY
     ========================================================= */

  private initUnity(): void {

    if (this.destroyed) {
      return;
    }

    console.log(
      '[DigitalTwin] Initializing Unity...'
    );

    /*
     * IMPORTANT:
     * Save the function in a local constant.
     *
     * This fixes:
     * TS2722 Cannot invoke an object which is
     * possibly undefined.
     */

    const createUnityInstance =
      window.createUnityInstance;

    if (!createUnityInstance) {

      console.error(
        '[DigitalTwin] createUnityInstance is undefined.'
      );

      this.loading.set(false);

      this.errorMsg.set(
        'createUnityInstance not found â€” Unity loader did not initialize correctly.'
      );

      return;
    }

    /*
     * Check canvas.
     */

    const canvas =
      this.canvasRef?.nativeElement;

    if (!canvas) {

      console.error(
        '[DigitalTwin] Unity canvas not found.'
      );

      this.loading.set(false);

      this.errorMsg.set(
        'Unity canvas was not found.'
      );

      return;
    }

    /*
     * Make sure canvas has a valid ID.
     *
     * This is important because the Unity/Emscripten
     * keyboard system uses DOM selectors.
     */

    if (
      !canvas.id ||
      canvas.id.trim() === '' ||
      canvas.id === '#'
    ) {

      canvas.id = 'unity-canvas';

      console.log(
        '[DigitalTwin] Canvas ID fixed to:',
        canvas.id
      );
    }

    /*
     * Unity configuration.
     */

    const config: UnityConfig = {

      dataUrl:
        `${UNITY_BASE_PATH}/Build/${UNITY_BUILD_NAME}.data`,

      frameworkUrl:
        `${UNITY_BASE_PATH}/Build/${UNITY_BUILD_NAME}.framework.js`,

      codeUrl:
        `${UNITY_BASE_PATH}/Build/${UNITY_BUILD_NAME}.wasm`,

      streamingAssetsUrl:
        `${UNITY_BASE_PATH}/StreamingAssets`,

      companyName:
        'DefaultCompany',

      productName:
        'WebGl Test',

      productVersion:
        '0.1'
    };

    console.log(
      '[DigitalTwin] Unity config:',
      config
    );

    /*
     * Run Unity outside Angular's change detection.
     *
     * This prevents Angular from interfering with
     * Unity WebGL DOM/event handling.
     */

    this.ngZone.runOutsideAngular(() => {

      let completed = false;

      /*
       * Safety timeout.
       */

      this.unityLoadTimeout =
        setTimeout(() => {

          if (
            completed ||
            this.destroyed
          ) {
            return;
          }

          console.error(
            '[DigitalTwin] Unity loading timeout.'
          );

          this.ngZone.run(() => {

            this.loading.set(false);

            this.errorMsg.set(
              'Unity Digital Twin could not finish initialization. Check the browser Console for the Unity WebGL error.'
            );
          });

        }, UNITY_LOAD_TIMEOUT_MS);

      /*
       * Start Unity.
       */

      createUnityInstance(
        canvas,
        config,
        (progress: number) => {

          const safeProgress =
            Math.max(
              0,
              Math.min(
                1,
                progress
              )
            );

          const percent =
            Math.round(
              safeProgress * 100
            );

          console.log(
            `[DigitalTwin] Unity loading: ${percent}%`
          );

          this.ngZone.run(() => {

            this.loadProgress.set(
              percent
            );
          });
        }
      )

      /*
       * Unity successfully initialized.
       */

      .then(
        (instance: UnityInstance) => {

          completed = true;

          this.clearUnityTimeout();

          if (this.destroyed) {

            instance
              .Quit()
              .catch(() => {});

            return;
          }

          console.log(
            '[DigitalTwin] Unity initialized successfully.'
          );

          this.ngZone.run(() => {

            this.unityInstance =
              instance;

            window.unityInstance =
              instance;

            this.loadProgress.set(100);

            this.loading.set(false);

            this.errorMsg.set(null);
          });
        }
      )

      /*
       * Unity initialization failed.
       */

      .catch(
        (err: unknown) => {

          completed = true;

          this.clearUnityTimeout();

          console.error(
            '[DigitalTwin] Unity initialization error:',
            err
          );

          this.ngZone.run(() => {

            this.loading.set(false);

            this.errorMsg.set(
              'Error while initializing the Digital Twin. Check the browser Console for details.'
            );
          });
        }
      );
    });
  }

  /* =========================================================
     TIMEOUT CLEANUP
     ========================================================= */

  private clearUnityTimeout(): void {

    if (this.unityLoadTimeout) {

      clearTimeout(
        this.unityLoadTimeout
      );

      this.unityLoadTimeout = null;
    }
  }

  /* =========================================================
     SEND COMMAND TO UNITY
     ========================================================= */

  sendCommand(
    command: string
  ): void {

    if (!this.unityInstance) {

      console.warn(
        '[DigitalTwin] Unity is not ready. Command ignored:',
        command
      );

      return;
    }

    try {

      this.unityInstance.SendMessage(
        'CommandReceiver',
        'OnAngularCommand',
        command
      );

      console.log(
        '[DigitalTwin] Command sent to Unity:',
        command
      );

    } catch (error) {

      console.error(
        '[DigitalTwin] Unity SendMessage error:',
        error
      );
    }
  }

  /* =========================================================
     RESET ROBOT
     ========================================================= */

  resetRobot(): void {

    this.sendCommand(
      'RESET'
    );
  }

  /* =========================================================
     FULLSCREEN
     ========================================================= */

  toggleFullscreen(): void {

    const unity =
      this.unityInstance;

    if (
      !unity ||
      !unity.SetFullscreen
    ) {

      console.warn(
        '[DigitalTwin] Unity fullscreen unavailable.'
      );

      return;
    }

    const next =
      !this.isFullscreen();

    try {

      unity.SetFullscreen(
        next ? 1 : 0
      );

      this.isFullscreen.set(
        next
      );

    } catch (error) {

      console.error(
        '[DigitalTwin] Fullscreen error:',
        error
      );
    }
  }

  /* =========================================================
     RETRY
     ========================================================= */

  retry(): void {

    console.log(
      '[DigitalTwin] Retrying Unity...'
    );

    this.clearUnityTimeout();

    this.errorMsg.set(null);

    this.loading.set(true);

    this.loadProgress.set(0);

    /*
     * Quit existing Unity instance.
     */

    if (this.unityInstance) {

      this.unityInstance
        .Quit()
        .catch(() => {});

      this.unityInstance = null;

      window.unityInstance =
        undefined;
    }

    /*
     * Reload Unity loader.
     */

    this.loadUnityScript();
  }

  /* =========================================================
     DESTROY
     ========================================================= */

  ngOnDestroy(): void {

    console.log(
      '[DigitalTwin] Component destroyed.'
    );

    this.destroyed = true;

    /*
     * Stop robot polling.
     */

    if (this.statusPollHandle) {

      clearInterval(
        this.statusPollHandle
      );

      this.statusPollHandle = null;
    }

    /*
     * Cancel robot HTTP subscription.
     */

    this.robotSubscription?.unsubscribe();

    this.robotSubscription = null;

    /*
     * Clear Unity timeout.
     */

    this.clearUnityTimeout();

    /*
     * Quit Unity.
     */

    if (this.unityInstance) {

      this.unityInstance
        .Quit()
        .catch(() => {});

      this.unityInstance = null;

      window.unityInstance =
        undefined;
    }

    /*
     * Remove Unity loader.
     */

    if (this.scriptEl) {

      this.scriptEl.remove();

      this.scriptEl = null;
    }
  }
}

