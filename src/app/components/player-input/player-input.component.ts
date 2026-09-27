import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SoundService } from '../../services/sound.service';

export interface PlayerConfig {
  name: string;
  avatar: string;
}

@Component({
  selector: 'app-player-input',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './player-input.component.html',
  styleUrls: ['./player-input.component.scss'],
})
export class PlayerInputComponent implements OnInit {
  playerCount = 2;
  targetScore = 5000;
  crtFilterEnabled = true;

  availableAvatars = [
    'fa-skull',
    'fa-crown',
    'fa-gem',
    'fa-fire',
    'fa-dice-d20',
    'fa-dragon',
    'fa-bolt',
    'fa-ghost',
    'fa-clover',
    'fa-star',
  ];

  players: PlayerConfig[] = [
    { name: 'Jogador 1', avatar: 'fa-skull' },
    { name: 'Jogador 2', avatar: 'fa-crown' },
  ];

  constructor(private router: Router, public soundService: SoundService) {}

  ngOnInit() {
    const savedTarget = localStorage.getItem('target_score');
    if (savedTarget) {
      this.targetScore = parseInt(savedTarget, 10);
    }
    const savedCrt = localStorage.getItem('5mil_crt');
    if (savedCrt !== null) {
      this.crtFilterEnabled = savedCrt === 'true';
    }
    const savedDetails = localStorage.getItem('player_details');
    if (savedDetails) {
      try {
        const parsed = JSON.parse(savedDetails);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          this.players = parsed;
          this.playerCount = parsed.length;
        }
      } catch (e) {
        console.error('Erro ao ler jogadores salvos', e);
      }
    }
  }

  toggleCrt() {
    this.crtFilterEnabled = !this.crtFilterEnabled;
    localStorage.setItem('5mil_crt', String(this.crtFilterEnabled));
    this.soundService.playDiceSelect();
  }

  setPlayerCount(count: number) {
    this.soundService.playDiceSelect();
    this.playerCount = count;
    const current = [...this.players];
    const updated: PlayerConfig[] = [];

    for (let i = 0; i < count; i++) {
      if (current[i]) {
        updated.push(current[i]);
      } else {
        const defaultAvatar = this.availableAvatars[i % this.availableAvatars.length];
        updated.push({
          name: `Jogador ${i + 1}`,
          avatar: defaultAvatar,
        });
      }
    }
    this.players = updated;
  }

  setTargetScore(score: number) {
    this.soundService.playDiceSelect();
    this.targetScore = score;
  }

  cycleAvatar(playerIndex: number) {
    this.soundService.playDiceSelect();
    const current = this.players[playerIndex].avatar;
    const currentIdx = this.availableAvatars.indexOf(current);
    const nextIdx = (currentIdx + 1) % this.availableAvatars.length;
    this.players[playerIndex].avatar = this.availableAvatars[nextIdx];
  }

  startGame() {
    this.soundService.playScoreBank();

    const formattedPlayers = this.players.map((p, i) => ({
      name: p.name.trim() || `Jogador ${i + 1}`,
      avatar: p.avatar,
    }));

    localStorage.setItem('players', JSON.stringify(formattedPlayers.map((p) => p.name)));
    localStorage.setItem('player_details', JSON.stringify(formattedPlayers));
    localStorage.setItem('target_score', String(this.targetScore));

    this.router.navigate(['/game']);
  }
}
