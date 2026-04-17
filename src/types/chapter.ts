export interface Chapter {
  id: string;
  name: string;
  description: string;
  school?: string;
  category: string;
  adminId: string;
  adminName: string;
  isRegistrationOpen: boolean;
  memberCount: number;
  maxMembers?: number;
  requirements: string[];
  benefits: string[];
  meetingSchedule: string;
  contactEmail: string;
  imageUrl?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChapterRegistration {
  id: string;
  studentId: string;
  chapterId: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  approvedAt?: string;
  notes?: string;
}

export interface ChapterProfile {
  chapterId: string;
  about?: string;
  mission?: string;
  vision?: string;
  posterImageUrl?: string;
  galleryImageUrls?: string[];
  highlights?: string[];
  achievements?: string[];
  socialLinks?: { [key: string]: string };
  contact?: string;
  activeFrom?: string;
  updatedBy?: string;
  updatedAt?: string;
}
