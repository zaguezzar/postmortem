export type Severity = "critical" | "major" | "minor";

export interface IncidentData {
  summary: string;
  impact: string;
  rootCause: string;
  detectionFailure: string;
  prevention: string;
  severity: Severity;
  tags: string[];
}
