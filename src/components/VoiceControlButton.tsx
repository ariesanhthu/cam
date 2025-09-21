interface VoiceControlButtonProps {
  isListening: boolean;
  onClick: () => void;
}

export const VoiceControlButton = ({ isListening, onClick }: VoiceControlButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`w-80 h-80 rounded-full border-none text-white text-2xl font-bold cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-5 relative ${
        isListening 
          ? 'bg-gradient-to-br from-red-500 to-red-600 animate-pulse shadow-lg shadow-red-500/40' 
          : 'bg-gradient-to-br from-sky-500 to-sky-600 hover:scale-105 shadow-lg shadow-sky-500/30'
      }`}
      aria-label="Bấm để bật điều khiển giọng nói"
    >
      <span className="text-6xl" aria-hidden="true">🎙️</span>
      <span>{isListening ? 'Đang nghe...' : 'Bấm để nói'}</span>
    </button>
  );
};
