import Header from './components/Header';
import ChatPanel from './components/ChatPanel';
import MedicalDisclaimer from './components/MedicalDisclaimer';

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 flex justify-center items-start" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div className="w-full max-w-[1024px] flex flex-col mx-auto" style={{ paddingLeft: '16px', paddingRight: '16px', gap: '24px', width: '100%' }}>
          <ChatPanel />
          <MedicalDisclaimer />
        </div>
      </main>
    </div>
  );
}
