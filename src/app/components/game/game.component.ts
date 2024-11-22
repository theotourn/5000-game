import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DiceService } from '../../services/dice.service';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss'],
})
export class GameComponent {
  players: string[] = [];
  scores: number[] = [];
  currentPlayer = 0;
  currentRoll: number[] = [];
  roundScore = 0;
  usedDice: number[] = [];
  remainingDice: number[] = [];
  fadeInDice = false;
  fadeOutDice = false;

  constructor(
    private diceService: DiceService,
    private gameService: GameService,
    private router: Router
  ) {}

  ngOnInit() {
    const savedPlayers = localStorage.getItem('players');
    if (!savedPlayers) {
      this.router.navigate(['/player-input']);
      return;
    }
    this.players = JSON.parse(savedPlayers);
    this.scores = Array(this.players.length).fill(0);
  }

  rollDice() {
    if (this.remainingDice.length === 0) {
      this.remainingDice = Array(5).fill(0); // Inicializa com "dice-roll"
      this.usedDice = [];
      this.currentRoll = [];
    } else {
      // Adiciona fade-out antes de redefinir para "dice-roll"
      this.fadeOutDice = true;
      setTimeout(() => {
        this.fadeOutDice = false;
        this.remainingDice = this.remainingDice.map(() => 0);
      }, 500); // Duração do fade-out
    }

    // Ativa animação de rolar
    const diceElements = document.querySelectorAll('.dice');
    diceElements.forEach((dice) => dice.classList.add('spin-animation'));

    const buttons = document.querySelectorAll<HTMLButtonElement>('.btn');
    buttons.forEach((btn) => (btn.disabled = true));

    setTimeout(() => {
      // Finaliza animação de rolar e inicia fade-in para mostrar os resultados
      const roll = this.diceService.roll(this.remainingDice.length);
      this.currentRoll = roll;

      this.fadeInDice = true;
      setTimeout(() => {
        this.fadeInDice = false;
        this.remainingDice = roll; // Exibe os resultados reais
      }, 500); // Duração do fade-in

      diceElements.forEach((dice) => dice.classList.remove('spin-animation'));

      setTimeout(() => {
        const score = this.gameService.calculateScore(roll);

        if (score.totalScore === 0) {
          alert(`${this.players[this.currentPlayer]} não pontuou e perdeu a vez.`);
          this.endTurn();
          buttons.forEach((btn) => (btn.disabled = false));
          return;
        }

        // Atualiza a pontuação da rodada e move os dados usados
        this.roundScore += score.totalScore;

        // Adiciona fade-out ao mover dados usados para outra coluna
        this.fadeOutDice = true;
        setTimeout(() => {
          this.fadeOutDice = false;
          this.usedDice = this.usedDice.concat(score.usedDice);
          this.remainingDice = roll.filter((die) => !score.usedDice.includes(die));
        }, 500);

        buttons.forEach((btn) => (btn.disabled = false));
      }, 3000); // Tempo para redistribuir os dados
    }, 1000); // Tempo da animação
  }

  keepScore() {
    if (this.scores[this.currentPlayer] + this.roundScore > 5000) {
      alert(
        `${this.players[this.currentPlayer]} perdeu os pontos desta rodada porque ultrapassou 5000!`
      );
      this.endTurn();
      return;
    }

    if (this.scores[this.currentPlayer] === 0 && this.roundScore < 500) {
      alert('Você precisa fazer no mínimo 500 pontos para começar a pontuar!');
    } else {
      this.scores[this.currentPlayer] += this.roundScore;

      if (this.scores[this.currentPlayer] === 5000) {
        alert(
          `${this.players[this.currentPlayer]} venceu com ${this.scores[this.currentPlayer]} pontos!`
        );
        this.router.navigate(['/player-input']);
      } else {
        this.endTurn();
      }
    }
  }

  endTurn() {
    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    this.roundScore = 0;
    this.usedDice = [];
    this.remainingDice = [];
    this.currentRoll = [];
  }
}
