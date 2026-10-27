import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';

import {
  Subscription,
  catchError,
  forkJoin,
  of,
  switchMap,
  timer
} from 'rxjs';

import {
  DashboardService,
  DashboardRange
} from '../../core/services/dashboard.service';

import {
  DashboardActivity,
  DashboardOverview,
  DashboardTrendItem
} from '../../core/models/dashboard.model';

import { SettingsService } from '../../core/services/settings.service';
import { AuthService } from '../../core/services/auth.service';
import { SystemSettings } from '../../core/models/settings.model';

import { RobotControlService } from '../../core/services/robot-control.service';

import * as XLSX from 'xlsx';


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


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent
  implements OnInit, OnDestroy {

  /* =========================================================
     HISTORY PAGINATION
     ========================================================= */

  pageSize = signal(5);
  currentPage = signal(1);

  pageSizeOptions = [5, 10, 25, 50];

  paginatedActivity() {
    const size = this.pageSize();
    const page = this.currentPage();

    const start = (page - 1) * size;
    const end = start + size;

    return this.activity.slice(start, end);
  }

  totalPages() {
    return Math.max(
      1,
      Math.ceil(this.activity.length / this.pageSize())
    );
  }

  paginationStart() {
    if (!this.activity.length) {
      return 0;
    }

    return (this.currentPage() - 1) * this.pageSize() + 1;
  }

  paginationEnd() {
    return Math.min(
      this.currentPage() * this.pageSize(),
      this.activity.length
    );
  }

  setPageSize(size: number) {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  previousPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(page => page - 1);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(page => page + 1);
    }
  }


  private readonly dashboardService =
    inject(DashboardService);

  private readonly settingsService =
    inject(SettingsService);
  private readonly authService =
    inject(AuthService);



  private readonly robotService =
    inject(RobotControlService);


  private dashboardSubscription?: Subscription;
  private robotSubscription?: Subscription;
  private clockSubscription?: Subscription;


  /* =========================================================
     GENERAL
     ========================================================= */

  data =
    signal<DashboardOverview | null>(null);

  loading =
    signal(true);

  error =
    signal('');

  selectedRange =
    signal<DashboardRange>('today');

  currentTime =
    signal(new Date());

  lastUpdate =
    signal<Date | null>(null);

  dashboardAutoRefresh =
    signal(true);

  dashboardRefreshInterval =
    signal(3);


  /* =========================================================
     ROBOT
     ========================================================= */

  robotServices =
    signal<RobotService[]>([]);

  robotState =
    signal('idle');

  robotMessage =
    signal('Pipeline stopped.');

  robotStep =
    signal<string | null>(null);

  robotLoading =
    signal(true);

  robotError =
    signal('');


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
     INSPECTION
     ========================================================= */

  activity: DashboardActivity[] = [];

  selectedInspection =
    signal<DashboardActivity | null>(null);


  /* =========================================================
     KPI
     ========================================================= */

  totalInspected =
    computed(() => {

      const kpis =
        this.data()?.kpis;

      return Number(
        kpis?.totalInspected ??
        kpis?.total ??
        kpis?.piecesInspected ??
        0
      );
    });


  healthyCount =
    computed(() => {

      const kpis =
        this.data()?.kpis;

      if (
        kpis?.healthy !== undefined &&
        kpis?.healthy !== null
      ) {
        return Number(kpis.healthy);
      }

      return this.activity.filter(
        item => this.isHealthy(item)
      ).length;
    });


  defectiveCount =
    computed(() => {

      const kpis =
        this.data()?.kpis;

      if (
        kpis?.defective !== undefined &&
        kpis?.defective !== null
      ) {
        return Number(kpis.defective);
      }

      return this.activity.filter(
        item => this.isDefective(item)
      ).length;
    });


  uncertainCount =
    computed(() => {

      const kpis =
        this.data()?.kpis as any;

      /*
       * First priority:
       * use the value explicitly returned by the backend.
       */
      const backendUncertain =
        kpis?.uncertain ??
        kpis?.uncertainCount;

      if (
        backendUncertain !== undefined &&
        backendUncertain !== null
      ) {
        return Math.max(
          Number(backendUncertain) || 0,
          0
        );
      }

      /*
       * Second priority:
       * calculate the remaining records.
       *
       * Example:
       * Total = 100
       * Healthy = 90
       * Defective = 7
       * Uncertain = 3
       */
      const total =
        this.totalInspected();

      const healthy =
        this.healthyCount();

      const defective =
        this.defectiveCount();

      if (total > 0) {
        return Math.max(
          total - healthy - defective,
          0
        );
      }

      /*
       * Final fallback:
       * calculate from activity records.
       */
      return this.activity.filter(
        item => this.isUncertain(item)
      ).length;
    });


  conformityRate =
    computed(() => {

      const kpis =
        this.data()?.kpis;

      if (
        kpis?.conformityRate !== undefined &&
        kpis?.conformityRate !== null
      ) {
        return Number(kpis.conformityRate);
      }

      const total =
        this.totalInspected();

      if (total <= 0) {
        return 0;
      }

      return (
        this.healthyCount() /
        total
      ) * 100;
    });


  /* =========================================================
     ROBOT STATUS
     ========================================================= */

  runningServices =
    computed(() => {

      return this.robotServices()
        .filter(
          service => service.running
        ).length;
    });


  robotStatus =
    computed(() => {

      const services =
        this.robotServices();

      if (!services.length) {
        return 'OFFLINE';
      }

      const running =
        services.filter(
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


  robotStatusClass =
    computed(() => {

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


  /* =========================================================
     LIVE PIPELINE
     ========================================================= */

  normalizedRobotStep =
    computed(() => {

      const rawStep =
        this.robotStep();

      if (!rawStep) {
        return null;
      }

      return this.normalizeStep(
        rawStep
      );
    });


  pipelineIndex =
    computed(() => {

      const step =
        this.normalizedRobotStep();

      if (!step) {
        return -1;
      }

      return this.pipelineSteps.indexOf(
        step
      );
    });


  pipelineProgress =
    computed(() => {

      const index =
        this.pipelineIndex();

      if (index < 0) {
        return 0;
      }

      /*
       * Each pipeline step represents one
       * stage of the complete process.
       *
       * PICK      = 12.5%
       * DETECT    = 25%
       * GRIP      = 37.5%
       * INSPECT   = 50%
       * DECIDE    = 62.5%
       * SORT      = 75%
       * RELEASE   = 87.5%
       * COMPLETE  = 100%
       */
      return (
        (index + 1) /
        this.pipelineSteps.length
      ) * 100;
    });


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
      this.pipelineSteps.indexOf(
        step
      );

    if (
      current < 0 ||
      index < 0
    ) {
      return false;
    }

    /*
     * All steps before the current step
     * are considered completed.
     */
    if (index < current) {
      return true;
    }

    /*
     * When the robot reaches COMPLETE,
     * COMPLETE itself becomes green.
     */
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
     LATEST INSPECTION
     ========================================================= */

  latestInspection =
    computed(() => {

      if (!this.activity.length) {
        return null;
      }

      return this.activity[0];
    });


  /* =========================================================
     QUALITY
     ========================================================= */

  qualityTotal =
    computed(() => {

      return (
        this.healthyCount() +
        this.defectiveCount() +
        this.uncertainCount()
      );
    });


  healthyPercentage =
    computed(() => {

      const total =
        this.qualityTotal();

      if (total <= 0) {
        return 0;
      }

      return (
        this.healthyCount() /
        total
      ) * 100;
    });


  defectivePercentage =
    computed(() => {

      const total =
        this.qualityTotal();

      if (total <= 0) {
        return 0;
      }

      return (
        this.defectiveCount() /
        total
      ) * 100;
    });


  uncertainPercentage =
    computed(() => {

      const total =
        this.qualityTotal();

      if (total <= 0) {
        return 0;
      }

      return (
        this.uncertainCount() /
        total
      ) * 100;
    });


  /* =========================================================
     TREND
     ========================================================= */

  getTrend():
    DashboardTrendItem[] {

    const dashboard =
      this.data();

    if (!dashboard) {
      return [];
    }

    if (
      this.selectedRange() === '30d'
    ) {
      return dashboard.trend30d ?? [];
    }

    return dashboard.trend7d ?? [];
  }


  getTrendInspected(
    item: DashboardTrendItem
  ): number {

    return Number(
      item.inspected ??
      item.total ??
      item.count ??
      0
    );
  }


  getTrendHealthy(
    item: DashboardTrendItem
  ): number {

    if (
      item.healthy !== undefined &&
      item.healthy !== null
    ) {
      return Number(item.healthy);
    }

    return Math.max(
      this.getTrendInspected(item) -
      this.getTrendDefective(item),
      0
    );
  }


  getTrendDefective(
    item: DashboardTrendItem
  ): number {

    return Number(
      item.defects ??
      item.defective ??
      item.defect ??
      0
    );
  }


  getTrendMax(): number {

    const trend =
      this.getTrend();

    return Math.max(
      ...trend.map(
        item =>
          this.getTrendInspected(item)
      ),
      1
    );
  }


  getTrendHeight(
    value: number
  ): string {

    return `${
      Math.max(
        (value / this.getTrendMax()) * 100,
        3
      )
    }%`;
  }


  getTrendLabel(
    item: DashboardTrendItem
  ): string {

    const value =
      item.date ??
      item.label ??
      item.time ??
      '';

    if (!value) {
      return '';
    }

    const date =
      new Date(value);

    if (!isNaN(date.getTime())) {

      return date.toLocaleDateString(
        undefined,
        {
          day: '2-digit',
          month: 'short'
        }
      );
    }

    return String(value);
  }


  /* =========================================================
     INSPECTIONS
     ========================================================= */

  getActivityId(
    item: DashboardActivity
  ): string {

    return String(
      item.inspectionId ??
      item.id ??
      '-'
    );
  }


  getPieceId(
    item: DashboardActivity
  ): string {

    return String(
      item.pieceId ??
      item.piece_id ??
      '—'
    );
  }


  getStatus(
    item: DashboardActivity
  ): string {

    return String(
      item.status ??
      'UNKNOWN'
    ).toUpperCase();
  }


  isHealthy(
    item: DashboardActivity
  ): boolean {

    return [
      'OK',
      'HEALTHY',
      'GOOD',
      'CONFORME'
    ].includes(
      this.getStatus(item)
    );
  }


  isDefective(
    item: DashboardActivity
  ): boolean {

    return [
      'DEFECT',
      'DEFECTED',
      'DEFECTIVE',
      'NOK',
      'REJECT',
      'REJECTED'
    ].includes(
      this.getStatus(item)
    );
  }


  isUncertain(
    item: DashboardActivity
  ): boolean {

    return [
      'UNCERTAIN',
      'UNKNOWN',
      'INCONCLUSIVE'
    ].includes(
      this.getStatus(item)
    );
  }


  getStatusClass(
    item: DashboardActivity
  ): string {

    if (this.isHealthy(item)) {
      return 'healthy';
    }

    if (this.isDefective(item)) {
      return 'defective';
    }

    if (this.isUncertain(item)) {
      return 'uncertain';
    }

    return 'unknown';
  }


  selectInspection(
    item: DashboardActivity
  ): void {

    this.selectedInspection.set(
      item
    );
  }


  closeInspection(): void {

    this.selectedInspection.set(
      null
    );
  }


  /* =========================================================
     ROBOT REAL-TIME
     ========================================================= */

  refreshRobot(): void {

    this.robotError.set('');

    forkJoin({

      status:
        this.robotService
          .status()
          .pipe(
            catchError(error => {

              console.error(
                '[AGDD] Robot status error:',
                error
              );

              return of(null);
            })
          ),

      pipeline:
        this.robotService
          .getPipelineState()
          .pipe(
            catchError(error => {

              console.error(
                '[AGDD] Pipeline error:',
                error
              );

              return of(null);
            })
          )

    }).subscribe({

      next: result => {

        if (
          result.status === null &&
          result.pipeline === null
        ) {

          this.robotError.set(
            'Robot control service unavailable.'
          );

          this.robotLoading.set(false);

          return;
        }


        /* =====================================================
           ROBOT SERVICES
           ===================================================== */

        if (result.status) {

          const response =
            result.status as RobotStatusResponse;

          this.robotServices.set(
            Array.isArray(
              response.items
            )
              ? response.items.map(
                  item => ({
                    name:
                      String(
                        item.name ??
                        'Unknown'
                      ),

                    running:
                      Boolean(
                        item.running
                      ),

                    pid:
                      item.pid !== null &&
                      item.pid !== undefined
                        ? Number(item.pid)
                        : null
                  })
                )
              : []
          );
        }


        /* =====================================================
           LIVE PIPELINE
           ===================================================== */

        if (result.pipeline) {

          const response =
            result.pipeline as PipelineResponse;

          const rawState =
            String(
              response.state ??
              'idle'
            ).toLowerCase();

          this.robotState.set(
            rawState
          );


          /*
           * Keep the message in English.
           * The dashboard interface is English-only.
           */
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


          /*
           * Preserve the exact API step.
           * normalizeStep() will convert it
           * into PICK / DETECT / GRIP / ...
           */
          const rawStep =
            response.step ??
            null;

          this.robotStep.set(
            rawStep !== null
              ? String(rawStep)
              : null
          );
        }


        this.robotLoading.set(false);
      }
    });
  }


  /* =========================================================
     PIPELINE STEP NORMALIZATION
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


    /*
     * Remove separators so that:
     *
     * "pick"
     * "PICKING"
     * "pick_gear"
     * "pick gear"
     *
     * can all be recognized.
     */
    const compact =
      raw
        .replace(
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


    /*
     * Exact match.
     */
    if (mapping[compact]) {
      return mapping[compact];
    }


    /*
     * More flexible fallback.
     *
     * Examples:
     * "CURRENT STEP: RELEASE"
     * "Pipeline RELEASE"
     * "robot_releasing"
     */
    const detectedStep =
      this.pipelineSteps.find(
        step =>
          raw.includes(step)
      );

    return detectedStep ?? null;
  }


  /* =========================================================
     ENGLISH ROBOT MESSAGES
     * ========================================================= */

  private toEnglishRobotMessage(
    message: string,
    state: string
  ): string {

    const normalized =
      message
        .toLowerCase()
        .trim();

    if (
      normalized.includes('arrêt') ||
      normalized.includes('arrÃªt') ||
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

    return message || 'Pipeline ready.';
  }


  private fixEncoding(
    value: string
  ): string {

    return value
      .replace(
        'arrÃªtÃ©',
        'arrêté'
      )
      .replace(
        'arrÃªt',
        'arrêt'
      );
  }


  /* =========================================================
     DASHBOARD LOAD
     ========================================================= */

  loadDashboard(): void {

    this.loading.set(true);
    this.error.set('');

    this.dashboardService
      .fetchOverview(
        this.selectedRange()
      )
      .pipe(
        catchError(error => {

          console.error(
            '[AGDD] Dashboard error:',
            error
          );

          this.error.set(
            'Unable to load inspection data.'
          );

          return of(null);
        })
      )
      .subscribe(result => {

        if (result) {

          this.data.set(result);

          this.activity =
            Array.isArray(
              result.activity
            )
              ? result.activity
              : [];

          this.lastUpdate.set(
            new Date()
          );
        }

        this.loading.set(false);
      });
  }


  /* =========================================================
     AUTO REFRESH
     ========================================================= */

  startAutoRefresh(
    seconds = 3
  ): void {

    this.dashboardSubscription
      ?.unsubscribe();

    const interval =
      Math.max(
        Number(seconds) || 3,
        1
      );

    this.dashboardRefreshInterval.set(
      interval
    );

    this.dashboardSubscription =
      timer(
        interval * 1000,
        interval * 1000
      )
      .pipe(
        switchMap(() =>
          this.dashboardService
            .fetchOverview(
              this.selectedRange()
            )
            .pipe(
              catchError(error => {

                console.error(
                  '[AGDD] Refresh error:',
                  error
                );

                return of(null);
              })
            )
        )
      )
      .subscribe(result => {

        if (!result) {
          return;
        }

        this.data.set(result);

        this.activity =
          Array.isArray(
            result.activity
          )
            ? result.activity
            : [];

        this.lastUpdate.set(
          new Date()
        );

        this.error.set('');
      });
  }


  stopAutoRefresh(): void {

    this.dashboardSubscription
      ?.unsubscribe();

    this.dashboardSubscription =
      undefined;
  }


  private loadSystemSettings(): void {

    const role =
      String(
        this.authService.currentUser()?.role ?? ''
      )
        .trim()
        .toUpperCase();

    if (role !== 'ADMIN') {

      this.dashboardAutoRefresh.set(true);

      this.startAutoRefresh(3);

      return;
    }

    this.settingsService
      .get<SystemSettings>('system')
      .subscribe({

        next: payload => {

          const values =
            payload?.values ?? {};

          const autoRefresh =
            values.dashboardAutoRefresh ??
            true;

          const interval =
            Number(
              values.dashboardRefreshInterval ??
              3
            );

          this.dashboardAutoRefresh.set(
            Boolean(autoRefresh)
          );

          if (autoRefresh) {

            this.startAutoRefresh(
              interval
            );

          } else {

            this.stopAutoRefresh();
          }
        },

        error: error => {

          console.error(
            '[AGDD] System settings error:',
            error
          );

          this.dashboardAutoRefresh.set(true);

          this.startAutoRefresh(3);
        }
      });
  }


  /* =========================================================
     RANGE
     ========================================================= */

  setRange(
    range: DashboardRange
  ): void {

    this.selectedRange.set(
      range
    );

    this.loadDashboard();
  }


  /* =========================================================
     EXPORT
     ========================================================= */

  exportExcel(): void {

    if (!this.activity.length) {
      return;
    }

    const rows =
      this.activity.map(item => ({

        'Inspection ID':
          this.getActivityId(item),

        'Gear ID':
          this.getPieceId(item),

        'Status':
          this.getStatus(item),

        'Inspected At':
          item.inspectedAt ?? '',

        'Outer Diameter (mm)':
          item.outerDiameter ?? '',

        'Inner Diameter (mm)':
          item.innerDiameter ?? '',

        'Teeth':
          item.teethCount ?? '',

        'Height (mm)':
          item.heightMm ?? '',

        'Helix (deg)':
          item.helixDeg ?? '',

        'Top Camera':
          item.topStatus ?? '',

        'Side Camera':
          item.sideStatus ?? ''
      }));


    const worksheet =
      XLSX.utils.json_to_sheet(
        rows
      );


    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 14 },
      { wch: 22 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
      { wch: 15 },
      { wch: 15 },
      { wch: 16 },
      { wch: 16 }
    ];


    const workbook =
      XLSX.utils.book_new();


    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Inspections'
    );


    const summary =
      XLSX.utils.json_to_sheet([
        {
          Metric: 'Period',
          Value: this.selectedRange()
        },
        {
          Metric: 'Total',
          Value: this.totalInspected()
        },
        {
          Metric: 'Healthy',
          Value: this.healthyCount()
        },
        {
          Metric: 'Defective',
          Value: this.defectiveCount()
        },
        {
          Metric: 'Uncertain',
          Value: this.uncertainCount()
        },
        {
          Metric: 'Conformity',
          Value:
            `${this.conformityRate().toFixed(2)}%`
        }
      ]);


    XLSX.utils.book_append_sheet(
      workbook,
      summary,
      'Summary'
    );


    const date =
      new Date()
        .toISOString()
        .slice(0, 10);


    XLSX.writeFile(
      workbook,
      `AGDD_Report_${date}.xlsx`
    );
  }


  /* =========================================================
     CLOCK
     ========================================================= */

  startClock(): void {

    this.clockSubscription
      ?.unsubscribe();

    this.clockSubscription =
      timer(0, 1000)
        .subscribe(() => {

          this.currentTime.set(
            new Date()
          );
        });
  }


  /* =========================================================
     INIT / DESTROY
     ========================================================= */

  ngOnInit(): void {

    this.loadDashboard();

    this.loadSystemSettings();

    this.refreshRobot();

    this.robotSubscription =
      timer(
        0,
        2000
      )
      .subscribe(() => {

        this.refreshRobot();
      });

    this.startClock();
  }


  ngOnDestroy(): void {

    this.dashboardSubscription
      ?.unsubscribe();

    this.robotSubscription
      ?.unsubscribe();

    this.clockSubscription
      ?.unsubscribe();
  }
}




