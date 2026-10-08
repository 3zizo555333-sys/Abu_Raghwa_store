import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { ArrowLeft, Mic, Volume2, Trash2 } from "lucide-react";

export default function Calculator() {
  const [, navigate] = useLocation();
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const initializeVoiceRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = "ar-EG";
      recognitionRef.current.continuous = false;

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        processVoiceCommand(transcript.toLowerCase());
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  };

  const processVoiceCommand = (command: string) => {
    if (command.includes("زائد") || command.includes("جمع")) {
      handleOperation("+");
    } else if (command.includes("ناقص") || command.includes("طرح")) {
      handleOperation("-");
    } else if (command.includes("ضرب")) {
      handleOperation("*");
    } else if (command.includes("قسمة")) {
      handleOperation("/");
    } else if (command.includes("مسح")) {
      handleClear();
    } else if (command.includes("يساوي") || command.includes("النتيجة")) {
      handleEquals();
    } else {
      // Try to extract numbers
      const numbers = command.match(/\d+/g);
      if (numbers) {
        numbers.forEach(num => handleNumber(num));
      }
    }
  };

  const startVoiceInput = () => {
    initializeVoiceRecognition();
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
  };

  const handleNumber = (num: string) => {
    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
    } else {
      setDisplay(display === "0" ? num : display + num);
    }
  };

  const handleDecimal = () => {
    if (waitingForNewValue) {
      setDisplay("0.");
      setWaitingForNewValue(false);
    } else if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const handleOperation = (op: string) => {
    const currentValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(currentValue);
    } else if (operation) {
      const result = calculate(previousValue, currentValue, operation);
      setDisplay(result.toString());
      setPreviousValue(result);
    }

    setOperation(op);
    setWaitingForNewValue(true);
  };

  const calculate = (prev: number, current: number, op: string): number => {
    switch (op) {
      case "+":
        return prev + current;
      case "-":
        return prev - current;
      case "*":
        return prev * current;
      case "/":
        return prev / current;
      case "%":
        return (prev / 100) * current;
      default:
        return current;
    }
  };

  const handleEquals = () => {
    if (operation && previousValue !== null) {
      const currentValue = parseFloat(display);
      const result = calculate(previousValue, currentValue, operation);
      const historyEntry = `${previousValue} ${operation} ${currentValue} = ${result}`;
      setHistory([historyEntry, ...history.slice(0, 9)]);
      setDisplay(result.toString());
      setPreviousValue(null);
      setOperation(null);
      setWaitingForNewValue(true);
      speak(result.toString());
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForNewValue(false);
  };

  const handlePercent = () => {
    const current = parseFloat(display);
    setDisplay((current / 100).toString());
  };

  const handleBackspace = () => {
    if (display.length === 1) {
      setDisplay("0");
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ar-EG";
    window.speechSynthesis.speak(utterance);
  };

  const buttons = [
    ["7", "8", "9", "/"],
    ["4", "5", "6", "*"],
    ["1", "2", "3", "-"],
    ["0", ".", "=", "+"]
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">🧮 الحاسبة الذكية</h1>
            <p className="text-gray-600 mt-1">مع دعم الصوت والتحويلات</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            العودة
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Calculator Card */}
        <Card className="border-0 shadow-lg mb-8">
          <CardContent className="pt-6">
            {/* Display */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 mb-6">
              <p className="text-blue-100 text-sm mb-2">النتيجة</p>
              <p className="text-white text-4xl font-bold text-left break-words">{display}</p>
            </div>

            {/* Voice Button */}
            <div className="flex gap-2 mb-6">
              <Button
                onClick={startVoiceInput}
                className={`flex-1 flex items-center justify-center gap-2 ${
                  isListening
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
              >
                <Mic className="w-4 h-4" />
                {isListening ? "جاري الاستماع..." : "صوت"}
              </Button>
              <Button
                onClick={() => speak(display)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
              >
                <Volume2 className="w-4 h-4" />
                اسمع
              </Button>
              <Button
                onClick={handleClear}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                مسح
              </Button>
            </div>

            {/* Calculator Buttons */}
            <div className="space-y-2 mb-6">
              {buttons.map((row, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-4 gap-2">
                  {row.map((btn) => {
                    let bgColor = "bg-gray-200 hover:bg-gray-300";
                    let onClick = () => handleNumber(btn);

                    if (btn === "=") {
                      bgColor = "bg-green-600 hover:bg-green-700 text-white";
                      onClick = handleEquals;
                    } else if (btn === ".") {
                      onClick = handleDecimal;
                    } else if (["+", "-", "*", "/"].includes(btn)) {
                      bgColor = "bg-blue-600 hover:bg-blue-700 text-white";
                      onClick = () => handleOperation(btn);
                    }

                    return (
                      <Button
                        key={btn}
                        onClick={onClick}
                        className={`${bgColor} text-lg font-semibold py-6`}
                      >
                        {btn}
                      </Button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Additional Operations */}
            <div className="grid grid-cols-3 gap-2 mb-6">
              <Button
                onClick={handlePercent}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                %
              </Button>
              <Button
                onClick={handleBackspace}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                ← حذف
              </Button>
              <Button
                onClick={() => setDisplay(display === "0" ? "-0" : display.startsWith("-") ? display.slice(1) : "-" + display)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                +/-
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>السجل</CardTitle>
              <CardDescription>آخر العمليات</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((entry, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 p-3 rounded-lg text-sm font-mono text-gray-700"
                  >
                    {entry}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
