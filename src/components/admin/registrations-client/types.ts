// Types shared across the registrations client UI subcomponents.

export interface Registration {
  id: string;
  academyName: string;
  directorName: string;
  directorEmail: string;
  directorPhone: string;
  phone: string;
  address?: string | null;
  district?: string | null;
  desiredPlan: string | null;
  status: string;
  message: string | null;
  reviewNote: string | null;
  createdAt: Date;
  reviewedBy?: { name: string } | null;
}

export interface Plan {
  id: string;
  name: string;
  tier: string;
  monthlyCredits: number;
  monthlyPrice: number;
}

export interface CredentialInfo {
  academyName: string;
  email: string;
  tempPassword: string;
}
