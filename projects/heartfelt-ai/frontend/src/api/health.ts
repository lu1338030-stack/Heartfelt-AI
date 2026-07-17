import { apiClient } from './client'
import type { HealthLiveness, HealthReadiness } from './types'

/** GET /api/v1/health */
export async function getLiveness(): Promise<HealthLiveness> {
  const { data } = await apiClient.get('/health')
  return data
}

/** GET /api/v1/health/ready */
export async function getReadiness(): Promise<HealthReadiness> {
  const { data } = await apiClient.get('/health/ready')
  return data
}
