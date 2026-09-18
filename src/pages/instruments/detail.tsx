import React, { useMemo, useState } from 'react';
import {
  Row,
  Col,
  Card,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  InputNumber,
  DatePicker,
  TimePicker,
  Input,
  Select,
  Table,
  Tabs,
  Alert,
  Descriptions,
  Statistic,
  Timeline,
  Popconfirm,
  message,
  Tooltip
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  ToolOutlined,
  EditOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { RootState } from '../../store';
import {
  updateInstrument,
  deleteInstrument,
  addInstrumentUsage,
  updateInstrumentUsage,
  deleteInstrumentUsage,
  addMaintenance
} from '../../store';
import type { InstrumentUsage, MaintenanceRecord, MaintenanceResult } from '../../types';
import {
  getMaintenanceInfo,
  MAINTENANCE_STATUS_META,
  formatMinutes,
  getDailyUsageSummary,
  getTotalUsedMinutes,
  findUsageConflict,
  canReactivate
} from '../../utils/instrument';
import { formatDateTime, formatTime, generateId, formatCurrency } from '../../utils/format';

const MAINT_TYPE_TEXT: Record<MaintenanceResult, string> = {
  completed: '常规保养',
  parts_replaced: '更换配件',
  repair: '故障维修'
};

const InstrumentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const state = useSelector((s: RootState) => s.app);

  const instrument = state.instruments.find((i) => i.id === id);

  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<InstrumentUsage | null>(null);
  const [usageForm] = Form.useForm();
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [maintForm] = Form.useForm();

  const cancelledIds = useMemo(
    () =>
      new Set(
        state.appointments
          .filter((a) => a.status === 'cancelled' || a.status === 'no_show')
          .map((a) => a.id)
      ),
    [state.appointments]
  );

  const usages = useMemo(
    () =>
      state.instrumentUsages
        .filter((u) => u.instrumentId === id)
        .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf()),
    [state.instrumentUsages, id]
  );

  const maintenances = useMemo(
    () =>
      state.instrumentMaintenances
        .filter((m) => m.instrumentId === id)
        .sort((a, b) => dayjs(b.maintenanceDate).valueOf() - dayjs(a.maintenanceDate).valueOf()),
    [state.instrumentMaintenances, id]
  );

  const info = useMemo(() => {
    if (!instrument) return null;
    return getMaintenanceInfo(instrument, state.instrumentUsages, state.instrumentMaintenances, cancelledIds);
  }, [instrument, state.instrumentUsages, state.instrumentMaintenances, cancelledIds]);

  // 同一台仪器一天用了几次合起来算
  const dailySummary = useMemo(() => {
    if (!instrument) return [];
    return getDailyUsageSummary(instrument, state.instrumentUsages, cancelledIds);
  }, [instrument, state.instrumentUsages, cancelledIds]);

  const totalMinutes = useMemo(() => {
    if (!instrument) return 0;
    return getTotalUsedMinutes(instrument, state.instrumentUsages, cancelledIds);
  }, [instrument, state.instrumentUsages, cancelledIds]);

  if (!instrument || !info) {
    return (
      <div className="empty-state">
        <WarningOutlined style={{ fontSize: 48 }} />
        <div style={{ marginTop: 16 }}>未找到该仪器台账</div>
        <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate('/instruments')}>
          返回列表
        </Button>
      </div>
    );
  }

  const meta = MAINTENANCE_STATUS_META[info.status];

  const nameOf = (customerId?: string, serviceId?: string) => {
    const customer = customerId ? state.customers.find((c) => c.id === customerId)?.name : '';
    const service = serviceId ? state.services.find((s) => s.id === serviceId)?.name : '';
    return { customer, service };
  };

  // ---------- 登记 / 编辑使用 ----------
  const openUsageModal = (record?: InstrumentUsage) => {
    if (instrument.status === 'inactive') {
      message.warning('该仪器已停用，不能登记使用');
      return;
    }
    setEditingUsage(record || null);
    usageForm.resetFields();
    if (record) {
      usageForm.setFieldsValue({
        date: dayjs(record.startTime),
        timeRange: [dayjs(record.startTime), dayjs(record.endTime)],
        purpose: record.purpose,
        customerId: record.customerId,
        serviceId: record.serviceId
      });
    } else {
      usageForm.setFieldsValue({
        date: dayjs(),
        timeRange: [dayjs().hour(10).minute(0).second(0), dayjs().hour(11).minute(0).second(0)]
      });
    }
    setUsageModalOpen(true);
  };

  const handleUsageSubmit = async () => {
    try {
      const v = await usageForm.validateFields();
      const start = dayjs(v.date)
        .hour(v.timeRange[0].hour())
        .minute(v.timeRange[0].minute())
        .second(0)
        .millisecond(0);
      const end = dayjs(v.date)
        .hour(v.timeRange[1].hour())
        .minute(v.timeRange[1].minute())
        .second(0)
        .millisecond(0);
      if (!end.isAfter(start)) {
        message.error('结束时间必须晚于开始时间');
        return;
      }
      const durationMinutes = end.diff(start, 'minute');

      // 同一台仪器同一时段不能同时被两个项目占用
      const conflict = findUsageConflict(
        instrument.id,
        start,
        end,
        state.instrumentUsages,
        cancelledIds,
        editingUsage?.id
      );
      if (conflict) {
        const { customer, service } = nameOf(conflict.customerId, conflict.serviceId);
        Modal.error({
          title: '时段冲突',
          content: `该时段仪器已被占用（${formatTime(conflict.startTime)}-${formatTime(
            conflict.endTime
          )} ${service || conflict.purpose || '项目'}${customer ? ` · ${customer}` : ''}），请更换时间。`,
          okText: '知道了'
        });
        return;
      }

      if (editingUsage) {
        dispatch(
          updateInstrumentUsage({
            ...editingUsage,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            durationMinutes,
            purpose: v.purpose?.trim(),
            customerId: v.customerId,
            serviceId: v.serviceId
          })
        );
        message.success('使用记录已更新');
      } else {
        const record: InstrumentUsage = {
          id: generateId(),
          instrumentId: instrument.id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          durationMinutes,
          purpose: v.purpose?.trim() || '手动登记',
          customerId: v.customerId,
          serviceId: v.serviceId,
          createdAt: new Date().toISOString()
        };
        dispatch(addInstrumentUsage(record));
        message.success('使用时长已登记');
      }
      setUsageModalOpen(false);
    } catch {
      // 表单校验失败
    }
  };

  const handleUsageDelete = (record: InstrumentUsage) => {
    Modal.confirm({
      title: record.appointmentId ? '该记录由预约自动生成' : '删除使用记录',
      content: record.appointmentId
        ? '建议到预约排期页取消对应预约；直接删除记录不会改变预约状态，确认删除吗？'
        : '删除后累计使用时长将相应减少，确认删除？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        dispatch(deleteInstrumentUsage(record.id));
        message.success('已删除');
      }
    });
  };

  // ---------- 完成保养 ----------
  const openMaintModal = () => {
    maintForm.resetFields();
    maintForm.setFieldsValue({
      maintenanceDate: dayjs(),
      type: 'completed',
      cost: 100,
      operator: state.employees.find((e) => e.role === 'technician')?.name || '',
      content: '常规清洁保养，检查探头及管路'
    });
    setMaintModalOpen(true);
  };

  const handleMaintSubmit = async () => {
    try {
      const v = await maintForm.validateFields();
      const record: MaintenanceRecord = {
        id: generateId(),
        instrumentId: instrument.id,
        maintenanceDate: v.maintenanceDate.second(0).millisecond(0).toISOString(),
        type: v.type,
        content: v.content?.trim() || '',
        operator: v.operator?.trim() || '未填写',
        cost: v.cost || 0,
        nextDueDate: v.nextDueDate ? v.nextDueDate.format('YYYY-MM-DD') : undefined,
        notes: v.notes?.trim(),
        createdAt: new Date().toISOString()
      };
      dispatch(addMaintenance(record));
      message.success('保养记录已登记，保养周期与计时重新开始');
      setMaintModalOpen(false);
    } catch {
      // 校验失败
    }
  };

  // ---------- 停用 / 重新启用 ----------
  const handleToggleStatus = () => {
    if (instrument.status === 'active') {
      Modal.confirm({
        title: '停用仪器',
        content: '停用后该仪器不能再被排到项目里，确认停用？',
        okText: '确认停用',
        cancelText: '取消',
        onOk: () => {
          dispatch(updateInstrument({ ...instrument, status: 'inactive' }));
          message.success('仪器已停用');
        }
      });
      return;
    }
    const check = canReactivate(instrument, state.instrumentUsages, state.instrumentMaintenances, cancelledIds);
    if (!check.ok) {
      message.error(check.reason);
      return;
    }
    dispatch(updateInstrument({ ...instrument, status: 'active' }));
    message.success('仪器已重新启用');
  };

  const handleDelete = () => {
    Modal.confirm({
      title: '删除仪器台账',
      content: '将同时删除全部使用与保养记录，且不可恢复，确认删除？',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        dispatch(deleteInstrument(instrument.id));
        navigate('/instruments');
      }
    });
  };

  const usageColumns: ColumnsType<InstrumentUsage> = [
    {
      title: '日期',
      dataIndex: 'startTime',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD')
    },
    {
      title: '时段',
      width: 130,
      render: (_, r) => (
        <span>
          <ClockCircleOutlined style={{ color: '#C9A86C', marginRight: 4 }} />
          {formatTime(r.startTime)} - {formatTime(r.endTime)}
        </span>
      )
    },
    {
      title: '本次时长',
      dataIndex: 'durationMinutes',
      width: 100,
      render: (v: number) => <strong>{formatMinutes(v)}</strong>
    },
    {
      title: '项目 / 用途',
      render: (_, r) => {
        const { customer, service } = nameOf(r.customerId, r.serviceId);
        return (
          <Space size={4} wrap>
            {service && <Tag color="purple">{service}</Tag>}
            {customer && <span>{customer}</span>}
            {!service && r.purpose && <span>{r.purpose}</span>}
            {r.appointmentId && (
              <Tooltip title="由预约自动生成">
                <Tag color="blue">预约</Tag>
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    {
      title: '操作',
      width: 120,
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openUsageModal(r)}>
            修改
          </Button>
          <Popconfirm title="确认删除该记录？" onConfirm={() => handleUsageDelete(r)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  const dailyColumns: ColumnsType<(typeof dailySummary)[number]> = [
    {
      title: '日期',
      dataIndex: 'date',
      render: (v: string) => (
        <span>
          <CalendarOutlined style={{ color: '#C9A86C', marginRight: 6 }} />
          {v}
        </span>
      )
    },
    { title: '使用次数', dataIndex: 'count', width: 120, render: (v: number) => `${v} 次` },
    {
      title: '当日合计时长',
      dataIndex: 'totalMinutes',
      width: 160,
      render: (v: number) => <strong style={{ color: '#C9A86C' }}>{formatMinutes(v)}</strong>
    }
  ];

  const alertNode = (() => {
    if (instrument.status === 'inactive') {
      const reactivate = canReactivate(instrument, state.instrumentUsages, state.instrumentMaintenances, cancelledIds);
      return (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          icon={<PauseCircleOutlined />}
          message="该仪器已停用，不能被排到项目里"
          description={
            reactivate.ok
              ? '当前无未完成的保养，可直接重新启用。'
              : `${reactivate.reason} 完成保养后方可重新启用。`
          }
        />
      );
    }
    if (info.status === 'overdue') {
      return (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          icon={<WarningOutlined />}
          message="保养已超期，请立即安排保养"
          description={info.reasons.join('；')}
          action={
            <Button danger type="primary" icon={<ToolOutlined />} onClick={openMaintModal}>
              登记保养
            </Button>
          }
        />
      );
    }
    if (info.status === 'due') {
      return (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="保养已到点，请尽快安排保养"
          description={info.reasons.join('；')}
          action={
            <Button type="primary" icon={<ToolOutlined />} onClick={openMaintModal}>
              登记保养
            </Button>
          }
        />
      );
    }
    if (info.status === 'due_soon') {
      return (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message="保养即将到期，请提前安排"
          description={info.reasons.join('；')}
        />
      );
    }
    return null;
  })();

  return (
    <div>
      <div className="page-header">
        <div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/instruments')}>
              返回
            </Button>
            <h1 className="page-header-title" style={{ marginBottom: 0 }}>
              {instrument.name}
            </h1>
            <Tag color={meta.color} style={{ fontSize: 13, padding: '2px 10px' }}>
              {instrument.status === 'inactive' ? '已停用' : meta.text}
            </Tag>
          </Space>
          <p className="page-header-subtitle" style={{ marginLeft: 72 }}>
            编号 {instrument.code}
          </p>
        </div>
        <Space>
          <Button type="primary" icon={<ToolOutlined />} onClick={openMaintModal}>
            完成保养登记
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => openUsageModal()}>
            登记使用
          </Button>
          <Button
            icon={instrument.status === 'active' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={handleToggleStatus}
          >
            {instrument.status === 'active' ? '停用' : '重新启用'}
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete} />
        </Space>
      </div>

      {alertNode}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card className="card-wrapper" title="仪器档案" bordered={false} style={{ marginBottom: 16 }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="编号">{instrument.code}</Descriptions.Item>
              <Descriptions.Item label="名称">{instrument.name}</Descriptions.Item>
              <Descriptions.Item label="品牌型号">{instrument.brand || '—'}</Descriptions.Item>
              <Descriptions.Item label="购进时间">{instrument.purchaseDate}</Descriptions.Item>
              <Descriptions.Item label="所在房间">{instrument.room}</Descriptions.Item>
              <Descriptions.Item label="保养周期">{instrument.maintenanceIntervalDays} 天</Descriptions.Item>
              <Descriptions.Item label="时长阈值">{formatMinutes(instrument.usageLimitMinutes)}</Descriptions.Item>
              <Descriptions.Item label="下次到期日">{info.nextDueDate.format('YYYY-MM-DD')}</Descriptions.Item>
              <Descriptions.Item label="备注">{instrument.notes || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card className="card-wrapper" bordered={false} style={{ marginBottom: 0 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="本周期累计使用"
                  value={info.usedMinutes}
                  suffix="分钟"
                  valueStyle={{
                    color:
                      info.usedMinutes > info.usageLimitMinutes
                        ? '#ff4d4f'
                        : info.usedMinutes >= info.usageLimitMinutes * 0.9
                        ? '#fa8c16'
                        : '#C9A86C',
                    fontSize: 22
                  }}
                />
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                  阈值 {info.usageLimitMinutes} 分钟（{Math.round((info.usedMinutes / info.usageLimitMinutes) * 100)}%）
                </div>
              </Col>
              <Col span={12}>
                <Statistic title="购进至今总时长" value={formatMinutes(totalMinutes)} valueStyle={{ fontSize: 18 }} />
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>共登记 {usages.length} 次使用</div>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card className="card-wrapper" bordered={false} style={{ marginBottom: 0 }}>
            <Tabs
              defaultActiveKey="usages"
              items={[
                {
                  key: 'usages',
                  label: `使用记录（${usages.length}）`,
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      columns={usageColumns}
                      dataSource={usages}
                      pagination={{ pageSize: 8, showSizeChanger: false }}
                    />
                  )
                },
                {
                  key: 'daily',
                  label: `按日合计（${dailySummary.length}）`,
                  children: (
                    <>
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message="同一台仪器一天使用多次的，时长在此合并计算"
                      />
                      <Table
                        rowKey="date"
                        size="small"
                        columns={dailyColumns}
                        dataSource={dailySummary}
                        pagination={{ pageSize: 8, showSizeChanger: false }}
                      />
                    </>
                  )
                },
                {
                  key: 'maintenances',
                  label: `保养记录（${maintenances.length}）`,
                  children:
                    maintenances.length > 0 ? (
                      <Timeline
                        items={maintenances.map((m) => ({
                          color: m.type === 'repair' ? 'red' : m.type === 'parts_replaced' ? 'orange' : 'green',
                          children: (
                            <div key={m.id}>
                              <Space wrap>
                                <strong>{formatDateTime(m.maintenanceDate)}</strong>
                                <Tag>{MAINT_TYPE_TEXT[m.type]}</Tag>
                                <span style={{ color: '#8c8c8c', fontSize: 13 }}>保养人：{m.operator}</span>
                                <span style={{ color: '#C9A86C', fontSize: 13 }}>{formatCurrency(m.cost)}</span>
                              </Space>
                              <div style={{ marginTop: 4 }}>{m.content}</div>
                              {m.nextDueDate && (
                <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                                  约定下次保养：{dayjs(m.nextDueDate).format('YYYY-MM-DD')}
                                </div>
                              )}
                              {m.notes && <div style={{ fontSize: 12, color: '#aaa' }}>备注：{m.notes}</div>}
                            </div>
                          )
                        }))}
                      />
                    ) : (
                      <div className="empty-state">
                        <ToolOutlined style={{ fontSize: 40, color: '#d9d9d9' }} />
                        <div style={{ marginTop: 12 }}>暂无保养记录</div>
                      </div>
                    )
                }
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* 登记使用 */}
      <Modal
        title={editingUsage ? '修改使用记录' : '登记仪器使用'}
        open={usageModalOpen}
        onOk={handleUsageSubmit}
        onCancel={() => setUsageModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={usageForm} layout="vertical">
          <Form.Item name="date" label="使用日期" rules={[{ required: true, message: '请选择日期' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="timeRange"
            label="使用时段（开始 - 结束）"
            rules={[{ required: true, message: '请选择使用时段' }]}
          >
            <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} order={false} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="serviceId" label="关联项目">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="选填"
                  options={state.services.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customerId" label="服务顾客">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="选填"
                  options={state.customers.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="purpose" label="用途说明">
            <Input placeholder="如：面部射频护理" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 完成保养 */}
      <Modal
        title="完成保养登记"
        open={maintModalOpen}
        onOk={handleMaintSubmit}
        onCancel={() => setMaintModalOpen(false)}
        okText="提交并重置周期"
        cancelText="取消"
      >
        <Form form={maintForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="maintenanceDate" label="保养时间" rules={[{ required: true, message: '请选择时间' }]}>
                <DatePicker showTime={{ format: 'HH:mm' }} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="保养类型" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'completed', label: '常规保养' },
                    { value: 'parts_replaced', label: '更换配件' },
                    { value: 'repair', label: '故障维修' }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="operator" label="保养人">
                <Input placeholder="厂家售后 / 技师姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="cost" label="费用（元）">
                <InputNumber min={0} step={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="保养内容" rules={[{ required: true, message: '请填写保养内容' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="nextDueDate" label="下次保养日期（留空则按周期自动推算）">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InstrumentDetail;
