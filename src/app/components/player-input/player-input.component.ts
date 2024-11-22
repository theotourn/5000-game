import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-player-input',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './player-input.component.html',
  styleUrls: ['./player-input.component.scss'],
})
export class PlayerInputComponent {
  playerCount = 2; // Inicializa com 2 jogadores
  players: string[] = ['', '']; // Inicializa com 2 campos para os nomes dos jogadores

  constructor(private router: Router) {}

  // Atualiza o número de jogadores e os campos de entrada de nomes
  onPlayerCountChange(count: number) {
    this.playerCount = count;
    // Preenche o array players com o número de jogadores, mantendo os valores antigos se já existirem
    this.players = new Array(count).fill('').map((_, i) => this.players[i] || '');
  }

  // Método para rastrear os elementos no *ngFor e evitar o problema de troca de campos
  trackByIndex(index: number, item: string): any {
    return index;
  }

  // Método para iniciar o jogo
  startGame() {
    if (this.playerCount >= 2 && this.playerCount <= 6) {
      // Salva os jogadores no localStorage e inicia o jogo
      localStorage.setItem('players', JSON.stringify(this.players));
      this.router.navigate(['/game']);
    } else {
      alert('Por favor, insira um número válido de jogadores (2-6).');
    }
  }
}
