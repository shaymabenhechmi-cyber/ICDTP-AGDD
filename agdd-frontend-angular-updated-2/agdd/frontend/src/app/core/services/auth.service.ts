import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import {
  LoginRequest,
  LoginResponse,
  RegisterRequest
} from '../models/auth.model';

import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'agdd_token';
const USER_KEY = 'agdd_user';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly apiUrl = `${environment.apiUrl}/auth`;

  /**
   * Current authenticated user.
   *
   * This signal is used by the navbar and other components.
   */
  readonly currentUser = signal<LoginResponse | null>(
    this.readStoredUser()
  );

  /**
   * True when a user is currently authenticated.
   */
  readonly isLoggedIn = computed(
    () => !!this.currentUser()
  );

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {}

  /**
   * Login
   */
  login(
    credentials: LoginRequest
  ): Observable<LoginResponse> {

    return this.http
      .post<LoginResponse>(
        `${this.apiUrl}/login`,
        credentials
      )
      .pipe(

        tap((response) => {

          const normalizedResponse: LoginResponse = {
            ...response,
            role: String(response.role ?? "").trim().toUpperCase()
          };

          localStorage.setItem(
            TOKEN_KEY,
            normalizedResponse.token
          );

          localStorage.setItem(
            USER_KEY,
            JSON.stringify(normalizedResponse)
          );

          this.currentUser.set(normalizedResponse);

        })

      );
  }

  /**
   * Register
   */
  register(
    data: RegisterRequest
  ): Observable<LoginResponse> {

    return this.http
      .post<LoginResponse>(
        `${this.apiUrl}/register`,
        data
      )
      .pipe(

        tap((response) => {

          const normalizedResponse: LoginResponse = {
            ...response,
            role: String(response.role ?? "").trim().toUpperCase()
          };

          localStorage.setItem(
            TOKEN_KEY,
            normalizedResponse.token
          );

          localStorage.setItem(
            USER_KEY,
            JSON.stringify(normalizedResponse)
          );

          this.currentUser.set(normalizedResponse);

        })

      );
  }

  /**
   * Update the currently logged-in user
   * without requiring logout/login.
   *
   * Used after editing the profile.
   */
  updateCurrentUser(
    data: Partial<LoginResponse>
  ): void {

    const current = this.currentUser();

    if (!current) {
      return;
    }

    const updatedUser: LoginResponse = {
      ...current,
      ...data
    };

    localStorage.setItem(
      USER_KEY,
      JSON.stringify(updatedUser)
    );

    this.currentUser.set(updatedUser);
  }

  /**
   * Logout
   */
  logout(): void {

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    this.currentUser.set(null);

    this.router.navigate(['/login']);
  }

  /**
   * Return JWT token.
   */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /**
   * Check authentication.
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Read the user saved in localStorage.
   */
  private readStoredUser(): LoginResponse | null {

    const raw = localStorage.getItem(USER_KEY);

    if (!raw) {
      return null;
    }

    try {

      return JSON.parse(raw) as LoginResponse;

    } catch {

      localStorage.removeItem(USER_KEY);

      return null;
    }
  }
}
