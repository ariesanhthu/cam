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
      
      {/* Action bar trên cùng */}
      <div className="sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-gray-900/60 z-10 -mt-4 -mx-5 px-5 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700">
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
      </div>

      <div className="space-y-8 mt-6">
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
        
          {/* Chuyển đổi ngôn ngữ */}
          <div className="mb-4">
            <label className="block mb-2 font-medium text-sm">
              Ngôn ngữ (cho cả API và giọng đọc)
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => onSettingsChange({ 
                  ...settings, 
                  language: 'vi',
                  // Khi chuyển sang tiếng Việt, có thể dùng Zalo
                })}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  settings.language === 'vi'
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                🇻🇳 Tiếng Việt
              </button>
              <button
                onClick={() => onSettingsChange({ 
                  ...settings, 
                  language: 'en',
                  // Khi chuyển sang tiếng Anh, ép provider về browser (Zalo chỉ hỗ trợ tiếng Việt)
                  ttsProvider: 'browser'
                })}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
                  settings.language === 'en'
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                🇺🇸 English
              </button>
            </div>
          </div>

          {/* Các tuỳ chọn liên quan giọng nói */}
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

        {/* Camera Settings (1 toggle duy nhất) */}
        <div className="p-5 border border-gray-300 dark:border-gray-600 rounded-lg">
          <h2 className="text-lg font-bold mb-4 text-sky-500">Camera</h2>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              id="chkUseDeviceCamera"
              checked={settings.useDeviceCamera}
              onChange={(e) => onSettingsChange({ ...settings, useDeviceCamera: e.target.checked })}
              className="w-6 h-6 cursor-pointer"
            />
            <label htmlFor="chkUseDeviceCamera" className="font-medium text-sm">
              ON: chụp từ thiết bị • OFF: lấy ảnh từ Supabase
            </label>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {settings.useDeviceCamera
              ? 'Đang bật: sẽ chụp ảnh từ camera thiết bị khi gửi yêu cầu'
              : 'Đang tắt: sẽ lấy ảnh từ Supabase (cam01/image.jpg) khi gửi yêu cầu'}
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
          {/* Chọn engine TTS */}
          <label className="block mb-2 font-medium text-sm">
            Engine đọc
          </label>
          <select
            value={settings.ttsProvider}
            onChange={(e) =>
              onSettingsChange({ ...settings, ttsProvider: e.target.value as any })
            }
            disabled={settings.language === "en"} // English -> Browser TTS thôi (Zalo chỉ hỗ trợ tiếng Việt)
            className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-base bg-white dark:bg-gray-800 text-black dark:text-white mb-4 disabled:opacity-50"
          >
            <option value="browser">Trình duyệt (SpeechSynthesis)</option>
            <option value="zalo">Zalo TTS (chất lượng Việt)</option>
          </select>

          {settings.language === "en" && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              English hiện dùng SpeechSynthesis của trình duyệt (Zalo TTS chỉ hỗ trợ tiếng Việt).
            </p>
          )}

        </div>
      </div>
    </div>
  );
};
