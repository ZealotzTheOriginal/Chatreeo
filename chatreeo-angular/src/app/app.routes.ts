import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { map, take } from 'rxjs';
import { FirebaseService } from './core/services/firebase.service';

const authGuard = () => {
  const firebase = inject(FirebaseService);
  const router = inject(Router);
  return firebase.currentUser$.pipe(
    take(1),
    map((user) => (user ? true : router.createUrlTree(['/auth'])))
  );
};

const guestGuard = () => {
  const firebase = inject(FirebaseService);
  const router = inject(Router);
  return firebase.currentUser$.pipe(
    take(1),
    map((user) => (user ? router.createUrlTree(['/chat']) : true))
  );
};

export const routes: Routes = [
  { path: '', redirectTo: 'chat', pathMatch: 'full' },
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth/auth').then((m) => m.AuthComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'chat',
    loadComponent: () => import('./pages/chat/chat').then((m) => m.ChatComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: 'chat' },
];
