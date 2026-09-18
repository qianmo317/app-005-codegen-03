import dayjs from 'dayjs';
import type {
  Instrument,
  InstrumentUsage,
  MaintenanceRecord,
  MaintenanceStatus,
} from '../types';

// ---------- 基础查询 ----------

/** 最近一次保养记录（保养记录跟着仪器走） */
export const getLatestMaintenance = (
  instrumentId: string,
  maintenances: MaintenanceRecord[]
): MaintenanceRecord | undefined => {
  return maintenances
    .filter((m) => m.instrumentId === instrumentId)
    .sort((a, b) => dayjs(b.maintenanceDate).valueOf() - dayjs(a.maintenanceDate).valueOf())[0];
};

/**
 * 当前保养周期起点：
 * 有保养记录则从最近一次保养日起算，否则从购进日起算。
 */
export const getCycleStart = (
  instrument: Instrument,
  maintenances: MaintenanceRecord[]
): dayjs.Dayjs => {
  const latest = getLatestMaintenance(instrument.id, maintenances);
  return dayjs(latest ? latest.maintenanceDate : instrument.purchaseDate).startOf('day');
};

/** 下次保养到期日：保养记录显式指定优先，否则按月份周期推算 */
export const getNextDueDate = (
  instrument: Instrument,
  maintenances: MaintenanceRecord[]
): dayjs.Dayjs => {
  const latest = getLatestMaintenance(instrument.id, maintenances);
  const start = getCycleStart(instrument, maintenances);
  if (latest?.nextDueDate) return dayjs(latest.nextDueDate).startOf('day');
  return start.add(instrument.maintenanceIntervalDays, 'day');
};

/** 所有未取消的使用记录（同一台仪器一天用几次都一起算） */
export const effectiveUsages = (
  instrumentId: string,
  usages: InstrumentUsage[],
  cancelledAppointmentIds: Set<string> = new Set()
): InstrumentUsage[] =>
  usages.filter(
    (u) =>
      u.instrumentId === instrumentId &&
      !(u.appointmentId && cancelledAppointmentIds.has(u.appointmentId))
  );

/** 当前保养周期内的累计使用时长（分钟）——做完保养后计数重新开始 */
export const getUsedMinutesSinceLastMaintenance = (
  instrument: Instrument,
  usages: InstrumentUsage[],
  maintenances: MaintenanceRecord[],
  cancelledAppointmentIds: Set<string> = new Set()
): number => {
  const start = getCycleStart(instrument, maintenances).valueOf();
  return effectiveUsages(instrument.id, usages, cancelledAppointmentIds)
    .filter((u) => dayjs(u.startTime).valueOf() >= start)
    .reduce((sum, u) => sum + u.durationMinutes, 0);
};

/** 购进至今的总累计使用时长（分钟） */
export const getTotalUsedMinutes = (
  instrument: Instrument,
  usages: InstrumentUsage[],
  cancelledAppointmentIds: Set<string> = new Set()
): number =>
  effectiveUsages(instrument.id, usages, cancelledAppointmentIds).reduce(
    (sum, u) => sum + u.durationMinutes,
    0
  );

/** 某一天该仪器的合计使用时长（分钟）——同一天多次使用合并计算 */
export const getDayUsedMinutes = (
  instrument: Instrument,
  date: string | dayjs.Dayjs,
  usages: InstrumentUsage[],
  cancelledAppointmentIds: Set<string> = new Set()
): number => {
  const day = dayjs(date).format('YYYY-MM-DD');
  return effectiveUsages(instrument.id, usages, cancelledAppointmentIds)
    .filter((u) => dayjs(u.startTime).format('YYYY-MM-DD') === day)
    .reduce((sum, u) => sum + u.durationMinutes, 0);
};

/** 按日聚合计时 */
export const getDailyUsageSummary = (
  instrument: Instrument,
  usages: InstrumentUsage[],
  cancelledAppointmentIds: Set<string> = new Set()
): { date: string; totalMinutes: number; count: number }[] => {
  const map = new Map<string, { totalMinutes: number; count: number }>();
  effectiveUsages(instrument.id, usages, cancelledAppointmentIds).forEach((u) => {
    const day = dayjs(u.startTime).format('YYYY-MM-DD');
    const cur = map.get(day) || { totalMinutes: 0, count: 0 };
    cur.totalMinutes += u.durationMinutes;
    cur.count += 1;
    map.set(day, cur);
  });
  return [...map.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
};

// ---------- 保养状态判定 ----------

export interface MaintenanceInfo {
  status: MaintenanceStatus;
  usedMinutes: number;
  usageLimitMinutes: number;
  nextDueDate: dayjs.Dayjs;
  /** 触发原因：到期 / 超期 / 即将到期 */
  reasons: string[];
}

const SOON_DAYS = 7;         // 到期前 7 天提醒
const SOON_USAGE_RATIO = 0.9; // 累计时长达 90% 提醒

/**
 * 综合「按月份周期」与「按累计使用时长」两种规则判定保养状态。
 * 取两种规则中更严重的一级：
 *  - overdue：超过到期日，或累计时长超过阈值
 *  - due：到达到期日，或累计时长达到阈值
 *  - due_soon：临近到期日（7天内）或时长达到 90%
 *  - normal
 */
export const getMaintenanceInfo = (
  instrument: Instrument,
  usages: InstrumentUsage[],
  maintenances: MaintenanceRecord[],
  cancelledAppointmentIds: Set<string> = new Set(),
  now: dayjs.Dayjs = dayjs()
): MaintenanceInfo => {
  const usedMinutes = getUsedMinutesSinceLastMaintenance(
    instrument,
    usages,
    maintenances,
    cancelledAppointmentIds
  );
  const nextDue = getNextDueDate(instrument, maintenances);
  const daysDiff = nextDue.startOf('day').diff(now.startOf('day'), 'day');

  let timeStatus: MaintenanceStatus = 'normal';
  if (daysDiff < 0) timeStatus = 'overdue';
  else if (daysDiff === 0) timeStatus = 'due';
  else if (daysDiff <= SOON_DAYS) timeStatus = 'due_soon';

  let usageStatus: MaintenanceStatus = 'normal';
  if (usedMinutes > instrument.usageLimitMinutes) usageStatus = 'overdue';
  else if (usedMinutes >= instrument.usageLimitMinutes) usageStatus = 'due';
  else if (usedMinutes >= instrument.usageLimitMinutes * SOON_USAGE_RATIO)
    usageStatus = 'due_soon';

  const order: MaintenanceStatus[] = ['normal', 'due_soon', 'due', 'overdue'];
  const status = order[Math.max(order.indexOf(timeStatus), order.indexOf(usageStatus))];

  const reasons: string[] = [];
  if (timeStatus === 'overdue') reasons.push(`已超保养到期日 ${Math.abs(daysDiff)} 天`);
  else if (timeStatus === 'due') reasons.push('今日到达保养到期日');
  else if (timeStatus === 'due_soon') reasons.push(`${daysDiff} 天后到达保养到期日`);
  if (usageStatus === 'overdue')
    reasons.push(`累计使用 ${usedMinutes} 分钟，已超过保养阈值`);
  else if (usageStatus === 'due') reasons.push('累计使用时长已达到保养阈值');
  else if (usageStatus === 'due_soon')
    reasons.push('累计使用时长接近保养阈值（90%）');

  return {
    status,
    usedMinutes,
    usageLimitMinutes: instrument.usageLimitMinutes,
    nextDueDate: nextDue,
    reasons,
  };
};

export const MAINTENANCE_STATUS_META: Record<
  MaintenanceStatus,
  { text: string; color: string; badge: 'success' | 'warning' | 'error' | 'default' }
> = {
  normal: { text: '正常', color: 'green', badge: 'success' },
  due_soon: { text: '即将到期', color: 'gold', badge: 'warning' },
  due: { text: '保养到期', color: 'orange', badge: 'warning' },
  overdue: { text: '已超期', color: 'red', badge: 'error' },
};

// ---------- 占用 / 冲突校验 ----------

const overlaps = (start: number, end: number, s: number, e: number) =>
  start < e && end > s; // 半开区间：首尾相接不算冲突

/**
 * 同一台仪器同一时段不能同时被两个项目占用。
 * 取消的预约、保养停用期间均不允许排入。
 */
export const findUsageConflict = (
  instrumentId: string,
  startTime: string | dayjs.Dayjs,
  endTime: string | dayjs.Dayjs,
  usages: InstrumentUsage[],
  cancelledAppointmentIds: Set<string> = new Set(),
  excludeUsageId?: string
): InstrumentUsage | undefined => {
  const start = dayjs(startTime).valueOf();
  const end = dayjs(endTime).valueOf();
  return effectiveUsages(instrumentId, usages, cancelledAppointmentIds).find((u) => {
    if (excludeUsageId && u.id === excludeUsageId) return false;
    return overlaps(start, end, dayjs(u.startTime).valueOf(), dayjs(u.endTime).valueOf());
  });
};

/** 停用的仪器不能再被排到项目里 */
export const isInstrumentBookable = (instrument: Instrument): boolean =>
  instrument.status === 'active';

/**
 * 停用 → 重新启用前置条件：保养没做完不许重新启用。
 * 即存在「到期 / 超期」未处理的保养时禁止启用。
 */
export const canReactivate = (
  instrument: Instrument,
  usages: InstrumentUsage[],
  maintenances: MaintenanceRecord[],
  cancelledAppointmentIds: Set<string> = new Set()
): { ok: boolean; reason?: string } => {
  if (instrument.status === 'active') return { ok: true };
  const info = getMaintenanceInfo(
    instrument,
    usages,
    maintenances,
    cancelledAppointmentIds
  );
  if (info.status === 'overdue')
    return { ok: false, reason: '该仪器保养已超期，请先完成保养后再重新启用' };
  if (info.status === 'due')
    return { ok: false, reason: '该仪器保养已到期，请先完成保养后再重新启用' };
  return { ok: true };
};

// ---------- 展示辅助 ----------

export const formatMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分钟`;
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分`;
};
