import axios from 'axios'

/**
 * Backend HTTP 客户端
 * baseURL 走 Vite 代理（/api → http://localhost:3000），
 * 避免 CORS 配置烦恼。
 */
export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
})
