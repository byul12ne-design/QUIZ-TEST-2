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
    // 비밀번호를 2026으로 수정했습니다.
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const rows = (evt.target?.result as string).split('\n').filter(row => row.trim() !== '');
      const parsed: Question[] = rows.slice(1).map(row => {
        const cols = row.split(',').map(c => c.trim());
        return { text: cols[0], options: [cols[1], cols[2], cols[3], cols[4]], answerIndex: parseInt(cols[5]) - 1 };
      }).filter(q => q.text && q.options.length >= 4 && !isNaN(q.answerIndex));
      if (parsed.length > 0) { setNewQuestions(parsed); showToast(`${parsed.length}문제 로드 완료!`); }
    };
    reader.readAsText(file);
  };

  const startExam = () => {
    if (!studentName.trim()) return showToast('이름을 입력하세요.');
    const exam = exams.find(e => e.id === currentExamId);
    if (!exam) return showToast('시험 코드를 확인하세요.');
    
    const pool = [...exam.questions];
    setActiveQuestions(pool.sort(() => Math.random() - 0.5).slice(0, exam.displayCount));
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
                  <input value={currentExamId} onChange={e => setCurrentExamId(e.target.value)} placeholder="시험 코드 입력" className="border rounded-xl px-4 py-2 w-full text-sm"/>
                  <button onClick={() => currentExamId && setView('student-entry')} className="bg-green-600 text-white px-4 rounded-xl font-bold">입장</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'admin-login' && (
          <div className="max-w-md mx-auto py-20 text-center">
            <h2 className="text-2xl font-bold mb-8">관리자 인증</h2>
            {/* 힌트를 없애고 입력 시 * 로 표시되도록 type="password"를 유지했습니다. */}
            <input type="password" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} className="w-full border-2 rounded-2xl p-4 mb-4 text-center text-lg" placeholder="비밀번호를 입력하세요"/>
            <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold">접속</button>
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
                <div key={exam.id} className="bg-white p-6 rounded-3xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h4 className="font-bold text-xl">{exam.title}</h4>
                    <p className="text-sm text-slate-400">문항: {exam.questions.length} | 출제수: {exam.displayCount}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copyToClipboard(exam.id)} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold flex items-center gap-1"><span>🔗</span> 링크복사</button>
                    <button onClick={() => handleEditExam(exam)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl"><span>✏️</span></button>
                    <button onClick={async () => {if(window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'exams', exam.id))}} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><span>🗑️</span></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'admin-create' && (
          <div className="space-y-8 pb-20">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('admin-dash')} className="text-2xl">⬅️</button>
              <input value={newExamTitle} onChange={e => setNewExamTitle(e.target.value)} className="flex-1 text-3xl font-black outline-none bg-transparent" placeholder="시험 제목 입력"/>
            </div>
            <div className="flex justify-between">
              <div className="bg-blue-50 p-4 rounded-2xl flex items-center gap-4 text-sm font-bold text-blue-700">
                <span>🔀</span> 무작위 출제 수: <input type="number" value={displayCount} onChange={e => setDisplayCount(e.target.value)} className="w-20 p-1.5 rounded-lg border-none text-center" placeholder="전체"/>
              </div>
              <label className="bg-green-50 text-green-700 p-4 rounded-2xl flex items-center gap-2 text-sm font-bold cursor-pointer hover:bg-green-100">
                <span>📊</span> CSV 업로드<input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            <div className="space-y-4">
              {newQuestions.map((q, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border space-y-4 relative">
                  <button onClick={() => setNewQuestions(newQuestions.filter((_, idx) => idx !== i))} className="absolute top-6 right-6 text-2xl hover:opacity-70">🗑️</button>
                  <textarea value={q.text} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} className="w-full text-lg font-bold outline-none resize-none" placeholder="문제 내용"/>
                  <div className="grid grid-cols-2 gap-3">
                    {q.options.map((opt, oi) => (
                      <input key={oi} value={opt} onChange={e => setNewQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, options: item.options.map((o, oIdx) => oIdx === oi ? e.target.value : o) } : item))} className="bg-slate-50 p-3 rounded-xl text-sm outline-none" placeholder={`보기 ${oi+1}`}/>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    {[0,1,2,3].map(idx => (
                      <button key={idx} onClick={() => setNewQuestions(prev => prev.map((item, iIdx) => iIdx === i ? { ...item, answerIndex: idx } : item))} className={`w-10 h-10 rounded-xl font-bold ${q.answerIndex === idx ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{idx+1}</button>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => setNewQuestions([...newQuestions, {text:'', options:['','',''], answerIndex:0}])} className="w-full py-6 bg-white border-2 border-dashed rounded-[2.5rem] text-slate-400 font-bold">➕ 문제 추가</button>
            </div>
            <button onClick={handleSaveExam} className="w-full py-6 bg-blue-900 text-white rounded-[2.5rem] font-black text-xl sticky bottom-4">저장하기</button>
          </div>
        )}

        {view === 'student-entry' && (
          <div className="max-w-md mx-auto py-20 text-center space-y-10">
            <div className="text-8xl animate-bounce">🏆</div>
            <h2 className="text-3xl font-black">{exams.find(e => e.id === currentExamId)?.title}</h2>
            <input value={studentName} onChange={e => setStudentName(e.target.value)} className="w-full border-2 rounded-2xl p-5 text-center text-2xl font-bold outline-none" placeholder="이름을 입력하세요"/>
            <button onClick={startExam} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl">시험 시작</button>
          </div>
        )}

        {view === 'student-take' && (
          <div className="max-w-2xl mx-auto space-y-8 pb-32">
            <div className="bg-white/80 backdrop-blur-md p-5 rounded-3xl sticky top-20 border flex justify-between items-center shadow-md">
              <span className="font-bold text-blue-600">{studentName} 님</span>
              <span className="text-xs font-black px-4 py-2 bg-blue-50 text-blue-600 rounded-full">{Object.keys(studentAnswers).length} / {activeQuestions.length} 풀이됨</span>
            </div>
            {activeQuestions.map((q, i) => (
              <div key={i} className="bg-white p-10 rounded-[3rem] border shadow-sm">
                <h4 className="text-2xl font-bold mb-8 flex gap-4"><span className="text-blue-200">Q{i+1}.</span>{q.text}</h4>
                <div className="grid gap-4">
                  {q.options.map((opt, oi) => (
                    <button key={oi} onClick={() => setStudentAnswers({...studentAnswers, [i]: oi})} className={`text-left p-6 rounded-2xl border-2 font-bold ${studentAnswers[i] === oi ? 'border-blue-600 bg-blue-50' : 'border-slate-50'}`}>{oi+1}. {opt}</button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={submitExam} className="w-full py-8 bg-slate-900 text-white rounded-[3rem] font-black text-2xl">제출하기</button>
          </div>
        )}

        {view === 'student-result' && (
          <div className="max-w-2xl mx-auto py-20 text-center space-y-8">
            <div className="text-9xl mb-4 animate-pulse">🏆</div>
            <h2 className="text-4xl font-black text-slate-800">시험 종료!</h2>
            <div className="bg-white p-12 rounded-[3.5rem] shadow-xl border">
              <div className="text-9xl font-black text-blue-600 mb-4">{studentScore}<span className="text-3xl text-slate-200">점</span></div>
            </div>
            <div className="mt-12 space-y-4 text-left">
              <h3 className="text-xl font-bold px-4">오답 노트</h3>
              {activeQuestions.map((q, i) => {
                const isCorrect = studentAnswers[i] === q.answerIndex;
                return (
                  <div key={i} className={`p-6 rounded-3xl border ${isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <h4 className="font-bold mb-2">Q{i+1}. {q.text}</h4>
                    <p className="text-sm">내 선택: {q.options[studentAnswers[i]]}</p>
                    {!isCorrect && <p className="text-sm font-bold text-blue-600 mt-1">정답: {q.options[q.answerIndex]}</p>}
                  </div>
                );
              })}
            </div>
            <button onClick={() => {setStudentName(''); setView('home'); window.history.replaceState({}, '', window.location.pathname);}} className="text-blue-600 font-bold text-lg mt-8">메인으로</button>
          </div>
        )}
      </main>

      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-8 py-4 rounded-full font-bold z-[100]">{toastMessage}</div>
      )}
    </div>
  );
}
