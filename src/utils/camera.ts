interface ImageCaptureWindow extends Window {
  ImageCapture?: typeof ImageCapture;
}

const backendBaseUrl = (backendUrl: string): string => {
  const url = new URL(backendUrl);
  url.pathname = url.pathname.replace(/\/?analyze\/?$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

export const fetchImageFromBackend = async (backendUrl: string): Promise<Blob> => {
  const response = await fetch(`${backendBaseUrl(backendUrl)}/camera/image`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    const message = response.status === 404
      ? 'Backend chưa có ảnh camera local'
      : `Không thể tải ảnh từ backend (HTTP ${response.status})`;
    throw new Error(message);
  }
  return response.blob();
};

export const captureFromDeviceCamera = async (): Promise<Blob> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });

  try {
    const track = stream.getVideoTracks()[0];
    const imageCapture = 'ImageCapture' in window && (window as ImageCaptureWindow).ImageCapture
      ? new (window as ImageCaptureWindow).ImageCapture!(track)
      : null;
    if (imageCapture?.takePhoto) return await imageCapture.takePhoto();

    const video = document.createElement('video');
    video.srcObject = stream;
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
    });
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Không thể tạo ảnh từ camera thiết bị');
    return blob;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
};
