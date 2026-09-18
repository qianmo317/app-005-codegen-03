import type { Device, DeviceUsage } from '../types';

export type MaintenanceStatus = 'normal' | 'due' | 'overdue';

export interface MaintenanceInfo {
  status: MaintenanceStatus;
  totalMinutes: number;
  usedMinutesSinceLast: number;
  remainingHours: number | null;
  nextDueDate: string | null;
  remainingDays: number | null;
  triggers: ('hours' | 'months')[];
}

export const MAINTENANCE_STATUS_META: Record<MaintenanceStatus, { text: string; color: string }> = {
  normal: { text: '正常', color: 'green' },
  due: { text: '保养到期', color: 'orange' },
  overdue: { text: '保养超期', color: 'red' },
};

export const DEVICE_STATUS_META: Record<Device['status'], { text: string; color: string }> = {
  active: { text: '在用', color: 'green' },
  maintenance: { text: '保养中', color: 'gold' },
  disabled: { text: '停用', color: 'default' },
};

const HOURS_WARNING_THRESHOLD = 10;
const DAYS_WARNING_THRESHOLD = 7;

const toDateStr = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDeviceTotalMinutes = (deviceId: string, usages: DeviceUsage[]): number => {
  return usages
    .filter((u) => u.deviceId === deviceId)
    .reduce((sum, u) => sum + u.duration, 0);
};

export const getMinutesSinceLastMaintenance = (device: Device, usages: DeviceUsage[]): number => {
  const total = getDeviceTotalMinutes(device.id, usages);
  return Math.max(0, total - Math.round(device.hoursAtLastMaintenance * 60));
};

export const getNextMaintenanceDate = (device: Device): string | null => {
  if (!device.maintenanceIntervalMonths || device.maintenanceIntervalMonths <= 0) return null;
  const base = device.lastMaintenanceDate || device.purchaseDate;
  if (!base) return null;
  // 按本地时间解析，避免 UTC 解析导致的日期偏移
  const [y, m, d] = base.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setMonth(date.getMonth() + device.maintenanceIntervalMonths);
  return toDateStr(date);
};

export const getMaintenanceInfo = (device: Device, usages: DeviceUsage[]): MaintenanceInfo => {
  const totalMinutes = getDeviceTotalMinutes(device.id, usages);
  const usedMinutesSinceLast = getMinutesSinceLastMaintenance(device, usages);

  let remainingHours: number | null = null;
  if (device.maintenanceIntervalHours > 0) {
    remainingHours = device.maintenanceIntervalHours - usedMinutesSinceLast / 60;
  }

  const nextDueDate = getNextMaintenanceDate(device);
  let remainingDays: number | null = null;
  if (nextDueDate) {
    const today = toDateStr(new Date());
    remainingDays = Math.round(
      (new Date(nextDueDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const overdueTriggers: ('hours' | 'months')[] = [];
  const dueTriggers: ('hours' | 'months')[] = [];

  if (remainingHours !== null) {
    if (remainingHours < 0) overdueTriggers.push('hours');
    else if (remainingHours <= HOURS_WARNING_THRESHOLD) dueTriggers.push('hours');
  }
  if (remainingDays !== null) {
    if (remainingDays < 0) overdueTriggers.push('months');
    else if (remainingDays <= DAYS_WARNING_THRESHOLD) dueTriggers.push('months');
  }

  let status: MaintenanceStatus = 'normal';
  let triggers: ('hours' | 'months')[] = [];
  if (overdueTriggers.length > 0) {
    status = 'overdue';
    triggers = overdueTriggers;
  } else if (dueTriggers.length > 0) {
    status = 'due';
    triggers = dueTriggers;
  }

  return {
    status,
    totalMinutes,
    usedMinutesSinceLast,
    remainingHours,
    nextDueDate,
    remainingDays,
    triggers,
  };
};

export const hasDeviceTimeConflict = (
  usages: DeviceUsage[],
  deviceId: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): boolean => {
  const newStart = new Date(startTime).getTime();
  const newEnd = new Date(endTime).getTime();
  return usages.some((u) => {
    if (u.deviceId !== deviceId || u.id === excludeId) return false;
    const uStart = new Date(u.startTime).getTime();
    const uEnd = new Date(u.endTime).getTime();
    return newStart < uEnd && newEnd > uStart;
  });
};

export interface DailyUsageSummary {
  deviceId: string;
  date: string;
  count: number;
  totalMinutes: number;
  sessions: DeviceUsage[];
}

export const aggregateUsageByDay = (usages: DeviceUsage[]): DailyUsageSummary[] => {
  const map = new Map<string, DailyUsageSummary>();
  usages.forEach((u) => {
    const key = `${u.deviceId}|${u.date}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalMinutes += u.duration;
      existing.sessions.push(u);
    } else {
      map.set(key, {
        deviceId: u.deviceId,
        date: u.date,
        count: 1,
        totalMinutes: u.duration,
        sessions: [u],
      });
    }
  });
  return Array.from(map.values())
    .map((s) => ({
      ...s,
      sessions: s.sessions.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
};

export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}分钟`;
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
};
