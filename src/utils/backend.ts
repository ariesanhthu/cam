import { Settings } from '../types';

// Send to backend
export const sendToBackend = async (blob: Blob | null, promptText: string, settings: Settings): Promise<string> => {
  if (!settings.backendUrl.trim()) {
    throw new Error('Chưa cài đặt địa chỉ server');
  }
  
  const formData = new FormData();
  
  // Backend yêu cầu file bắt buộc, nếu không có thì tạo file trống
  if (blob) {
    const file = new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' });
    formData.append('file', file);
  } else {
    // Tạo file trống nếu không có ảnh
    const emptyBlob = new Blob([''], { type: 'image/jpeg' });
    const emptyFile = new File([emptyBlob], 'empty.jpg', { type: 'image/jpeg' });
    formData.append('file', emptyFile);
  }
  
  formData.append('prompt', promptText);
  formData.append('language', settings.language || 'vi');

  // Ensure URL ends with /analyze endpoint
  let apiUrl = settings.backendUrl.trim();
  if (!apiUrl.endsWith('/analyze')) {
    apiUrl = apiUrl.replace(/\/$/, '') + '/analyze';
  }
  
  // Validate URL format
  try {
    new URL(apiUrl);
  } catch {
    throw new Error('Địa chỉ server không hợp lệ');
  }
  
  // Debug: log request details
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
      headers: {
        // Không set Content-Type, để browser tự set với boundary cho FormData
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let result = '';
    
    console.log('Response content-type:', contentType);
    
    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('Response JSON data:', data);
      // Backend trả về { "status": "success", "text": "...", "intent": "..." }
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
  } catch (fetchError: unknown) {
    console.error('Fetch error:', fetchError);
    if (fetchError instanceof Error && fetchError.name === 'TypeError' && fetchError.message.includes('fetch')) {
      throw new Error('Không thể kết nối đến server. Kiểm tra địa chỉ server và kết nối mạng.');
    }
    throw fetchError;
  }
};
