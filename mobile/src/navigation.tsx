import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './auth/AuthContext';
import { api } from './lib/api';
import { AttendanceBoardScreen } from './screens/AttendanceBoardScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { MyServiceJobsScreen } from './screens/MyServiceJobsScreen';
import { ChangePasswordScreen } from './screens/ChangePasswordScreen';
import { ExpenseDetailScreen, ExpenseFormScreen, ExpensesScreen } from './screens/ExpenseScreens';
import { CustomerDetailScreen } from './screens/CustomerDetailScreen';
import { CustomerFormScreen } from './screens/CustomerFormScreen';
import { CustomersScreen } from './screens/CustomersScreen';
import { FollowUpDetailScreen } from './screens/FollowUpDetailScreen';
import { FollowUpFormScreen } from './screens/FollowUpFormScreen';
import { FollowUpsScreen } from './screens/FollowUpsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { LeadActivityFormScreen, LeadDetailScreen, LeadFormScreen, LeadsScreen } from './screens/LeadScreens';
import { CardScanScreen } from './screens/CardScanScreen';
import type { CardData } from './lib/cardScan';
import { B2CCaseDetailScreen, B2CCaseFormScreen, B2CCasesScreen, DiscomFormScreen, DiscomsScreen } from './screens/DiscomScreens';
import { LeaveFormScreen, LeaveScreen } from './screens/LeaveScreens';
import { MeetingDetailScreen, MeetingFormScreen, MeetingsScreen } from './screens/MeetingScreens';
import { MoreScreen } from './screens/MoreScreen';
import { OrderDetailScreen, OrdersScreen } from './screens/OrderScreens';
import { NotificationsScreen, useUnreadNotifications } from './screens/NotificationsScreen';
import { OutboxScreen } from './screens/OutboxScreen';
import { BillDetailScreen } from './screens/BillDetailScreen';
import { DocDetailScreen } from './screens/DocDetailScreen';
import { QuotationDetailScreen } from './screens/QuotationDetailScreen';
import { QuotationFormScreen } from './screens/QuotationFormScreen';
import { TourDetailScreen, TourFormScreen, ToursScreen } from './screens/ToursScreens';
import { QuotationsScreen } from './screens/QuotationsScreen';
import { InstallationDetailScreen, SurveyDetailScreen, SurveyFormScreen } from './screens/FieldJobScreens';
import { ServiceScreen } from './screens/ServiceScreen';
import { TargetsScreen } from './screens/TargetsScreen';
import { TaskDetailScreen, TaskFormScreen, TasksScreen, type TaskView } from './screens/TasksScreens';
import { TicketDetailScreen, TicketFormScreen } from './screens/TicketScreens';
import { ProductsScreen } from './screens/ProductsScreen';
import { ProductDetailScreen } from './screens/ProductDetailScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ChatThreadScreen } from './screens/ChatThreadScreen';
import { ReportsScreen, ReportViewerScreen } from './screens/ReportsScreen';
import { SalesDashboardScreen } from './screens/SalesDashboardScreen';
import { SalesHomeScreen } from './screens/SalesHomeScreen';
import { TeamManagementScreen } from './screens/TeamManagementScreen';
import { CampaignDetailScreen, CampaignFormScreen, CampaignsScreen } from './screens/CampaignScreens';
import { EmailCampaignDetailScreen, EmailCampaignFormScreen, EmailCampaignsScreen } from './screens/EmailCampaignScreens';
import { ServiceEngineerHomeScreen } from './screens/ServiceEngineerHomeScreen';
import { ServiceEngineerDashboardScreen } from './screens/ServiceEngineerDashboardScreen';
import { ServiceEngineerProfileScreen } from './screens/ServiceEngineerProfileScreen';
import { SparePartsFormScreen, SparePartsScreen } from './screens/SparePartsScreen';
import { MdHomeScreen } from './screens/MdHomeScreen';
import { MdReportsMenuScreen } from './screens/MdReportsMenuScreen';
import { MdSalesReportScreen } from './screens/MdSalesReportScreen';
import { MdTopEmployeesScreen } from './screens/MdTopEmployeesScreen';
import { MdTargetAchievementScreen } from './screens/MdTargetAchievementScreen';
import { MdPipelineScreen } from './screens/MdPipelineScreen';
import { MdExpenseSummaryScreen } from './screens/MdExpenseSummaryScreen';
import { MdAttendanceOverviewScreen } from './screens/MdAttendanceOverviewScreen';
import { MdServiceSummaryScreen } from './screens/MdServiceSummaryScreen';
import { MdApprovalCenterScreen } from './screens/MdApprovalCenterScreen';
import { ServiceHeadHomeScreen } from './screens/ServiceHeadHomeScreen';
import { ServiceHeadVisitsScreen } from './screens/ServiceHeadVisitsScreen';
import { ServiceHeadTechTeamScreen } from './screens/ServiceHeadTechTeamScreen';
import { ServiceHeadReportsMenuScreen } from './screens/ServiceHeadReportsMenuScreen';
import { ServiceHeadSlaScreen } from './screens/ServiceHeadSlaScreen';
import { ServiceHeadApprovalsScreen } from './screens/ServiceHeadApprovalsScreen';
import { HrHomeScreen } from './screens/HrHomeScreen';
import { HrEmployeesScreen, HrEmployeeDetailScreen } from './screens/HrEmployeesScreen';
import { HrApprovalsScreen } from './screens/HrApprovalsScreen';
import { JobOpeningsScreen, JobOpeningDetailScreen, JobOpeningFormScreen, JobApplicationFormScreen } from './screens/RecruitmentScreens';
import { TrainingSessionsScreen, TrainingSessionDetailScreen, TrainingSessionFormScreen } from './screens/TrainingScreens';
import { AppraisalsScreen, AppraisalDetailScreen, AppraisalFormScreen } from './screens/PerformanceScreens';
import { brand, colors } from './theme';

export type CustomersStackParams = {
  CustomerList: undefined;
  CustomerDetail: { id: string; name: string };
  /** No id = add a customer. `fromLead` prefills the new-customer form when opened via Leads → "Convert to Customer". */
  CustomerForm: { id?: string; fromLead?: { name: string; contactName: string; phone?: string; email?: string } } | undefined;
};
export type FollowUpsStackParams = {
  FollowUpList: undefined;
  FollowUpDetail: { id: string };
  /** `customer` is fixed when the form was opened from that customer's page. */
  FollowUpForm: { customer?: { id: string; name: string } };
};
export type QuotationsStackParams = {
  QuotationList: undefined;
  QuotationDetail: { id: string; no: string };
  /**
   * The sales document form. `customer` is fixed when it was opened from that customer's page; `mode` picks what is made
   * (a quotation unless said otherwise); `editId` edits that draft quotation instead of making a new document.
   */
  QuotationForm: { customer?: { id: string; name: string }; mode?: 'QUOTATION' | 'PROFORMA' | 'FORMAT4'; salesType?: 'PRODUCT' | 'AMC'; editId?: string } | undefined;
  /** A proforma invoice or a Format-4. `notice` is shown once at the top (e.g. a payment that could not be recorded). */
  DocDetail: { kind: 'PROFORMA' | 'FORMAT4'; id: string; no: string; notice?: string };
  BillDetail: { id: string; no: string };
};
export type ServiceStackParams = {
  ServiceHome: undefined;
  TicketDetail: { id: string; no: string };
  TicketForm: undefined;
  InstallationDetail: { id: string; no: string };
  SurveyDetail: { id: string; no: string };
  SurveyForm: undefined;
};
export type MoreStackParams = {
  MoreHome: undefined;
  Notifications: undefined;
  Outbox: undefined;
  Targets: undefined;
  Tours: undefined;
  TourDetail: { id: string; no: string };
  /** No id = plan a new tour; with an id, edit that plan. */
  TourForm: { id?: string } | undefined;
  Attendance: undefined;
  Leave: undefined;
  LeaveForm: undefined;
  AttendanceBoard: undefined;
  TeamManagement: undefined;
  Campaigns: undefined;
  CampaignDetail: { id: string; name: string };
  /** No id = add a campaign. */
  CampaignForm: { id?: string } | undefined;
  EmailCampaigns: undefined;
  EmailCampaignDetail: { id: string; subject: string };
  EmailCampaignForm: undefined;
  Reports: undefined;
  ReportViewer: { id: string; title: string };
  ServiceEngineerHome: undefined;
  ServiceEngineerDashboard: undefined;
  ServiceEngineerProfile: undefined;
  SpareParts: undefined;
  SparePartsForm: undefined;
  Meetings: undefined;
  MeetingForm: undefined;
  MeetingDetail: { id: string; title: string };
  Orders: undefined;
  OrderDetail: { id: string; no: string };
  Expenses: undefined;
  ExpenseDetail: { id: string; no: string };
  ExpenseForm: undefined;
  Tasks: undefined;
  /** `view` is the list the task was opened from (the detail reads it from that list). */
  TaskDetail: { id: string; view: TaskView; title: string };
  TaskForm: undefined;
  Leads: undefined;
  LeadDetail: { id: string };
  /** No id = add a lead. */
  LeadForm: { id?: string } | undefined;
  /** Hands the scanned card back to whoever opened this screen. */
  CardScan: { onScanned: (card: CardData) => void };
  /** No id = schedule a new follow-up / event. */
  LeadActivityForm: { id?: string } | undefined;
  B2CCases: undefined;
  B2CCaseForm: undefined;
  B2CCaseDetail: { id: string; caseNo: string };
  Discoms: undefined;
  DiscomForm: undefined;
};

/**
 * The Sales role's own "Dashboard" tab: the Sales Home (action grid) and Sales Dashboard (stats/chart), plus every
 * screen its tiles / stat cards lead to — reused straight from the stacks above rather than duplicated. A Sales-role
 * user sees a 4-tab layout (Dashboard / Follow-up / Product / Service Status) instead of the usual one; see AppTabs.
 */
export type SalesStackParams = {
  SalesHome: undefined;
  SalesDashboard: undefined;
  Reports: undefined;
  ReportViewer: { id: string; title: string };
  Chat: undefined;
  ChatThread: { id: string; name: string };
} & Pick<CustomersStackParams, 'CustomerList' | 'CustomerDetail' | 'CustomerForm'> &
  Pick<QuotationsStackParams, 'QuotationList' | 'QuotationDetail' | 'QuotationForm' | 'DocDetail' | 'BillDetail'> &
  Pick<MoreStackParams, 'Expenses' | 'ExpenseDetail' | 'ExpenseForm' | 'Targets' | 'Tours' | 'TourDetail' | 'TourForm' | 'Leads' | 'LeadDetail' | 'LeadForm' | 'CardScan' | 'LeadActivityForm' | 'Attendance' | 'Notifications' | 'TeamManagement' | 'Campaigns' | 'CampaignDetail' | 'CampaignForm' | 'EmailCampaigns' | 'EmailCampaignDetail' | 'EmailCampaignForm'>;
export type ProductsStackParams = { ProductList: undefined; ProductDetail: { id: string } };

/** The MD / CEO role's own screens — Home, the Sales Report family, Top Employees, Target Achievement, Sales Pipeline,
 * and the Expense / Attendance / Service / Approval tabs. Reports is its own small stack (a menu, then one of four
 * screens); every other tab here is a single screen with its own native header. */
export type MdStackParams = {
  MdHome: undefined;
  MdReportsMenu: undefined;
  MdSalesReport: undefined;
  MdTopEmployees: undefined;
  MdTargetAchievement: undefined;
  MdPipeline: undefined;
  MdExpenseSummary: undefined;
  MdAttendanceOverview: undefined;
  MdServiceSummary: undefined;
  MdApprovalCenter: undefined;
};

/** The Service Head role's own screens — Home, Visits, Tech Team, Reports (SLA & Performance, Approval Center, and the
 * generic Reports catalogue). Tickets reuses ServiceNavigator wholesale (a Service Head is a coordinator, same scope
 * as the "Service" role, via service.all_records); More reuses MoreNavigator, same as every other role. */
export type ServiceHeadStackParams = {
  ServiceHeadHome: undefined;
  ServiceHeadVisits: undefined;
  ServiceHeadTechTeam: undefined;
  ServiceHeadReportsMenu: undefined;
  ServiceHeadSla: undefined;
  ServiceHeadApprovals: undefined;
} & Pick<MoreStackParams, 'Reports' | 'ReportViewer'>;

/** The HR Head role's own screens — Home, Employees (list + detail), and the expense-claim Approval Center. Attendance
 * reuses MdAttendanceOverviewScreen directly (same company-wide data, same report.attendance permission this role
 * already holds); Leave reuses the existing Leave screen wholesale (it already has its own Approve/Reject queue,
 * gated on attendance.manage — which this oversight-only role doesn't hold, so it renders read-only here, same as
 * any other role without that permission); More reuses MoreNavigator, same as every other role's "More" tab. */
export type HrStackParams = {
  HrHome: undefined;
  HrEmployees: undefined;
  HrEmployeeDetail: { id: string; name: string };
  HrAttendance: undefined;
  HrApprovals: undefined;
  JobOpenings: undefined;
  JobOpeningDetail: { id: string; title: string };
  JobOpeningForm: { id?: string } | undefined;
  JobApplicationForm: { jobOpeningId: string };
  TrainingSessions: undefined;
  TrainingSessionDetail: { id: string; title: string };
  TrainingSessionForm: { id?: string } | undefined;
  Appraisals: undefined;
  AppraisalDetail: { id: string; name: string };
  AppraisalForm: undefined;
} & Pick<MoreStackParams, 'Leave' | 'LeaveForm'>;

const Tabs = createBottomTabNavigator();
const CustomersStack = createNativeStackNavigator<CustomersStackParams>();
const FollowUpsStack = createNativeStackNavigator<FollowUpsStackParams>();
const QuotationsStack = createNativeStackNavigator<QuotationsStackParams>();
const ServiceStack = createNativeStackNavigator<ServiceStackParams>();
const MoreStack = createNativeStackNavigator<MoreStackParams>();
const SalesStack = createNativeStackNavigator<SalesStackParams>();
const ProductsStack = createNativeStackNavigator<ProductsStackParams>();
const ServiceEngineerHomeStack = createNativeStackNavigator<MoreStackParams>();
const ServiceEngineerReportsStack = createNativeStackNavigator<MoreStackParams>();
const ServiceEngineerDashboardStack = createNativeStackNavigator<MoreStackParams>();
const ServiceEngineerProfileStack = createNativeStackNavigator<MoreStackParams>();
const MdHomeStack = createNativeStackNavigator<MdStackParams>();
const MdReportsStack = createNativeStackNavigator<MdStackParams>();
const MdExpenseStack = createNativeStackNavigator<MdStackParams>();
const MdAttendanceStack = createNativeStackNavigator<MdStackParams>();
const MdServiceStack = createNativeStackNavigator<MdStackParams>();
const MdApprovalStack = createNativeStackNavigator<MdStackParams>();
const ServiceHeadHomeStack = createNativeStackNavigator<ServiceHeadStackParams>();
const ServiceHeadVisitsStack = createNativeStackNavigator<ServiceHeadStackParams>();
const ServiceHeadTechTeamStack = createNativeStackNavigator<ServiceHeadStackParams>();
const ServiceHeadReportsStack = createNativeStackNavigator<ServiceHeadStackParams>();
const HrHomeStack = createNativeStackNavigator<HrStackParams>();
const HrEmployeesStack = createNativeStackNavigator<HrStackParams>();
const HrAttendanceStack = createNativeStackNavigator<HrStackParams>();
const HrLeaveStack = createNativeStackNavigator<HrStackParams>();

const header = { headerStyle: { backgroundColor: colors.navy }, headerTintColor: '#ffffff', headerTitleStyle: { fontWeight: '700' as const } };

function CustomersNavigator() {
  return (
    <CustomersStack.Navigator screenOptions={header}>
      <CustomersStack.Screen name="CustomerList" component={CustomersScreen} options={{ title: 'Customers' }} />
      <CustomersStack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={({ route }) => ({ title: route.params.name })} />
      <CustomersStack.Screen name="CustomerForm" component={CustomerFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Customer' : 'Add Customer' })} />
    </CustomersStack.Navigator>
  );
}

function FollowUpsNavigator() {
  return (
    <FollowUpsStack.Navigator screenOptions={header}>
      <FollowUpsStack.Screen name="FollowUpList" component={FollowUpsScreen} options={{ title: 'Follow-ups' }} />
      <FollowUpsStack.Screen name="FollowUpDetail" component={FollowUpDetailScreen} options={{ title: 'Follow-up' }} />
      <FollowUpsStack.Screen name="FollowUpForm" component={FollowUpFormScreen} options={{ title: 'Plan Follow-up' }} />
    </FollowUpsStack.Navigator>
  );
}

function QuotationsNavigator() {
  return (
    <QuotationsStack.Navigator screenOptions={header}>
      <QuotationsStack.Screen name="QuotationList" component={QuotationsScreen} options={{ title: 'Sales Documents' }} />
      <QuotationsStack.Screen name="QuotationDetail" component={QuotationDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <QuotationsStack.Screen name="QuotationForm" component={QuotationFormScreen} options={{ title: 'New Quotation' }} />
      <QuotationsStack.Screen name="DocDetail" component={DocDetailScreen} options={({ route }) => ({ title: route.params.no || (route.params.kind === 'PROFORMA' ? 'Proforma Invoice' : 'Format-4') })} />
      <QuotationsStack.Screen name="BillDetail" component={BillDetailScreen} options={({ route }) => ({ title: route.params.no || 'Bill' })} />
    </QuotationsStack.Navigator>
  );
}

/**
 * A field engineer sees their own job list (MyServiceJobsScreen, matching the Service Engineer app mockup); a
 * coordinator keeps the existing multi-kind Service screen (tickets/installations/revisits/surveys/warranty). Reuses
 * the same ['service','summary'] query HomeScreen.tsx already makes, so this costs no extra request in practice.
 */
function ServiceHomeRouter(props: NativeStackScreenProps<ServiceStackParams, 'ServiceHome'>) {
  const { data, refetch } = useQuery({ queryKey: ['service', 'summary'], queryFn: () => api.get<{ coordinator: boolean }>('/service/summary') });
  // Whether this account is a coordinator can change (an admin reassigning its role) without the app ever being
  // closed; re-check every time this tab is looked at, not just on its first mount, which tab screens otherwise skip.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  if (data && !data.coordinator) return <MyServiceJobsScreen {...props} />;
  return <ServiceScreen {...props} />;
}

function ServiceNavigator() {
  return (
    <ServiceStack.Navigator screenOptions={header}>
      <ServiceStack.Screen name="ServiceHome" component={ServiceHomeRouter} options={{ title: 'Service' }} />
      <ServiceStack.Screen name="TicketDetail" component={TicketDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <ServiceStack.Screen name="TicketForm" component={TicketFormScreen} options={{ title: 'Log Complaint' }} />
      <ServiceStack.Screen name="InstallationDetail" component={InstallationDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <ServiceStack.Screen name="SurveyDetail" component={SurveyDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <ServiceStack.Screen name="SurveyForm" component={SurveyFormScreen} options={{ title: 'Plan Site Survey' }} />
    </ServiceStack.Navigator>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={header}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ title: 'More' }} />
      <MoreStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <MoreStack.Screen name="Outbox" component={OutboxScreen} options={{ title: 'Waiting to Send' }} />
      <MoreStack.Screen name="Targets" component={TargetsScreen} options={{ title: 'Targets' }} />
      <MoreStack.Screen name="Tours" component={ToursScreen} options={{ title: 'Tour Plans' }} />
      <MoreStack.Screen name="TourDetail" component={TourDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <MoreStack.Screen name="TourForm" component={TourFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Tour Plan' : 'Plan Tour' })} />
      <MoreStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <MoreStack.Screen name="Leave" component={LeaveScreen} options={{ title: 'Leave' }} />
      <MoreStack.Screen name="LeaveForm" component={LeaveFormScreen} options={{ title: 'Apply for Leave' }} />
      <MoreStack.Screen name="AttendanceBoard" component={AttendanceBoardScreen} options={{ title: 'Team Attendance' }} />
      <MoreStack.Screen name="TeamManagement" component={TeamManagementScreen} options={{ title: 'My Team' }} />
      <MoreStack.Screen name="Campaigns" component={CampaignsScreen} options={{ title: 'Marketing Campaigns' }} />
      <MoreStack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={({ route }) => ({ title: route.params.name })} />
      <MoreStack.Screen name="CampaignForm" component={CampaignFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Campaign' : 'New Campaign' })} />
      <MoreStack.Screen name="EmailCampaigns" component={EmailCampaignsScreen} options={{ title: 'Emailer' }} />
      <MoreStack.Screen name="EmailCampaignDetail" component={EmailCampaignDetailScreen} options={({ route }) => ({ title: route.params.subject })} />
      <MoreStack.Screen name="EmailCampaignForm" component={EmailCampaignFormScreen} options={{ title: 'New Email' }} />
      <MoreStack.Screen name="MeetingForm" component={MeetingFormScreen} options={{ title: 'New Meeting' }} />
      <MoreStack.Screen name="Meetings" component={MeetingsScreen} options={{ title: 'Meetings' }} />
      <MoreStack.Screen name="MeetingDetail" component={MeetingDetailScreen} options={({ route }) => ({ title: route.params.title })} />
      <MoreStack.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders & Dispatch' }} />
      <MoreStack.Screen name="OrderDetail" component={OrderDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <MoreStack.Screen name="Expenses" component={ExpensesScreen} options={{ title: 'My Expenses' }} />
      <MoreStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <MoreStack.Screen name="ExpenseForm" component={ExpenseFormScreen} options={{ title: 'New Expense' }} />
      <MoreStack.Screen name="Tasks" component={TasksScreen} options={{ title: 'Tasks' }} />
      <MoreStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task' }} />
      <MoreStack.Screen name="TaskForm" component={TaskFormScreen} options={{ title: 'Give Tasks' }} />
      <MoreStack.Screen name="Leads" component={LeadsScreen} options={{ title: 'Leads' }} />
      <MoreStack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ title: 'Lead' }} />
      <MoreStack.Screen name="LeadForm" component={LeadFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Lead' : 'Add Lead' })} />
      <MoreStack.Screen name="CardScan" component={CardScanScreen} options={{ title: 'Scan Visiting Card', headerShown: false }} />
      <MoreStack.Screen name="LeadActivityForm" component={LeadActivityFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Activity' : 'Schedule Follow-up / Event' })} />
      <MoreStack.Screen name="B2CCases" component={B2CCasesScreen} options={{ title: 'B2C Cases' }} />
      <MoreStack.Screen name="B2CCaseForm" component={B2CCaseFormScreen} options={{ title: 'Open a B2C Case' }} />
      <MoreStack.Screen name="B2CCaseDetail" component={B2CCaseDetailScreen} options={({ route }) => ({ title: route.params.caseNo })} />
      <MoreStack.Screen name="Discoms" component={DiscomsScreen} options={{ title: 'Discom Master' }} />
      <MoreStack.Screen name="DiscomForm" component={DiscomFormScreen} options={{ title: 'Add Discom' }} />
    </MoreStack.Navigator>
  );
}

function SalesNavigator() {
  return (
    <SalesStack.Navigator screenOptions={header}>
      <SalesStack.Screen name="SalesHome" component={SalesHomeScreen} options={{ headerShown: false }} />
      <SalesStack.Screen name="SalesDashboard" component={SalesDashboardScreen} options={{ headerShown: false }} />
      <SalesStack.Screen name="CustomerList" component={CustomersScreen} options={{ title: 'Customers' }} />
      <SalesStack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={({ route }) => ({ title: route.params.name })} />
      <SalesStack.Screen name="CustomerForm" component={CustomerFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Customer' : 'Add Customer' })} />
      <SalesStack.Screen name="QuotationList" component={QuotationsScreen} options={{ title: 'Sales Documents' }} />
      <SalesStack.Screen name="QuotationDetail" component={QuotationDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <SalesStack.Screen name="QuotationForm" component={QuotationFormScreen} options={{ title: 'New Quotation' }} />
      <SalesStack.Screen name="DocDetail" component={DocDetailScreen} options={({ route }) => ({ title: route.params.no || (route.params.kind === 'PROFORMA' ? 'Proforma Invoice' : 'Format-4') })} />
      <SalesStack.Screen name="BillDetail" component={BillDetailScreen} options={({ route }) => ({ title: route.params.no || 'Bill' })} />
      <SalesStack.Screen name="Expenses" component={ExpensesScreen} options={{ title: 'My Expenses' }} />
      <SalesStack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <SalesStack.Screen name="ExpenseForm" component={ExpenseFormScreen} options={{ title: 'New Expense' }} />
      <SalesStack.Screen name="Targets" component={TargetsScreen} options={{ title: 'Targets' }} />
      <SalesStack.Screen name="Tours" component={ToursScreen} options={{ title: 'Tour Plans' }} />
      <SalesStack.Screen name="TourDetail" component={TourDetailScreen} options={({ route }) => ({ title: route.params.no })} />
      <SalesStack.Screen name="TourForm" component={TourFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Tour Plan' : 'Plan Tour' })} />
      <SalesStack.Screen name="Leads" component={LeadsScreen} options={{ title: 'Leads' }} />
      <SalesStack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ title: 'Lead' }} />
      <SalesStack.Screen name="LeadForm" component={LeadFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Lead' : 'Add Lead' })} />
      <SalesStack.Screen name="CardScan" component={CardScanScreen} options={{ title: 'Scan Visiting Card', headerShown: false }} />
      <SalesStack.Screen name="LeadActivityForm" component={LeadActivityFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Activity' : 'Schedule Follow-up / Event' })} />
      <SalesStack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
      <SalesStack.Screen name="TeamManagement" component={TeamManagementScreen} options={{ title: 'My Team' }} />
      <SalesStack.Screen name="Campaigns" component={CampaignsScreen} options={{ title: 'Marketing Campaigns' }} />
      <SalesStack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={({ route }) => ({ title: route.params.name })} />
      <SalesStack.Screen name="CampaignForm" component={CampaignFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Campaign' : 'New Campaign' })} />
      <SalesStack.Screen name="EmailCampaigns" component={EmailCampaignsScreen} options={{ title: 'Emailer' }} />
      <SalesStack.Screen name="EmailCampaignDetail" component={EmailCampaignDetailScreen} options={({ route }) => ({ title: route.params.subject })} />
      <SalesStack.Screen name="EmailCampaignForm" component={EmailCampaignFormScreen} options={{ title: 'New Email' }} />
      <SalesStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <SalesStack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
      <SalesStack.Screen name="ReportViewer" component={ReportViewerScreen} options={({ route }) => ({ title: route.params.title })} />
      <SalesStack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <SalesStack.Screen name="ChatThread" component={ChatThreadScreen} options={({ route }) => ({ title: route.params.name })} />
    </SalesStack.Navigator>
  );
}

function ProductsNavigator() {
  return (
    <ProductsStack.Navigator screenOptions={header}>
      <ProductsStack.Screen name="ProductList" component={ProductsScreen} options={{ title: 'Products' }} />
      <ProductsStack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product' }} />
    </ProductsStack.Navigator>
  );
}

/** Text glyph tab icons — no icon font to load, and each tab always carries its label too. */
const tabIcon = (glyph: string) =>
  function TabIcon({ color }: { color: string }) {
    return <Text style={[styles.glyph, { color }]}>{glyph}</Text>;
  };

let handledTap: string | null = null;

/**
 * A push that arrives while the app is open refreshes the unread count; tapping one (open or closed) opens
 * Notifications, on whichever tab carries that screen — "More" for the usual tab set, "Dashboard" for Sales role.
 */
function usePushNavigation(notificationsTab: string = 'More') {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const qc = useQueryClient();
  const tapped = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => void qc.invalidateQueries({ queryKey: ['notifications'] }));
    return () => sub.remove();
  }, [qc]);
  useEffect(() => {
    // Each tap is acted on once, also when this screen is mounted again (signing in again keeps the last tap around).
    const tapId = tapped?.notification.request.identifier;
    if (!tapId || tapId === handledTap) return;
    handledTap = tapId;
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    navigation.navigate(notificationsTab, { screen: 'Notifications', initial: false });
  }, [tapped, navigation, qc, notificationsTab]);
}

function AppTabs() {
  const { hasPermission } = useAuth();
  const unread = useUnreadNotifications();
  usePushNavigation();
  return (
    <Tabs.Navigator screenOptions={{ ...header, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarLabelStyle: styles.tabLabel }}>
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'My Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: tabIcon('⌂'),
          headerRight: () => (
            // `initial: false` keeps the More page underneath, so Back from Notifications goes there.
            <Pressable style={styles.bell} onPress={() => navigation.navigate('More', { screen: 'Notifications', initial: false })} hitSlop={10} accessibilityRole="button" accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
              <Text style={styles.bellText}>{unread > 0 ? `Alerts (${unread > 99 ? '99+' : unread})` : 'Alerts'}</Text>
            </Pressable>
          ),
        })}
      />
      {hasPermission('customer.read') ? <Tabs.Screen name="Customers" component={CustomersNavigator} options={{ headerShown: false, tabBarIcon: tabIcon('☰') }} /> : null}
      {hasPermission('followup.read') ? <Tabs.Screen name="FollowUps" component={FollowUpsNavigator} options={{ headerShown: false, title: 'Follow-ups', tabBarIcon: tabIcon('✆') }} /> : null}
      {['quotation.read', 'proforma.read', 'format4.read', 'amc.read', 'bill.read'].some((p) => hasPermission(p)) ? <Tabs.Screen name="Quotations" component={QuotationsNavigator} options={{ headerShown: false, title: 'Sales', tabBarIcon: tabIcon('₹') }} /> : null}
      {hasPermission('service.read') || hasPermission('warranty.read') ? <Tabs.Screen name="Service" component={ServiceNavigator} options={{ headerShown: false, tabBarIcon: tabIcon('⚙') }} /> : null}
      <Tabs.Screen name="More" component={MoreNavigator} options={{ headerShown: false, tabBarIcon: tabIcon('⋯'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }} />
    </Tabs.Navigator>
  );
}

/**
 * The Sales role's own 4-tab layout (Dashboard / Follow-up / Product / Service Status) — the Sales Person Dashboard
 * and Home screens replace the usual "My Dashboard" Home tab, and Customers / Sales documents / Targets / Tours /
 * Leads / Expenses move from their own tabs into the Dashboard tab's own stack (see SalesNavigator), reached from
 * the Home action grid instead. Every other role keeps AppTabs unchanged.
 */
function SalesAppTabs() {
  usePushNavigation('Dashboard');
  const insets = useSafeAreaInsets();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: { height: 56 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="Dashboard" component={SalesNavigator} options={{ tabBarLabel: 'Home', tabBarIcon: tabIcon('⌂') }} />
      <Tabs.Screen name="FollowUps" component={FollowUpsNavigator} options={{ title: 'Follow-up', tabBarLabel: 'Follow-up', tabBarIcon: tabIcon('✆') }} />
      <Tabs.Screen name="Products" component={ProductsNavigator} options={{ title: 'Product', tabBarLabel: 'Product', tabBarIcon: tabIcon('▦') }} />
      <Tabs.Screen name="Service" component={ServiceNavigator} options={{ title: 'Service Status', tabBarLabel: 'Service Status', tabBarIcon: tabIcon('⚙') }} />
    </Tabs.Navigator>
  );
}

function ServiceEngineerHomeNavigator() {
  return (
    <ServiceEngineerHomeStack.Navigator screenOptions={header}>
      <ServiceEngineerHomeStack.Screen name="ServiceEngineerHome" component={ServiceEngineerHomeScreen} options={{ title: 'Home' }} />
      <ServiceEngineerHomeStack.Screen name="SpareParts" component={SparePartsScreen} options={{ title: 'Spare Parts & Replacement' }} />
      <ServiceEngineerHomeStack.Screen name="SparePartsForm" component={SparePartsFormScreen} options={{ title: 'Request Parts' }} />
    </ServiceEngineerHomeStack.Navigator>
  );
}

function ServiceEngineerReportsNavigator() {
  return (
    <ServiceEngineerReportsStack.Navigator screenOptions={header}>
      <ServiceEngineerReportsStack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
      <ServiceEngineerReportsStack.Screen name="ReportViewer" component={ReportViewerScreen} options={({ route }) => ({ title: route.params.title })} />
    </ServiceEngineerReportsStack.Navigator>
  );
}

/** A bare header bar for this tab — without it the content sits flush at y=0 and overlaps the phone's status bar. */
function ServiceEngineerDashboardNavigator() {
  return (
    <ServiceEngineerDashboardStack.Navigator screenOptions={header}>
      <ServiceEngineerDashboardStack.Screen name="ServiceEngineerDashboard" component={ServiceEngineerDashboardScreen} options={{ title: 'Dashboard' }} />
    </ServiceEngineerDashboardStack.Navigator>
  );
}

/** Same reason as ServiceEngineerDashboardNavigator above — gives Profile its header bar / status-bar clearance. */
function ServiceEngineerProfileNavigator() {
  return (
    <ServiceEngineerProfileStack.Navigator screenOptions={header}>
      <ServiceEngineerProfileStack.Screen name="ServiceEngineerProfile" component={ServiceEngineerProfileScreen} options={{ title: 'Profile' }} />
    </ServiceEngineerProfileStack.Navigator>
  );
}

function MdHomeNavigator() {
  return (
    <MdHomeStack.Navigator screenOptions={header}>
      <MdHomeStack.Screen name="MdHome" component={MdHomeScreen} options={{ title: 'Home' }} />
    </MdHomeStack.Navigator>
  );
}

function MdReportsNavigator() {
  return (
    <MdReportsStack.Navigator screenOptions={header}>
      <MdReportsStack.Screen name="MdReportsMenu" component={MdReportsMenuScreen} options={{ title: 'Sales Reports' }} />
      <MdReportsStack.Screen name="MdSalesReport" component={MdSalesReportScreen} options={{ title: 'Sales Report' }} />
      <MdReportsStack.Screen name="MdTopEmployees" component={MdTopEmployeesScreen} options={{ title: 'Top 5 Employees' }} />
      <MdReportsStack.Screen name="MdTargetAchievement" component={MdTargetAchievementScreen} options={{ title: 'Target Achievement' }} />
      <MdReportsStack.Screen name="MdPipeline" component={MdPipelineScreen} options={{ title: 'Sales Pipeline' }} />
    </MdReportsStack.Navigator>
  );
}

function MdExpenseNavigator() {
  return (
    <MdExpenseStack.Navigator screenOptions={header}>
      <MdExpenseStack.Screen name="MdExpenseSummary" component={MdExpenseSummaryScreen} options={{ title: 'Expense Summary' }} />
    </MdExpenseStack.Navigator>
  );
}

function MdAttendanceNavigator() {
  return (
    <MdAttendanceStack.Navigator screenOptions={header}>
      <MdAttendanceStack.Screen name="MdAttendanceOverview" component={MdAttendanceOverviewScreen} options={{ title: 'Attendance Overview' }} />
    </MdAttendanceStack.Navigator>
  );
}

function MdServiceNavigator() {
  return (
    <MdServiceStack.Navigator screenOptions={header}>
      <MdServiceStack.Screen name="MdServiceSummary" component={MdServiceSummaryScreen} options={{ title: 'Service Summary' }} />
    </MdServiceStack.Navigator>
  );
}

function MdApprovalNavigator() {
  return (
    <MdApprovalStack.Navigator screenOptions={header}>
      <MdApprovalStack.Screen name="MdApprovalCenter" component={MdApprovalCenterScreen} options={{ title: 'Approval Center' }} />
    </MdApprovalStack.Navigator>
  );
}

/**
 * The MD / CEO role's own 7-tab layout (Home / Reports / Expense / Attendance / Service / Approval / Others) — a
 * company-wide, read-only view (no document creation here): every figure comes from MdReportsController, each
 * independently permission-gated the same as any other report. Others reuses MoreNavigator wholesale, same as every
 * other role's "More" tab.
 */
function MdCeoAppTabs() {
  const insets = useSafeAreaInsets();
  usePushNavigation('More');
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: { height: 56 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="MdHomeTab" component={MdHomeNavigator} options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: tabIcon('⌂') }} />
      <Tabs.Screen name="MdReportsTab" component={MdReportsNavigator} options={{ title: 'Reports', tabBarLabel: 'Reports', tabBarIcon: tabIcon('▣') }} />
      <Tabs.Screen name="MdExpenseTab" component={MdExpenseNavigator} options={{ title: 'Expense', tabBarLabel: 'Expense', tabBarIcon: tabIcon('₹') }} />
      <Tabs.Screen name="MdAttendanceTab" component={MdAttendanceNavigator} options={{ title: 'Attendance', tabBarLabel: 'Attendance', tabBarIcon: tabIcon('✓') }} />
      <Tabs.Screen name="MdServiceTab" component={MdServiceNavigator} options={{ title: 'Service', tabBarLabel: 'Service', tabBarIcon: tabIcon('⚙') }} />
      <Tabs.Screen name="Approval" component={MdApprovalNavigator} options={{ title: 'Approval', tabBarLabel: 'Approval', tabBarIcon: tabIcon('✔') }} />
      <Tabs.Screen name="More" component={MoreNavigator} options={{ headerShown: false, tabBarIcon: tabIcon('⋯') }} />
    </Tabs.Navigator>
  );
}

function ServiceHeadHomeNavigator() {
  return (
    <ServiceHeadHomeStack.Navigator screenOptions={header}>
      <ServiceHeadHomeStack.Screen name="ServiceHeadHome" component={ServiceHeadHomeScreen} options={{ title: 'Home' }} />
    </ServiceHeadHomeStack.Navigator>
  );
}

function ServiceHeadVisitsNavigator() {
  return (
    <ServiceHeadVisitsStack.Navigator screenOptions={header}>
      <ServiceHeadVisitsStack.Screen name="ServiceHeadVisits" component={ServiceHeadVisitsScreen} options={{ title: 'Visits' }} />
    </ServiceHeadVisitsStack.Navigator>
  );
}

function ServiceHeadTechTeamNavigator() {
  return (
    <ServiceHeadTechTeamStack.Navigator screenOptions={header}>
      <ServiceHeadTechTeamStack.Screen name="ServiceHeadTechTeam" component={ServiceHeadTechTeamScreen} options={{ title: 'Tech Team' }} />
    </ServiceHeadTechTeamStack.Navigator>
  );
}

function ServiceHeadReportsNavigator() {
  return (
    <ServiceHeadReportsStack.Navigator screenOptions={header}>
      <ServiceHeadReportsStack.Screen name="ServiceHeadReportsMenu" component={ServiceHeadReportsMenuScreen} options={{ title: 'Reports' }} />
      <ServiceHeadReportsStack.Screen name="ServiceHeadSla" component={ServiceHeadSlaScreen} options={{ title: 'SLA & Performance' }} />
      <ServiceHeadReportsStack.Screen name="ServiceHeadApprovals" component={ServiceHeadApprovalsScreen} options={{ title: 'Approval Center' }} />
      <ServiceHeadReportsStack.Screen name="Reports" component={ReportsScreen} options={{ title: 'All Reports' }} />
      <ServiceHeadReportsStack.Screen name="ReportViewer" component={ReportViewerScreen} options={({ route }) => ({ title: route.params.title })} />
    </ServiceHeadReportsStack.Navigator>
  );
}

/**
 * The Service Head role's own 6-tab layout (Home / Tickets / Visits / Tech Team / Reports / More). Tickets reuses
 * ServiceNavigator wholesale — a Service Head holds service.all_records, the same coordinator scope as the "Service"
 * role, so ServiceHomeRouter already resolves to the full ticket list, not the field-engineer job list.
 */
function ServiceHeadAppTabs() {
  const insets = useSafeAreaInsets();
  usePushNavigation('More');
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: { height: 56 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="ServiceHeadHomeTab" component={ServiceHeadHomeNavigator} options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: tabIcon('⌂') }} />
      <Tabs.Screen name="Tickets" component={ServiceNavigator} options={{ title: 'Tickets', tabBarLabel: 'Tickets', tabBarIcon: tabIcon('▤') }} />
      <Tabs.Screen name="ServiceHeadVisitsTab" component={ServiceHeadVisitsNavigator} options={{ title: 'Visits', tabBarLabel: 'Visits', tabBarIcon: tabIcon('📅') }} />
      <Tabs.Screen name="ServiceHeadTechTeamTab" component={ServiceHeadTechTeamNavigator} options={{ title: 'Tech Team', tabBarLabel: 'Tech Team', tabBarIcon: tabIcon('👤') }} />
      <Tabs.Screen name="ServiceHeadReportsTab" component={ServiceHeadReportsNavigator} options={{ title: 'Reports', tabBarLabel: 'Reports', tabBarIcon: tabIcon('▣') }} />
      <Tabs.Screen name="More" component={MoreNavigator} options={{ headerShown: false, tabBarIcon: tabIcon('⋯') }} />
    </Tabs.Navigator>
  );
}

function HrHomeNavigator() {
  return (
    <HrHomeStack.Navigator screenOptions={header}>
      <HrHomeStack.Screen name="HrHome" component={HrHomeScreen} options={{ title: 'Home' }} />
      <HrHomeStack.Screen name="HrApprovals" component={HrApprovalsScreen} options={{ title: 'Approval Center' }} />
      <HrHomeStack.Screen name="JobOpenings" component={JobOpeningsScreen} options={{ title: 'Recruitment' }} />
      <HrHomeStack.Screen name="JobOpeningDetail" component={JobOpeningDetailScreen} options={({ route }) => ({ title: route.params.title })} />
      <HrHomeStack.Screen name="JobOpeningForm" component={JobOpeningFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Opening' : 'New Job Opening' })} />
      <HrHomeStack.Screen name="JobApplicationForm" component={JobApplicationFormScreen} options={{ title: 'Add Application' }} />
      <HrHomeStack.Screen name="TrainingSessions" component={TrainingSessionsScreen} options={{ title: 'Training & Development' }} />
      <HrHomeStack.Screen name="TrainingSessionDetail" component={TrainingSessionDetailScreen} options={({ route }) => ({ title: route.params.title })} />
      <HrHomeStack.Screen name="TrainingSessionForm" component={TrainingSessionFormScreen} options={({ route }) => ({ title: route.params?.id ? 'Edit Training' : 'Schedule Training' })} />
      <HrHomeStack.Screen name="Appraisals" component={AppraisalsScreen} options={{ title: 'Performance & Appraisal' }} />
      <HrHomeStack.Screen name="AppraisalDetail" component={AppraisalDetailScreen} options={({ route }) => ({ title: route.params.name })} />
      <HrHomeStack.Screen name="AppraisalForm" component={AppraisalFormScreen} options={{ title: 'Start Appraisal' }} />
    </HrHomeStack.Navigator>
  );
}

function HrEmployeesNavigator() {
  return (
    <HrEmployeesStack.Navigator screenOptions={header}>
      <HrEmployeesStack.Screen name="HrEmployees" component={HrEmployeesScreen} options={{ title: 'Employees' }} />
      <HrEmployeesStack.Screen name="HrEmployeeDetail" component={HrEmployeeDetailScreen} options={({ route }) => ({ title: route.params.name })} />
    </HrEmployeesStack.Navigator>
  );
}

function HrAttendanceNavigator() {
  return (
    <HrAttendanceStack.Navigator screenOptions={header}>
      <HrAttendanceStack.Screen name="HrAttendance" component={MdAttendanceOverviewScreen} options={{ title: 'Attendance Overview' }} />
    </HrAttendanceStack.Navigator>
  );
}

function HrLeaveNavigator() {
  return (
    <HrLeaveStack.Navigator screenOptions={header}>
      <HrLeaveStack.Screen name="Leave" component={LeaveScreen} options={{ title: 'Leave Management' }} />
      <HrLeaveStack.Screen name="LeaveForm" component={LeaveFormScreen} options={{ title: 'Apply for Leave' }} />
    </HrLeaveStack.Navigator>
  );
}

/**
 * The HR Head role's own 5-tab layout (Home / Employees / Attendance / Leave / More), matching the mockup's own
 * footer. Approval Center is reached from Home (no dedicated tab in the mockup either — it lives under a "Tasks /
 * Approvals" screen reached from the menu there). Recruitment, Training & Development and Performance & Appraisal
 * from the mockup are not built: no model for any of the three exists anywhere in this schema — a genuinely new
 * domain each, not a missing screen over existing data.
 */
function HrHeadAppTabs() {
  const insets = useSafeAreaInsets();
  usePushNavigation('More');
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: { height: 56 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="HrHomeTab" component={HrHomeNavigator} options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: tabIcon('⌂') }} />
      <Tabs.Screen name="HrEmployeesTab" component={HrEmployeesNavigator} options={{ title: 'Employees', tabBarLabel: 'Employees', tabBarIcon: tabIcon('👥') }} />
      <Tabs.Screen name="HrAttendanceTab" component={HrAttendanceNavigator} options={{ title: 'Attendance', tabBarLabel: 'Attendance', tabBarIcon: tabIcon('✓') }} />
      <Tabs.Screen name="HrLeaveTab" component={HrLeaveNavigator} options={{ title: 'Leave', tabBarLabel: 'Leave', tabBarIcon: tabIcon('🗓') }} />
      <Tabs.Screen name="More" component={MoreNavigator} options={{ headerShown: false, tabBarIcon: tabIcon('⋯') }} />
    </Tabs.Navigator>
  );
}

/**
 * A Service Engineer's own 6-tab layout (Home / Jobs / Dashboard / Reports / Profile / More), matching the pasted
 * mockup's own footer choice — the Jobs tab reuses ServiceNavigator exactly as it already works (ServiceHomeRouter
 * already resolves to MyServiceJobsScreen for a non-coordinator), and More reuses MoreNavigator, same as every other
 * role. Only Home, Dashboard, Profile and Spare Parts are new. A coordinator (the "Service" role) keeps AppTabs —
 * this shell is for the field engineer's own login only.
 */
function ServiceEngineerAppTabs() {
  const insets = useSafeAreaInsets();
  usePushNavigation('More');
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: { height: 56 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="ServiceEngineerHomeTab" component={ServiceEngineerHomeNavigator} options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: tabIcon('⌂') }} />
      <Tabs.Screen name="Jobs" component={ServiceNavigator} options={{ title: 'Jobs', tabBarLabel: 'Jobs', tabBarIcon: tabIcon('▤') }} />
      <Tabs.Screen name="ServiceEngineerDashboardTab" component={ServiceEngineerDashboardNavigator} options={{ title: 'Dashboard', tabBarLabel: 'Dashboard', tabBarIcon: tabIcon('◎') }} />
      <Tabs.Screen name="ServiceEngineerReportsTab" component={ServiceEngineerReportsNavigator} options={{ title: 'Reports', tabBarLabel: 'Reports', tabBarIcon: tabIcon('▣') }} />
      <Tabs.Screen name="ServiceEngineerProfileTab" component={ServiceEngineerProfileNavigator} options={{ title: 'Profile', tabBarLabel: 'Profile', tabBarIcon: tabIcon('◉') }} />
      <Tabs.Screen name="More" component={MoreNavigator} options={{ headerShown: false, tabBarIcon: tabIcon('⋯') }} />
    </Tabs.Navigator>
  );
}

/** Which part of the app the user sees: a splash while the stored session is checked, sign-in, the forced password change, or the app. */
export function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <ChangePasswordScreen />;
  const isSales = user.userRoles?.some((r) => r.role.name === 'Sales') ?? false;
  const isServiceEngineer = !isSales && (user.userRoles?.some((r) => r.role.name === 'Service Engineer') ?? false);
  const isMdCeo = !isSales && !isServiceEngineer && (user.userRoles?.some((r) => r.role.name === 'MD / CEO') ?? false);
  const isServiceHead = !isSales && !isServiceEngineer && !isMdCeo && (user.userRoles?.some((r) => r.role.name === 'Service Head') ?? false);
  const isHrHead = !isSales && !isServiceEngineer && !isMdCeo && !isServiceHead && (user.userRoles?.some((r) => r.role.name === 'HR Head') ?? false);
  return (
    <NavigationContainer>
      {isSales ? (
        <SalesAppTabs />
      ) : isServiceEngineer ? (
        <ServiceEngineerAppTabs />
      ) : isMdCeo ? (
        <MdCeoAppTabs />
      ) : isServiceHead ? (
        <ServiceHeadAppTabs />
      ) : isHrHead ? (
        <HrHeadAppTabs />
      ) : (
        <AppTabs />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy },
  glyph: { fontSize: 20, lineHeight: 24 },
  tabLabel: { fontSize: 11.5, fontWeight: '600' },
  bell: { marginRight: 14 },
  bellText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
