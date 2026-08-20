import type { Printer } from './Printer';
import { EpsonPrinter } from './EpsonPrinter';
import { StarPrinter } from './StarPrinter';
import { BixolonPrinter } from './BixolonPrinter';

export type { Printer, PrinterStatus } from './Printer';

export function createPrinter(brand: 'epson' | 'star' | 'bixolon', host: string, port: number): Printer {
  switch (brand) {
    case 'epson':
      return new EpsonPrinter(host, port);
    case 'star':
      return new StarPrinter(host, port);
    case 'bixolon':
      return new BixolonPrinter(host, port);
  }
}
