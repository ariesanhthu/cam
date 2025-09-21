import { Settings } from '../types';

interface SettingsPanelProps {
  settingsOpen: boolean;
  settings: Settings;
  onClose: () => void;
  onSettingsChange: (settings: Settings) => void;
  onSave: () => void;
  onReset: () => void;
}

export const SettingsPanel = ({ 
  settingsOpen, 
  settings, 
  onClose, 
  onSettingsChange, 
  onSave, 
  onReset 
}: SettingsPanelProps) => {
  return (
    <div className={`fixed top-0 right-0 w-full max-w-lg h-screen bg-white dark:bg-gray-900 border-l border-gray-300 dark:border-gray-600 transition-transform duration-300 overflow-y-auto z-40 p-20 ${
      settingsOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'
    }`}>
      <button
        onClick={onClose}
        className="absolute top-5 right-5 w-12 h-12 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-full text-2xl cursor-pointer"
        aria-label="Đóng cài đặt"
      >
        ✕
      </button>
      
      <div className="space-y-8">
        {/* Backend Settings */}
        <div className="p-5 border border-gray-300 dark:border-gray-600 rounded-lg">
          <h2 className="text-lg font-bold mb-4 text-sky-500">Backend Server</h2>
          <label className="block mb-2 font-medium text-sm">
            Backend URL (ví dụ: http://192.168.1.2:5000/analyze)
          </label>
          <input
            type="url"
            value={settings.backendUrl}
            onChange={(e) => onSettingsChange({ ...settings, backendUrl: e.target.value })}
            placeholder="http://192.168.1.2:5000/analyze"
            className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-base bg-white dark:bg-gray-800 text-black dark:text-white mb-4"
          />
          
          <div className="flex gap-3">
            <button
              onClick={onSave}
              className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors duration-200"
            >
              💾 Lưu
            </button>
            
            <button
              onClick={onReset}
              className="flex-1 py-3 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors duration-200"
            >
              🔄 Reset
            </button>
          </div>
          
          <div className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              id="chkAutoSend"
              checked={settings.autoSend}
              onChange={(e) => onSettingsChange({ ...settings, autoSend: e.target.checked })}
              className="w-6 h-6 cursor-pointer"
            />
            <label htmlFor="chkAutoSend" className="font-medium text-sm">
              Tự động gửi yêu cầu sau khi xử lý
            </label>
          </div>
          
          <div className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              id="chkAutoListen"
              checked={settings.autoListen}
              onChange={(e) => onSettingsChange({ ...settings, autoListen: e.target.checked })}
              className="w-6 h-6 cursor-pointer"
            />
            <label htmlFor="chkAutoListen" className="font-medium text-sm">
              Tự động nghe liên tục
            </label>
          </div>
          
          <div className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              id="chkSpeak"
              checked={settings.speak}
              onChange={(e) => onSettingsChange({ ...settings, speak: e.target.checked })}
              className="w-6 h-6 cursor-pointer"
            />
            <label htmlFor="chkSpeak" className="font-medium text-sm">
              Đọc kết quả phân tích
            </label>
          </div>
        </div>

        {/* Camera Settings */}
        <div className="p-5 border border-gray-300 dark:border-gray-600 rounded-lg">
          <h2 className="text-lg font-bold mb-4 text-sky-500">Camera</h2>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              id="chkEnableCamera"
              checked={settings.enableCamera}
              onChange={(e) => onSettingsChange({ ...settings, enableCamera: e.target.checked })}
              className="w-6 h-6 cursor-pointer"
            />
            <label htmlFor="chkEnableCamera" className="font-medium text-sm">
              Bật chụp ảnh
            </label>
          </div>
          
          {settings.enableCamera && (
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="chkUseDeviceCamera"
                checked={settings.useDeviceCamera}
                onChange={(e) => onSettingsChange({ ...settings, useDeviceCamera: e.target.checked })}
                className="w-6 h-6 cursor-pointer"
              />
              <label htmlFor="chkUseDeviceCamera" className="font-medium text-sm">
                Sử dụng camera thiết bị
              </label>
            </div>
          )}
          
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {!settings.enableCamera 
              ? 'OFF: Chỉ gửi yêu cầu văn bản, không chụp ảnh'
              : settings.useDeviceCamera 
                ? 'ON: Sẽ chụp ảnh từ camera thiết bị và gửi kèm yêu cầu'
                : 'OFF: Sẽ lấy ảnh từ Supabase (cam01/image.jpg) và gửi kèm yêu cầu'
            }
          </p>
        </div>

        {/* Voice Settings */}
        <div className="p-5 border border-gray-300 dark:border-gray-600 rounded-lg">
          <h2 className="text-lg font-bold mb-4 text-sky-500">Giọng đọc</h2>
          
          <label className="block mb-2 font-medium text-sm">
            Tốc độ đọc: {settings.voiceRate}
          </label>
          <input
            type="range"
            min="0.7"
            max="1.4"
            step="0.05"
            value={settings.voiceRate}
            onChange={(e) => onSettingsChange({ ...settings, voiceRate: parseFloat(e.target.value) })}
            className="w-full mb-4"
          />
          
          <label className="block mb-2 font-medium text-sm">
            Âm lượng: {Math.round(settings.voiceVolume * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.voiceVolume}
            onChange={(e) => onSettingsChange({ ...settings, voiceVolume: parseFloat(e.target.value) })}
            className="w-full mb-4"
          />
        </div>
      </div>
    </div>
  );
};
