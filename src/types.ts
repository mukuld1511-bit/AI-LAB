export interface PCStatus {
  pc_id: string;
  status: 'free' | 'occupied';
  occupied_by: string | null;
  since_time: string | null;
}

export interface AttendanceLog {
  id: number;
  name: string;
  is_known: boolean;
  image_path: string | null;
  in_time: string | null;
  out_time: string | null;
  date: string;
}

export interface UnknownFace {
  id: string;
  image_path: string;
  date: string;
  timestamp: string;
  filename: string;
  thumbnailUrl?: string;
}

export interface EnrolledPerson {
  name: string;
  enrolledAt: string;
  photoUrl?: string;
}
