import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.currentUser();
  const role = String(user?.role ?? '').trim().toUpperCase();

  if (role === 'ADMIN') {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
