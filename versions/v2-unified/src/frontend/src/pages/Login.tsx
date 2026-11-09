import React from 'react';
import { Form, Input, Button, Checkbox, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiPostData, ApiRequestError } from '../utils/api';
import { useI18n } from '../utils/i18n';
import './Login.css';

interface LoginForm {
  username: string;
  password: string;
  remember: boolean;
}

interface RememberedCredentials {
  username: string;
  password: string;
}

interface LoginUser {
  id: number;
  username: string;
  email?: string;
  role: string;
  permissions?: string[];
  is_active?: boolean;
}

interface LoginResponse {
  token: string;
  user: LoginUser;
}

const REMEMBER_CREDENTIALS_KEY = 'remembered_login_credentials';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginForm>();
  const [loading, setLoading] = React.useState(false);
  const { login } = useAuth();
  const { t } = useI18n();

  React.useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_CREDENTIALS_KEY);
    if (!saved) {
      return;
    }

    try {
      const credentials = JSON.parse(saved) as RememberedCredentials;
      if (!credentials.username || !credentials.password) {
        localStorage.removeItem(REMEMBER_CREDENTIALS_KEY);
        return;
      }

      form.setFieldsValue({
        username: credentials.username,
        password: credentials.password,
        remember: true
      });
    } catch {
      localStorage.removeItem(REMEMBER_CREDENTIALS_KEY);
    }
  }, [form]);

  const onFinish = async (values: LoginForm) => {
    const { username, password, remember } = values;
    setLoading(true);
    try {
      const loginData = await apiPostData<LoginResponse>('/api/auth/login', { username, password }, { auth: false });
      login(loginData.token, loginData.user);

      if (remember) {
        localStorage.setItem(REMEMBER_CREDENTIALS_KEY, JSON.stringify({ username, password }));
      } else {
        localStorage.removeItem(REMEMBER_CREDENTIALS_KEY);
      }

      message.success(t('登录成功', 'Login successful'));
      navigate('/dashboard');
    } catch (error) {
      console.error(t('登录错误:', 'Login error:'), error);
      if (error instanceof ApiRequestError) {
        message.error(error.message || t('登录失败', 'Login failed'));
      } else {
        message.error(t('登录失败，请检查网络连接', 'Login failed, please check your network connection'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <div className="login-title">{t('自动化部署系统', 'Auto Deploy System')}</div>
        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
          initialValues={{ remember: false }}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('请输入用户名', 'Please enter username') }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('用户名', 'Username')} />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('请输入密码', 'Please enter password') }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={t('密码', 'Password')}
            />
          </Form.Item>

          <Form.Item
            name="remember"
            valuePropName="checked"
            className="remember-item"
          >
            <Checkbox className="remember-checkbox">{t('记住密码', 'Remember password')}</Checkbox>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              style={{ width: '100%' }}
            >
              {t('登录', 'Login')}
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

export default Login;
