import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class GameService {
  calculateScore(diceRoll: number[]): { totalScore: number; usedDice: number[] } {
    let totalScore = 0;
    const usedDice: number[] = [];
    const diceCount = this.countDice(diceRoll);

    // Verifica sequência (de 1 a 5 ou 2 a 6)
    if (this.isSequence(diceCount)) {
      totalScore += 750; // Pontuação para sequência
      usedDice.push(...diceRoll); // Marca todos os dados da sequência como usados
      return { totalScore, usedDice };
    }

    // Verifica trinca, quadrupla e quintupla de 1
    if (diceCount[1] >= 3) {
      if (diceCount[1] === 3) {
        totalScore += 1000; // Trinca de 1
        usedDice.push(1, 1, 1);
      } else if (diceCount[1] === 4) {
        totalScore += 2000; // Quadrupla de 1
        usedDice.push(1, 1, 1, 1);
      } else if (diceCount[1] === 5) {
        totalScore += 5000; // Quintupla de 1
        usedDice.push(1, 1, 1, 1, 1);
      }
    }

    // Verifica trinca, quadrupla e quintupla de outros números
    for (let num = 2; num <= 6; num++) {
      if (diceCount[num] >= 3) {
        if (diceCount[num] === 3) {
          totalScore += num * 100; // Trinca
          usedDice.push(num, num, num);
        } else if (diceCount[num] === 4) {
          totalScore += num * 200; // Quadrupla
          usedDice.push(num, num, num, num);
        } else if (diceCount[num] === 5) {
          totalScore += num * 1000; // Quintupla
          usedDice.push(num, num, num, num, num);
        }
      }
    }

    // Pontos por 1s e 5s individuais (fora de trinca/quadrupla/quintupla)
    // 1s valem 100 pontos
    if (diceCount[1] < 3) {
      totalScore += diceCount[1] * 100;
      usedDice.push(...Array(diceCount[1]).fill(1));
    }

    // 5s valem 50 pontos
    if (diceCount[5] < 3) {
      totalScore += diceCount[5] * 50;
      usedDice.push(...Array(diceCount[5]).fill(5));
    }

    // Retorna o total de pontos e os dados usados
    return { totalScore, usedDice };
  }

  // Função para contar a quantidade de dados de cada tipo
  private countDice(diceRoll: number[]): number[] {
    const count = [0, 0, 0, 0, 0, 0, 0]; // Para armazenar a quantidade de 1s, 2s, ..., 6s
    for (const die of diceRoll) {
      count[die]++;
    }
    return count;
  }

  // Função para verificar se há uma sequência de 1-5 ou 2-6
  private isSequence(diceCount: number[]): boolean {
    // Sequência de 1-5
    if (diceCount[1] > 0 && diceCount[2] > 0 && diceCount[3] > 0 && diceCount[4] > 0 && diceCount[5] > 0) {
      return true;
    }
    // Sequência de 2-6
    if (diceCount[2] > 0 && diceCount[3] > 0 && diceCount[4] > 0 && diceCount[5] > 0 && diceCount[6] > 0) {
      return true;
    }
    return false;
  }
}
