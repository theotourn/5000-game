import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import confetti from 'canvas-confetti';
import { DiceService } from '../../services/dice.service';
import { GameService } from '../../services/game.service';
import { SoundService } from '../../services/sound.service';
import { DiceBoard3dComponent } from '../dice-board-3d/dice-board-3d.component';
import { PlayerConfig } from '../player-input/player-input.component';

interface BalatroBanner {
  title: string;
  subtitle: string;
  type: 'farkle' | 'hotdice' | 'warning' | 'info';
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, DiceBoard3dComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss'],
})
export class GameComponent implements OnInit, AfterViewInit {
  @ViewChild(DiceBoard3dComponent) diceBoard3d!: DiceBoard3dComponent;

  players: PlayerConfig[] = [];
  scores: number[] = [];
  targetScore = 5000;
  currentPlayer = 0;
  crtFilterEnabled = true;

  // Estado da rodada atual
  roundAccumulatedScore = 0;
  currentSelectionScore = 0;
  isSelectionValid = true;
  selectionBreakdown: string[] = [];

  // Dados sorteados e dados revelados
  currentRoll: number[] = [];
  private pendingRoll: number[] = [];

  selectedIndices: number[] = [];
  scoringIndices: number[] = [];
  lockedDice: number[] = [];
  remainingDiceCount = 5;

  isRolling = false;
  hasRolledThisTurn = false;
  pixelFilterEnabled = true;
  canBankScore = false;
  canRollAgain = false;

  bannerNotice: BalatroBanner | null = null;
  winner: { name: string; avatar: string; score: number } | null = null;
  showRulesModal = false;

  constructor(
    private diceService: DiceService,
    private gameService: GameService,
    public soundService: SoundService,
    private router: Router
  ) {}

  ngOnInit() {
    const savedCrt = localStorage.getItem('5mil_crt');
    if (savedCrt !== null) {
      this.crtFilterEnabled = savedCrt === 'true';
    }

    const savedPixel = localStorage.getItem('5mil_pixel');
    if (savedPixel !== null) {
      this.pixelFilterEnabled = savedPixel === 'true';
    } else {
      this.pixelFilterEnabled = true;
    }

    const savedPlayers = localStorage.getItem('player_details');
    const legacyPlayers = localStorage.getItem('players');

    if (savedPlayers) {
      try {
        this.players = JSON.parse(savedPlayers);
      } catch {
        this.players = [];
      }
    } else if (legacyPlayers) {
      try {
        const names: string[] = JSON.parse(legacyPlayers);
        this.players = names.map((name, i) => ({
          name,
          avatar: i === 0 ? 'fa-skull' : 'fa-crown',
        }));
      } catch {
        this.players = [];
      }
    }

    if (!this.players || this.players.length === 0) {
      this.router.navigate(['/player-input']);
      return;
    }

    const savedTarget = localStorage.getItem('target_score');
    if (savedTarget) {
      this.targetScore = parseInt(savedTarget, 10);
    }

    this.scores = Array(this.players.length).fill(0);
  }

  ngAfterViewInit() {
    // Ao iniciar a tela, os dados JÁ SURGEM FLUTUANDO para o primeiro jogador!
    setTimeout(() => {
      this.prepareFloatingRoll();
    }, 100);
  }

  get totalPotentialScore(): number {
    return this.roundAccumulatedScore + (this.isSelectionValid ? this.currentSelectionScore : 0);
  }

  get isFirstTimeScoring(): boolean {
    return this.scores[this.currentPlayer] === 0;
  }

  get isDiceFloating(): boolean {
    return !!this.diceBoard3d?.isFloating;
  }

  toggleCrt() {
    this.crtFilterEnabled = !this.crtFilterEnabled;
    localStorage.setItem('5mil_crt', String(this.crtFilterEnabled));
    this.soundService.playDiceSelect();
  }

  togglePixel() {
    this.pixelFilterEnabled = !this.pixelFilterEnabled;
    localStorage.setItem('5mil_pixel', String(this.pixelFilterEnabled));
    this.soundService.playDiceSelect(this.pixelFilterEnabled);
  }

  /**
   * Prepara os dados flutuando no ar para o jogador poder pegar, balançar e jogar
   */
  private prepareFloatingRoll() {
    this.isRolling = false;
    this.currentRoll = [];
    this.selectedIndices = [];
    this.currentSelectionScore = 0;
    this.selectionBreakdown = [];

    if (this.diceBoard3d) {
      this.diceBoard3d.spawnFloatingDice(this.remainingDiceCount);
    }
  }

  private resetTurnState() {
    this.roundAccumulatedScore = 0;
    this.currentSelectionScore = 0;
    this.selectionBreakdown = [];
    this.isSelectionValid = true;

    this.currentRoll = [];
    this.pendingRoll = [];
    this.selectedIndices = [];
    this.scoringIndices = [];
    this.lockedDice = [];
    this.remainingDiceCount = 5;

    this.isRolling = false;
    this.hasRolledThisTurn = false;
    this.canBankScore = false;
    this.canRollAgain = false;
    this.bannerNotice = null;

    this.prepareFloatingRoll();
  }

  /**
   * Ação do botão "LANÇAR DADOS" (atalho para arremesso automático ou para rolar dados restantes)
   */
  rollDice() {
    if (this.isRolling) return;

    // Se os dados estão flutuando no ar, arremessa imediatamente!
    if (this.diceBoard3d && this.diceBoard3d.isFloating) {
      this.onRollStarted();
      this.diceBoard3d.throwAll(0, -22);
      return;
    }

    // Se já rolou anteriormente nesta mesma rodada, precisa ter guardado ao menos uma combinação
    if (this.hasRolledThisTurn) {
      if (this.selectedIndices.length === 0 || !this.isSelectionValid || this.currentSelectionScore === 0) {
        this.showBanner(
          'SELECIONE COMBINAÇÕES',
          'Para arremessar novamente, guarde ao menos uma combinação válida!',
          'warning'
        );
        return;
      }

      // Trava os dados selecionados
      const chosenValues = this.selectedIndices.map((i) => this.currentRoll[i]);
      this.lockedDice.push(...chosenValues);
      this.roundAccumulatedScore += this.currentSelectionScore;
      this.remainingDiceCount -= this.selectedIndices.length;

      // MÃO QUENTE (HOT DICE)
      if (this.remainingDiceCount === 0) {
        this.soundService.playHotDice();
        this.showBanner(
          'HOT DICE! MÃO QUENTE!',
          'Todos os 5 dados pontuaram! Todos voltam para a mesa!',
          'hotdice'
        );
        this.remainingDiceCount = 5;
        this.lockedDice = [];
      }

      this.bannerNotice = null;
      this.prepareFloatingRoll();
      return;
    }
  }

  onRollStarted() {
    this.isRolling = true;
    this.currentRoll = [];
    this.selectedIndices = [];
    this.scoringIndices = [];
    this.currentSelectionScore = 0;
    this.selectionBreakdown = [];
  }

  /**
   * Chamado quando TODOS os dados assentam na mesa 3D (após 1.5s de contemplação)
   */
  onRollFinished(physicalRoll?: number[]) {
    this.isRolling = false;
    this.hasRolledThisTurn = true;

    // Revela os números reais físicos lidos das faces superiores da mesa 3D
    if (physicalRoll && physicalRoll.length > 0) {
      this.currentRoll = [...physicalRoll];
    } else {
      this.currentRoll = this.diceService.roll(this.remainingDiceCount);
    }

    const hasPoints = this.gameService.hasAnyScoringCombination(this.currentRoll);

    if (!hasPoints) {
      this.soundService.playFarkle();
      this.showBanner(
        'ZILCH! SEM PONTOS!',
        `${this.players[this.currentPlayer].name} zerou a rodada e perdeu a vez!`,
        'farkle'
      );
      this.canBankScore = false;
      this.canRollAgain = false;

      setTimeout(() => {
        this.nextTurn();
      }, 2600);
      return;
    }

    this.scoringIndices = this.gameService.getScoringDiceIndices(this.currentRoll);
    this.selectedIndices = [...this.scoringIndices];
    this.onSelectionChanged();

    // Dispara animação visual de pontos flutuantes saindo dos dados
    this.showScoringPopupsOnTable();
  }

  private showScoringPopupsOnTable() {
    if (!this.diceBoard3d || this.scoringIndices.length === 0) return;

    const popups: { index: number; text: string; isBig?: boolean }[] = [];
    const count = this.gameService.countDice(this.currentRoll);
    const isSeq = this.currentRoll.length === 5 && this.gameService.isSequence(count);

    if (isSeq) {
      this.scoringIndices.forEach((idx, i) => {
        popups.push({
          index: idx,
          text: i === 2 ? '+750' : 'SEQ',
          isBig: true,
        });
      });
    } else {
      this.scoringIndices.forEach((idx) => {
        const val = this.currentRoll[idx];
        const valCount = count[val];
        if (valCount >= 3) {
          const base = val === 1 ? 1000 : val * 100;
          let multiplier = 1;
          if (valCount === 4) multiplier = 2;
          if (valCount === 5) multiplier = 4;
          const score = base * multiplier;
          popups.push({
            index: idx,
            text: `+${score}`,
            isBig: true,
          });
        } else if (val === 1) {
          popups.push({ index: idx, text: '+100' });
        } else if (val === 5) {
          popups.push({ index: idx, text: '+50' });
        }
      });
    }

    this.diceBoard3d.triggerScoringPopups(popups);
    this.diceBoard3d.updateSelectionVisuals(this.selectedIndices, this.scoringIndices);
  }

  onDiceClicked(index: number) {
    if (this.isRolling || !this.hasRolledThisTurn || this.currentRoll.length === 0) return;

    const isEligible = this.scoringIndices.includes(index);
    if (!isEligible) {
      this.showBanner('DADO INVÁLIDO', 'Este dado não faz parte de nenhuma combinação pontuadora!', 'warning');
      return;
    }

    const existingIdx = this.selectedIndices.indexOf(index);
    if (existingIdx !== -1) {
      this.selectedIndices.splice(existingIdx, 1);
      this.soundService.playDiceSelect(false);
    } else {
      this.selectedIndices.push(index);
      this.soundService.playDiceSelect(true);

      // Dispara número flutuante saltando do dado clicado
      const val = this.currentRoll[index];
      const count = this.gameService.countDice(this.currentRoll);
      const valCount = count[val] || 1;
      let txt = '+PTS';
      let isBig = false;
      if (valCount >= 3) {
        const base = val === 1 ? 1000 : val * 100;
        let mult = 1;
        if (valCount === 4) mult = 2;
        if (valCount === 5) mult = 4;
        txt = `+${base * mult}`;
        isBig = true;
      } else if (val === 1) {
        txt = '+100';
      } else if (val === 5) {
        txt = '+50';
      }

      if (this.diceBoard3d) {
        this.diceBoard3d.spawnScorePopup(index, txt, isBig);
      }
    }

    this.onSelectionChanged();
  }

  private onSelectionChanged() {
    const selectedValues = this.selectedIndices.map((i) => this.currentRoll[i]);
    const scoreResult = this.gameService.calculateScore(selectedValues);

    this.isSelectionValid = scoreResult.isValid;
    this.currentSelectionScore = scoreResult.totalScore;
    this.selectionBreakdown = scoreResult.breakdown;

    if (this.diceBoard3d) {
      this.diceBoard3d.updateSelectionVisuals(this.selectedIndices, this.scoringIndices);
    }

    const potentialTotal = this.roundAccumulatedScore + this.currentSelectionScore;
    this.canBankScore =
      this.hasRolledThisTurn &&
      this.isSelectionValid &&
      this.selectedIndices.length > 0 &&
      potentialTotal > 0;

    this.canRollAgain =
      this.hasRolledThisTurn &&
      this.isSelectionValid &&
      this.selectedIndices.length > 0 &&
      this.currentSelectionScore > 0;
  }

  bankScore() {
    if (this.isRolling || !this.canBankScore) return;

    const totalToAdd = this.totalPotentialScore;
    const currentTotal = this.scores[this.currentPlayer];

    // Regra dos 500 pontos iniciais
    if (currentTotal === 0 && totalToAdd < 500) {
      this.showBanner(
        'ENTRADA: MÍNIMO 500 PTS!',
        'Para abrir o placar, some ao menos 500 pontos em uma única rodada!',
        'warning'
      );
      return;
    }

    // Regra do Estouro (> targetScore)
    if (currentTotal + totalToAdd > this.targetScore) {
      this.soundService.playFarkle();
      this.showBanner(
        '💥 ESTOUROU O TARGET!',
        `Você passou de ${this.targetScore} (${currentTotal + totalToAdd}). Pontos da rodada anulados!`,
        'warning'
      );
      setTimeout(() => {
        this.nextTurn();
      }, 2500);
      return;
    }

    this.scores[this.currentPlayer] += totalToAdd;

    // Vitória Exata
    if (this.scores[this.currentPlayer] === this.targetScore) {
      this.soundService.playVictory();
      this.winner = {
        name: this.players[this.currentPlayer].name,
        avatar: this.players[this.currentPlayer].avatar,
        score: this.scores[this.currentPlayer],
      };
      this.launchConfetti();
      return;
    }

    this.soundService.playScoreBank();
    this.nextTurn();
  }

  nextTurn() {
    this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    this.resetTurnState();
  }

  forfeitTurn() {
    if (this.isRolling) return;
    this.soundService.playDiceSelect(false);
    this.nextTurn();
  }

  private showBanner(title: string, subtitle: string, type: 'farkle' | 'hotdice' | 'warning' | 'info') {
    this.bannerNotice = { title, subtitle, type };
  }

  closeBanner() {
    this.bannerNotice = null;
  }

  restartGame() {
    this.winner = null;
    this.scores = Array(this.players.length).fill(0);
    this.currentPlayer = 0;
    this.resetTurnState();
  }

  exitToLobby() {
    this.winner = null;
    this.router.navigate(['/player-input']);
  }

  private launchConfetti() {
    const duration = 4.5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 2000 };

    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }
      const particleCount = 60 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: Math.random() * 0.4 + 0.1, y: Math.random() * 0.4 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: Math.random() * 0.4 + 0.5, y: Math.random() * 0.4 },
      });
    }, 250);
  }
}
