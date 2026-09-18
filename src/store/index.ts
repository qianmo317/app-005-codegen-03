import { configureStore, createSlice, PayloadAction, combineReducers } from '@reduxjs/toolkit';
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
  Device,
  DeviceUsage,
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
  mockDevices,
  mockDeviceUsages,
  mockMaintenanceRecords
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
  devices: Device[];
  deviceUsages: DeviceUsage[];
  maintenanceRecords: MaintenanceRecord[];
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
          // 旧版本数据缺少仪器台账，补充生成
          if (!saved.devices) {
            const devices = mockDevices() as Device[];
            const serviceIds = saved.services.map(s => s.id);
            const employeeIds = saved.employees.map(e => e.id);
            saved.devices = devices;
            saved.deviceUsages = mockDeviceUsages(devices, serviceIds, employeeIds) as DeviceUsage[];
            saved.maintenanceRecords = mockMaintenanceRecords() as MaintenanceRecord[];
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
  const devices = mockDevices() as Device[];

  return {
    customers,
    skinAnalyses: mockSkinAnalyses(customerIds),
    allergies: mockAllergies(customerIds),
    memberships: mockMemberships(customerIds),
    services,
    packages,
    packageItems: mockPackageItems(packages),
    employees,
    appointments: mockAppointments(customerIds, serviceIds, employeeIds),
    serviceRecords: mockServiceRecords(customerIds, serviceIds, employeeIds),
    schedules: mockSchedules(employeeIds),
    reviews: mockReviews(customerIds, employeeIds, serviceIds),
    attendance: mockAttendance(employeeIds),
    commissions: mockCommissions(employeeIds),
    waitList: mockWaitList(customerIds, serviceIds),
    devices,
    deviceUsages: mockDeviceUsages(devices, serviceIds, employeeIds) as DeviceUsage[],
    maintenanceRecords: mockMaintenanceRecords() as MaintenanceRecord[],
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
      saveState(state);
    },
    updateAppointment: (state, action: PayloadAction<Appointment>) => {
      const index = state.appointments.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.appointments[index] = action.payload;
        saveState(state);
      }
    },
    deleteAppointment: (state, action: PayloadAction<string>) => {
      state.appointments = state.appointments.filter(a => a.id !== action.payload);
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
    addDevice: (state, action: PayloadAction<Device>) => {
      state.devices.unshift(action.payload);
      saveState(state);
    },
    updateDevice: (state, action: PayloadAction<Device>) => {
      const index = state.devices.findIndex(d => d.id === action.payload.id);
      if (index !== -1) {
        state.devices[index] = action.payload;
        saveState(state);
      }
    },
    setDeviceStatus: (state, action: PayloadAction<{ id: string; status: Device['status'] }>) => {
      const device = state.devices.find(d => d.id === action.payload.id);
      if (!device) return;
      // 保养未完成的仪器不允许重新启用
      if (action.payload.status === 'active') {
        const hasOngoing = state.maintenanceRecords.some(
          r => r.deviceId === device.id && r.status === 'in_progress'
        );
        if (hasOngoing) return;
      }
      device.status = action.payload.status;
      saveState(state);
    },
    addDeviceUsage: (state, action: PayloadAction<DeviceUsage>) => {
      const device = state.devices.find(d => d.id === action.payload.deviceId);
      // 停用/保养中的仪器不能登记使用
      if (!device || device.status !== 'active') return;
      // 同一台仪器同一时段不能被两个项目占用
      const newStart = new Date(action.payload.startTime).getTime();
      const newEnd = new Date(action.payload.endTime).getTime();
      const conflict = state.deviceUsages.some(u => {
        if (u.deviceId !== action.payload.deviceId) return false;
        const uStart = new Date(u.startTime).getTime();
        const uEnd = new Date(u.endTime).getTime();
        return newStart < uEnd && newEnd > uStart;
      });
      if (conflict) return;
      state.deviceUsages.unshift(action.payload);
      saveState(state);
    },
    deleteDeviceUsage: (state, action: PayloadAction<string>) => {
      state.deviceUsages = state.deviceUsages.filter(u => u.id !== action.payload);
      saveState(state);
    },
    removeDeviceUsagesByAppointment: (state, action: PayloadAction<string>) => {
      state.deviceUsages = state.deviceUsages.filter(u => u.appointmentId !== action.payload);
      saveState(state);
    },
    startMaintenance: (state, action: PayloadAction<MaintenanceRecord>) => {
      const device = state.devices.find(d => d.id === action.payload.deviceId);
      if (!device || device.status === 'disabled') return;
      state.maintenanceRecords.unshift(action.payload);
      device.status = 'maintenance';
      saveState(state);
    },
    completeMaintenance: (state, action: PayloadAction<{ recordId: string; description: string; cost: number; performedBy: string; notes: string }>) => {
      const record = state.maintenanceRecords.find(r => r.id === action.payload.recordId);
      if (!record || record.status !== 'in_progress') return;
      const device = state.devices.find(d => d.id === record.deviceId);
      const now = new Date();
      record.status = 'completed';
      record.completedAt = now.toISOString();
      record.description = action.payload.description;
      record.cost = action.payload.cost;
      record.performedBy = action.payload.performedBy;
      record.notes = action.payload.notes;
      if (device) {
        // 保养完成后重置保养计时基准，保养记录跟随仪器
        const totalMinutes = state.deviceUsages
          .filter(u => u.deviceId === device.id)
          .reduce((sum, u) => sum + u.duration, 0);
        device.lastMaintenanceDate = now.toISOString().split('T')[0];
        device.hoursAtLastMaintenance = totalMinutes / 60;
        if (device.status === 'maintenance') {
          device.status = 'active';
        }
      }
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
  addDevice,
  updateDevice,
  setDeviceStatus,
  addDeviceUsage,
  deleteDeviceUsage,
  removeDeviceUsagesByAppointment,
  startMaintenance,
  completeMaintenance
} = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
