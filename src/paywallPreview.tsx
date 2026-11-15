import { useState } from "react";
import { createRoot } from "react-dom/client";
import V6PaywallModal from "./components/V6PaywallModal";
import "./index.css";

function Preview() {
  const [open, setOpen] = useState(true);
  return <main className="min-h-screen bg-slate-50 p-5 text-slate-800">
    <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-blue-600">똑</p>
      <h1 className="mt-4 text-2xl font-black">요금제</h1>
      <p className="mt-2 text-sm text-slate-500">실제 앱에서 사용하는 결제 화면의 로컬 미리보기입니다.</p>
      <button type="button" onClick={() => setOpen(true)}
        className="mt-6 w-full rounded-2xl bg-blue-600 p-4 font-bold text-white">요금제 화면 보기</button>
    </div>
    {open && <V6PaywallModal products={{}} activePlans={[]} previewOnly
      onClose={() => setOpen(false)} onPurchased={() => {}} />}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Preview />);
