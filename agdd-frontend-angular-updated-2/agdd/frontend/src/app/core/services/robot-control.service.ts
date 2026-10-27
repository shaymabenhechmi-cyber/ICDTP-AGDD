import {
  Injectable,
  inject
} from '@angular/core';

import {
  HttpClient
} from '@angular/common/http';

import {
  Observable
} from 'rxjs';

import {
  environment
} from '../../../environments/environment';


export interface RobotTarget {
  mode: 'simulation' | 'real';
  robotHost: string;
  robotPort: number;
  treatmentHost: string;
  treatmentPort: number;
}


export interface PipelineStateResponse {
  state: string;
  step?: string;
  message?: string;
  [key: string]: any;
}


@Injectable({
  providedIn: 'root'
})
export class RobotControlService {

  private readonly http =
    inject(HttpClient);

  private readonly apiUrl =
    environment.robotControlUrl;


  start(target?: RobotTarget): Observable<any> {

    return this.http.post(
      `${this.apiUrl}/start`,
      target ?? {}
    );
  }


  stop(target?: RobotTarget): Observable<any> {

    return this.http.post(
      `${this.apiUrl}/stop`,
      target ?? {}
    );
  }


  status(): Observable<any> {

    return this.http.get(
      `${this.apiUrl}/status`
    );
  }


  getPipelineState(): Observable<any> {

    return this.http.get(
      `${this.apiUrl}/pipeline-state`
    );
  }


  // Alias used by PipelineControlComponent
  pipelineState(): Observable<PipelineStateResponse> {

    return this.http.get<PipelineStateResponse>(
      `${this.apiUrl}/pipeline-state`
    );
  }


  getLogs(
    service: string
  ): Observable<any> {

    return this.http.get(
      `${this.apiUrl}/logs/${encodeURIComponent(service)}`
    );
  }

}