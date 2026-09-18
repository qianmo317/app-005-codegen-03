import React, { useMemo, useState } from 'react';
import {
  Row,
  Col,
  Card,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Modal,
  Form,
  InputNumber,
  DatePicker,
  Table,
  Tooltip,
  message,
  Progress
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ToolOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { RootState } from '../../store';
import { addInstrument, updateInstrument, deleteInstrument } from '../../store';
import type { Instrument, MaintenanceStatus } from '../../types';
import {
  getMaintenanceInfo,
  MAINTENANCE_STATUS_META,
  formatMinutes,
  canReactivate
} from '../../utils/instrument';

const InstrumentList: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const state = useSelector((s: RootState) => s.app);
  const [searchText, setSearchText] = useState('');
  const [roomFilter, setRoomFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | 'all' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Instrument | null>(null);
  const [form] = Form.useForm();

  const cancelledIds = useMemo(
    () =>
      new Set(
        state.appointments
          .filter((a) => a.status === 'cancelled' || a.status === 'no_show')
          .map((a) => a.id)
      ),
    [state.appointments]
  );

  const rows = useMemo(
    () =>
      state.instruments.map((ins) => {
        const info = getMaintenanceInfo(
          ins,
          state.instrumentUsages,
          state.instrumentMaintenances,
          cancelledIds
        );
        return { instrument: ins, info };
      }),
    [state.instruments, state.instrumentUsages, state.instrumentMaintenances, cancelledIds]
  );

  const filtered = rows.filter(({ instrument, info }) => {
    const hitText =
      !searchText ||
      instrument.code.toLowerCase().includes(searchText.toLowerCase()) ||
      instrument.name.includes(searchText) ||
      (instrument.brand || '').includes(searchText);
    const hitRoom = !roomFilter || instrument.room === roomFilter;
    let hitStatus = true;
    if (statusFilter === 'inactive') hitStatus = instrument.status === 'inactive';
    else if (statusFilter !== 'all') {
      hitStatus = instrument.status === 'active' && info.status === statusFilter;
    }
    return hitText && hitRoom && hitStatus;
  });

  const rooms = [...new Set(state.instruments.map((i) => i.room))].sort();

  // 顶部统计
  const activeRows = rows.filter(({ instrument }) => instrument.status === 'active');
  const activeCount = activeRows.length;
  const inactiveCount = state.instruments.length - activeCount;
  const dueCount = activeRows.filter(({ info }) => info.status === 'due').length;
  const overdueCount = activeRows.filter(({ info }) => info.status === 'overdue').length;
  const normalCount = activeRows.filter(
    ({ info }) => info.status === 'normal' || info.status === 'due_soon'
  ).length;

  const statCards = [
    { title: '仪器总数', value: state.instruments.length, sub: `启用 ${activeCount} · 停用 ${inactiveCount}`, color: '#C9A86C' },
    { title: '运行正常', value: normalCount, sub: '含即将到期提醒', color: '#52c41a' },
    { title: '保养到期', value: dueCount, sub: '到点该安排保养', color: '#fa8c16' },
    { title: '已超期', value: overdueCount, sub: '请立即安排保养', color: '#ff4d4f' }
  ];

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      purchaseDate: dayjs(),
      room: rooms[0] || 'V101',
      usageLimitMinutes: 10000,
      maintenanceIntervalDays: 90,
      status: 'active'
    });
    setIsModalOpen(true);
  };

  const handleEdit = (ins: Instrument) => {
    setEditing(ins);
    form.setFieldsValue({
      code: ins.code,
      name: ins.name,
      brand: ins.brand,
      purchaseDate: dayjs(ins.purchaseDate),
      room: ins.room,
      usageLimitMinutes: ins.usageLimitMinutes,
      maintenanceIntervalDays: ins.maintenanceIntervalDays,
      status: ins.status,
      notes: ins.notes
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        brand: values.brand?.trim(),
        purchaseDate: values.purchaseDate.format('YYYY-MM-DD'),
        room: values.room.trim(),
        usageLimitMinutes: values.usageLimitMinutes,
        maintenanceIntervalDays: values.maintenanceIntervalDays,
        status: values.status,
        notes: values.notes?.trim()
      };
      if (editing) {
        dispatch(updateInstrument({ ...editing, ...payload }));
        message.success('仪器信息已更新');
      } else {
        const duplicate = state.instruments.some((i) => i.code === payload.code);
        if (duplicate) {
          message.error('仪器编号已存在，请更换编号');
          return;
        }
        const newInstrument: Instrument = {
          id: `I${Date.now()}`,
          ...payload,
          createdAt: new Date().toISOString()
        };
        dispatch(addInstrument(newInstrument));
        message.success('仪器已登记入账');
      }
      setIsModalOpen(false);
    } catch {
      // 校验未通过
    }
  };

  // 停用 / 重新启用（保养没做完不许重新启用）
  const handleToggleStatus = (ins: Instrument) => {
    if (ins.status === 'active') {
      Modal.confirm({
        title: '停用仪器',
        content: `停用后「${ins.name}（${ins.code}）」将不能再被排到项目里，确认停用？`,
        okText: '确认停用',
        cancelText: '取消',
        onOk: () => {
          dispatch(updateInstrument({ ...ins, status: 'inactive' }));
          message.success('仪器已停用');
        }
      });
      return;
    }
    const check = canReactivate(
      ins,
      state.instrumentUsages,
      state.instrumentMaintenances,
      cancelledIds
    );
    if (!check.ok) {
      Modal.warning({
        title: '暂时无法重新启用',
        content: check.reason,
        okText: '去做保养',
        onOk: () => navigate(`/instruments/${ins.id}`)
      });
      return;
    }
    dispatch(updateInstrument({ ...ins, status: 'active' }));
    message.success('仪器已重新启用');
  };

  const handleDelete = (ins: Instrument) => {
    Modal.confirm({
      title: '删除仪器台账',
      content: `将同时删除「${ins.name}（${ins.code}）」的全部使用与保养记录，且不可恢复，确认删除？`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        dispatch(deleteInstrument(ins.id));
        message.success('已删除');
      }
    });
  };

  const columns: ColumnsType<(typeof rows)[number]> = [
    {
      title: '编号 / 名称',
      dataIndex: 'instrument',
      render: (ins: Instrument) => (
        <div>
          <a onClick={() => navigate(`/instruments/${ins.id}`)} style={{ fontWeight: 600 }}>
            {ins.name}
          </a>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {ins.code} · {ins.brand || '—'}
          </div>
        </div>
      )
    },
    {
      title: '所在房间',
      dataIndex: ['instrument', 'room'],
      width: 100
    },
    {
      title: '购进时间',
      dataIndex: ['instrument', 'purchaseDate'],
      width: 110
    },
    {
      title: '累计使用',
      width: 180,
      render: (_, { info }) => (
        <div style={{ minWidth: 130 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 2 }}>
            {formatMinutes(info.usedMinutes)} / {formatMinutes(info.usageLimitMinutes)}
          </div>
          <Progress
            percent={Math.min(100, Math.round((info.usedMinutes / info.usageLimitMinutes) * 100))}
            size="small"
            showInfo={false}
            strokeColor={
              info.usedMinutes > info.usageLimitMinutes
                ? '#ff4d4f'
                : info.usedMinutes >= info.usageLimitMinutes * 0.9
                ? '#fa8c16'
                : '#C9A86C'
            }
          />
        </div>
      )
    },
    {
      title: '下次保养',
      width: 150,
      render: (_, { info }) => {
        const diff = info.nextDueDate.diff(dayjs().startOf('day'), 'day');
        return (
          <div>
            <ClockCircleOutlined style={{ color: '#C9A86C', marginRight: 4 }} />
            {info.nextDueDate.format('YYYY-MM-DD')}
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              {diff < 0 ? `已超 ${Math.abs(diff)} 天` : diff === 0 ? '今天到期' : `还有 ${diff} 天`}
            </div>
          </div>
        );
      }
    },
    {
      title: '保养状态',
      width: 120,
      render: (_, { instrument, info }) => {
        if (instrument.status === 'inactive') {
          return <Tag color="default">已停用</Tag>;
        }
        const meta = MAINTENANCE_STATUS_META[info.status];
        return (
          <Tooltip title={info.reasons.join('；') || '状态良好'}>
            <Tag
              color={meta.color}
              icon={info.status === 'overdue' ? <WarningOutlined /> : undefined}
              style={{ fontWeight: info.status === 'due' || info.status === 'overdue' ? 600 : 400 }}
            >
              {meta.text}
            </Tag>
          </Tooltip>
        );
      }
    },
    {
      title: '操作',
      width: 230,
      render: (_, { instrument }) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => navigate(`/instruments/${instrument.id}`)}>
            台账
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(instrument)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={instrument.status === 'active' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={() => handleToggleStatus(instrument)}
          >
            {instrument.status === 'active' ? '停用' : '启用'}
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(instrument)} />
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">
            <ToolOutlined style={{ marginRight: 8, color: '#C9A86C' }} />
            仪器使用台账
          </h1>
          <p className="page-header-subtitle">
            按累计使用时长 / 月份周期自动提醒保养，到期与超期分开标记
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          登记新仪器
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {statCards.map((card) => (
          <Col xs={12} md={6} key={card.title}>
            <Card className="card-wrapper" style={{ marginBottom: 0, padding: 16 }}>
              <div style={{ fontSize: 13, color: '#8c8c8c' }}>{card.title}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: card.color, lineHeight: 1.3 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 12, color: '#aaa' }}>{card.sub}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="card-wrapper" bordered={false} style={{ marginTop: 16 }}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索编号 / 名称 / 型号"
            prefix={<SearchOutlined />}
            allowClear
            style={{ width: 240 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Select
            placeholder="房间"
            allowClear
            style={{ width: 140 }}
            value={roomFilter}
            onChange={setRoomFilter}
            options={rooms.map((r) => ({ value: r, label: r }))}
          />
          <Select
            style={{ width: 150 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'normal', label: '正常' },
              { value: 'due_soon', label: '即将到期' },
              { value: 'due', label: '保养到期' },
              { value: 'overdue', label: '已超期' },
              { value: 'inactive', label: '已停用' }
            ]}
          />
        </Space>

        <Table
          rowKey={(r) => r.instrument.id}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>

      <Modal
        title={editing ? '编辑仪器信息' : '登记新仪器'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="code" label="仪器编号" rules={[{ required: true, message: '请输入编号' }]}>
                <Input placeholder="如 YQ-011" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="仪器名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="如 射频美容仪" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="brand" label="品牌 / 型号">
                <Input placeholder="选填" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="room" label="所在房间" rules={[{ required: true, message: '请输入房间' }]}>
                <Input placeholder="如 V101" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="purchaseDate" label="购进时间" rules={[{ required: true, message: '请选择购进日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'active', label: '启用' },
                    { value: 'inactive', label: '停用' }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="usageLimitMinutes"
                label="累计使用保养阈值（分钟）"
                tooltip="本周期累计使用达到该时长即提醒保养"
                rules={[{ required: true, message: '请输入时长阈值' }]}
              >
                <InputNumber min={60} step={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maintenanceIntervalDays"
                label="月份保养周期（天）"
                tooltip="距上次保养（或购进）每满该天数提醒"
                rules={[{ required: true, message: '请输入保养周期' }]}
              >
                <InputNumber min={7} step={30} addonAfter="天" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InstrumentList;
