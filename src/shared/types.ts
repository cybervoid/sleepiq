export interface SleepMetrics {
  date: string;
  sleepScore?: number;
  durationMinutes?: number;
  timeInBedMinutes?: number;
  restfulMinutes?: number;
  restlessMinutes?: number;
  awakeMinutes?: number;
  heartRateAvg?: number;
  respirationRateAvg?: number;
  outOfBedCount?: number;
  raw?: any; // For storing raw response data
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