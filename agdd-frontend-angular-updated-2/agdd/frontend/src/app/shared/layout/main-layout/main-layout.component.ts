import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { NavbarComponent } from '../navbar/navbar.component';
import { DashboardService } from '../../../core/services/dashboard.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NavbarComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit {
  private dashboardService = inject(DashboardService);

  ngOnInit(): void {
    // Pre-load dashboard data app-wide so the navbar alerts bell has data
    // even before the user visits the Dashboard page itself.
    this.dashboardService.fetchOverview().subscribe();
  }
}
