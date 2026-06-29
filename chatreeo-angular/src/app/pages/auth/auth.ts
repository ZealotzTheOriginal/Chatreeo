import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
export class AuthComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  mode = signal<AuthMode>('login');
  loading = signal(false);
  error = signal('');

  email = '';
  password = '';
  displayName = '';
  language = 'es';

  languages = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
    { code: 'pt', label: 'Português' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
  ];

  toggleMode() {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.error.set('');
  }

  async submit() {
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);

    try {
      if (this.mode() === 'login') {
        await new Promise<void>((resolve, reject) => {
          this.authService.login(this.email, this.password).subscribe({
            next: () => resolve(),
            error: (e) => reject(e),
          });
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          this.authService
            .register({
              email: this.email,
              password: this.password,
              displayName: this.displayName,
              language: this.language,
            })
            .subscribe({
              next: () => resolve(),
              error: (e) => reject(e),
            });
        });
      }
      this.router.navigate(['/chat']);
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.error.set(this.parseFirebaseError(err.message ?? 'Error desconocido'));
    } finally {
      this.loading.set(false);
    }
  }

  private parseFirebaseError(msg: string): string {
    if (msg.includes('email-already-in-use')) return 'El email ya está en uso.';
    if (msg.includes('invalid-email')) return 'Email inválido.';
    if (msg.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
    if (msg.includes('user-not-found') || msg.includes('wrong-password'))
      return 'Email o contraseña incorrectos.';
    if (msg.includes('invalid-credential')) return 'Credenciales inválidas.';
    return msg;
  }
}
