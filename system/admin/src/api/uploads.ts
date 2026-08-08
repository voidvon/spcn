import apiClient from './client'

export interface UploadResult {
  success: boolean
  message: string
  fileName: string
  relativePath: string
  uploadType: string
}

export const uploadsApi = {
  image: async (file: File, uploadType: 'prod' | 'news' = 'prod') => {
    const formData = new FormData()
    formData.append('uploadfile', file)

    const response = await apiClient.post<UploadResult>('/uploads', formData, {
      params: { utype: uploadType },
    })
    return response.data
  },
}
