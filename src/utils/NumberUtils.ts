import { isNull } from 'util';

export class NumberUtils {
  static countDecimals(value: number) {
    const decimalsMatch = /^\d+\.?([\d]*)$/.exec(`${value}`);
    return isNull(decimalsMatch) ? 0 : decimalsMatch[1].length;
  }
}
