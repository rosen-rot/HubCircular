import type { DataOrigin } from "./filters";

export interface Kpis {
  capturedG: number;
  weighings: number;
  contaminated: number;
  dispatchedG: number;
  dispatchedConfirmedG: number;
  dispatchedRejectedG: number;
  dispatchedPendingG: number;
  dispatchedPendingNoEvidenceG: number;
  reusedG: number;
  reusedBackedG: number;
  rejectedG: number;
  adjustInG: number;
  adjustOutG: number;
  transferInG: number;
  transferOutG: number;
  openingG: number;
  closingG: number;
  currentG: number;
}

export interface WeeklyRow {
  weekStart: string;
  materialId: string;
  materialName: string;
  capturedG: number;
  weighings: number;
}

export interface ContainerInfo {
  id: string;
  code: string;
  materialName: string;
  zoneName: string;
  dataOrigin: DataOrigin;
}
