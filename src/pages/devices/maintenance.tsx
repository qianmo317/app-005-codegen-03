import React, { useMemo, useState } from 'react';
import { Table, Tag, Select, Space, Statistic, Row, Col, Card } from 'antd';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import type { MaintenanceRecord } from '../../types';
import { formatDate, formatCurrency } from '../../utils/format';

const MaintenanceRecords: React.FC = () => {
  const state = useSelector((state: RootState) => state.app);
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredRecords = useMemo(() => {
    return state.maintenanceRecords
      .filter((r) => {
        if (deviceFilter !== 'all' && r.deviceId !== deviceFilter) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (a.maintenanceDate < b.maintenanceDate ? 1 : -1));
  }, [state.maintenanceRecords, deviceFilter, statusFilter]);

  const totalCost = filteredRecords
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + r.cost, 0);
  const inProgressCount = filteredRecords.filter((r) => r.status === 'in_progress').length;

  const columns = [
    {
      title: '仪器',
      key: 'device',
      render: (_: unknown, record: MaintenanceRecord) => {
        const device = state.devices.find((d) => d.id === record.deviceId);
        return device ? (
          <div>
            <div style={{ fontWeight: 500 }}>{device.name}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              {device.code} · {device.room}
            </div>
          </div>
        ) : (
          record.deviceId
        );
      }
    },
    {
      title: '保养日期',
      dataIndex: 'maintenanceDate',
      key: 'maintenanceDate',
      width: 110,
      render: (date: string) => formatDate(date)
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) =>
        type === 'routine' ? <Tag color="blue">常规保养</Tag> : <Tag color="purple">维修</Tag>
    },
    {
      title: '保养内容',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '—'
    },
    {
      title: '费用',
      dataIndex: 'cost',
      key: 'cost',
      width: 110,
      render: (cost: number) => formatCurrency(cost)
    },
    {
      title: '经办人',
      dataIndex: 'performedBy',
      key: 'performedBy',
      width: 100,
      render: (text: string) => text || '—'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) =>
        status === 'in_progress' ? (
          <Tag color="gold">进行中</Tag>
        ) : (
          <Tag color="green">已完成</Tag>
        )
    },
    {
      title: '完成时间',
      key: 'completedAt',
      width: 110,
      render: (_: unknown, record: MaintenanceRecord) =>
        record.completedAt ? formatDate(record.completedAt) : '—'
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      render: (text: string) => text || '—'
    }
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
            <Statistic title="保养记录数" value={filteredRecords.length} suffix="条" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
            <Statistic
              title="进行中"
              value={inProgressCount}
              suffix="条"
              valueStyle={{ color: inProgressCount > 0 ? '#faad14' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
            <Statistic
              title="保养总费用"
              value={totalCost}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#C9A86C' }}
            />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          value={deviceFilter}
          style={{ width: 200 }}
          onChange={setDeviceFilter}
          options={[
            { value: 'all', label: '全部仪器' },
            ...state.devices.map((d) => ({ value: d.id, label: `${d.code} ${d.name}` }))
          ]}
        />
        <Select
          value={statusFilter}
          style={{ width: 120 }}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'in_progress', label: '进行中' },
            { value: 'completed', label: '已完成' }
          ]}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={filteredRecords}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};

export default MaintenanceRecords;
