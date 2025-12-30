export default function MedicalDisclaimer() {
  return (
    <div className="bg-gradient-to-r from-[rgba(225,113,0,0.08)] to-[rgba(225,113,0,0.05)] border border-[rgba(225,113,0,0.2)] rounded-[15px] w-full" style={{ padding: '20px' }}>
      <div className="flex items-start w-full" style={{ gap: '12px' }}>
        <div className="w-6 h-6 flex-shrink-0" style={{ marginTop: '1px' }}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"
              fill="#e17100"
            />
          </svg>
        </div>
        <div className="flex flex-col flex-1" style={{ gap: '10px' }}>
          <h3 className="text-[#e17100] text-base font-semibold m-0" style={{ lineHeight: '24px', letterSpacing: '0.01em' }}>
            Important Medical Information
          </h3>
          <div className="text-[#475569] text-sm font-normal" style={{ lineHeight: '22px' }}>
            <p className="m-0" style={{ marginBottom: '6px' }}>
              <strong className="text-[#e17100]">Clara does not provide medical advice, diagnosis, or treatment.</strong> This assistant is designed to provide general information about diabetes based on trusted ADA resources.
              In a medical emergency, call <strong>911</strong> or your local emergency number immediately. For all medical decisions, please consult with your healthcare provider.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

