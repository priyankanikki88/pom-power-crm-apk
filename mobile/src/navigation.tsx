import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './auth/AuthContext';
import { AttendanceBoardScreen } from './screens/AttendanceBoardScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
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
import { LeadActivityFormScreen, LeadFormScreen, LeadsScreen } from './screens/LeadScreens';
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
import { colors } from './theme';

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

const Tabs = createBottomTabNavigator();
const CustomersStack = createNativeStackNavigator<CustomersStackParams>();
const FollowUpsStack = createNativeStackNavigator<FollowUpsStackParams>();
const QuotationsStack = createNativeStackNavigator<QuotationsStackParams>();
const ServiceStack = createNativeStackNavigator<ServiceStackParams>();
const MoreStack = createNativeStackNavigator<MoreStackParams>();

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

function ServiceNavigator() {
  return (
    <ServiceStack.Navigator screenOptions={header}>
      <ServiceStack.Screen name="ServiceHome" component={ServiceScreen} options={{ title: 'Service' }} />
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

/** Text glyph tab icons — no icon font to load, and each tab always carries its label too. */
const tabIcon = (glyph: string) =>
  function TabIcon({ color }: { color: string }) {
    return <Text style={[styles.glyph, { color }]}>{glyph}</Text>;
  };

let handledTap: string | null = null;

/** A push that arrives while the app is open refreshes the unread count; tapping one (open or closed) opens Notifications. */
function usePushNavigation() {
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
    navigation.navigate('More', { screen: 'Notifications', initial: false });
  }, [tapped, navigation, qc]);
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
  return (
    <NavigationContainer>
      <AppTabs />
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
