import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class DiceService {
  roll(count: number): number[] {
    return Array(count)
      .fill(0)
      .map(() => Math.floor(Math.random() * 6) + 1);
  }
}
