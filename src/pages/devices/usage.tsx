import React, { useMemo, useState } from 'react';
import { Table, Tag, Select, DatePicker, Space, Button, Modal, message, Statistic, Row, Col, Card } from 'antd';
import { DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store';
import { deleteDeviceUsage } from '../../store';
import type { DeviceUsage } from '../../types';
import { formatTime } from '../../utils/format';
import { aggregateUsageByDay, formatMinutes, DailyUsageSummary } from '../../utils/device';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const DeviceUsageLedger: React.FC = () => {
  const dispatch = useDispatch();
  const state = useSelector((state: RootState) => state.app);
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, 'day'), dayjs()]);

  const filteredUsages = useMemo(() => {
    const [start, end] = range;
    const startStr = start.format('YYYY-MM-DD');
    const endStr = end.format('YYYY-MM-DD');
    return state.deviceUsages.filter((u) => {
      if (deviceFilter !== 'all' && u.deviceId !== deviceFilter) return false;
      return u.date >= startStr && u.date <= endStr;
    });
  }, [state.deviceUsages, deviceFilter, range]);

  // 同一台仪器一天用了几次合起来算时长
  const dailySummaries = useMemo(() => aggregateUsageByDay(filteredUsages), [filteredUsages]);

  const totalMinutes = filteredUsages.reduce((sum, u) => sum + u.duration, 0);
  const totalCount = filteredUsages.length;

  const getDevice = (deviceId: string) => state.devices.find((d) => d.id === deviceId);

  const handleDelete = (usage: DeviceUsage) => {
    if (usage.appointmentId) {
      message.warning('该记录由预约产生，请通过取消预约来移除');
      return;
    }
    Modal.confirm({
      title: '删除使用记录',
      content: '确定要删除这条使用记录吗？',
      okText: '删除',
      cancelText: '取消',
      onOk: () => {
        dispatch(deleteDeviceUsage(usage.id));
        message.success('使用记录已删除');
      }
    });
  };

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (date: string) => <span style={{ fontWeight: 500 }}>{date}</span>
    },
    {
      title: '仪器',
      key: 'device',
      render: (_: unknown, record: DailyUsageSummary) => {
        const device = getDevice(record.deviceId);
        return device ? (
          <div>
            <div style={{ fontWeight: 500 }}>{device.name}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{device.code}</div>
          </div>
        ) : (
          record.deviceId
        );
      }
    },
    {
      title: '所在房间',
      key: 'room',
      width: 100,
      render: (_: unknown, record: DailyUsageSummary) => {
        const device = getDevice(record.deviceId);
        return device ? <Tag>{device.room}</Tag> : '—';
      }
    },
    {
      title: '使用次数',
      dataIndex: 'count',
      key: 'count',
      width: 100,
      render: (count: number) => <Tag color="blue">{count} 次</Tag>
    },
    {
      title: '合计时长',
      dataIndex: 'totalMinutes',
      key: 'totalMinutes',
      width: 140,
      render: (minutes: number) => (
        <span style={{ color: '#C9A86C', fontWeight: 600 }}>{formatMinutes(minutes)}</span>
      )
    }
  ];

  const expandedRowRender = (record: DailyUsageSummary) => (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      columns={[
        {
          title: '时段',
          key: 'time',
          render: (_: unknown, u: DeviceUsage) =>
            `${formatTime(u.startTime)} - ${formatTime(u.endTime)}`
        },
        {
          title: '时长',
          key: 'duration',
          width: 110,
          render: (_: unknown, u: DeviceUsage) => formatMinutes(u.duration)
        },
        {
          title: '来源',
          key: 'source',
          width: 110,
          render: (_: unknown, u: DeviceUsage) =>
            u.appointmentId ? (
              <Tag icon={<LinkOutlined />} color="purple">
                预约
              </Tag>
            ) : (
              <Tag>手动登记</Tag>
            )
        },
        {
          title: '关联项目',
          key: 'service',
          render: (_: unknown, u: DeviceUsage) => {
            const service = state.services.find((s) => s.id === u.serviceId);
            return service?.name || '—';
          }
        },
        {
          title: '操作员',
          key: 'operator',
          width: 100,
          render: (_: unknown, u: DeviceUsage) => {
            const employee = state.employees.find((e) => e.id === u.operatorId);
            return employee?.name || '—';
          }
        },
        {
          title: '备注',
          dataIndex: 'notes',
          key: 'notes',
          render: (notes: string) => notes || '—'
        },
        {
          title: '操作',
          key: 'action',
          width: 80,
          render: (_: unknown, u: DeviceUsage) => (
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={!!u.appointmentId}
              onClick={() => handleDelete(u)}
            />
          )
        }
      ]}
      dataSource={record.sessions}
    />
  );

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
            <Statistic title="使用总次数" value={totalCount} suffix="次" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" bordered={false} style={{ background: '#fafafa' }}>
            <Statistic
              title="使用总时长"
              value={formatMinutes(totalMinutes)}
              valueStyle={{ color: '#C9A86C' }}
            />
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <RangePicker
          value={range}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setRange([dates[0], dates[1]]);
            }
          }}
          allowClear={false}
        />
        <Select
          value={deviceFilter}
          style={{ width: 200 }}
          onChange={setDeviceFilter}
          options={[
            { value: 'all', label: '全部仪器' },
            ...state.devices.map((d) => ({ value: d.id, label: `${d.code} ${d.name}` }))
          ]}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={dailySummaries}
        rowKey={(r) => `${r.deviceId}|${r.date}`}
        expandable={{ expandedRowRender }}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
};

export default DeviceUsageLedger;
