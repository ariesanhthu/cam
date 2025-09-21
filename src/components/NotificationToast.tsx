import { Notification } from '../types';

interface NotificationToastProps {
  notification: Notification;
}

export const NotificationToast = ({ notification }: NotificationToastProps) => {
  return (
    <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 transition-all duration-300 z-50 ${
      notification.show ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
    }`}>
      <div className={`px-8 py-4 rounded-full text-base font-medium text-center max-w-80 ${
        notification.type === 'error' 
          ? 'bg-red-500 text-white' 
          : 'bg-green-500 text-white'
      }`}>
        {notification.message}
      </div>
    </div>
  );
};
