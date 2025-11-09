
export enum TransactionType {
  Income = 'E',
  Expense = 'U',
}

export interface Transaction {
  id: number;
  type: TransactionType;
  description: string;
  amount: number;
  date: string;
  source: 'manual' | 'calendar';
  calendarEventId?: string;
}

export interface GapiCredentials {
  clientId: string;
  apiKey: string;
}

export interface ColorMapping {
  colorId: string;
  description: string;
  amount: number;
  type: TransactionType;
}

export interface AppSettings {
    colorMappings: ColorMapping[];
    lastSync?: string;
}

export type Page = 'home' | 'income' | 'expenses' | 'stats' | 'settings';
