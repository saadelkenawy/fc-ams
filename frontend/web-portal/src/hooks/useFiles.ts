import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fileApi } from '@/lib/api';

export interface FileRecord {
  id:           string;
  fileKey:      string;
  originalName: string;
  mimeType:     string;
  sizeBytes:    number;
  entityType:   string;
  entityId:     string;
  description?: string;
  uploadedBy:   string;
  createdAt:    string;
}

export interface UploadInitResponse {
  fileId:    string;
  uploadUrl: string;
  fileKey:   string;
  expiresIn: number;
}

export function useEntityFiles(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ['files', entityType, entityId],
    queryFn: async () => {
      const { data } = await fileApi.get<{ success: boolean; data: FileRecord[] }>(
        `/files?entityType=${entityType}&entityId=${entityId}`,
      );
      return data.data;
    },
    enabled: !!entityId,
    staleTime: 30_000,
  });
}

export function useFileDownloadUrl(fileId: string | null) {
  return useQuery({
    queryKey: ['file-download', fileId],
    queryFn: async () => {
      const { data } = await fileApi.get<{ success: boolean; data: FileRecord & { downloadUrl: string } }>(
        `/files/${fileId}/download`,
      );
      return data.data;
    },
    enabled: !!fileId,
    staleTime: 0,
    cacheTime: 0,
  });
}

export function useUploadFile(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      // Step 1: initiate upload — get presigned PUT URL
      const { data: initData } = await fileApi.post<{ success: boolean; data: UploadInitResponse }>(
        '/files/upload/initiate',
        {
          originalName: file.name,
          mimeType:     file.type || 'application/octet-stream',
          sizeBytes:    file.size,
          entityType,
          entityId,
        },
      );
      const { uploadUrl, fileId } = initData.data;

      // Step 2: PUT file directly to MinIO presigned URL
      await fetch(uploadUrl, {
        method:  'PUT',
        body:    file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      return fileId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['files', entityType, entityId] });
    },
  });
}

export function useDeleteFile(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: string) => {
      await fileApi.delete(`/files/${fileId}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['files', entityType, entityId] });
    },
  });
}
