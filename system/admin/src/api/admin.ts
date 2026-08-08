import apiClient from './client'
import type { Admin, ApiResponse } from '@/types'

export type SystemVersionStatus = {
  current_version: string
  current_version_source: string
  update_supported: boolean
  latest_version: string | null
  latest_tag: string | null
  has_update: boolean
  release_url: string
  release_name: string | null
  published_at: string | null
  repository: string
  checking_error: string | null
  update_in_progress: boolean
  auto_restart: boolean
  can_update: boolean
  can_restart: boolean
}

export type SystemUpdateResult = {
  updated: boolean
  previous_version?: string
  current_version: string
  latest_version: string
  message: string
  restart_required: boolean
  restarting: boolean
  backup_directory?: string
}

export type SystemRestartResult = {
  message: string
  restarting: boolean
}

export const adminApi = {
  getSystemVersion: async (refresh = false) => {
    const response = await apiClient.get<ApiResponse<SystemVersionStatus>>('/admin/system-version', {
      params: refresh ? { refresh: '1' } : undefined,
      timeout: 30 * 1000,
    })
    return response.data
  },

  installSystemUpdate: async () => {
    const response = await apiClient.post<ApiResponse<SystemUpdateResult>>(
      '/admin/system-version/update',
      {},
      { timeout: 15 * 60 * 1000 },
    )
    return response.data
  },

  restartSystem: async () => {
    const response = await apiClient.post<ApiResponse<SystemRestartResult>>(
      '/admin/system-version/restart',
      {},
      { timeout: 30 * 1000 },
    )
    return response.data
  },

  list: async () => {
    const response = await apiClient.get<ApiResponse<Admin[]>>('/admin/list')
    return response.data
  },

  create: async (data: { username: string; password: string }) => {
    const response = await apiClient.post<ApiResponse<Admin>>('/admin', data)
    return response.data
  },

  update: async (id: number, data: { username: string }) => {
    const response = await apiClient.put<ApiResponse<Admin>>(`/admin/${id}`, data)
    return response.data
  },

  updatePassword: async (id: number, data: { password: string }) => {
    const response = await apiClient.put<ApiResponse<void>>(`/admin/${id}/password`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/admin/${id}`)
    return response.data
  },
}
