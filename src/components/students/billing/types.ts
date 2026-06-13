export interface StudentPayment {
  id: string;
  amount: number;
  method: string;
  paidAt: string | Date;
  memo: string | null;
}

export interface StudentInvoice {
  id: string;
  title: string;
  amount: number;
  discount: number;
  finalAmount: number;
  status: string;
  dueDate: string | Date;
  paidDate: string | Date | null;
  memo: string | null;
  createdAt: string | Date;
  payments: StudentPayment[];
}
