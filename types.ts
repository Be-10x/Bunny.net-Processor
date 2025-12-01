export enum AppState {
  IDLE = 'IDLE',
  PROCESSING_CHAPTERS = 'PROCESSING_CHAPTERS',
  PROCESSING_CAPTIONS = 'PROCESSING_CAPTIONS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface ChapterResult {
  humanReadable: string; // The "Part 1" output
  csvContent: string;    // The "Part 2" output
}

export interface CaptionResult {
  srtContent: string;
}

export interface ProcessorState {
  file: File | null;
  fileContent: string | null;
  status: AppState;
  errorMessage: string | null;
  chapterResult: ChapterResult | null;
  captionResult: CaptionResult | null;
}

export interface BunnyChapter {
  title: string;
  start: number;
  end: number;
}

export interface BunnyConfig {
  apiKey: string;
  libraryId: string;
  videoId: string;
}

export enum BunnyStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}