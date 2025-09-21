import { fetchImageFromSupabase } from '../lib/supabase';

// Type definition for ImageCapture API
interface ImageCaptureWindow extends Window {
  ImageCapture?: typeof ImageCapture;
}

// Fetch image from Supabase storage
export const fetchImageFromSupabaseStorage = async (): Promise<Blob | null> => {
  try {
    const blob = await fetchImageFromSupabase('cam01', 'image.jpg');
    return blob;
  } catch (error: unknown) {
    throw new Error('Lỗi tải ảnh từ Supabase: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

// Capture from device camera
export const captureFromDeviceCamera = async (): Promise<Blob> => {
  const stream = await navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' } 
  });
  
  try {
    const track = stream.getVideoTracks()[0];
    const imageCapture = ('ImageCapture' in window) ? new (window as ImageCaptureWindow).ImageCapture(track) : null;
    let blob: Blob;
    
    if (imageCapture && imageCapture.takePhoto) {
      blob = await imageCapture.takePhoto();
    } else {
      // Fallback: draw frame to canvas
      const video = document.createElement('video');
      video.srcObject = stream;
      await new Promise(r => video.onloadedmetadata = r);
      video.play();
      await new Promise(r => setTimeout(r, 150));
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const res = await fetch(dataUrl);
      blob = await res.blob();
    }
    return blob;
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
};
