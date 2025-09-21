interface StatusDisplayProps {
  status: string;
  isProcessing: boolean;
  currentRequest: string;
  waitingForTrigger: boolean;
}

export const StatusDisplay = ({ status, isProcessing, currentRequest, waitingForTrigger }: StatusDisplayProps) => {
  return (
    <>
      <div className="mt-8 px-8 py-4 bg-black/10 dark:bg-white/10 rounded-full min-h-15 flex items-center justify-center">
        <span className="text-lg">{status}</span>
      </div>
      
      {isProcessing && (
        <div className="mt-4 px-6 py-3 bg-orange-500/20 border border-orange-500 rounded-lg">
          <span className="text-orange-600 dark:text-orange-400 text-sm">
            ⏳ Đang xử lý yêu cầu: {currentRequest}
          </span>
        </div>
      )}
      
      {waitingForTrigger && !isProcessing && (
        <div className="mt-4 px-6 py-3 bg-blue-500/20 border border-blue-500 rounded-lg">
          <span className="text-blue-600 dark:text-blue-400 text-sm">
            🎯 Chờ nghe "bạn ơi!" để kích hoạt
          </span>
        </div>
      )}
    </>
  );
};
