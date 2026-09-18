import React, { useMemo, useState } from 'react';
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  TimePicker,
  message,
  Row,
  Col,
  Tabs,
  Alert,
  Drawer,
  Descriptions,
  Progress,
  Timeline,
  Tooltip,
  AutoComplete
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  StopOutlined,
  PlayCircleOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import {
  addDevice,
  updateDevice,
  setDeviceStatus,
  addDeviceUsage,
  startMaintenance,
  completeMaintenance
} from '../../store';
import type { Device, DeviceUsage, MaintenanceRecord } from '../../types';
import { formatDate, formatTime, generateId } from '../../utils/format';
import {
  getMaintenanceInfo,
  getDeviceTotalMinutes,
  hasDeviceTimeConflict,
  MAINTENANCE_STATUS_META,
  DEVICE_STATUS_META,
  formatMinutes
} from '../../utils/device';
import DeviceUsageLedger from './usage';
import MaintenanceRecords from './maintenance';
import dayjs from 'dayjs';

const ROOM_OPTIONS = ['101室', '102室', '103室', '105室', '106室', '107室', '108室', '库房'];

const DeviceList: React.FC = () => {
  const dispatch = useDispatch();
  const state = useSelector((state: RootState) => state.app);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [usageDevice, setUsageDevice] = useState<Device | null>(null);
  const [startMaintainDevice, setStartMaintainDevice] = useState<Device | null>(null);
  const [completeMaintainDevice, setCompleteMaintainDevice] = useState<Device | null>(null);
  const [detailDevice, setDetailDevice] = useState<Device | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [maintFilter, setMaintFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();
  const [usageForm] = Form.useForm();
  const [startMaintainForm] = Form.useForm();
  const [completeMaintainForm] = Form.useForm();

  const maintenanceInfoMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getMaintenanceInfo>>();
    state.devices.forEach((d) => {
      map.set(d.id, getMaintenanceInfo(d, state.deviceUsages));
    });
    return map;
  }, [state.devices, state.deviceUsages]);

  const dueDevices = state.devices.filter(
    (d) => d.status !== 'disabled' && maintenanceInfoMap.get(d.id)?.status === 'due'
  );
  const overdueDevices = state.devices.filter(
    (d) => d.status !== 'disabled' && maintenanceInfoMap.get(d.id)?.status === 'overdue'
  );

  const filteredDevices = state.devices.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (maintFilter !== 'all' && maintenanceInfoMap.get(d.id)?.status !== maintFilter) return false;
    if (keyword) {
      const kw = keyword.toLowerCase();
      return (
        d.code.toLowerCase().includes(kw) ||
        d.name.toLowerCase().includes(kw) ||
        d.room.toLowerCase().includes(kw)
      );
    }
    return true;
  });

  const handleAdd = () => {
    setEditingDevice(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'active',
      maintenanceIntervalHours: 200,
      maintenanceIntervalMonths: 6,
      purchaseDate: dayjs(),
      room: '101室'
    });
    setIsModalOpen(true);
  };

  const handleEdit = (device: Device) => {
    setEditingDevice(device);
    form.setFieldsValue({
      code: device.code,
      name: device.name,
      model: device.model,
      room: device.room,
      purchaseDate: dayjs(device.purchaseDate),
      status: device.status,
      maintenanceIntervalHours: device.maintenanceIntervalHours,
      maintenanceIntervalMonths: device.maintenanceIntervalMonths,
      notes: device.notes
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        code: values.code,
        name: values.name,
        model: values.model || '',
        room: values.room,
        purchaseDate: values.purchaseDate.format('YYYY-MM-DD'),
        maintenanceIntervalHours: values.maintenanceIntervalHours ?? 0,
        maintenanceIntervalMonths: values.maintenanceIntervalMonths ?? 0,
        notes: values.notes || ''
      };
      if (editingDevice) {
        const duplicated = state.devices.some(
          (d) => d.code === values.code && d.id !== editingDevice.id
        );
        if (duplicated) {
          message.error('仪器编号已存在');
          return;
        }
        dispatch(updateDevice({ ...editingDevice, ...payload }));
        message.success('仪器信息已更新');
      } else {
        const duplicated = state.devices.some((d) => d.code === values.code);
        if (duplicated) {
          message.error('仪器编号已存在');
          return;
        }
        const newDevice: Device = {
          id: generateId(),
          ...payload,
          status: 'active',
          lastMaintenanceDate: null,
          hoursAtLastMaintenance: 0,
          createdAt: new Date().toISOString()
        };
        dispatch(addDevice(newDevice));
        message.success('仪器已入库');
      }
      setIsModalOpen(false);
    } catch {
      // validation error
    }
  };

  const handleLogUsage = (device: Device) => {
    if (device.status !== 'active') {
      message.error(device.status === 'maintenance' ? '仪器保养中，不能登记使用' : '仪器已停用，不能登记使用');
      return;
    }
    setUsageDevice(device);
    usageForm.resetFields();
    usageForm.setFieldsValue({
      date: dayjs(),
      time: dayjs().minute(Math.floor(dayjs().minute() / 15) * 15),
      duration: 60
    });
  };

  const handleUsageSubmit = async () => {
    if (!usageDevice) return;
    try {
      const values = await usageForm.validateFields();
      const startTime = dayjs(values.date).hour(values.time.hour()).minute(values.time.minute()).second(0);
      const endTime = startTime.add(values.duration, 'minute');
      const conflict = hasDeviceTimeConflict(
        state.deviceUsages,
        usageDevice.id,
        startTime.toISOString(),
        endTime.toISOString()
      );
      if (conflict) {
        message.error('该仪器此时段已被其他项目占用，请更换时段');
        return;
      }
      const usage: DeviceUsage = {
        id: generateId(),
        deviceId: usageDevice.id,
        date: startTime.format('YYYY-MM-DD'),
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration: values.duration,
        notes: values.notes || ''
      };
      dispatch(addDeviceUsage(usage));
      message.success('使用记录已登记');
      setUsageDevice(null);
    } catch {
      // validation error
    }
  };

  const handleStartMaintenance = (device: Device) => {
    setStartMaintainDevice(device);
    startMaintainForm.resetFields();
    startMaintainForm.setFieldsValue({ type: 'routine', performedBy: '' });
  };

  const handleStartMaintenanceSubmit = async () => {
    if (!startMaintainDevice) return;
    try {
      const values = await startMaintainForm.validateFields();
      const futureUsage = state.appointments.filter(
        (a) =>
          a.deviceId === startMaintainDevice.id &&
          a.status !== 'cancelled' &&
          a.status !== 'completed' &&
          new Date(a.startTime).getTime() > Date.now()
      );
      const doStart = () => {
        const record: MaintenanceRecord = {
          id: generateId(),
          deviceId: startMaintainDevice.id,
          maintenanceDate: dayjs().format('YYYY-MM-DD'),
          type: values.type,
          description: values.description || '',
          cost: 0,
          performedBy: values.performedBy || '',
          status: 'in_progress',
          notes: values.notes || ''
        };
        dispatch(startMaintenance(record));
        message.success('已开始保养，仪器标记为保养中');
        setStartMaintainDevice(null);
      };
      if (futureUsage.length > 0) {
        Modal.confirm({
          title: '存在未完成的预约',
          content: `该仪器还有 ${futureUsage.length} 个未完成的预约占用，开始保养后请及时调整这些预约。确认开始保养吗？`,
          okText: '开始保养',
          cancelText: '取消',
          onOk: doStart
        });
      } else {
        doStart();
      }
    } catch {
      // validation error
    }
  };

  const handleCompleteMaintenanceSubmit = async () => {
    if (!completeMaintainDevice) return;
    const record = state.maintenanceRecords.find(
      (r) => r.deviceId === completeMaintainDevice.id && r.status === 'in_progress'
    );
    if (!record) {
      message.error('未找到进行中的保养记录');
      return;
    }
    try {
      const values = await completeMaintainForm.validateFields();
      dispatch(
        completeMaintenance({
          recordId: record.id,
          description: values.description,
          cost: values.cost ?? 0,
          performedBy: values.performedBy,
          notes: values.notes || ''
        })
      );
      message.success('保养已完成，仪器恢复在用');
      setCompleteMaintainDevice(null);
    } catch {
      // validation error
    }
  };

  const handleDisable = (device: Device) => {
    const futureUsage = state.appointments.filter(
      (a) =>
        a.deviceId === device.id &&
        a.status !== 'cancelled' &&
        a.status !== 'completed' &&
        new Date(a.startTime).getTime() > Date.now()
    );
    Modal.confirm({
      title: '停用仪器',
      content:
        futureUsage.length > 0
          ? `该仪器还有 ${futureUsage.length} 个未完成的预约占用，停用后不能再被排到项目里。确认停用吗？`
          : '停用后该仪器不能再被排到项目里，确认停用吗？',
      okText: '确认停用',
      cancelText: '取消',
      onOk: () => {
        dispatch(setDeviceStatus({ id: device.id, status: 'disabled' }));
        message.success('仪器已停用');
      }
    });
  };

  const handleEnable = (device: Device) => {
    const hasOngoing = state.maintenanceRecords.some(
      (r) => r.deviceId === device.id && r.status === 'in_progress'
    );
    if (hasOngoing) {
      message.error('该仪器保养未做完，不许重新启用');
      return;
    }
    dispatch(setDeviceStatus({ id: device.id, status: 'active' }));
    message.success('仪器已重新启用');
  };

  const renderMaintenanceTag = (device: Device) => {
    const info = maintenanceInfoMap.get(device.id);
    if (!info) return null;
    const meta = MAINTENANCE_STATUS_META[info.status];
    const tips: string[] = [];
    if (info.remainingHours !== null) {
      tips.push(
        info.remainingHours >= 0
          ? `距保养还剩 ${info.remainingHours.toFixed(1)} 小时`
          : `已超期 ${Math.abs(info.remainingHours).toFixed(1)} 小时`
      );
    }
    if (info.remainingDays !== null && info.nextDueDate) {
      tips.push(
        info.remainingDays >= 0
          ? `下次保养日期 ${info.nextDueDate}（剩 ${info.remainingDays} 天）`
          : `下次保养日期 ${info.nextDueDate}（超期 ${Math.abs(info.remainingDays)} 天）`
      );
    }
    return (
      <Tooltip title={tips.join('；') || '无需保养'}>
        <Tag color={meta.color} icon={info.status !== 'normal' ? <WarningOutlined /> : undefined}>
          {meta.text}
        </Tag>
      </Tooltip>
    );
  };

  const columns = [
    {
      title: '编号',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <span style={{ fontWeight: 600 }}>{code}</span>
    },
    {
      title: '仪器名称',
      key: 'name',
      render: (_: unknown, record: Device) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.name}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{record.model || '—'}</div>
        </div>
      )
    },
    {
      title: '所在房间',
      dataIndex: 'room',
      key: 'room',
      render: (room: string) => <Tag>{room}</Tag>
    },
    {
      title: '购进时间',
      dataIndex: 'purchaseDate',
      key: 'purchaseDate',
      render: (date: string) => formatDate(date)
    },
    {
      title: '累计使用',
      key: 'totalUsage',
      render: (_: unknown, record: Device) => {
        const total = getDeviceTotalMinutes(record.id, state.deviceUsages);
        return <span>{formatMinutes(total)}</span>;
      }
    },
    {
      title: '保养状态',
      key: 'maintenanceStatus',
      render: (_: unknown, record: Device) => renderMaintenanceTag(record)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: Device['status']) => (
        <Tag color={DEVICE_STATUS_META[status].color}>{DEVICE_STATUS_META[status].text}</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      render: (_: unknown, record: Device) => (
        <Space size={0} wrap>
          <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => setDetailDevice(record)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          {record.status === 'active' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<ClockCircleOutlined />}
                onClick={() => handleLogUsage(record)}
              >
                登记使用
              </Button>
              <Button
                type="link"
                size="small"
                icon={<ToolOutlined />}
                onClick={() => handleStartMaintenance(record)}
              >
                保养
              </Button>
              <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => handleDisable(record)}>
                停用
              </Button>
            </>
          )}
          {record.status === 'maintenance' && (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setCompleteMaintainDevice(record);
                completeMaintainForm.resetFields();
              }}
            >
              完成保养
            </Button>
          )}
          {record.status === 'disabled' && (
            <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handleEnable(record)}>
              启用
            </Button>
          )}
        </Space>
      )
    }
  ];

  const detailInfo = detailDevice ? maintenanceInfoMap.get(detailDevice.id) : null;
  const detailRecords = detailDevice
    ? state.maintenanceRecords
        .filter((r) => r.deviceId === detailDevice.id)
        .sort((a, b) => (a.maintenanceDate < b.maintenanceDate ? 1 : -1))
    : [];
  const detailUsages = detailDevice
    ? state.deviceUsages
        .filter((u) => u.deviceId === detailDevice.id)
        .sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
        .slice(0, 10)
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">仪器管理</h1>
          <p className="page-header-subtitle">
            共 {state.devices.length} 台仪器 · {dueDevices.length} 台保养到期 · {overdueDevices.length} 台保养超期
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          仪器入库
        </Button>
      </div>

      {(dueDevices.length > 0 || overdueDevices.length > 0) && (
        <Alert
          style={{ marginBottom: 16, borderRadius: 12 }}
          type={overdueDevices.length > 0 ? 'error' : 'warning'}
          showIcon
          message={
            <Space size={4} wrap>
              <span>保养提醒：</span>
              {overdueDevices.map((d) => (
                <Tag key={d.id} color="red">
                  {d.code} {d.name} 已超期
                </Tag>
              ))}
              {dueDevices.map((d) => (
                <Tag key={d.id} color="orange">
                  {d.code} {d.name} 到期
                </Tag>
              ))}
            </Space>
          }
        />
      )}

      <Card className="card-wrapper" bordered={false} style={{ padding: '16px 24px' }}>
        <Tabs
          defaultActiveKey="devices"
          items={[
            {
              key: 'devices',
              label: '仪器台账',
              children: (
                <>
                  <Space style={{ marginBottom: 16 }} wrap>
                    <Input.Search
                      placeholder="搜索编号 / 名称 / 房间"
                      allowClear
                      style={{ width: 240 }}
                      onChange={(e) => setKeyword(e.target.value)}
                    />
                    <Select
                      value={statusFilter}
                      style={{ width: 120 }}
                      onChange={setStatusFilter}
                      options={[
                        { value: 'all', label: '全部状态' },
                        { value: 'active', label: '在用' },
                        { value: 'maintenance', label: '保养中' },
                        { value: 'disabled', label: '停用' }
                      ]}
                    />
                    <Select
                      value={maintFilter}
                      style={{ width: 140 }}
                      onChange={setMaintFilter}
                      options={[
                        { value: 'all', label: '全部保养状态' },
                        { value: 'normal', label: '正常' },
                        { value: 'due', label: '保养到期' },
                        { value: 'overdue', label: '保养超期' }
                      ]}
                    />
                  </Space>
                  <Table
                    columns={columns}
                    dataSource={filteredDevices}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                  />
                </>
              )
            },
            {
              key: 'usage',
              label: '使用台账',
              children: <DeviceUsageLedger />
            },
            {
              key: 'maintenance',
              label: '保养记录',
              children: <MaintenanceRecords />
            }
          ]}
        />
      </Card>

      <Modal
        title={editingDevice ? '编辑仪器' : '仪器入库'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        okText="确认"
        cancelText="取消"
        width={560}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="仪器编号"
                rules={[{ required: true, message: '请输入仪器编号' }]}
              >
                <Input placeholder="如 EQ-009" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="name"
                label="仪器名称"
                rules={[{ required: true, message: '请输入仪器名称' }]}
              >
                <Input placeholder="请输入仪器名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="model" label="型号">
                <Input placeholder="请输入型号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="room"
                label="所在房间"
                rules={[{ required: true, message: '请选择所在房间' }]}
              >
                <AutoComplete
                  placeholder="选择或输入房间"
                  options={ROOM_OPTIONS.map((r) => ({ value: r }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="purchaseDate"
                label="购进时间"
                rules={[{ required: true, message: '请选择购进时间' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maintenanceIntervalHours"
                label="保养周期（累计使用小时，0为不限）"
                rules={[{ required: true, message: '请输入保养周期' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={10} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="maintenanceIntervalMonths"
                label="保养周期（月份，0为不限）"
                rules={[{ required: true, message: '请输入保养周期' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={1} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`登记使用 - ${usageDevice?.name ?? ''}`}
        open={!!usageDevice}
        onOk={handleUsageSubmit}
        onCancel={() => setUsageDevice(null)}
        okText="确认登记"
        cancelText="取消"
        width={480}
      >
        <Form form={usageForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="date"
                label="使用日期"
                rules={[{ required: true, message: '请选择日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="time"
                label="开始时间"
                rules={[{ required: true, message: '请选择开始时间' }]}
              >
                <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={15} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="duration"
            label="使用时长（分钟）"
            rules={[{ required: true, message: '请输入使用时长' }]}
          >
            <InputNumber style={{ width: '100%' }} min={5} step={15} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="用途说明（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`开始保养 - ${startMaintainDevice?.name ?? ''}`}
        open={!!startMaintainDevice}
        onOk={handleStartMaintenanceSubmit}
        onCancel={() => setStartMaintainDevice(null)}
        okText="开始保养"
        cancelText="取消"
        width={480}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="开始保养后仪器将标记为「保养中」，期间不能被排到项目里，保养完成后才能恢复使用。"
        />
        <Form form={startMaintainForm} layout="vertical">
          <Form.Item
            name="type"
            label="保养类型"
            rules={[{ required: true, message: '请选择保养类型' }]}
          >
            <Select
              options={[
                { value: 'routine', label: '常规保养' },
                { value: 'repair', label: '维修' }
              ]}
            />
          </Form.Item>
          <Form.Item name="performedBy" label="经办人">
            <Input placeholder="保养经办人（选填）" />
          </Form.Item>
          <Form.Item name="description" label="保养内容">
            <Input.TextArea rows={2} placeholder="保养内容（选填）" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="备注（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`完成保养 - ${completeMaintainDevice?.name ?? ''}`}
        open={!!completeMaintainDevice}
        onOk={handleCompleteMaintenanceSubmit}
        onCancel={() => setCompleteMaintainDevice(null)}
        okText="完成保养"
        cancelText="取消"
        width={480}
      >
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message="完成保养后将重置仪器的保养计时，仪器恢复「在用」状态。"
        />
        <Form form={completeMaintainForm} layout="vertical">
          <Form.Item
            name="description"
            label="保养内容"
            rules={[{ required: true, message: '请填写保养内容' }]}
          >
            <Input.TextArea rows={2} placeholder="如：更换滤芯、校准能量输出" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="cost"
                label="保养费用（元）"
                rules={[{ required: true, message: '请输入保养费用' }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={10} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="performedBy"
                label="经办人"
                rules={[{ required: true, message: '请填写经办人' }]}
              >
                <Input placeholder="保养经办人" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="备注（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detailDevice ? `${detailDevice.code} ${detailDevice.name}` : ''}
        open={!!detailDevice}
        onClose={() => setDetailDevice(null)}
        width={520}
      >
        {detailDevice && detailInfo && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="编号">{detailDevice.code}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={DEVICE_STATUS_META[detailDevice.status].color}>
                  {DEVICE_STATUS_META[detailDevice.status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="名称">{detailDevice.name}</Descriptions.Item>
              <Descriptions.Item label="型号">{detailDevice.model || '—'}</Descriptions.Item>
              <Descriptions.Item label="所在房间">{detailDevice.room}</Descriptions.Item>
              <Descriptions.Item label="购进时间">{formatDate(detailDevice.purchaseDate)}</Descriptions.Item>
              <Descriptions.Item label="累计使用">
                {formatMinutes(detailInfo.totalMinutes)}
              </Descriptions.Item>
              <Descriptions.Item label="保养周期">
                {detailDevice.maintenanceIntervalHours > 0
                  ? `${detailDevice.maintenanceIntervalHours}小时`
                  : ''}
                {detailDevice.maintenanceIntervalHours > 0 && detailDevice.maintenanceIntervalMonths > 0
                  ? ' / '
                  : ''}
                {detailDevice.maintenanceIntervalMonths > 0
                  ? `${detailDevice.maintenanceIntervalMonths}个月`
                  : ''}
                {detailDevice.maintenanceIntervalHours <= 0 && detailDevice.maintenanceIntervalMonths <= 0
                  ? '不限'
                  : ''}
              </Descriptions.Item>
              <Descriptions.Item label="上次保养">
                {detailDevice.lastMaintenanceDate ? formatDate(detailDevice.lastMaintenanceDate) : '从未保养'}
              </Descriptions.Item>
              <Descriptions.Item label="下次保养">
                {detailInfo.nextDueDate ? detailInfo.nextDueDate : '—'}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ margin: '16px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 500 }}>保养状态</span>
                {renderMaintenanceTag(detailDevice)}
              </div>
              {detailDevice.maintenanceIntervalHours > 0 && (
                <>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                    距上次保养已使用 {formatMinutes(detailInfo.usedMinutesSinceLast)} / {detailDevice.maintenanceIntervalHours}小时
                  </div>
                  <Progress
                    percent={Math.min(
                      100,
                      Math.round(
                        (detailInfo.usedMinutesSinceLast / 60 / detailDevice.maintenanceIntervalHours) * 100
                      )
                    )}
                    status={detailInfo.status === 'overdue' ? 'exception' : 'active'}
                    strokeColor={detailInfo.status === 'normal' ? '#C9A86C' : undefined}
                  />
                </>
              )}
              {detailDevice.notes && (
                <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 8 }}>备注：{detailDevice.notes}</div>
              )}
            </div>

            <Card title="保养记录" size="small" style={{ marginTop: 16 }}>
              {detailRecords.length > 0 ? (
                <Timeline
                  items={detailRecords.map((r) => ({
                    color: r.status === 'in_progress' ? 'gold' : 'green',
                    children: (
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {formatDate(r.maintenanceDate)} · {r.type === 'routine' ? '常规保养' : '维修'}
                          {r.status === 'in_progress' && (
                            <Tag color="gold" style={{ marginLeft: 8 }}>进行中</Tag>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#595959' }}>{r.description || '—'}</div>
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                          经办：{r.performedBy || '—'} · 费用：¥{r.cost.toFixed(2)}
                          {r.completedAt ? ` · 完成于 ${formatDate(r.completedAt)}` : ''}
                        </div>
                      </div>
                    )
                  }))}
                />
              ) : (
                <div className="empty-state" style={{ padding: '24px 0' }}>暂无保养记录</div>
              )}
            </Card>

            <Card title="最近使用" size="small" style={{ marginTop: 16 }}>
              {detailUsages.length > 0 ? (
                detailUsages.map((u) => {
                  const service = state.services.find((s) => s.id === u.serviceId);
                  return (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid #f5f5f5',
                        fontSize: 13
                      }}
                    >
                      <span>
                        {formatDate(u.startTime)} {formatTime(u.startTime)}-{formatTime(u.endTime)}
                      </span>
                      <span style={{ color: '#8c8c8c' }}>{service?.name || '手动登记'}</span>
                      <span style={{ color: '#C9A86C', fontWeight: 500 }}>{formatMinutes(u.duration)}</span>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state" style={{ padding: '24px 0' }}>暂无使用记录</div>
              )}
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
};

export default DeviceList;
