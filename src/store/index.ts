import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { storage } from '../utils/storage';
import type {
  Customer,
  SkinAnalysis,
  Allergy,
  Membership,
  Service,
  Package,
  PackageItem,
  Employee,
  Appointment,
  ServiceRecord,
  Schedule,
  Review,
  Attendance,
  Commission,
  WaitList,
  Instrument,
  InstrumentUsage,
  MaintenanceRecord
} from '../types';
import {
  mockCustomers,
  mockSkinAnalyses,
  mockAllergies,
  mockMemberships,
  mockServices,
  mockPackages,
  mockPackageItems,
  mockEmployees,
  mockAppointments,
  mockServiceRecords,
  mockSchedules,
  mockReviews,
  mockAttendance,
  mockCommissions,
  mockWaitList,
  mockInstruments
} from '../mock';

interface AppState {
  customers: Customer[];
  skinAnalyses: SkinAnalysis[];
  allergies: Allergy[];
  memberships: Membership[];
  services: Service[];
  packages: Package[];
  packageItems: PackageItem[];
  employees: Employee[];
  appointments: Appointment[];
  serviceRecords: ServiceRecord[];
  schedules: Schedule[];
  reviews: Review[];
  attendance: Attendance[];
  commissions: Commission[];
  waitList: WaitList[];
  instruments: Instrument[];
  instrumentUsages: InstrumentUsage[];
  instrumentMaintenances: MaintenanceRecord[];
  initialized: boolean;
}

const STORAGE_KEY = 'app_state';

const loadState = (): AppState => {
  try {
    const saved = storage.get<AppState>(STORAGE_KEY);
    if (saved && saved.initialized) {
      // Verify data integrity
      const firstCustomer = saved.customers[0];
      if (firstCustomer && firstCustomer.avatar && firstCustomer.avatar.includes('data:image/svg+xml;base64,')) {
        const b64 = firstCustomer.avatar.replace('data:image/svg+xml;base64,', '');
        try {
          atob(b64);
          // 兼容旧版本数据：补齐仪器台账模块
          if (!saved.instruments || !saved.instrumentUsages || !saved.instrumentMaintenances) {
            const instrumentData = mockInstruments();
            saved.instruments = instrumentData.instruments as Instrument[];
            saved.instrumentUsages = instrumentData.instrumentUsages as InstrumentUsage[];
            saved.instrumentMaintenances = instrumentData.instrumentMaintenances as MaintenanceRecord[];
          }
          return saved;
        } catch (e) {
          console.log('Detected corrupted data, regenerating...');
          storage.clear();
        }
      }
    }
  } catch (e) {
    console.log('Loading fresh data...');
  }

  const customers = mockCustomers();
  const customerIds = customers.map(c => c.id);
  const services = mockServices() as Service[];
  const serviceIds = services.map(s => s.id);
  const employees = mockEmployees() as Employee[];
  const employeeIds = employees.map(e => e.id);
  const packages = mockPackages() as Package[];
  const instrumentData = mockInstruments();
  const instruments = instrumentData.instruments as Instrument[];

  return {
    customers,
    skinAnalyses: mockSkinAnalyses(customerIds),
    allergies: mockAllergies(customerIds),
    memberships: mockMemberships(customerIds),
    services,
    packages,
    packageItems: mockPackageItems(packages),
    employees,
    appointments: mockAppointments(customerIds, serviceIds, employeeIds, instruments),
    serviceRecords: mockServiceRecords(customerIds, serviceIds, employeeIds),
    schedules: mockSchedules(employeeIds),
    reviews: mockReviews(customerIds, employeeIds, serviceIds),
    attendance: mockAttendance(employeeIds),
    commissions: mockCommissions(employeeIds),
    waitList: mockWaitList(customerIds, serviceIds),
    instruments,
    instrumentUsages: instrumentData.instrumentUsages as InstrumentUsage[],
    instrumentMaintenances: instrumentData.instrumentMaintenances as MaintenanceRecord[],
    initialized: true
  };
};

const initialState: AppState = loadState();

const saveState = (state: AppState) => {
  storage.set(STORAGE_KEY, state);
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    addCustomer: (state, action: PayloadAction<Customer>) => {
      state.customers.unshift(action.payload);
      saveState(state);
    },
    updateCustomer: (state, action: PayloadAction<Customer>) => {
      const index = state.customers.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.customers[index] = action.payload;
        saveState(state);
      }
    },
    deleteCustomer: (state, action: PayloadAction<string>) => {
      state.customers = state.customers.filter(c => c.id !== action.payload);
      saveState(state);
    },
    addSkinAnalysis: (state, action: PayloadAction<SkinAnalysis>) => {
      state.skinAnalyses.unshift(action.payload);
      saveState(state);
    },
    addAllergy: (state, action: PayloadAction<Allergy>) => {
      state.allergies.unshift(action.payload);
      saveState(state);
    },
    updateAllergy: (state, action: PayloadAction<Allergy>) => {
      const index = state.allergies.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.allergies[index] = action.payload;
        saveState(state);
      }
    },
    deleteAllergy: (state, action: PayloadAction<string>) => {
      state.allergies = state.allergies.filter(a => a.id !== action.payload);
      saveState(state);
    },
    addService: (state, action: PayloadAction<Service>) => {
      state.services.unshift(action.payload);
      saveState(state);
    },
    updateService: (state, action: PayloadAction<Service>) => {
      const index = state.services.findIndex(s => s.id === action.payload.id);
      if (index !== -1) {
        state.services[index] = action.payload;
        saveState(state);
      }
    },
    deleteService: (state, action: PayloadAction<string>) => {
      state.services = state.services.filter(s => s.id !== action.payload);
      saveState(state);
    },
    addPackage: (state, action: PayloadAction<Package>) => {
      state.packages.unshift(action.payload);
      saveState(state);
    },
    updatePackage: (state, action: PayloadAction<Package>) => {
      const index = state.packages.findIndex(p => p.id === action.payload.id);
      if (index !== -1) {
        state.packages[index] = action.payload;
        saveState(state);
      }
    },
    addAppointment: (state, action: PayloadAction<Appointment>) => {
      state.appointments.unshift(action.payload);
      // 预约确认即占用仪器时段（取消/爽约状态不占用）
      if (action.payload.instrumentId && !['cancelled', 'no_show'].includes(action.payload.status)) {
        state.instrumentUsages.unshift({
          id: `usage_${action.payload.id}`,
          instrumentId: action.payload.instrumentId,
          startTime: action.payload.startTime,
          endTime: action.payload.endTime,
          durationMinutes: action.payload.duration,
          customerId: action.payload.customerId,
          serviceId: action.payload.serviceId,
          appointmentId: action.payload.id,
          purpose: '预约项目',
          createdAt: new Date().toISOString()
        });
      }
      saveState(state);
    },
    updateAppointment: (state, action: PayloadAction<Appointment>) => {
      const index = state.appointments.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.appointments[index] = action.payload;
        // 同步仪器占用：先移除旧记录，再按新状态决定是否重新占用
        state.instrumentUsages = state.instrumentUsages.filter(
          u => u.appointmentId !== action.payload.id
        );
        if (action.payload.instrumentId && !['cancelled', 'no_show'].includes(action.payload.status)) {
          state.instrumentUsages.unshift({
            id: `usage_${action.payload.id}`,
            instrumentId: action.payload.instrumentId,
            startTime: action.payload.startTime,
            endTime: action.payload.endTime,
            durationMinutes: action.payload.duration,
            customerId: action.payload.customerId,
            serviceId: action.payload.serviceId,
            appointmentId: action.payload.id,
            purpose: '预约项目',
            createdAt: new Date().toISOString()
          });
        }
        saveState(state);
      }
    },
    deleteAppointment: (state, action: PayloadAction<string>) => {
      state.appointments = state.appointments.filter(a => a.id !== action.payload);
      state.instrumentUsages = state.instrumentUsages.filter(u => u.appointmentId !== action.payload);
      saveState(state);
    },
    addEmployee: (state, action: PayloadAction<Employee>) => {
      state.employees.unshift(action.payload);
      saveState(state);
    },
    updateEmployee: (state, action: PayloadAction<Employee>) => {
      const index = state.employees.findIndex(e => e.id === action.payload.id);
      if (index !== -1) {
        state.employees[index] = action.payload;
        saveState(state);
      }
    },
    updateSchedule: (state, action: PayloadAction<Schedule>) => {
      const index = state.schedules.findIndex(s => s.id === action.payload.id);
      if (index !== -1) {
        state.schedules[index] = action.payload;
      } else {
        state.schedules.push(action.payload);
      }
      saveState(state);
    },
    addWaitList: (state, action: PayloadAction<WaitList>) => {
      state.waitList.unshift(action.payload);
      saveState(state);
    },
    updateWaitList: (state, action: PayloadAction<WaitList>) => {
      const index = state.waitList.findIndex(w => w.id === action.payload.id);
      if (index !== -1) {
        state.waitList[index] = action.payload;
        saveState(state);
      }
    },
    deleteWaitList: (state, action: PayloadAction<string>) => {
      state.waitList = state.waitList.filter(w => w.id !== action.payload);
      saveState(state);
    },
    addServiceRecord: (state, action: PayloadAction<ServiceRecord>) => {
      state.serviceRecords.unshift(action.payload);
      const membership = state.memberships.find(m => m.customerId === action.payload.customerId);
      if (membership) {
        membership.totalSpent += action.payload.price;
        membership.points += Math.floor(action.payload.price / 10);
        if (membership.totalSpent > 30000) membership.level = 'diamond';
        else if (membership.totalSpent > 20000) membership.level = 'platinum';
        else if (membership.totalSpent > 10000) membership.level = 'gold';
        else if (membership.totalSpent > 5000) membership.level = 'silver';
      }
      saveState(state);
    },
    // ---------- 仪器台账 ----------
    addInstrument: (state, action: PayloadAction<Instrument>) => {
      state.instruments.unshift(action.payload);
      saveState(state);
    },
    updateInstrument: (state, action: PayloadAction<Instrument>) => {
      const index = state.instruments.findIndex(i => i.id === action.payload.id);
      if (index !== -1) {
        state.instruments[index] = action.payload;
        saveState(state);
      }
    },
    deleteInstrument: (state, action: PayloadAction<string>) => {
      // 保养记录跟着仪器走：删除仪器时一并清除其使用与保养记录、解除预约关联
      state.instruments = state.instruments.filter(i => i.id !== action.payload);
      state.instrumentUsages = state.instrumentUsages.filter(u => u.instrumentId !== action.payload);
      state.instrumentMaintenances = state.instrumentMaintenances.filter(m => m.instrumentId !== action.payload);
      state.appointments.forEach(a => {
        if (a.instrumentId === action.payload) a.instrumentId = undefined;
      });
      saveState(state);
    },
    addInstrumentUsage: (state, action: PayloadAction<InstrumentUsage>) => {
      state.instrumentUsages.unshift(action.payload);
      saveState(state);
    },
    updateInstrumentUsage: (state, action: PayloadAction<InstrumentUsage>) => {
      const index = state.instrumentUsages.findIndex(u => u.id === action.payload.id);
      if (index !== -1) {
        state.instrumentUsages[index] = action.payload;
        saveState(state);
      }
    },
    deleteInstrumentUsage: (state, action: PayloadAction<string>) => {
      state.instrumentUsages = state.instrumentUsages.filter(u => u.id !== action.payload);
      saveState(state);
    },
    addMaintenance: (state, action: PayloadAction<MaintenanceRecord>) => {
      state.instrumentMaintenances.unshift(action.payload);
      saveState(state);
    }
  }
});

export const {
  addCustomer,
  updateCustomer,
  deleteCustomer,
  addSkinAnalysis,
  addAllergy,
  updateAllergy,
  deleteAllergy,
  addService,
  updateService,
  deleteService,
  addPackage,
  updatePackage,
  addAppointment,
  updateAppointment,
  deleteAppointment,
  addEmployee,
  updateEmployee,
  updateSchedule,
  addWaitList,
  updateWaitList,
  deleteWaitList,
  addServiceRecord,
  addInstrument,
  updateInstrument,
  deleteInstrument,
  addInstrumentUsage,
  updateInstrumentUsage,
  deleteInstrumentUsage,
  addMaintenance
} = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
