import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './placeholder.component.html',
  styleUrl: './placeholder.component.scss'
})
export class PlaceholderComponent {
  title = '';
  icon = 'construction';
  message = '';

  constructor(private route: ActivatedRoute) {
    const data = this.route.snapshot.data;
    this.title = data['title'] ?? 'Module';
    this.icon = data['icon'] ?? 'construction';
    this.message = data['message'] ?? 'This feature will be implemented in a future version.';
  }
}
