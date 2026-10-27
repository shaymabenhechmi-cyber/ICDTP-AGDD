import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.currentUser();

  if (!user) {
    return router.createUrlTree(['/login']);
  }

  const currentRole = String(user.role ?? '').trim().toUpperCase();

  const allowedRoles = (route.data['roles'] ?? [])
    .map((role: string) => String(role).trim().toUpperCase());

  if (allowedRoles.length === 0 || allowedRoles.includes(currentRole)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
