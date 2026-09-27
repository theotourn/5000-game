import { Injectable } from '@angular/core';

export interface ScoreResult {
  totalScore: number;
  isValid: boolean; // Verdadeiro se TODOS os dados selecionados formam combinações pontuáveis
  breakdown: string[]; // Descrição textual das combinações (ex: "Trinca de 4 (400 pts)")
}

@Injectable({
  providedIn: 'root',
})
export class GameService {
  /**
   * Conta a frequência de cada face (1 a 6)
   */
  countDice(dice: number[]): number[] {
    const count = [0, 0, 0, 0, 0, 0, 0];
    for (const die of dice) {
      if (die >= 1 && die <= 6) {
        count[die]++;
      }
    }
    return count;
  }

  /**
   * Verifica se os dados formam uma sequência válida de 5 dados (1-5 ou 2-6)
   */
  isSequence(diceCount: number[]): boolean {
    const has1to5 = diceCount[1] >= 1 && diceCount[2] >= 1 && diceCount[3] >= 1 && diceCount[4] >= 1 && diceCount[5] >= 1;
    const has2to6 = diceCount[2] >= 1 && diceCount[3] >= 1 && diceCount[4] >= 1 && diceCount[5] >= 1 && diceCount[6] >= 1;
    return has1to5 || has2to6;
  }

  /**
   * Verifica se uma rolagem tem QUALQUER combinação pontuável.
   * Se retornar false, é ZILCH / FARKLE.
   */
  hasAnyScoringCombination(diceRoll: number[]): boolean {
    if (!diceRoll || diceRoll.length === 0) return false;
    const count = this.countDice(diceRoll);

    // Tem 1 ou 5
    if (count[1] > 0 || count[5] > 0) return true;

    // Tem alguma trinca, quádrupla ou quíntupla
    for (let num = 2; num <= 6; num++) {
      if (count[num] >= 3) return true;
    }

    // Tem sequência
    if (diceRoll.length === 5 && this.isSequence(count)) return true;

    return false;
  }

  /**
   * Retorna os índices dos dados que participam de alguma combinação pontuável.
   */
  getScoringDiceIndices(diceRoll: number[]): number[] {
    const count = this.countDice(diceRoll);
    const scoringIndices: number[] = [];

    // Se tem sequência completa de 5
    if (diceRoll.length === 5 && this.isSequence(count)) {
      return diceRoll.map((_, i) => i);
    }

    diceRoll.forEach((val, idx) => {
      // 1s e 5s sempre pontuam
      if (val === 1 || val === 5) {
        scoringIndices.push(idx);
      } else if (count[val] >= 3) {
        // Se faz parte de uma trinca ou mais
        scoringIndices.push(idx);
      }
    });

    return scoringIndices;
  }

  /**
   * Calcula a pontuação de um conjunto de dados selecionados pelo jogador.
   * Valida se TODOS os dados selecionados são pontuáveis (rejeita se o jogador tentar selecionar um 2 avulso).
   */
  calculateScore(selectedDice: number[]): ScoreResult {
    if (!selectedDice || selectedDice.length === 0) {
      return { totalScore: 0, isValid: true, breakdown: [] };
    }

    let totalScore = 0;
    const breakdown: string[] = [];
    const count = this.countDice(selectedDice);
    let usedCount = 0;

    // 1. Verifica sequência de 5 dados (1-5 ou 2-6)
    if (selectedDice.length === 5 && this.isSequence(count)) {
      if (count[1] === 1 && count[2] === 1 && count[3] === 1 && count[4] === 1 && count[5] === 1) {
        return { totalScore: 750, isValid: true, breakdown: ['Sequência Baixa 1-5 (750 pts)'] };
      }
      if (count[2] === 1 && count[3] === 1 && count[4] === 1 && count[5] === 1 && count[6] === 1) {
        return { totalScore: 750, isValid: true, breakdown: ['Sequência Alta 2-6 (750 pts)'] };
      }
    }

    // 2. Pontuações de 1 (Trinca, Quádrupla, Quíntupla ou Avulsos)
    if (count[1] >= 5) {
      totalScore += 5000;
      breakdown.push('Quíntupla de 1 (5000 pts)');
      usedCount += 5;
    } else if (count[1] === 4) {
      totalScore += 2000;
      breakdown.push('Quádrupla de 1 (2000 pts)');
      usedCount += 4;
    } else if (count[1] === 3) {
      totalScore += 1000;
      breakdown.push('Trinca de 1 (1000 pts)');
      usedCount += 3;
    } else if (count[1] > 0) {
      totalScore += count[1] * 100;
      breakdown.push(`${count[1]}x Ás avulso (${count[1] * 100} pts)`);
      usedCount += count[1];
    }

    // 3. Pontuações de outros números (2 a 6)
    for (let num = 2; num <= 6; num++) {
      if (num === 5) continue; // Trata o 5 separadamente devido aos avulsos

      if (count[num] >= 5) {
        totalScore += num * 1000;
        breakdown.push(`Quíntupla de ${num} (${num * 1000} pts)`);
        usedCount += 5;
      } else if (count[num] === 4) {
        totalScore += num * 200;
        breakdown.push(`Quádrupla de ${num} (${num * 200} pts)`);
        usedCount += 4;
      } else if (count[num] === 3) {
        totalScore += num * 100;
        breakdown.push(`Trinca de ${num} (${num * 100} pts)`);
        usedCount += 3;
      }
    }

    // 4. Pontuações do 5 (Trinca, Quádrupla, Quíntupla ou Avulsos)
    if (count[5] >= 5) {
      totalScore += 5 * 1000;
      breakdown.push('Quíntupla de 5 (5000 pts)');
      usedCount += 5;
    } else if (count[5] === 4) {
      totalScore += 5 * 200;
      breakdown.push('Quádrupla de 5 (1000 pts)');
      usedCount += 4;
    } else if (count[5] === 3) {
      totalScore += 5 * 100;
      breakdown.push('Trinca de 5 (500 pts)');
      usedCount += 3;
    } else if (count[5] > 0) {
      totalScore += count[5] * 50;
      breakdown.push(`${count[5]}x Cinco avulso (${count[5] * 50} pts)`);
      usedCount += count[5];
    }

    // A seleção só é válida se absolutamente TODOS os dados selecionados pontuarem!
    const isValid = usedCount === selectedDice.length;

    return {
      totalScore: isValid ? totalScore : 0,
      isValid,
      breakdown: isValid ? breakdown : ['Seleção contém dados que não pontuam!'],
    };
  }
}
