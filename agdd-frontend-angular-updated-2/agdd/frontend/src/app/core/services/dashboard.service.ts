import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs';
import { DashboardOverview } from '../models/dashboard.model';
import { environment } from '../../../environments/environment';

export type DashboardRange =
  | '1h'
  | 'today'
  | '24h'
  | '7d'
  | '30d';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  private http = inject(HttpClient);

  private apiUrl = `${environment.apiUrl}/dashboard`;

  overview = signal<DashboardOverview | null>(null);

  fetchOverview(
    range: DashboardRange = 'today'
  ) {

    const params = new HttpParams()
      .set('range', range);

    return this.http
      .get<DashboardOverview>(
        `${this.apiUrl}/overview`,
        { params }
      )
      .pipe(
        tap(data => {
          this.overview.set(data);
        })
      );
  }
}