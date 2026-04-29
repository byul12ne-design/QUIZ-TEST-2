import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// --- 인터페이스 정의 ---
interface Question {
  text: string;
  options: string[];
  answerIndex: number;
}

interface Exam {
  id: string;
  title: string;
  questions: Question[];
  displayCount: number;
  createdAt: number;
}

interface ExamResult {
  id: string;
  examId: string;
  examTitle: string;
  studentName: string;
  score: number;
  answers: Record<number, number>;
  createdAt: number;
}

// --- Firebase Config (실제 값) ---
const firebaseConfig = {
  apiKey: "AIzaSyAIBp1x4DalwhtlFnYjnz2TisQBA0wVBSg",
  authDomain: "product-exam-9b794.firebaseapp.com",
  projectId: "product-exam-9b794",
  storageBucket: "product-exam-9b794.firebasestorage.app",
  messagingSenderId: "443959122996",
  appId: "1:443959122996:web:355714f3a0c809b9ebbe61",
  measurementId: "G-X5NVNL1G96"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [view, setView] = useState('home');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const [currentExamId, setCurrentExamId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, number>>({});
  const [studentScore, setStudentScore] = useState(0);

  const [adminPasswordInput, setAdminPasswordInput] = useState(''); 
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [newExamTitle, setNewExamTitle] = useState('');
  const [displayCount, setDisplayCount] = useState('');
  const [newQuestions, setNewQuestions] = useState<Question[]>([
    { text: '', options: ['', '', '', ''], answerIndex: 0 }
  ]);

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }
    const params = new URLSearchParams(window.location.search);
    const linkExamId = params.get('examId');
    if (linkExamId) {
      setCurrentExamId(linkExamId);
      setView('student-entry');
    }
  }, []);

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error(err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubExams = onSnapshot(collection(db, 'exams'), (snapshot) => {
      setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)).sort((a, b) => b.createdAt - a.createdAt));
    });
    const unsubResults = onSnapshot(collection(db, 'results'), (snapshot) => {
      setResults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamResult)));
    });
    return () => { unsubExams(); unsubResults(); };
  }, [user]);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const copyToClipboard = (examId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?examId=${examId}`;
    navigator.clipboard.writeText(url);
    showToast('응시 링크가 복사되었습니다!');
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === '2026') { 
      setView('admin-dash'); setAdminPasswordInput(''); 
      window.history.replaceState({}, '', window.location.pathname);
    } else showToast('비밀번호 불일치');
  };

  const handleEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setNewExamTitle(exam.title);
    setNewQuestions(JSON.parse(JSON.stringify(exam.questions)));
    setDisplayCount(exam.displayCount?.toString() || '');
    setView('admin-create');
  };

  const handleSaveExam = async () => {
    if (!newExamTitle.trim()) return showToast('제목을 입력해주세요.');
    const dCount = parseInt(displayCount) || newQuestions.length;
    const examData = { title: newExamTitle, questions: newQuestions, displayCount: dCount, createdAt: Date.now() };
    try {
      if (editingExamId) await updateDoc(doc(db, 'exams', editingExamId), examData);
      else await addDoc(collection(db, 'exams'), examData);
      setView('admin-dash'); showToast('저장되었습니다.');
      setNewExamTitle(''); setNewQuestions([{ text: '', options: ['', '', '', ''], answerIndex: 0 }]); setDisplayCount(''); setEditingExamId(null);
    } catch (e) { showToast('저장 실패'); }
  };

  // --- 개선된 CSV 업로드 핸들러 ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      
      // 따옴표 내부의 쉼표를 보호하며 파싱하는 로직
      const parseCSV = (text: string) => {
        const rows = [];
        const lines = text.split(/\r?\n/);
        for (let line of lines) {
          if (!line.trim()) continue;
          const cols = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              cols.push(cur.replace(/^"|"$/g, '').trim());
              cur = '';
            } else cur += char;
          }
          cols.push(cur.replace(/^"|"$/g, '').trim());
          rows.push(cols);
        }
        return rows;
      };

      const allRows = parseCSV(content);
      // slice(1)을 제거하여 첫 줄부터 바로 문제로 인식
      const parsed: Question[] = allRows.map(cols => {
        return { 
          text: cols[0], 
          options: [cols[1], cols[2], cols[3], cols[4]], 
          answerIndex: parseInt(cols[5]) - 1 
        };
      }).filter(q => q.text && q.options.length >= 4 && !isNaN(q.answerIndex));

      if (parsed.length > 0) { 
        setNewQuestions(parsed); 
        showToast(`${parsed.length}문제 로드 완료!`); 
      }
    };
    reader.readAsText(file);
  };

  const startExam = () => {
    if (!studentName.trim()) return showToast('이름을 입력하세요.');
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return showToast('시험 코드를 확인하세요.');
    
    const pool = [...exam.questions];
    const finalCount = exam.displayCount || pool.length;
    setActiveQuestions(pool.sort(() => Math.random() - 0.5).slice(0, finalCount));
    setStudentAnswers({});
    setView('student-take');
  };

  const submitExam = async () => {
    if (Object.keys(studentAnswers).length < activeQuestions.length) return showToast('모든 문제를 풀어주세요.');
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return;
    const correct = activeQuestions.filter((q, idx) => studentAnswers[idx] === q.answerIndex).length;
    const score = Math.round((correct / activeQuestions.length) * 100);
    setStudentScore(score);
    await addDoc(collection(db, 'results'), {
      examId: currentExamId, examTitle: exam.title, studentName, score, answers: studentAnswers, createdAt: Date.now()
    });
    setView('student-result');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <nav className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-50">
        <h1 onClick={() => {setView('home'); window.history.replaceState({}, '', window.location.pathname);}} className="text-blue-600 font-bold flex items-center gap-2 cursor-pointer">
          <span className="text-2xl">📋</span> 스마트 문제은행
        </h1>
      </nav>

      <main className="p-6 max-w-4xl mx-auto">
        {view === 'home' && (
          <div className="flex flex-col items-center gap-12 py-20 text-center">
            <h2 className="text-5xl font-black text-slate-800">Quiz Master</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
              <button onClick={() => setView('admin-login')} className="p-10 bg-white border rounded-[2.5rem] shadow-sm hover:border-blue-500 transition-all flex flex-col items-center gap-4">
                <span className="text-6xl">👨‍🏫</span><span className="text-xl font-bold">선생님 / 관리자</span>
              </button>
              <div className="p-10 bg-white border rounded-[2.5rem] shadow-sm flex flex-col items-center gap-4">
                <span className="text-6xl">✅</span>
                <div className="flex gap-2 w-full">
                  <input value={currentExamId} onChange={e => setCurrentExamId(e.target.value)} placeholder="시험 코드 입력" className="border rounded-xl px-4 py-2 w-full text-sm outline-none"/>
                  <button onClick={() => currentExamId && setView('student-entry')} className="bg-green-600 text-white px-4 rounded-xl font-bold">입장</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-md mx-auto py-20 text-center">
            <h2 className="text-2xl font-bold mb-8">관리자 인증</h2>
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} className="w-full border-2 rounded-2xl p-4 mb-4 text-center text-lg" placeholder="비밀번호를 입력하세요"/>
            <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg active:scale-95 transition-transform">접속</button>
          </div>
        )}

        {view === 'admin-dash' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold">시험 목록</h3>
              <button onClick={() => {setEditingExamId(null); setNewExamTitle(''); setNewQuestions([{text:'', options:['','','',''], answerIndex:0}]); setView('admin-create');}} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2"><span>➕</span>새 시험</button>
            </div>
            <div className="grid gap-4">
              {exams.map(exam => (
                <div key={exam.id} className="bg-white p-6 rounded-3xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-shadow">
                  <div>
                    <h4 className="font-bold text-xl">{exam.title}</h4>
                    <p className="text-sm text-slate-400">전체 문항: {exam.questions.length} | 랜덤 출제: {exam.displayCount || '전체'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copyToClipboard(exam.id)} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold flex items-center gap-1 hover:bg-blue-100 transition-colors"><span>🔗</span> 링크복사</button>
                    <button onClick={() => handleEditExam(exam)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"><span>✏️</span></button>
                    <button onClick={async () => {if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'exams', exam.id))}} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"><span>🗑️</span></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'admin-create' && (
          <div className="space-y-8 pb-20">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('admin-dash')} className="text-2xl hover:bg-slate-100 p-2 rounded-full">⬅️</button>
              <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="flex-1 text-3xl font-black outline-none bg-transparent" placeholder="시험 제목 입력"/>
            </div>
            <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] border shadow-sm">
              <div className="flex items-center gap-4 text-sm font-bold text-blue-700">
                <span>🔀</span> 랜덤 출제 문항 수: 
                <input type="number" value={displayCount} onChange={e => setDisplayCount(e.target.value)} className="w-20 p-2 rounded-lg border bg-slate-50 text-center outline-none focus:ring-2 ring-blue-200" placeholder="전체"/>
              </div>
              <label className="bg-green-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 text-sm font-bold cursor-pointer hover:bg-green-700 transition-colors shadow-md">
                <span>📊</span> CSV 대량 업로드<input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            <div className="space-y-6">
              {newQuestions.map((q, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border shadow-sm space-y-4 relative">
                  <button onClick={() => setNewQuestions(newQuestions.filter((_, idx) => idx !== i))} className="absolute top-6 right-6 text-2xl hover:text-red-500 transition-colors">🗑️</button>
                  <div className="flex gap-2">
                    <span className="text-blue-500 font-bold">Q{i+1}</span>
                    <textarea value={q.text} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} className="w-full text-lg font-bold outline-none resize-none" placeholder="문제 내용을 입력하세요" rows={2}/>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                         <span className="text-xs font-bold text-slate-300">{oi+1}</span>
                         <input value={opt} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, options: item.options.map((o, oIdx) => oIdx === oi ? e.target.value : o) } : item))} className="w-full bg-slate-50 p-3 rounded-xl text-sm outline-none focus:ring-2 ring-blue-100" placeholder={`보기 ${oi+1}`}/>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 pt-2 border-t">
                    <span className="text-sm font-bold text-slate-400">정답 선택:</span>
                    <div className="flex gap-2">
                      {[0,1,2,3].map(idx => (
                        <button key={idx} onClick={() => setNewQuestions(prev => prev.map((item, iIdx) => iIdx === i ? { ...item, answerIndex: idx } : item))} className={`w-12 h-12 rounded-xl font-bold transition-all ${q.answerIndex === idx ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{idx+1}</button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => setNewQuestions([...newQuestions, {text:'', options:['','','',''], answerIndex:0}])} className="w-full py-8 bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] text-slate-400 font-bold hover:bg-slate-50 hover:border-blue-200 transition-all">+ 직접 문제 추가</button>
            </div>
            <button onClick={handleSaveExam} className="w-full py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl sticky bottom-4 shadow-2xl active:scale-95 transition-transform">저장하고 나가기</button>
          </div>
        )}

        {view === 'student-entry' && (
          <div className="max-w-md mx-auto py-20 text-center space-y-10">
            <div className="text-8xl animate-bounce">🏆</div>
            <h2 className="text-3xl font-black">{exams.find(e => e.id === currentExamId)?.title}</h2>
            <div className="space-y-4">
               <p className="text-slate-500 font-medium">이름을 입력하면 시험이 시작됩니다.</p>
               <input value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full border-2 rounded-2xl p-5 text-center text-2xl font-bold outline-none focus:border-blue-500 transition-colors" placeholder="이름 입력"/>
            </div>
            <button onClick={startExam} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-transform">시험 시작!</button>
          </div>
        )}

        {view === 'student-take' && (
          <div className="max-w-2xl mx-auto space-y-8 pb-32">
            <div className="bg-white/90 backdrop-blur-md p-5 rounded-3xl sticky top-20 border flex justify-between items-center shadow-lg z-10">
              <span className="font-bold text-blue-600 text-lg">📝 {studentName} 님 응시 중</span>
              <span className="text-xs font-black px-4 py-2 bg-blue-600 text-white rounded-full">{Object.keys(studentAnswers).length} / {activeQuestions.length} 완료</span>
            </div>
            {activeQuestions.map((q, i) => (
              <div key={i} className="bg-white p-10 rounded-[3rem] border shadow-sm space-y-8">
                <h4 className="text-2xl font-bold leading-snug flex gap-4"><span className="text-blue-300">Q{i+1}.</span>{q.text}</h4>
                <div className="grid gap-4">
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => setStudentAnswers({...studentAnswers, [i]: oi})} className={`text-left p-6 rounded-2xl border-2 font-bold transition-all ${studentAnswers[i] === oi ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-inner' : 'border-slate-50 hover:border-slate-200 text-slate-500'}`}>{oi+1}. {opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={submitExam} className="w-full py-8 bg-slate-900 text-white rounded-[3rem] font-black text-2xl shadow-2xl active:scale-95 transition-transform">최종 제출하기</button>
          </div>
        )}

        {view === 'student-result' && (
          <div className="max-w-2xl mx-auto py-20 text-center space-y-8">
            <div className="text-9xl mb-4 animate-pulse">🏆</div>
            <h2 className="text-4xl font-black text-slate-800">수고하셨습니다!</h2>
            <div className="bg-white p-12 rounded-[3.5rem] shadow-2xl border-4 border-blue-50">
              <p className="text-slate-400 font-bold mb-2">최종 점수</p>
              <div className="text-9xl font-black text-blue-600 mb-4">{studentScore}<span className="text-3xl text-slate-300 ml-2">점</span></div>
            </div>
            <div className="mt-12 space-y-6 text-left">
              <h3 className="text-2xl font-bold px-4 flex items-center gap-2">🔍 오답 확인</h3>
              {activeQuestions.map((q, i) => {
                const isCorrect = studentAnswers[i] === q.answerIndex;
                return (
                  <div key={i} className={`p-8 rounded-[2rem] border-2 transition-colors ${isCorrect ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'}`}>
                    <div className="flex justify-between items-start mb-4">
                       <h4 className="font-bold text-lg leading-relaxed">Q{i+1}. {q.text}</h4>
                       <span className={`px-3 py-1 rounded-full text-xs font-bold ${isCorrect ? 'bg-green-200 text-green-700' : 'bg-red-200 text-red-700'}`}>{isCorrect ? '정답' : '오답'}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                       <p className={`${isCorrect ? 'text-green-700' : 'text-red-700'} font-medium`}>내 선택: {q.options[studentAnswers[i]]}</p>
                       {!isCorrect && <p className="text-blue-700 font-bold">정답: {q.options[q.answerIndex]}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => {setStudentName(''); setView('home'); window.history.replaceState({}, '', window.location.pathname);}} className="bg-slate-100 text-slate-600 px-10 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-colors mt-8">메인으로 돌아가기</button>
          </div>
        )}
      </main>

      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-sm text-white px-8 py-4 rounded-full font-bold z-[100] shadow-2xl animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
