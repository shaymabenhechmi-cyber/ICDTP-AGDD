import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export interface UpdateProfileRequest {
  firstName: string;
  lastName: string;
  email: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {

  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/users/me`;

  getCurrentProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(this.baseUrl);
  }

  updateProfile(payload: UpdateProfileRequest): Observable<UserProfile> {
    return this.http.put<UserProfile>(this.baseUrl, payload);
  }

  changePassword(payload: ChangePasswordRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/password`, payload);
  }
}