import axios, { AxiosInstance } from 'axios';

interface User {
  id: number;
  username: string;
  email?: string;
  role: string;
  enabled: boolean;
  createdAt: string;
}

interface Project {
  id?: number;
  name: string;
  description?: string;
  gitUrl?: string;
  gitBranch?: string;
  projectPath?: string;
  buildTool?: string;
  buildCommand?: string;
  deployPath?: string;
  autoDeploy?: boolean;
  healthCheckUrl?: string;
  createdBy?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface Server {
  id?: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  description?: string;
  connectionStatus?: string;
  lastCheckAt?: string;
  createdBy?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface LogEntry {
  id: number;
  level: string;
  source: string;
  message: string;
  operationType?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  userId?: number;
  userName?: string;
  createdAt: string;
  timestamp: string;
}

interface LoginResponse {
  success: boolean;
  message?: string;
  user: User;
  token: string;
}

class BackendService {
  private api: AxiosInstance;

  constructor() {
    const apiBaseUrl = (process.env.REACT_APP_API_BASE_URL || '/api').replace(/\/$/, '');

    this.api = axios.create({
      baseURL: apiBaseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // 认证相关
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await this.api.post('/auth/login', { username, password });
    return response.data;
  }

  async register(username: string, password: string, email?: string, role?: string) {
    const response = await this.api.post('/auth/register', { username, password, email, role });
    return response.data;
  }

  // 项目相关
  async getProjects(): Promise<Project[]> {
    const response = await this.api.get('/projects');
    return response.data.data;
  }

  async getProject(id: number | string): Promise<Project> {
    const response = await this.api.get(`/projects/${id}`);
    return response.data.data;
  }

  async createProject(project: Project): Promise<Project> {
    const response = await this.api.post('/projects', project);
    return response.data.data;
  }

  async updateProject(id: number | string, project: Project): Promise<Project> {
    const response = await this.api.put(`/projects/${id}`, project);
    return response.data.data;
  }

  async deleteProject(id: number | string): Promise<void> {
    await this.api.post('/projects/delete', { id: id.toString() });
  }

  // 服务器相关
  async getServers(): Promise<Server[]> {
    const response = await this.api.get('/servers');
    return response.data.data;
  }

  async getServer(id: number | string): Promise<Server> {
    const response = await this.api.get(`/servers/${id}`);
    return response.data.data;
  }

  async createServer(server: Server): Promise<Server> {
    const response = await this.api.post('/servers', server);
    return response.data.data;
  }

  async updateServer(id: number | string, server: Server): Promise<Server> {
    const response = await this.api.put(`/servers/${id}`, server);
    return response.data.data;
  }

  async deleteServer(id: number | string): Promise<void> {
    await this.api.post('/servers/delete', { id: id.toString() });
  }

  async testServerConnection(id: number | string): Promise<boolean> {
    const response = await this.api.post('/servers/test-connection', { id: id.toString() });
    return response.data.connected;
  }

  // 日志相关
  async getLogs(params: {
    page?: number;
    size?: number;
    level?: string;
    source?: string;
    targetUserId?: string;
    startTime?: string;
    endTime?: string;
  } = {}): Promise<{
    data: LogEntry[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
    size: number;
  }> {
    const response = await this.api.get('/logs', { params });
    return response.data;
  }

  async createLog(level: string, source: string, message: string): Promise<LogEntry> {
    const response = await this.api.post('/logs', { level, source, message });
    return response.data.data;
  }
}

const backendService = new BackendService();

export default backendService;
