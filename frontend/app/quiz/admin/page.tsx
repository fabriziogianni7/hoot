"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuiz } from "@/lib/quiz-context";
import { Button } from "@/components/ui/button";

interface QuestionOption {
  text: string;
  color: string;
}

interface QuizQuestion {
  text: string;
  options: QuestionOption[];
  correctAnswer: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { addQuiz, startGame } = useQuiz();
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion>({
    text: "",
    options: [
      { text: "", color: "bg-lime-500 hover:bg-lime-600" },
      { text: "", color: "bg-red-500 hover:bg-red-600" },
      { text: "", color: "bg-blue-600 hover:bg-blue-700" },
      { text: "", color: "bg-yellow-400 hover:bg-yellow-500" }
    ],
    correctAnswer: 0
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizTitle, setQuizTitle] = useState("New Quiz");
  const [gamePin, setGamePin] = useState("");

  // Effetto per caricare la domanda corrente quando cambia l'indice
  useEffect(() => {
    if (currentQuestionIndex < questions.length) {
      // Stiamo modificando una domanda esistente
      setCurrentQuestion(questions[currentQuestionIndex]);
    } else {
      // Stiamo creando una nuova domanda
      setCurrentQuestion({
        text: "",
        options: [
          { text: "", color: "bg-lime-500 hover:bg-lime-600" },
          { text: "", color: "bg-red-500 hover:bg-red-600" },
          { text: "", color: "bg-blue-600 hover:bg-blue-700" },
          { text: "", color: "bg-yellow-400 hover:bg-yellow-500" }
        ],
        correctAnswer: 0
      });
    }
  }, [currentQuestionIndex, questions]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...currentQuestion.options];
    newOptions[index] = { ...newOptions[index], text: value };
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
  };

  const handleCorrectAnswerChange = (index: number) => {
    setCurrentQuestion({ ...currentQuestion, correctAnswer: index });
  };

  const handleSaveQuestion = () => {
    // Validazione
    if (currentQuestion.text.trim() === "") {
      alert("Please enter a question");
      return;
    }

    // Verifica che almeno due opzioni siano compilate
    const filledOptions = currentQuestion.options.filter(opt => opt.text.trim() !== "");
    if (filledOptions.length < 2) {
      alert("Please add at least two answer options");
      return;
    }

    const newQuestions = [...questions];
    
    if (currentQuestionIndex < questions.length) {
      // Modifica di una domanda esistente
      newQuestions[currentQuestionIndex] = currentQuestion;
    } else {
      // Aggiunta di una nuova domanda
      newQuestions.push(currentQuestion);
    }
    
    setQuestions(newQuestions);
    
    // Passa alla prossima domanda
    setCurrentQuestionIndex(newQuestions.length);
  };

  const handleQuestionClick = (index: number) => {
    // Salva la domanda corrente prima di cambiare
    if (currentQuestion.text.trim() !== "") {
      const newQuestions = [...questions];
      
      if (currentQuestionIndex < questions.length) {
        // Aggiorna la domanda esistente
        newQuestions[currentQuestionIndex] = currentQuestion;
      } else if (currentQuestionIndex === questions.length) {
        // Aggiungi la nuova domanda
        newQuestions.push(currentQuestion);
      }
      
      setQuestions(newQuestions);
    }
    
    // Passa alla domanda selezionata
    setCurrentQuestionIndex(index);
  };

  const handleAddQuestion = () => {
    // Salva la domanda corrente se ha contenuto
    if (currentQuestion.text.trim() !== "") {
      const newQuestions = [...questions];
      
      if (currentQuestionIndex < questions.length) {
        // Aggiorna la domanda esistente
        newQuestions[currentQuestionIndex] = currentQuestion;
      } else {
        // Aggiungi la nuova domanda
        newQuestions.push(currentQuestion);
      }
      
      setQuestions(newQuestions);
    }
    
    // Passa a una nuova domanda
    setCurrentQuestionIndex(questions.length + (currentQuestion.text.trim() !== "" ? 1 : 0));
  };

  const handleSaveQuiz = () => {
    // Salva la domanda corrente se ha contenuto
    let allQuestions = [...questions];
    if (currentQuestion.text.trim() !== "") {
      if (currentQuestionIndex < questions.length) {
        // Aggiorna la domanda esistente
        allQuestions[currentQuestionIndex] = currentQuestion;
      } else {
        // Aggiungi la nuova domanda
        allQuestions.push(currentQuestion);
      }
    }
    
    if (allQuestions.length === 0) {
      alert("Please add at least one question");
      return;
    }
    
    // Crea l'oggetto quiz
    const quiz = {
      id: gamePin || `quiz-${Date.now()}`,
      title: quizTitle || "New Quiz",
      description: "Created from the admin interface",
      questions: allQuestions.map((q, i) => ({
        id: `q-${i}`,
        text: q.text,
        options: q.options.map(opt => opt.text),
        correctAnswer: q.correctAnswer,
        timeLimit: 15
      })),
      createdAt: new Date()
    };
    
    // Aggiungi il quiz al contesto
    addQuiz(quiz);
    
    // Avvia il gioco
    startGame(quiz.id);
    
    // Naviga alla lobby
    router.push("/quiz/lobby");
  };

  const handleUseAI = () => {
    // Simula la generazione di una domanda con AI
    const aiGeneratedQuestion = {
      text: "Quale di queste è una tecnologia blockchain?",
      options: [
        { text: "Ethereum", color: "bg-lime-500 hover:bg-lime-600" },
        { text: "MySQL", color: "bg-red-500 hover:bg-red-600" },
        { text: "MongoDB", color: "bg-blue-600 hover:bg-blue-700" },
        { text: "Firebase", color: "bg-yellow-400 hover:bg-yellow-500" }
      ],
      correctAnswer: 0 // Ethereum è la risposta corretta
    };
    
    setCurrentQuestion(aiGeneratedQuestion);
  };

  // Calcola il numero della domanda corrente (per visualizzazione)
  const displayQuestionNumber = currentQuestionIndex + 1;

  // Ottieni un riassunto breve della domanda per i pulsanti (max 10 caratteri)
  const getQuestionSummary = (question: QuizQuestion) => {
    if (!question.text) return "xx";
    return question.text.length > 10 ? question.text.substring(0, 10) + "..." : question.text;
  };

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
      {/* Background network effect */}
      <div 
        className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: "url('/network-bg.svg')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      />
      
      {/* Content container */}
      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-8">
        {/* Top navigation */}
        <div className="w-full max-w-md flex justify-between items-center mb-4">
          <div className="text-sm">Question Editor</div>
          <div className="flex space-x-2">
            <input
              type="text"
              value={gamePin}
              onChange={(e) => setGamePin(e.target.value)}
              placeholder="Pin for Game"
              className="px-1 py-1 text-sm rounded bg-white text-black"
            />
            <button
              onClick={handleSaveQuiz}
              className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600"
            >
              Save
            </button>
          </div>
        </div>
        
        {/* Question input */}
        <div className="w-full max-w-md mb-6">
          <div className="border border-white/30 rounded p-4 h-32 flex items-center justify-center">
            <textarea
              value={currentQuestion.text}
              onChange={(e) => setCurrentQuestion({ ...currentQuestion, text: e.target.value })}
              placeholder="Enter your question here"
              className="w-full h-full bg-transparent text-white text-center resize-none focus:outline-none"
            />
          </div>
        </div>
        
        {/* Answer options */}
        <div className="w-full max-w-md grid grid-cols-2 gap-4 mb-8">
          {currentQuestion.options.map((option, index) => (
            <div 
              key={index}
              className={`${option.color} rounded p-4 text-white relative`}
              onClick={() => handleCorrectAnswerChange(index)}
            >
              {/* Indicatore di risposta corretta */}
              {currentQuestion.correctAnswer === index && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              )}
              <input
                type="text"
                value={option.text}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`add reply ${index + 1}`}
                className="w-full bg-transparent focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ))}
        </div>
        
        {/* Question navigation */}
        <div className="w-full max-w-md flex items-center justify-center space-x-4 overflow-x-auto pb-2">
          {questions.map((question, index) => (
            <div 
              key={index}
              className={`bg-black border ${currentQuestionIndex === index ? 'border-white' : 'border-white/30'} rounded px-4 py-2 text-sm cursor-pointer hover:border-white transition-colors flex-shrink-0`}
              onClick={() => handleQuestionClick(index)}
            >
              Question {index + 1}<br/>
              {getQuestionSummary(question)}
            </div>
          ))}
          
          {/* Current question button (if it's a new question) */}
          {currentQuestionIndex === questions.length && (
            <div 
              className="bg-black border border-white rounded px-4 py-2 text-sm flex-shrink-0"
            >
              Question {displayQuestionNumber}<br/>
              {currentQuestion.text ? getQuestionSummary(currentQuestion) : "xx"}
            </div>
          )}
          
          {/* Add question button */}
          <button 
            className="bg-black border border-white/30 rounded px-4 py-2 text-2xl flex-shrink-0 hover:border-white transition-colors"
            onClick={handleAddQuestion}
          >
            +
          </button>
        </div>
        
        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-4 w-full max-w-md">
          <button
            onClick={handleSaveQuestion}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
          >
            Save Question
          </button>
          
          {/* AI Agent button */}
          <button
            onClick={handleUseAI}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-[#7B68EE] hover:bg-[#6A5ACD] rounded-md text-white font-medium"
          >
            <span>Use AI Agent</span>
            <div className="flex items-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="white"/>
              </svg>
              <span className="font-bold ml-1">CIVIC</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}