export type Severity = "critical" | "major" | "minor";
export type Status = "open" | "action-items-pending" | "resolved";

export interface Timeline {
  started: string;
  detected: string;
  resolved: string;
}

export interface ActionItem {
  text: string;
  done: boolean;
}

export interface IncidentData {
  summary: string;
  impact: string;
  rootCause: string;
  detectionFailure: string;
  prevention: string;
  severity: Severity;
  status: Status;
  tags: string[];
  timeline: Timeline;
  actionItems: ActionItem[];
}
