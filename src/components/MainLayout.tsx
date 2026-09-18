import React from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Badge, Tag } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  ScheduleOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  BellOutlined,
  ToolOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { getMaintenanceInfo, MAINTENANCE_STATUS_META } from '../utils/device';

const { Header, Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const devices = useSelector((state: RootState) => state.app.devices);
  const deviceUsages = useSelector((state: RootState) => state.app.deviceUsages);

  const maintenanceReminders = devices
    .filter((d) => d.status !== 'disabled')
    .map((d) => ({ device: d, info: getMaintenanceInfo(d, deviceUsages) }))
    .filter((x) => x.info.status !== 'normal')
    .sort((a, b) => (a.info.status === 'overdue' ? -1 : 1) - (b.info.status === 'overdue' ? -1 : 1));

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: '/customers',
      icon: <TeamOutlined />,
      label: '顾客管理',
    },
    {
      key: '/services',
      icon: <AppstoreOutlined />,
      label: '项目管理',
    },
    {
      key: '/appointments',
      icon: <CalendarOutlined />,
      label: '预约排期',
    },
    {
      key: '/devices',
      icon: <ToolOutlined />,
      label: '仪器管理',
    },
    {
      key: '/schedules',
      icon: <ScheduleOutlined />,
      label: '员工排班',
    },
    {
      key: '/employees',
      icon: <UserOutlined />,
      label: '员工管理',
    },
  ];

  const userMenu = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: '个人中心',
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: '系统设置',
      },
      {
        type: 'divider' as const,
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
      },
    ],
  };

  const reminderMenu = {
    items:
      maintenanceReminders.length > 0
        ? maintenanceReminders.map((x) => ({
            key: x.device.id,
            icon: <WarningOutlined style={{ color: x.info.status === 'overdue' ? '#ff4d4f' : '#faad14' }} />,
            label: (
              <Space>
                <span>
                  {x.device.code} {x.device.name}
                </span>
                <Tag color={MAINTENANCE_STATUS_META[x.info.status].color} style={{ marginInlineEnd: 0 }}>
                  {MAINTENANCE_STATUS_META[x.info.status].text}
                </Tag>
              </Space>
            ),
          }))
        : [
            {
              key: 'empty',
              label: '暂无保养提醒',
              disabled: true,
            },
          ],
    onClick: () => navigate('/devices'),
  };

  return (
    <Layout className="app-container">
      <Header className="app-header">
        <div className="app-logo">
          <span>✦</span>
          <span>雅尚美容院管理系统</span>
        </div>
        <Space size="large">
          <Dropdown menu={reminderMenu} placement="bottomRight" trigger={['click']}>
            <Badge count={maintenanceReminders.length} size="small" offset={[-2, 2]}>
              <BellOutlined style={{ fontSize: 18, color: '#fff', cursor: 'pointer' }} />
            </Badge>
          </Dropdown>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                style={{ backgroundColor: '#fff', color: '#C9A86C' }}
                icon={<UserOutlined />}
              />
              <span style={{ color: '#fff' }}>管理员</span>
            </Space>
          </Dropdown>
        </Space>
      </Header>
      <Layout style={{ background: '#FAFAFA' }}>
        <Sider width={220} theme="light" className="app-sidebar">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ height: '100%', borderInlineEnd: 'none' }}
          />
        </Sider>
        <Content className="app-main">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
