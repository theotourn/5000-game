import { Routes } from '@angular/router';
import { PlayerInputComponent } from './components/player-input/player-input.component';
import { GameComponent } from './components/game/game.component';

export const routes: Routes = [
  { path: '', redirectTo: '/player-input', pathMatch: 'full' },
  { path: 'player-input', component: PlayerInputComponent },
  { path: 'game', component: GameComponent },
];
