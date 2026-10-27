import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

import { UserService } from '../../core/services/user.service';
import { RoleService } from '../../core/services/role.service';
import { User } from '../../core/models/user.model';
import { Role } from '../../core/models/role.model';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatChipsModule, MatDialogModule,
    MatMenuModule, MatSnackBarModule, MatSelectModule, MatSlideToggleModule, MatTooltipModule
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {
  displayedColumns = ['firstName', 'lastName', 'username', 'email', 'role', 'status', 'actions'];

  allUsers = signal<User[]>([]);
  roles = signal<Role[]>([]);
  searchTerm = signal('');

  pageIndex = signal(0);
  pageSize = signal(5);

  showForm = signal(false);
  editingUser = signal<User | null>(null);

  filteredUsers = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const list = this.allUsers();
    if (!term) return list;
    return list.filter(u =>
      u.firstName.toLowerCase().includes(term) ||
      u.lastName.toLowerCase().includes(term) ||
      u.username.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term)
    );
  });

  pagedUsers = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filteredUsers().slice(start, start + this.pageSize());
  });

  private fb = inject(FormBuilder);
  private userService = inject(UserService);
  private roleService = inject(RoleService);
  private snackBar = inject(MatSnackBar);

  form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    role: ['', Validators.required],
    enabled: [true],
  });

  ngOnInit(): void {
    this.loadUsers();
    this.loadRoles();
  }

  loadUsers(): void {
    this.userService.getAll().subscribe({
      next: (users) => this.allUsers.set(users),
      error: () => this.snackBar.open('Error loading users', 'Close', { duration: 3000 })
    });
  }

  loadRoles(): void {
    this.roleService.getAll().subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => {}
    });
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.pageIndex.set(0);
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  openCreateForm(): void {
    this.editingUser.set(null);
    this.form.reset({ enabled: true });
    this.form.get('password')?.setValidators([Validators.required]);
    this.form.get('password')?.updateValueAndValidity();
    this.showForm.set(true);
  }

  openEditForm(user: User): void {
    this.editingUser.set(user);
    this.form.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      enabled: user.enabled,
    });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingUser.set(null);
  }

  saveUser(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const editing = this.editingUser();

    if (editing) {
      this.userService.update(editing.id, {
        firstName: raw.firstName!, lastName: raw.lastName!, username: raw.username!,
        email: raw.email!, password: raw.password || undefined, enabled: raw.enabled!,
        role: raw.role!
      }).subscribe({
        next: () => {
          this.snackBar.open('User updated', 'Close', { duration: 2500 });
          this.closeForm();
          this.loadUsers();
        },
        error: (err) => this.snackBar.open(err?.error?.message ?? 'Error updating user', 'Close', { duration: 3000 })
      });
    } else {
      this.userService.create({
        firstName: raw.firstName!, lastName: raw.lastName!, username: raw.username!,
        email: raw.email!, password: raw.password!, enabled: raw.enabled!, role: raw.role!
      }).subscribe({
        next: () => {
          this.snackBar.open('User created', 'Close', { duration: 2500 });
          this.closeForm();
          this.loadUsers();
        },
        error: (err) => this.snackBar.open(err?.error?.message ?? 'Error creating user', 'Close', { duration: 3000 })
      });
    }
  }

  deleteUser(user: User): void {
    if (!confirm(`Delete user "${user.username}"?`)) return;

    this.userService.delete(user.id).subscribe({
      next: () => {
        this.snackBar.open('User deleted', 'Close', { duration: 2500 });
        this.loadUsers();
      },
      error: () => this.snackBar.open('Error deleting user', 'Close', { duration: 3000 })
    });
  }
}
