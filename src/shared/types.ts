export interface SleepMetrics {
  '30-average': string;
  'score': string;
  'all-time-best': string;
  'message': string;
  'heartRateMsg': string;
  'heartRateVariabilityMsg': string;
  'breathRateMsg': string;
  // Legacy fields (keeping for backward compatibility during transition)
  date?: string;
  sleepScore?: number;
  durationMinutes?: number;
  timeInBedMinutes?: number;
  restfulMinutes?: number;
  restlessMinutes?: number;
  awakeMinutes?: number;
  heartRateAvg?: number;
  respirationRateAvg?: number;
  outOfBedCount?: number;
  raw?: any;
}

export interface SleepDataBySleeper {
  rafa: SleepMetrics;
  miki: SleepMetrics;
}

export interface SleepIQCredentials {
  username: string;
  password: string;
}

export interface ScraperOptions {
  headless?: boolean;
  timeout?: number;
  debug?: boolean;
}