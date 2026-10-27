import {
  CommonModule
} from '@angular/common';

import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal
} from '@angular/core';

import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors
} from '@angular/forms';

import {
  MatButtonModule
} from '@angular/material/button';

import {
  MatCardModule
} from '@angular/material/card';

import {
  MatFormFieldModule
} from '@angular/material/form-field';

import {
  MatIconModule
} from '@angular/material/icon';

import {
  MatInputModule
} from '@angular/material/input';

import {
  MatProgressSpinnerModule
} from '@angular/material/progress-spinner';

import {
  MatSnackBar
} from '@angular/material/snack-bar';

import {
  MatTabsModule
} from '@angular/material/tabs';

import {
  ActivatedRoute
} from '@angular/router';

import {
  Subscription
} from 'rxjs';

import {
  ProfileService,
  UserProfile
} from './profile.service';

import {
  AuthService
} from '../../core/services/auth.service';


/**
 * Validator used to make sure that
 * new password and confirmation are identical.
 */
function passwordsMatchValidator(
  control: AbstractControl
): ValidationErrors | null {

  const newPassword =
    control.get('newPassword')?.value;

  const confirmPassword =
    control.get('confirmPassword')?.value;

  if (
    !newPassword ||
    !confirmPassword
  ) {
    return null;
  }

  return newPassword === confirmPassword
    ? null
    : { passwordsMismatch: true };
}


@Component({
  selector: 'app-profile-settings',
  standalone: true,

  imports: [

    CommonModule,

    ReactiveFormsModule,

    MatCardModule,

    MatTabsModule,

    MatFormFieldModule,

    MatInputModule,

    MatButtonModule,

    MatIconModule,

    MatProgressSpinnerModule

  ],

  templateUrl: './profile-settings.component.html',

  styleUrl: './profile-settings.component.scss'
})
export class ProfileSettingsComponent
  implements OnInit, OnDestroy {


  private readonly fb =
    inject(FormBuilder);

  private readonly profileService =
    inject(ProfileService);

  private readonly authService =
    inject(AuthService);

  private readonly snackBar =
    inject(MatSnackBar);

  private readonly route =
    inject(ActivatedRoute);


  /**
   * Controls the active Material tab.
   *
   * 0 = Personal info
   * 1 = Security
   */
  readonly selectedTabIndex =
    signal(0);


  readonly loadingProfile =
    signal(true);


  readonly savingInfo =
    signal(false);


  readonly savingPassword =
    signal(false);


  readonly profile =
    signal<UserProfile | null>(null);


  private queryParamSubscription?: Subscription;


  /**
   * Personal information form.
   */
  readonly infoForm =
    this.fb.nonNullable.group({

      firstName: [
        '',
        [
          Validators.required,
          Validators.maxLength(60)
        ]
      ],

      lastName: [
        '',
        [
          Validators.required,
          Validators.maxLength(60)
        ]
      ],

      email: [
        '',
        [
          Validators.required,
          Validators.email
        ]
      ]

    });


  /**
   * Security / password form.
   */
  readonly passwordForm =
    this.fb.nonNullable.group(

      {

        currentPassword: [
          '',
          [
            Validators.required
          ]
        ],

        newPassword: [
          '',
          [
            Validators.required,
            Validators.minLength(8)
          ]
        ],

        confirmPassword: [
          '',
          [
            Validators.required
          ]
        ]

      },

      {
        validators:
          passwordsMatchValidator
      }

    );


  ngOnInit(): void {

    /**
     * Listen continuously to query parameters.
     *
     * This is important because Angular can reuse
     * the same ProfileSettingsComponent when only
     * ?tab=security changes.
     */
    this.queryParamSubscription =
      this.route.queryParamMap.subscribe(
        (params) => {

          const tab =
            params.get('tab');

          this.selectedTabIndex.set(
            tab === 'security'
              ? 1
              : 0
          );

        }
      );


    /**
     * Load current profile from backend.
     */
    this.loadProfile();
  }


  /**
   * Load the authenticated user's profile.
   */
  private loadProfile(): void {

    this.loadingProfile.set(true);

    this.profileService
      .getCurrentProfile()
      .subscribe({

        next: (user) => {

          this.profile.set(user);

          this.infoForm.patchValue({

            firstName:
              user.firstName,

            lastName:
              user.lastName,

            email:
              user.email

          });

          this.loadingProfile.set(false);
        },


        error: () => {

          this.loadingProfile.set(false);

          this.snackBar.open(
            'Unable to load your profile. Please try again.',
            'Close',
            {
              duration: 4000
            }
          );

        }

      });
  }


  /**
   * User initials displayed in the profile header.
   */
  get initials(): string {

    const user =
      this.profile();

    if (!user) {
      return '';
    }

    return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`
      .toUpperCase();
  }


  /**
   * Save personal information.
   */
  saveInfo(): void {

    if (this.infoForm.invalid) {

      this.infoForm.markAllAsTouched();

      return;
    }


    this.savingInfo.set(true);


    const payload =
      this.infoForm.getRawValue();


    this.profileService
      .updateProfile(payload)
      .subscribe({

        next: (updated) => {

          /**
           * Update local profile page.
           */
          this.profile.set(updated);


          /**
           * IMPORTANT:
           *
           * Update AuthService.currentUser()
           * so the navbar changes immediately.
           */
          this.authService.updateCurrentUser({

            firstName:
              updated.firstName,

            lastName:
              updated.lastName,

            email:
              updated.email,

            role:
              updated.role

          });


          this.savingInfo.set(false);


          this.snackBar.open(
            'Profile updated successfully.',
            'Close',
            {
              duration: 3000
            }
          );

        },


        error: (error) => {

          console.error(
            'Profile update error:',
            error
          );


          this.savingInfo.set(false);


          const message =
            error?.status === 409
              ? 'This email address is already associated with another account.'
              : 'Could not update your profile. Please try again.';

          this.snackBar.open(
            message,
            'Close',
            {
              duration: 5000
            }
          );

        }

      });
  }


  /**
   * Change password.
   */
  changePassword(): void {

    if (this.passwordForm.invalid) {

      this.passwordForm.markAllAsTouched();

      return;
    }


    this.savingPassword.set(true);


    const {
      currentPassword,
      newPassword
    } =
      this.passwordForm.getRawValue();


    this.profileService
      .changePassword({

        currentPassword,

        newPassword

      })
      .subscribe({

        next: () => {

          this.savingPassword.set(false);


          /**
           * Clear password fields after success.
           */
          this.passwordForm.reset();


          this.snackBar.open(
            'Password changed successfully.',
            'Close',
            {
              duration: 3000
            }
          );

        },


        error: (error) => {

          console.error(
            'Password change error:',
            error
          );


          this.savingPassword.set(false);


          this.snackBar.open(
            'Could not change your password. Check your current password and try again.',
            'Close',
            {
              duration: 5000
            }
          );

        }

      });
  }


  /**
   * Cleanup query-param subscription.
   */
  ngOnDestroy(): void {

    this.queryParamSubscription?.unsubscribe();

  }
}