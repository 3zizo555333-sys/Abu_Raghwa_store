import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("تجربة انتظار الميكروفون", () => {
  it("لا يعالج الأمر إلا بعد كلام نهائي ويعامل الصمت كحالة هادئة", () => {
    const handler = readFileSync(resolve(projectRoot, "client/src/components/VoiceCommandHandler.tsx"), "utf8");
    const assistant = readFileSync(resolve(projectRoot, "client/src/pages/VoiceAssistant.tsx"), "utf8");

    expect(handler).toContain("جاري الاستماع... اتكلم براحتك الآن.");
    expect(handler).toContain("لم يبدأ الاستماع هذه المرة");
    expect(handler).toContain("playListeningTone");
    expect(handler).toContain("recognition.continuous = false");
    expect(handler).toContain("if (!finalText || receivedFinalSpeechRef.current) continue");
    expect(handler).toContain('event.error === "no-speech"');
    expect(handler).toContain("لم يصل صوت هذه المرة");
    expect(handler).not.toContain("window.location.reload()");
    expect(assistant).toContain("if (!event.results[i].isFinal) continue");
    expect(assistant).toContain('event.error === "no-speech"');
    expect(assistant).toContain("لم يبدأ الاستماع هذه المرة");
    expect(assistant).toContain("playListeningTone");
  });
});
