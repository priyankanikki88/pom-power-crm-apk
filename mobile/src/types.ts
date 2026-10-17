/** API shapes shared by the screens — the same fields the web CRM reads (frontend/src/lib/types.ts), trimmed to what the app uses. */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerContact {
  id: string;
  name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface CustomerAddress {
  type: string;
  line1?: string | null;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface CustomerSummary {
  id: string;
  customerCode: string;
  type: string;
  name: string;
  tradeName: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  assignee: { id: string; fullName: string; email: string } | null;
  addresses?: CustomerAddress[];
  contacts?: CustomerContact[];
  /** Set when the customer belongs to another sales person: contact details, street address and notes are withheld. */
  restricted?: boolean;
}

export interface CustomerDetail extends CustomerSummary {
  funnelStage?: string | null;
  altPhone: string | null;
  source: string | null;
  businessSegment: string | null;
  paymentTerms: string | null;
  creditDays: number | null;
  notes: string | null;
}

export type FunnelStage = 'PROSPECT' | 'FOLLOW_UP' | 'INTERESTED' | 'NEGOTIATION' | 'CONVERTED' | 'ACTIVE_CUSTOMER' | 'LOST' | 'ON_HOLD';
export type FollowUpType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'SITE_VISIT' | 'ONLINE_MEETING' | 'OTHER';
export type FollowUpView = 'today' | 'overdue' | 'tomorrow' | 'pending';

export const STAGE_LABEL: Record<FunnelStage, string> = {
  PROSPECT: 'Prospect',
  FOLLOW_UP: 'Follow-up',
  INTERESTED: 'Interested',
  NEGOTIATION: 'Negotiation',
  CONVERTED: 'Converted',
  ACTIVE_CUSTOMER: 'Active Customer',
  LOST: 'Lost',
  ON_HOLD: 'On Hold',
};
export const TYPE_LABEL: Record<FollowUpType, string> = { CALL: 'Call', WHATSAPP: 'WhatsApp', EMAIL: 'Email', MEETING: 'Meeting', SITE_VISIT: 'Site Visit', ONLINE_MEETING: 'Online Meeting', OTHER: 'Other' };

export interface FollowUp {
  id: string;
  scheduledAt: string;
  type: FollowUpType;
  purpose: string | null;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  displayStatus: 'PLANNED' | 'OVERDUE' | 'DONE' | 'CANCELLED';
  outcome: string | null;
  remarks: string | null;
  completedAt: string | null;
  customer: { id: string; name: string; customerCode: string; funnelStage: FunnelStage | null; status: string };
  contact: { id: string; name: string; phone: string | null } | null;
  salesPerson: { id: string; fullName: string };
}

export interface QuotationSummary {
  id: string;
  quotationNo: string;
  status: string;
  quotationDate: string;
  grandTotal: string;
  version: number;
  salesType?: 'PRODUCT' | 'AMC';
  customer: { id: string; customerCode: string; name: string };
}

/** AMC header fields — on every sales document, empty on a product one. */
export interface AmcFields {
  salesType?: 'PRODUCT' | 'AMC';
  amcType?: string | null;
  amcStartDate?: string | null;
  amcEndDate?: string | null;
  siteAddress?: string | null;
  amcRemarks?: string | null;
  amcTerms?: string | null;
  /** A project order: bulk / tender / large commercial order or a complete plant (product sales only). */
  isProject?: boolean;
  projectName?: string | null;
}

export interface QuotationItem {
  id: string;
  productVariantId?: string;
  productCodeSnapshot?: string | null;
  descriptionSnapshot: string;
  productNameSnapshot?: string | null;
  ratingSnapshot?: string | null;
  warrantySnapshot?: string | null;
  qty: string;
  unitPriceSnapshot: string;
  discountPct: string;
  gstRateSnapshot: string;
  lineTotal: string;
}

export interface QuotationDetail extends QuotationSummary, AmcFields {
  /** Set on a revision: the quotation it was copied from. */
  revisionOfId?: string | null;
  validUntil: string | null;
  subject: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  notes: string | null;
  ownerUserId?: string | null;
  freightOverride?: string | null;
  deliveryAddressOverride?: string | null;
  items: QuotationItem[];
  customer: { id: string; customerCode: string; name: string; email: string | null; phone: string | null };
  /** What this quotation was converted to. */
  proformaInvoices: Array<{ id: string; proformaNo: string; status: string }>;
  format4Documents: Array<{ id: string; format4No: string; status: string }>;
}

export interface TargetRow {
  id: string;
  metric: 'SALES_REVENUE' | 'PRODUCT_REVENUE' | 'AMC_REVENUE' | 'SERVICE_TICKETS_CLOSED';
  scopeType: 'USER' | 'BRANCH' | 'COMPANY';
  periodStart: string;
  periodEnd: string;
  amount: number;
  achieved: number;
  achievedPct: number | null;
  period: 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | 'CUSTOM';
  user: { id: string; fullName: string } | null;
  branch: { id: string; name: string } | null;
}

/** What POST /customers answers with (409) when similar customers exist. */
export interface DuplicateMatch {
  level: string;
  reason: string;
  customer: { id: string; customerCode: string; name: string; gstin: string | null; status: string; owner: { id: string; fullName: string } | null };
}

/** A proforma invoice or a Format-4, as the list and detail endpoints return them (the fields the app shows). */
export interface SalesDoc {
  id: string;
  proformaNo?: string;
  format4No?: string;
  status: string;
  approvalStatus?: string;
  sourceType?: string;
  issueDate?: string;
  createdAt: string;
  grandTotal: string;
  version: number;
  customer: { id: string; customerCode: string; name: string };
  quotation: { id: string; quotationNo: string } | null;
  proformaInvoice?: { id: string; proformaNo: string } | null;
}

export interface SalesDocDetail extends SalesDoc, AmcFields {
  revisionReason?: string | null;
  /** Format-4 only: its live (not cancelled / rejected) bills. */
  bills?: Array<{ id: string; billNo: string; status: string }>;
  subtotal: string;
  taxTotal: string;
  validUntil?: string | null;
  freightOverride?: string | null;
  deliveryAddressOverride?: string | null;
  /** Format-4 only: the actual tax invoice number, when raised outside this CRM (e.g. in Tally) instead of through Raise Bill. */
  externalInvoiceNo?: string | null;
  items: QuotationItem[];
  /** Proforma only: the Format-4s made from it. */
  format4Documents?: Array<{ id: string; format4No: string; status: string }>;
}

export interface BillSummary {
  id: string;
  billNo: string;
  status: string;
  billDate: string;
  grandTotal: string;
  version: number;
  customer: { id: string; customerCode: string; name: string };
}

export interface BillDetail extends BillSummary {
  subtotal: string;
  taxTotal: string;
  format4Document: { id: string; format4No: string; route: string };
  items: QuotationItem[];
}

/** The approval of a proforma invoice or a Format-4, with whether the signed-in user may decide it now. */
export interface ApprovalInstance {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  currentUserCanAct: boolean;
  decision: { action: string; actor: { id: string; fullName: string } | null; actedAt: string; displayName: string | null; comments: string | null } | null;
}

export interface PaymentStatus {
  amountPaid: number;
  amountDue: number;
  isPaid: boolean;
}

export interface Payment {
  id: string;
  paymentNo: string;
  amount: string;
  paymentMode: string;
  referenceNo: string | null;
  paymentDate: string;
  allocatedAmount?: string;
}

export interface ProductVariant {
  id: string;
  productCode: string;
  productName: string | null;
  rating: string | null;
  active: boolean;
  model: { name: string };
  /** Current price first; empty when the product has no price yet. */
  priceHistory: Array<{ price: string; currency: string }>;
}

export type MeetingType = 'SALES_VISIT' | 'SENIOR_VISIT' | 'JOINT_VISIT' | 'TECHNICAL_VISIT' | 'MANAGEMENT_MEETING' | 'SITE_VISIT';
export const MEETING_LABEL: Record<MeetingType, string> = {
  SALES_VISIT: 'Sales Visit',
  SENIOR_VISIT: 'Senior Visit',
  JOINT_VISIT: 'Joint Visit',
  TECHNICAL_VISIT: 'Technical Visit',
  MANAGEMENT_MEETING: 'Management Meeting',
  SITE_VISIT: 'Site Visit',
};

export interface TourMeeting {
  id: string;
  customer: { id: string; name: string; customerCode: string } | null;
  prospectName: string | null;
  contactName: string | null;
  mobile: string | null;
  location: string | null;
  purpose: string | null;
  meetingType: MeetingType;
  status: MeetingStatus;
  discussion: string | null;
  interestedIn: string | null;
  expectedDiscussion: string | null;
  seniorRequired: boolean;
  seniorName: string | null;
  remarks: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}
export type MeetingStatus = 'PLANNED' | 'DONE' | 'POSTPONED' | 'CANCELLED';

export interface TourSummary {
  id: string;
  planNo: string;
  tourDate: string;
  location: string;
  purpose: string | null;
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
  salesPerson: { id: string; fullName: string };
  _count?: { meetings: number };
}

export interface TourDetail extends TourSummary {
  remarks: string | null;
  meetings: TourMeeting[];
}

// ---------------------------------------------------------------- service

interface CustomerRef {
  id: string;
  customerCode: string;
  name: string;
}

export interface WarrantyRef {
  id: string;
  serialNo: string | null;
  warrantyStart: string;
  warrantyEnd: string;
  effectiveStatus: 'ACTIVE' | 'EXPIRED' | 'VOIDED';
  daysLeft: number;
}

export interface TicketSummary {
  id: string;
  ticketNo: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING' | 'REVISIT_REQUIRED' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  issueDescription: string;
  serialNo: string | null;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: string;
  customer: CustomerRef;
  productTitle: string | null;
  assignedEngineer: { id: string; name: string; phone: string | null } | null;
  warrantyRecord: WarrantyRef | null;
}

export interface Revisit {
  id: string;
  ticketId: string;
  visitDate: string;
  reason: string;
  remarks: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  nextAction: string | null;
  engineer: { id: string; name: string } | null;
  ticket?: { id: string; ticketNo: string; status: string; customer: CustomerRef };
}

export interface TicketDetail extends TicketSummary {
  reports: Array<{ id: string; workDone: string; reportDate: string; signedBy: string | null; engineer: { id: string; name: string } }>;
  parts: Array<{ id: string; partName: string; partCode: string | null; qty: string; cost: string }>;
  partsTotal: string;
  photos: Array<{ id: string; caption: string | null; stored: boolean }>;
  revisits: Revisit[];
  /** The signed-in user is the assigned engineer (or a coordinator) and may record work. */
  canWork: boolean;
  canCoordinate: boolean;
}

export interface InstallationSummary {
  id: string;
  installationNo: string | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  installationDate: string | null;
  completedAt: string | null;
  serialNo: string | null;
  notes: string | null;
  customer: CustomerRef;
  productTitle: string;
  engineer: { id: string; name: string; phone: string | null } | null;
  address: { line1: string; line2: string | null; city: string; state: string; pincode: string } | null;
}

export interface InstallationDetail extends InstallationSummary {
  signedBy: string | null;
  warrantyRecords: WarrantyRef[];
  warrantyDefault: { months: number; label: string } | null;
  canWork: boolean;
  canCoordinate: boolean;
}

export type SurveyType = 'PRE_INSTALLATION' | 'PRE_QUOTATION' | 'BUSINESS_PROPOSAL' | 'TECHNICAL_FEASIBILITY' | 'REPLACEMENT' | 'EXPANSION' | 'OTHER';
export const SURVEY_LABEL: Record<SurveyType, string> = {
  PRE_INSTALLATION: 'Pre-installation',
  PRE_QUOTATION: 'Pre-quotation',
  BUSINESS_PROPOSAL: 'Business Proposal',
  TECHNICAL_FEASIBILITY: 'Technical Feasibility',
  REPLACEMENT: 'Replacement',
  EXPANSION: 'Expansion',
  OTHER: 'Other',
};

export interface SiteSurvey {
  id: string;
  surveyNo: string;
  siteAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  surveyDate: string;
  surveyType: SurveyType;
  purpose: string | null;
  requirement: string | null;
  technicalRemarks: string | null;
  recommendedProductText: string | null;
  recommendedProductTitle: string | null;
  estimatedCapacity: string | null;
  nextAction: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  customer: CustomerRef;
  engineer: { id: string; name: string } | null;
  files?: Array<{ id: string; fileName: string; mimeType: string; caption: string | null }>;
  canWork?: boolean;
}

export interface WarrantySummary extends WarrantyRef {
  terms: string | null;
  endCustomerName?: string | null;
  customer: CustomerRef;
  productTitle: string;
  installation: { id: string; installationNo: string | null } | null;
}
