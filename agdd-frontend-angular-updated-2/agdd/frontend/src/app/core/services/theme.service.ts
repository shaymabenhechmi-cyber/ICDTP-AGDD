import { Injectable, signal, effect } from '@angular/core';

const THEME_KEY = 'agdd_theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {

  isDark = signal<boolean>(
    localStorage.getItem(THEME_KEY) === 'dark'
  );

  constructor() {
    effect(() => {
      const dark = this.isDark();

      document.documentElement.setAttribute(
        'data-theme',
        dark ? 'dark' : 'light'
      );

      localStorage.setItem(
        THEME_KEY,
        dark ? 'dark' : 'light'
      );
    });
  }

  toggle(): void {
    this.isDark.update(value => !value);
  }

  setDarkMode(dark: boolean): void {
    this.isDark.set(dark);
  }
}