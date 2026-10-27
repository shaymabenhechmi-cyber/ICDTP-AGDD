// src/app/features/pipeline-control/pipeline-control.component.ts

import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import {
  RobotControlService,
  PipelineStateResponse,
} from '../../core/services/robot-control.service';

@Component({
  selector: 'app-pipeline-control',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button (click)="onStartClick()" [disabled]="isBusy">
      {{ isBusy ? 'Démarrage en cours...' : 'Start' }}
    </button>

    <p *ngIf="currentState">
      Statut: <b>{{ currentState.state }}</b>
      <span *ngIf="currentState.step"> (étape: {{ currentState.step }})</span>
    </p>

    <p *ngIf="currentState?.state === 'error'" class="error">
      {{ currentState?.message }}
    </p>
  `,
})
export class PipelineControlComponent implements OnDestroy {
  isBusy = false;
  currentState: PipelineStateResponse | null = null;

  private pollingSub?: Subscription;

  constructor(private robotControl: RobotControlService) {}

  onStartClick() {
    this.isBusy = true;
    this.currentState = null;

    // 1) Déclenche le pipeline. Le serveur répond immédiatement
    //    (il ne bloque plus 40s), puis lance tout en arrière-plan.
    this.robotControl.start().subscribe({
      next: (res) => {
        console.log(res.message); // "Démarrage lancé..."
        this.pollUntilRunning();
      },
      error: (err) => {
        this.isBusy = false;
        console.error('Erreur au démarrage:', err);
      },
    });
  }

  // 2) Vérifie /pipeline-state toutes les 1.5s jusqu'à 'running' ou 'error'.
  private pollUntilRunning() {
    this.pollingSub?.unsubscribe();

    this.pollingSub = interval(1500)
      .pipe(
        switchMap(() => this.robotControl.pipelineState()),
        takeWhile((state) => state.state === 'starting', true) // inclut le dernier état
      )
      .subscribe({
        next: (state) => {
          this.currentState = state;
          if (state.state === 'running' || state.state === 'error') {
            this.isBusy = false;
          }
        },
        error: (err) => {
          this.isBusy = false;
          console.error('Erreur pendant le polling:', err);
        },
      });
  }

  ngOnDestroy() {
    this.pollingSub?.unsubscribe();
  }
}
