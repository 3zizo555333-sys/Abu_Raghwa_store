import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useLocation } from 'wouter';

interface VoiceCommand {
  pattern: RegExp;
  action: (location: string) => void;
  description: string;
}

export function AdvancedVoiceControl() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'ar-SA';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setTranscript('');
      };

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            setTranscript(transcript);
            processCommand(transcript);
          } else {
            interimTranscript += transcript;
          }
        }
        if (interimTranscript) {
          setTranscript(interimTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('خطأ في التعرف الصوتي:', event.error);
        speak('حدث خطأ في التعرف الصوتي');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const voiceCommands: VoiceCommand[] = [
    {
      pattern: /افتح|اذهب.*المبيعات/i,
      action: () => navigate('/sales'),
      description: 'افتح المبيعات',
    },
    {
      pattern: /افتح|اذهب.*المنتجات/i,
      action: () => navigate('/products'),
      description: 'افتح المنتجات',
    },
    {
      pattern: /افتح|اذهب.*الفواتير/i,
      action: () => navigate('/advanced-invoices'),
      description: 'افتح الفواتير',
    },
    {
      pattern: /افتح|اذهب.*الباركود/i,
      action: () => navigate('/advanced-barcode'),
      description: 'افتح ماسح الباركود',
    },
    {
      pattern: /افتح|اذهب.*التقارير/i,
      action: () => navigate('/reports'),
      description: 'افتح التقارير',
    },
    {
      pattern: /افتح|اذهب.*لوحة التحكم|الرئيسية/i,
      action: () => navigate('/dashboard'),
      description: 'افتح لوحة التحكم',
    },
    {
      pattern: /افتح|اذهب.*الموظفين/i,
      action: () => navigate('/employees'),
      description: 'افتح الموظفين',
    },
    {
      pattern: /افتح|اذهب.*الخامات/i,
      action: () => navigate('/materials'),
      description: 'افتح الخامات',
    },
    {
      pattern: /افتح|اذهب.*الوصفات/i,
      action: () => navigate('/recipes'),
      description: 'افتح الوصفات',
    },
    {
      pattern: /افتح|اذهب.*وسائل التواصل/i,
      action: () => navigate('/social-media'),
      description: 'افتح وسائل التواصل',
    },
  ];

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };

  const processCommand = (text: string) => {
    for (const command of voiceCommands) {
      if (command.pattern.test(text)) {
        speak(`تم تنفيذ الأمر: ${command.description}`);
        command.action(window.location.pathname);
        return;
      }
    }
    speak('لم أتمكن من فهم الأمر. حاول مرة أخرى');
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">التحكم الصوتي</h3>
          <p className="text-sm text-gray-600">
            استخدم أوامر صوتية بالعربية للتنقل بين الصفحات
          </p>
        </div>

        {/* Voice Control Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={startListening}
            disabled={isListening}
            className="flex-1"
            size="lg"
          >
            <Mic className="mr-2 h-4 w-4" />
            استمع
          </Button>
          <Button
            onClick={stopListening}
            disabled={!isListening}
            variant="destructive"
            className="flex-1"
            size="lg"
          >
            <MicOff className="mr-2 h-4 w-4" />
            توقف
          </Button>
          <Button
            onClick={() => speak('مرحبا! أنا مساعدك الصوتي')}
            disabled={isSpeaking}
            variant="outline"
            className="flex-1"
            size="lg"
          >
            <Volume2 className="mr-2 h-4 w-4" />
            اختبر
          </Button>
        </div>

        {/* Transcript Display */}
        {transcript && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">ما تم التعرف عليه:</p>
            <p className="text-lg font-semibold text-blue-700">{transcript}</p>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
          <span className="text-gray-600">
            {isListening ? 'جاري الاستماع...' : 'جاهز للاستماع'}
          </span>
        </div>

        {/* Available Commands */}
        <div className="border-t pt-4">
          <p className="text-sm font-semibold mb-3">الأوامر المتاحة:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {voiceCommands.map((cmd, idx) => (
              <div key={idx} className="p-2 bg-gray-50 rounded border border-gray-200">
                <p className="text-gray-700">{cmd.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
