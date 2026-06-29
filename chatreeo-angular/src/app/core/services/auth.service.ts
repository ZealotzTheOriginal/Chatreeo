import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, from, switchMap } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { environment } from '../../../environments/environment';

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  language: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private firebase = inject(FirebaseService);
  private router = inject(Router);

  currentUser$ = this.firebase.currentUser$;

  register(payload: RegisterPayload): Observable<unknown> {
    return from(this.firebase.register(payload.email, payload.password)).pipe(
      switchMap(() => from(this.firebase.getIdToken())),
      switchMap((token) =>
        this.http.post(`${environment.apiUrl}/api/auth/register`, {
          id_token: token,
          display_name: payload.displayName,
          language: payload.language,
        })
      )
    );
  }

  login(email: string, password: string): Observable<unknown> {
    return from(this.firebase.login(email, password));
  }

  async logout(): Promise<void> {
    await this.firebase.logout();
    this.router.navigate(['/auth']);
  }

  getIdToken(): Observable<string | null> {
    return from(this.firebase.getIdToken());
  }
}
