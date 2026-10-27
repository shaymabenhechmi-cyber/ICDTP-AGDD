import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
SettingsPayload
} from '../models/settings.model';

import {
environment
} from '../../../environments/environment';

@Injectable({
providedIn: 'root'
})
export class SettingsService {

private readonly http = inject(HttpClient);

private readonly apiUrl =
`${environment.apiUrl}/settings`;

// ==========================================
// GET SETTINGS
// ==========================================

get<T>(
category: string
): Observable<SettingsPayload<T>> {


return this.http.get<SettingsPayload<T>>(
  `${this.apiUrl}/${category}`
);


}

// ==========================================
// SAVE SETTINGS
// ==========================================

save<T>(
category: string,
values: T
): Observable<SettingsPayload<T>> {


return this.http.put<SettingsPayload<T>>(
  `${this.apiUrl}/${category}`,
  values
);


}


  updateRobotConfig(config: {
    mode: string;
    simulationCameraHost: string;
    simulationTopCameraPort: number;
    simulationSideCameraPort: number;
  }): Observable<{ ok: boolean; message: string }> {
    return this.http.put<{ ok: boolean; message: string }>(
      `${environment.robotControlUrl}/config`,
      config
    );
  }
}


