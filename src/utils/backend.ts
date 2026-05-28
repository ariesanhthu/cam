import { Settings } from '../types';

export const sendToBackend = async (
  blob: Blob | null,
  promptText: string,
  settings: Settings
): Promise<string> => {
  const backendUrl = settings.backendUrl.trim();
  if (!backendUrl) {
    throw new Error('Chưa cài đặt địa chỉ server');
  }

  let apiUrl: string;
  try {
    apiUrl = new URL(backendUrl).toString();
  } catch {
    throw new Error('Địa chỉ server không hợp lệ');
  }

  const formData = new FormData();

  if (blob) {
    const file = new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
    formData.append('file', file);
  } else {
    const emptyBlob = new Blob([''], { type: 'image/jpeg' });
    const emptyFile = new File([emptyBlob], 'empty.jpg', { type: 'image/jpeg' });
    formData.append('file', emptyFile);
  }

  formData.append('prompt', promptText);
  formData.append('language', settings.language || 'vi');

  console.log('=== BACKEND REQUEST DEBUG ===');
  console.log('Sending to:', apiUrl);
  console.log('Prompt text:', promptText);
  console.log('Settings:', settings);
  console.log('FormData contents:');

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      console.log(key, `File: ${value.name}, size: ${value.size}, type: ${value.type}`);
    } else {
      console.log(key, value);
    }
  }

  console.log('=== END DEBUG ===');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      mode: 'cors',
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    console.log('Response content-type:', contentType);

    let result = '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('Response JSON data:', data);

      if (data.status === 'success') {
        result = data.text || '';
      } else if (data.status === 'error') {
        result = data.text || 'Có lỗi xảy ra';
      } else if (data.status === 'clarify') {
        result = data.text || 'Cần làm rõ thêm';
      } else {
        result = data.text || data.result || data.message || '';
      }
    } else {
      result = await response.text();
      console.log('Response text:', result);
    }

    console.log('Final result:', result);
    return String(result || '').trim();
  } catch (error: unknown) {
    console.error('Fetch error:', error);

    if (
      error instanceof Error &&
      error.name === 'TypeError' &&
      error.message.includes('fetch')
    ) {
      throw new Error('Không thể kết nối đến server. Kiểm tra địa chỉ server và mạng.');
    }

    throw error;
  }
};
