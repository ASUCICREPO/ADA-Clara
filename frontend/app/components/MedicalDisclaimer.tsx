export default function MedicalDisclaimer() {
  return (
    <div className="bg-[rgba(225,113,0,0.05)] rounded-[15px] w-full" style={{ padding: '16px', minHeight: '104px' }}>
      <div className="flex items-start w-full" style={{ gap: '8px' }}>
        <div className="w-5 h-5 flex-shrink-0" style={{ marginTop: '2px' }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 2L2 18h16L10 2zm0 3.5L15.5 16H4.5L10 5.5zM9 13h2v2H9v-2zm0-4h2v3H9V9z"
              fill="#e17100"
            />
          </svg>
        </div>
        <div className="flex flex-col flex-1" style={{ gap: '8px' }}>
          <h3 className="text-[#e17100] text-base font-medium m-0" style={{ lineHeight: '24px' }}>
            Medical Disclaimer
          </h3>
          <div className="text-[#64748b] text-sm font-normal">
            <p className="m-0" style={{ lineHeight: '20px', marginBottom: '0px' }}>
              Clara does not provide medical advice, diagnosis, or treatment. In an emergency, call 911 or your local emergency number.
            </p>
            <p className="m-0" style={{ lineHeight: '20px', marginTop: '0px' }}>Always consult with your healthcare provider for medical decisions.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

